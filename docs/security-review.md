# Security review — 2026-06-11

Full-project security pass (backend + 4 Next.js web apps + 3 Expo apps).
Goal: production-readiness. This documents what was checked, what was
fixed in this session, and the residual follow-ups with their rationale.

## Summary

| Severity | Finding | Status |
|----------|---------|--------|
| **P1** | Rate limiting ineffective behind the nginx reverse proxy (`trust proxy` unset) | **Fixed** |
| **P2** | `ws` uninitialized-memory disclosure (CVE via socket.io / engine.io) | **Fixed** (`npm audit fix`) |
| P3 | Next.js middleware/proxy-bypass advisory (GHSA-26hh-7cqf-hhc6) | Documented — no stable fix; low exposure |
| P3 | `qs` remotely-triggerable DoS (transitive) | Documented — low risk |

No critical/high application-level vulnerabilities found. The codebase has
a strong baseline (details under "Reviewed and clean" below).

## Fixed this session

### P1 · Rate limiting was a single global bucket behind nginx

`express-rate-limit` keys by `req.ip`. Production runs behind nginx
(`nginx/conf.d/api.conf` et al.), but `trust proxy` was never set, so
`req.ip` resolved to nginx's upstream IP for **every** request. Effect:

- The OTP limiter (10 / 15 min) became one bucket shared by all clients —
  10 OTP requests from anyone would lock out **every** user (a trivial DoS),
  and a real attacker could never be isolated from legitimate traffic.
- The global limiter (300 / 15 min) was likewise global, not per-client.
- `express-rate-limit` v7 also emits a validation error when it sees an
  `X-Forwarded-For` header without `trust proxy` configured.

**Fix** (`backend/src/index.ts`): set `app.set('trust proxy', 1)` in
production only. `1` trusts exactly one hop (nginx) — never `true`, which
would trust a forged `X-Forwarded-For` from a direct client. Dev/test has
no proxy, so it's intentionally left off there.

### P2 · `ws` uninitialized-memory disclosure

`ws` (pulled in by socket.io's `engine.io` + `socket.io-adapter`) had a
moderate advisory (GHSA-58qx-3vcg-4xpx). Socket.io is on the hot path
(driver location, order events, chat), so it's reachable. Resolved with a
non-breaking `npm audit fix` — `ws` no longer appears in the audit.

## Documented follow-ups (deliberately not auto-applied)

### P3 · Next.js middleware/proxy-bypass (GHSA-26hh-7cqf-hhc6)

The advisory range covers every stable 16.x including the installed
16.2.9; the only patched build is a canary. `npm audit fix --force` would
install a Next **beta** and risk breaking all four web apps — net-negative
for production stability.

Practical exposure is **low**: this is a *middleware* bypass, and none of
the apps use `middleware.ts`. Authorization is enforced server-side on the
Express API for every request (verified: admin routes `authorize('ADMIN')`,
order/address ownership checks, per-user scoping), not via Next middleware.

Recommendation: pin all apps to the latest stable (16.2.9 — already the
resolved version) and upgrade to the stable patch as soon as Vercel ships
it out of canary. Do **not** force a beta.

### P3 · `qs` DoS (transitive)

Moderate `qs.stringify` DoS (GHSA-q8mj-m7cp-5q26), reachable only through
the same Next dependency tree, so it's also gated behind the forced
upgrade. Low risk on our paths; resolve alongside the Next stable bump.

## Reviewed and clean (no action needed)

- **SQL injection** — none. Prisma everywhere; zero `$queryRaw` /
  `$executeRaw` / `*Unsafe` calls in `backend/src`.
- **Secrets** — `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are required via
  `requireEnv` with no insecure fallback. No real secrets committed
  (`backend/.env.test` holds only obviously-fake `test`/placeholder values).
  No secrets exposed to clients — the only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`
  vars are the API URL and SEO site-verification tokens.
- **AuthZ / IDOR** — admin router is globally `authenticate + authorize('ADMIN')`;
  `GET /orders/:id` verifies the caller is admin / the customer / the owning
  store / the assigned driver; addresses verify `existing.userId === req.user.id`;
  the new favorites endpoints scope every query to `req.user.id`.
- **Auth hygiene** — passwords bcrypt-hashed; `passwordHash` stripped via the
  `publicUser()` sanitiser; OTP brute-force capped per-phone *and*
  rate-limited per-IP; OTP is only console-logged under the dev `CONSOLE`
  SMS provider (real providers never log it).
- **Transport / headers** — `helmet()` enabled; CORS hardened (never falls
  back to `*` in production); JSON/urlencoded body capped at 10 MB.
- **Error handling** — the global handler returns only a generic message to
  clients; stack traces go to an internal ring buffer, never the response.
- **Client-side** — no `eval` / `new Function`; the two
  `dangerouslySetInnerHTML` uses inject static content only (JSON-LD SEO
  block + a service-worker purge script), no user input.

## How to re-run this audit

```sh
# Dependency CVEs (run at repo root — npm workspaces)
npm audit

# Injection surface
grep -rn '\$queryRaw\|\$executeRaw\|Unsafe' backend/src

# Authorization spot-checks
grep -rn 'req.user' backend/src/routes/<route>.routes.ts

# Client secret leakage
grep -rhoE 'NEXT_PUBLIC_[A-Z_]+|EXPO_PUBLIC_[A-Z_]+' apps/*/app apps/*/lib
```

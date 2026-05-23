# Apni Kirana Store — web apps pattern

This monorepo will ship **three** customer-facing web surfaces. They share infrastructure, code and brand:

| App | Domain | Workspace | Audience |
|---|---|---|---|
| Customer storefront | `quickeasymart.com` (apex) | `apps/customer-web` | Shoppers |
| Store portal | `store.quickeasymart.com` | `apps/store-web` *(planned)* | Kirana owners |
| Driver portal | `driver.quickeasymart.com` | `apps/driver-web` *(planned)* | Delivery riders |

All three follow the same Docker / nginx / workspace / styling pattern documented below. **If you're scaffolding a new web app, copy the customer-web setup — not the admin's.** The admin app predates `@aks/ui`; the three new apps are the reference implementation going forward.

## Monorepo layout

```
/
├── apps/
│   ├── admin/                Legacy admin dashboard (Tailwind + inline shadcn-ish)
│   ├── customer/             Expo (mobile)
│   ├── customer-web/         ← Slice-1 reference
│   ├── store-web/            ← coming next
│   ├── driver-web/           ← coming next
│   └── store-portal/, driver/    Expo (mobile)
├── packages/
│   └── ui/                   @aks/ui — shared shadcn/ui library
├── shared/                   @aks/shared — TS types + enums + constants
└── backend/                  Express + Prisma API (one for everyone)
```

`@aks/ui` and `@aks/shared` are **source-only workspace packages**; they ship raw `.ts`/`.tsx` and the consumer's Next.js build transpiles them via `transpilePackages` in `next.config.ts`.

## Shared shadcn/ui library — `packages/ui`

See `packages/ui/README.md` for the full integration recipe. Three steps in any new web app:

1. Add `"@aks/ui": "*"` to its `package.json`.
2. `transpilePackages: ['@aks/shared', '@aks/ui']` in `next.config.ts`.
3. `presets: [preset]` in `tailwind.config.ts` + `@import '@aks/ui/styles.css';` in `globals.css`.

Component names mirror upstream shadcn — `Button`, `Input`, `Dialog`, `Sheet`, etc. Add new components by running `npx shadcn@latest add <name>` from `packages/ui/` and re-exporting from `src/index.ts`.

## Per-app Dockerfile pattern

`apps/customer-web/Dockerfile` is the reference. Always:

- Build context = monorepo root (the workspace deps `@aks/shared` / `@aks/ui` are siblings).
- `dockerfile: ./apps/<name>/Dockerfile` in the compose service.
- Four stages: `deps` → `dev` → `builder` (with `ARG NEXT_PUBLIC_API_URL`) → `production` running `npm run start`.
- Production stage `COPY --from=builder /app/packages/ui ./packages/ui` so the symlinked workspace dep resolves at runtime.

A common foot-gun: missing the `COPY packages/ui/package.json ./packages/ui/` line in the `deps` stage causes `npm install` to silently drop the workspace.

## Per-app nginx vhost pattern

`nginx/conf.d/customer.conf` is the reference for an apex-domain app. For subdomain apps copy `nginx/conf.d/admin.conf`.

Every vhost:

- Listens on 80 → 301 to HTTPS, exposes ACME challenge under `/.well-known/acme-challenge/`.
- Listens on 443 with the **shared SAN certificate** at `live/api.quickeasymart.com/` (Let's Encrypt's combined-cert convention — all hostnames live under the first one issued).
- Proxies `/_next/static/` with `expires 1y; immutable`.
- Proxies everything else to `http://<service-name>:3000`.

## Docker Compose wiring

Add the new service to `docker-compose.prod.yml` (NOT a separate compose file). Mirror the `customer-web` service block:

```yaml
store-web:
  build:
    context: .
    dockerfile: ./apps/store-web/Dockerfile
    target: production
    args:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL_STORE}
  env_file:
    - .env.prod
  restart: unless-stopped
  expose:
    - "3000"
  depends_on:
    - backend
```

Add the service name to `nginx.depends_on` so nginx restarts pick up upstream changes.

> **Don't** put `NEXT_PUBLIC_*` under `environment:` — Next.js inlines those variables into the client bundle at build time, so they must be `build.args`. This is the single most-hit bug; the admin app had it once already.

## DNS + cert recipe (per new app)

1. **DNS** — point the new hostname at the VPS:
   - `<sub>.quickeasymart.com.   A    <vps-ip>`
   - Apex apps: also `www.<domain>.   A    <vps-ip>` (the vhost redirects www → apex).

2. **Expand the SAN cert** — Let's Encrypt allows up to ~100 SANs on one cert; we keep them on the api domain:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm certbot certonly \
     --webroot -w /var/www/certbot \
     --cert-name api.quickeasymart.com \
     -d api.quickeasymart.com \
     -d admin.quickeasymart.com \
     -d quickeasymart.com \
     -d www.quickeasymart.com \
     -d store.quickeasymart.com \
     -d driver.quickeasymart.com \
     --expand
   ```

3. **Build + start** the new service:
   ```bash
   docker compose -f docker-compose.prod.yml build <service-name>
   docker compose -f docker-compose.prod.yml up -d <service-name> nginx
   ```

4. **Smoke test**: `curl -I https://<new-host>` should 200 / 301 cleanly.

## Auth + storage namespacing

Each web app stores its session in `localStorage` under app-specific keys so a single browser can stay signed-in to all three at once:

| App | Token key | User key |
|---|---|---|
| customer-web | `aks_customer_token` | `aks_customer_user` |
| store-web | *(use `aks_store_*`)* | *(use `aks_store_*`)* |
| driver-web | *(use `aks_driver_*`)* | *(use `aks_driver_*`)* |
| admin | `admin_token` | — |

Cart / app-specific Zustand stores follow the same namespacing (`aks-customer-cart`, etc.).

## Theme + brand

`@aks/ui` exports brand tokens (`colors.primary` = `#16A34A`, etc.) that mirror `apps/customer/constants/theme.ts`. Changes happen in both places:

- `packages/ui/src/theme/index.ts` — for web
- `apps/customer/constants/theme.ts` — for React Native

Per-app accents are deliberately not supported — three surfaces, one brand.

## Adding the next web app — checklist

- [ ] Create `apps/<name>/` with `package.json` (`"name": "@aks/<name>"`, deps on `@aks/shared` and `@aks/ui` with `"*"`).
- [ ] Add `apps/<name>` to root `package.json` `workspaces`.
- [ ] Copy `apps/customer-web/{Dockerfile, next.config.ts, tsconfig.json, tailwind.config.ts, postcss.config.js, app/globals.css}` and rename references.
- [ ] Scaffold `app/login` etc. using `@aks/ui` components.
- [ ] Add the service block + `depends_on` to `docker-compose.prod.yml`.
- [ ] Create `nginx/conf.d/<name>.conf` (copy `admin.conf` for subdomain apps).
- [ ] Add `NEXT_PUBLIC_API_URL_<NAME>` to `.env.prod.example`.
- [ ] Update DNS, expand the SAN cert (see above).
- [ ] Add a docs page `docs/<name>-web.md` covering slice scope + deploy.
- [ ] Log it in `docs/TASKS.md`.

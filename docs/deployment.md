# Deployment

Production deployment to a single Ubuntu 22.04 VPS using Docker Compose, Nginx, and Let's Encrypt.

## Recommended VPS

| Provider | Plan | RAM / CPU / SSD | Price | Notes |
| --- | --- | --- | --- | --- |
| Hetzner | CX22 | 4 GB / 2 vCPU / 40 GB | €4 / mo | Best value; EU + US locations |
| DigitalOcean | Basic Droplet | 1 GB / 1 vCPU / 25 GB | $6 / mo | Easy onboarding; many regions |
| Contabo | VPS S | 8 GB / 4 vCPU / 200 GB | ~$5 / mo | Big specs, slower IO, EU/US/Asia |

For the early launch, Hetzner CX22 is the sweet spot. Scale vertically (CX32, CX42) before reaching for a load balancer.

## DNS setup

Point two A records at the VPS public IP:

| Host | Type | Value |
| --- | --- | --- |
| `api.yourdomain.com` | A | `203.0.113.10` |
| `admin.yourdomain.com` | A | `203.0.113.10` |

Wait for propagation (`dig api.yourdomain.com +short`) before issuing the cert.

## VPS bootstrap

SSH in as root, then:

```bash
git clone https://github.com/your-org/apni-kirana-store.git /opt/apni-kirana-store
cd /opt/apni-kirana-store
bash scripts/setup-vps.sh
```

The script installs:

- Docker Engine + Compose plugin
- UFW firewall (open 22, 80, 443)
- fail2ban with the SSH jail enabled
- A non-root `deploy` user with sudo + docker group
- Unattended security updates

It is idempotent — safe to re-run.

## Environment

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Required values:

| Var | Source |
| --- | --- |
| `POSTGRES_PASSWORD` | Generate with `openssl rand -base64 24` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` |
| `SMS_PROVIDER` | `CONSOLE` (dev), `TWOFACTOR` (free 100/day, India), `MSG91` (~₹0.18/OTP, India), `TWILIO` (international) — see [SMS OTP setup](#sms-otp-setup) below |
| `TWOFACTOR_API_KEY` | 2Factor.in dashboard (only when SMS_PROVIDER=TWOFACTOR) |
| `MSG91_AUTH_KEY` / `MSG91_TEMPLATE_ID` | MSG91 dashboard (only when SMS_PROVIDER=MSG91) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | Twilio console (only when SMS_PROVIDER=TWILIO) |
| `CLOUDINARY_URL` | Cloudinary dashboard |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase console → Project settings → Service accounts (paste full JSON) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay dashboard |
| `ADMIN_PUBLIC_URL` | `https://admin.yourdomain.com` |
| `API_PUBLIC_URL` | `https://api.yourdomain.com` |

Permissions: `chmod 600 .env.prod`.

## SMS OTP setup

Pick a provider and set `SMS_PROVIDER=<KEY>` in `.env.prod` plus that
provider's credentials. The backend's `services/sms.service.ts` does the rest.

### Option A — 2Factor.in (free 100 OTP/day, India)

Best for early stage / beta. Genuinely free up to 100 OTP/day, no credit card.

1. Sign up at <https://2factor.in> (Indian mobile + email; takes ~3 minutes)
2. Verify your email — they'll auto-create a "Free Trial" plan with 100 OTP/day
3. Dashboard → "API Key" — copy the 36-char UUID (looks like `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`)
4. (Optional, for branded sender) Get a DLT-approved template approved on
   the dashboard. Until then, use the default `OTP1` template — works
   immediately but the SMS reads "Your OTP is XXXXXX from 2FACTOR".
5. Set in `.env.prod`:
   ```
   SMS_PROVIDER=TWOFACTOR
   TWOFACTOR_API_KEY=<your-uuid>
   TWOFACTOR_TEMPLATE=OTP1   # or your DLT template name
   ```
6. Restart backend: `docker compose -f docker-compose.prod.yml restart backend`
7. Test: hit `POST /api/v1/auth/send-otp` with your real phone — you'll get
   the SMS within ~5 seconds.

### Option B — MSG91 (no daily cap, ~₹0.18/OTP)

Best when you outgrow the free 100/day. DLT-compliant, used widely in India.

1. Sign up at <https://msg91.com> + complete KYC (business name, GST, ~1 day)
2. Apply for a DLT principal entity ID + sender ID via your TRAI registrar
   (Vilpower / Videocon / etc.) — required by Indian regulation; takes ~3
   business days. MSG91 has a guide.
3. Once DLT-approved, create an OTP template inside MSG91 dashboard and
   note its template ID (a 24-char hex)
4. Dashboard → API → "Auth Key" — copy
5. Set in `.env.prod`:
   ```
   SMS_PROVIDER=MSG91
   MSG91_AUTH_KEY=<auth-key>
   MSG91_TEMPLATE_ID=<template-id>
   ```
6. Restart backend; test as above

### Option C — Twilio (international, expensive in India)

Use only if shipping outside India. Per-SMS cost in India is ~₹3.30/OTP.

1. Sign up at <https://twilio.com> ($15 trial credit)
2. Buy a verified Indian sender or use a US long-code
3. Set in `.env.prod`:
   ```
   SMS_PROVIDER=TWILIO
   TWILIO_ACCOUNT_SID=ACxxxx
   TWILIO_AUTH_TOKEN=xxxxx
   TWILIO_PHONE_NUMBER=+1234567890
   ```

### Option D — CONSOLE (development only)

Default. OTP is logged to backend stdout — never sent over the network. Use
this for local dev / staging when you don't want to spend SMS credits.

```
SMS_PROVIDER=CONSOLE
```

Watch with `docker compose logs -f backend | grep OTP`.

### What if SMS sending fails?

- **Production:** the route returns `500 Failed to send OTP`. Check backend
  logs for `[SMS] <PROVIDER> send failed:` and verify your API key + template.
- **Dev (`NODE_ENV=development`):** failures silently fall back to console
  so the local dev flow never breaks.

## TLS certificates

```bash
bash scripts/init-ssl.sh api.yourdomain.com admin.yourdomain.com you@yourdomain.com
```

This:

1. Spins up a temporary Nginx serving HTTP-01 challenges.
2. Calls Certbot for both hostnames.
3. Installs the certs into `./certs/` and configures auto-renew via a daily cron.

## First start

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
docker compose -f docker-compose.prod.yml logs -f
```

Smoke test:

```bash
curl https://api.yourdomain.com/health
# { "status": "ok" }
```

## Updates

```bash
./scripts/deploy.sh
```

The deploy script:

1. `pg_dump` the current DB to `/opt/apni-kirana-store/backups/<timestamp>.sql.gz` (rolling 14-day retention).
2. `git pull`.
3. `docker compose -f docker-compose.prod.yml build`.
4. `docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy`.
5. Rolling restart of `backend`, then `admin` (each waits for healthcheck before next).

Rollback: re-run `./scripts/deploy.sh <git-sha>` to redeploy a known-good commit; restore DB from the latest pre-deploy dump if needed.

## Backups

Pre-deploy dumps are automatic. For continuous protection add a daily cron:

```cron
0 2 * * * /usr/bin/docker exec apni-postgres pg_dumpall -U postgres | gzip > /opt/backups/$(date +\%F).sql.gz && \
          aws s3 cp /opt/backups/$(date +\%F).sql.gz s3://apni-kirana-backups/
```

Pair with S3 lifecycle to delete beyond 30 days.

## Monitoring

For an MVP, tail the logs:

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=200
```

Once you have users, plug in:

- **Sentry** for backend + mobile error tracking (free tier covers ~5k events/mo).
- **Uptime Kuma** on the VPS pinging `/health` every minute.
- **Grafana + Prometheus** for container metrics (heavier; add when scaling).

## Cost estimate (monthly, INR equivalents in brackets)

| Item | Cost |
| --- | --- |
| Hetzner CX22 | €4 (~₹360) |
| Twilio SMS | ~₹0.30 per OTP, batch credit ~₹500 |
| Cloudinary | Free tier (25 GB storage, 25 GB bandwidth) |
| Firebase FCM | Free |
| Razorpay | per-transaction fee (~2% UPI/cards) |
| Domain | ~₹100 |
| **Total fixed** | **~₹1000–1500/mo** at low volume |

Variable costs (Twilio, Razorpay) scale with revenue, so unit economics stay healthy.

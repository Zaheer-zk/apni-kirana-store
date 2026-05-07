# Deployment

Production deployment to a single Ubuntu 22.04 VPS using Docker Compose, Nginx, and Let's Encrypt.

## Pre-deployment checklist

Before you `ssh` to the VPS, gather these. The deploy script won't run without most of them.

| ✓ | Item | Where to get it |
| --- | --- | --- |
| ☐ | A domain (any registrar, e.g. Hostinger / Namecheap / GoDaddy) | ~₹100-1000/yr |
| ☐ | A VPS — see [Recommended VPS](#recommended-vps); for India use **Hostinger KVM 2** | ~₹500/mo |
| ☐ | SMS provider account — **2Factor.in** (free 100/day) is the easiest start | <https://2factor.in> |
| ☐ | Cloudinary account for image uploads (free tier OK) | <https://cloudinary.com> |
| ☐ | Razorpay account for payments (Indian businesses) | <https://razorpay.com> |
| ☐ | VAPID keys (admin web push) — generate locally: `npx web-push generate-vapid-keys --json` | local |
| ☐ | (Optional) Firebase project — only if you need raw FCM tokens; Expo Push doesn't need this | <https://console.firebase.google.com> |
| ☐ | (Optional) Apple Developer account for iOS production push | $99/yr — only at App Store submission |
| ☐ | (Optional) Sentry account for error tracking | <https://sentry.io> free tier |

The mobile apps (customer/driver/store-portal) are not deployed to a VPS — they ship to **Apple App Store** + **Google Play** via [EAS Build](https://docs.expo.dev/build/introduction/). Build commands at the bottom of this doc.

## Recommended VPS

| Provider | Plan | RAM / CPU / SSD | Price | Notes |
| --- | --- | --- | --- | --- |
| **Hostinger** | **KVM 2** | **8 GB / 2 vCPU / 100 GB** | **₹499 / mo** | **India location (Mumbai). Best for Indian users — see [Hostinger setup](#hostinger-vps-setup-india) below.** |
| Hetzner | CX22 | 4 GB / 2 vCPU / 40 GB | €4 (~₹360) / mo | Best value globally; EU + US locations |
| DigitalOcean | Basic Droplet | 1 GB / 1 vCPU / 25 GB | $6 / mo | Easy onboarding; Bangalore region available |
| Contabo | VPS S | 8 GB / 4 vCPU / 200 GB | ~$5 / mo | Big specs, slower IO, EU/US/Asia |

For an India-only launch, **Hostinger KVM 2 (Mumbai)** gives you the lowest customer-side latency at ~₹500/mo. Hetzner is cheaper globally but its closest region (Singapore add-on) adds ~150ms RTT for Indian customers. Scale vertically (KVM 4, KVM 8) before reaching for a load balancer.

> ⚠️ **Hostinger "Web Hosting" (cPanel/PHP) plans will NOT work** — those don't allow Docker. You must pick a **VPS** or **Cloud Hosting** plan (anything that gives you root SSH on Ubuntu/Debian).

## Hostinger VPS setup (India)

If you're using Hostinger's KVM VPS plans, here's the exact path from order → running stack.

### 1. Buy the right plan

- Go to <https://www.hostinger.in/vps-hosting>
- Choose **KVM 2** (8 GB RAM, 2 vCPU, 100 GB NVMe) at ~₹499/mo
- **OS:** Ubuntu 22.04 with Docker — Hostinger has a one-click "Docker" template that includes Docker + Compose pre-installed. Pick that to skip half the bootstrap.
- **Region:** Mumbai (closest to Indian users)
- **Hostname:** `aks-prod-1` (or anything memorable)

After purchase, Hostinger emails the root password and IP within ~2 minutes.

### 2. Initial SSH login

```bash
ssh root@<your-vps-ip>
# Hostinger root password from the order email
```

First-login checklist:

```bash
# Update OS packages
apt update && apt upgrade -y

# Verify Docker (already installed if you picked the Docker template)
docker --version
docker compose version

# If Docker isn't there, install it via the official script:
curl -fsSL https://get.docker.com | sh
```

### 3. Point your domain

Hostinger lets you buy a domain in the same dashboard, but any registrar works. In your DNS panel add **two A records** pointing at your VPS IP:

| Host | Type | Value | TTL |
| --- | --- | --- | --- |
| `api.yourdomain.com` | A | `<vps-ip>` | 300 |
| `admin.yourdomain.com` | A | `<vps-ip>` | 300 |

If you bought the domain on Hostinger:
- hPanel → Domain → DNS / Nameservers → Manage DNS records → Add record (×2)

Wait ~5-15 minutes, then verify:
```bash
dig api.yourdomain.com +short
# Should print your VPS IP
```

### 4. Open firewall ports

Hostinger VPSes have a panel firewall. From hPanel → VPS → your-server → Firewall:
- Allow `22/tcp` (SSH) from your IP if possible (else `Anywhere`)
- Allow `80/tcp` (HTTP — Let's Encrypt cert challenge)
- Allow `443/tcp` (HTTPS)
- Block everything else

Inside the VPS, also:
```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 5. Continue with the standard bootstrap

The rest of the deployment matches the generic flow below — start at [VPS bootstrap](#vps-bootstrap), substituting Hostinger's IP for `203.0.113.10` in examples.

### Hostinger gotchas to know

- **Backups**: Hostinger includes weekly snapshots on KVM 2+. Enable them in hPanel → VPS → Backups. Don't rely on this alone — keep `pg_dump` running too (see [Backups](#backups)).
- **Reverse DNS / PTR**: needed for SMTP. hPanel → VPS → DNS Setup → set PTR to your domain. Skip if you're not sending email yourself.
- **Bandwidth**: KVM plans bundle 8 TB/month. At MVP scale you'll use < 50 GB/mo. Hostinger throttles to 100 Mbps after the cap, doesn't charge overage.
- **Country-specific blocks**: certain ports (e.g. 25 outgoing) are blocked by default for spam prevention. SMTP must use 587 + auth.
- **VPS support**: Hostinger's KVM tier includes 24/7 chat. They generally only help with infra (booting, networking) — not your app.

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

## Mobile apps — store submission

Mobile apps (customer / driver / store-portal) ship via the **EAS Build** service (free tier covers ~30 builds/month — enough for early-stage iteration).

### One-time setup

```bash
npm install -g eas-cli
eas login                            # creates a free Expo account if needed
cd apps/customer && eas init         # binds an EAS projectId — writes it to app.json
cd apps/driver    && eas init
cd apps/store-portal && eas init
```

The `projectId` written to each `app.json`'s `extra.eas` is what unlocks **real Expo Push notifications** in production builds. Without it, the apps degrade gracefully (push registration logs a warning and continues).

### Build for testing (internal)

```bash
cd apps/customer
eas build --platform ios --profile preview      # internal TestFlight
eas build --platform android --profile preview  # APK download
```

### Build for store submission

Configure `eas.json` (one-time):

```jsonc
{
  "build": {
    "production": {
      "ios":     { "autoIncrement": true },
      "android": { "buildType": "app-bundle", "autoIncrement": true }
    }
  }
}
```

Then:

```bash
eas build --platform all --profile production
eas submit --platform ios     --latest          # to App Store Connect
eas submit --platform android --latest          # to Play Console
```

iOS submission requires an **Apple Developer account ($99/yr)**. Android submission is a one-time **$25 Play Console** fee.

Repeat per app (customer / driver / store-portal). Use distinct bundle IDs:
- `com.apnikiranastore.customer`
- `com.apnikiranastore.driver`
- `com.apnikiranastore.store`

### Production push (iOS)

After your Apple Developer account is approved:

1. Apple Developer → Certificates, IDs & Profiles → Keys → "+" → check "Apple Push Notifications service" → download `.p8`
2. `eas credentials --platform ios` → upload the `.p8` + Key ID + Team ID
3. EAS forwards pushes through APNs automatically — no code changes needed

Android works out of the box without any extra setup; Expo Push relays through Google's FCM behind the scenes.

## Cost estimate (monthly, INR equivalents in brackets)

| Item | Cost |
| --- | --- |
| Hostinger KVM 2 (Mumbai) | ~₹500 |
| _or_ Hetzner CX22 (global) | €4 (~₹360) |
| 2Factor.in SMS (free tier) | ₹0 (up to 100 OTP/day) |
| _or_ MSG91 SMS | ~₹0.18 per OTP |
| Cloudinary | Free tier (25 GB storage, 25 GB bandwidth) |
| Expo Push (mobile) | Free |
| Web Push for admin (VAPID) | Free |
| Razorpay | per-transaction fee (~2% UPI/cards) |
| Domain | ~₹100 |
| **Total fixed** | **~₹600–₹1000/mo** at low volume |

Variable costs (SMS, Razorpay) scale with revenue, so unit economics stay healthy.

One-time launch costs:
- Apple Developer account: **$99/yr (~₹8000)** — required for iOS App Store
- Google Play Console: **$25 once (~₹2000)** — required for Play Store

If you're launching Android-only first, you can defer the Apple cost by 6+ months without losing functionality.

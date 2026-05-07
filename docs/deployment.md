# Deployment

Production deployment to a single Ubuntu 22.04 VPS using Docker Compose, Nginx, and Let's Encrypt.

## Pre-deployment checklist

Before you `ssh` to the VPS, gather these. The deploy script won't run without most of them.

| ✓ | Item | Where to get it |
| --- | --- | --- |
| ☐ | A domain (any registrar, e.g. Hostinger / Namecheap / GoDaddy) | ~₹100-1000/yr |
| ☐ | A VPS — see [HostLelo product matrix](#hostlelo--picking-the-right-product); for India MVP use **HostLelo Multi-Region Cloud VPS (Mumbai)** | ~₹1,450/mo |
| ☐ | SMS provider account — **2Factor.in** (free 100/day) is the easiest start | <https://2factor.in> |
| ☐ | Cloudinary account for image uploads (free tier OK) | <https://cloudinary.com> |
| ☐ | Razorpay account for payments (Indian businesses) | <https://razorpay.com> |
| ☐ | VAPID keys (admin web push) — generate locally: `npx web-push generate-vapid-keys --json` | local |
| ☐ | (Optional) Firebase project — only if you need raw FCM tokens; Expo Push doesn't need this | <https://console.firebase.google.com> |
| ☐ | (Optional) Apple Developer account for iOS production push | $99/yr — only at App Store submission |
| ☐ | (Optional) Sentry account for error tracking | <https://sentry.io> free tier |

The mobile apps (customer/driver/store-portal) are not deployed to a VPS — they ship to **Apple App Store** + **Google Play** via [EAS Build](https://docs.expo.dev/build/introduction/). Build commands at the bottom of this doc.

## HostLelo — picking the right product

HostLelo (<https://www.hostlelo.com>) is the chosen hosting provider. This section covers every product they sell, which ones can run our stack, and which exact plan to pick for each phase.

### Product matrix — what runs Apni Kirana Store

| Product | URL | Runs our stack? | Why / Why not |
|---|---|---|---|
| **Multi-Region Cloud VPS** | [/cloud-vps](https://www.hostlelo.com/cloud-vps) | ✅ **Yes — recommended for MVP** | Root SSH, NVMe, Mumbai region, Ubuntu support |
| **AMD EPYC VDS** | [/vds](https://www.hostlelo.com/vds) | ✅ **Yes — recommended for production** | Dedicated CPU cores, up to 64 vCPU / 512 GB RAM, 24/7 fully-managed support included |
| **Dedicated Servers** | [/dedicated-hosting](https://www.hostlelo.com/dedicated-hosting) | ✅ Yes (overkill for v1) | Bare metal, full hardware control. Pick once you scale past one VDS |
| **VPS Hosting** (legacy) | listed on homepage | ⚠️ Avoid for new orders | 1 GB RAM / 1 core for $18.91 — Cloud VPS gives 4× the resources for similar price |
| **UAE VPS / UAE Dedicated** | [/uae-vps](https://www.hostlelo.com/uae-vps), [/uae-dedicated](https://www.hostlelo.com/uae-dedicated) | ✅ Yes | Pick only if you launch in UAE — adds ~80 ms RTT for Indian users |
| **Premium Shared Hosting** | [/shared-hosting](https://www.hostlelo.com/shared-hosting) | ❌ **No** | cPanel-style, no Docker, no Node.js/Postgres — **don't buy this for AKS** |
| **WordPress Hosting** | [/wordpress-hosting](https://www.hostlelo.com/wordpress-hosting) | ❌ **No** | Same as shared — runs only WordPress, not arbitrary Docker stacks |
| UAE Web Hosting | [/uae-hosting](https://www.hostlelo.com/uae-hosting) | ❌ **No** | Same as shared, just UAE region |
| Software Development | [/development](https://www.hostlelo.com/development) | n/a | A service offering, not a hosting product |
| Bash Scripting | [/bash-script-development](https://www.hostlelo.com/bash-script-development) | n/a | DevOps service offering |

> ⚠️ **Do not buy "Shared", "WordPress", or any cPanel-only plan.** They cannot run our Docker stack (Postgres + Redis + Node + Next.js need root SSH and arbitrary process control).

### Resource sizing for Apni Kirana Store

What our 4-container stack actually uses at idle and under MVP load (~50 stores, ~500 customers, ~10 orders/min peak):

| Container | Idle RAM | Peak RAM | CPU | Disk |
|---|---|---|---|---|
| `backend` (Node + Express + tsx) | ~250 MB | ~450 MB | bursty | minimal |
| `admin` (Next.js prod) | ~200 MB | ~400 MB | bursty | minimal |
| `postgres` | ~150 MB | ~600 MB | low-moderate | grows with order volume |
| `redis` | ~50 MB | ~150 MB | low | minimal |
| **Headroom** (OS, snapshots, bursts) | — | ~600 MB | — | logs + DB backups |
| **TOTAL** | **~650 MB** | **~2.2 GB** | **~2 vCPU** | **30–50 GB** |

So **4 GB RAM / 2 vCPU / 100 GB NVMe is the comfortable MVP floor**. 8 GB / 4 vCPU is the production target. Beyond that you're either separating Postgres to its own box or sharding by city.

### Recommended plan by phase

| Phase | Customers | Plan | Approx cost | Why |
|---|---|---|---|---|
| **Beta / pilot** | 0–500, 1 city | **Multi-Region Cloud VPS — 4 vCPU / 4 GB / 100 GB NVMe** ([/cloud-vps](https://www.hostlelo.com/cloud-vps), Mumbai) | $16.52 (~₹1,450) / mo | Smallest plan that fits the stack with headroom. Self-managed |
| **Public launch** | 500–10K, 2-3 cities | **AMD EPYC VDS — ~6 vCPU / 12 GB / 360 GB NVMe** ([/vds](https://www.hostlelo.com/vds), India) | ~$50–60 (~₹4,500) / mo | Dedicated CPU cores prevent noisy-neighbor lag during dispatch matching. **Includes 24/7 fully-managed support** — your in-house ops time goes near-zero |
| **Scale** | 10K+, 5+ cities | Dedicated Server (Ryzen 5950X, 128 GB) ([/dedicated-hosting](https://www.hostlelo.com/dedicated-hosting)) | ~$50/mo + $49/mo semi-managed | Move Postgres to separate dedicated box; backend/admin still on VDS. Add CDN |

For most launches, **start at Cloud VPS, upgrade to VDS when paid orders hit ~₹50K/day**. Both keep the same Docker Compose setup — only the box underneath changes.

## HostLelo deployment — step-by-step

End-to-end from "I just bought the plan" → "stack running on https://api.yourdomain.com".

### 1. Buy + provision

1. Sign in / create account at <https://www.hostlelo.com>
2. Order page → pick the plan from the table above. Choose:
   - **Region:** **India (Mumbai)** — 45 ms latency to most Indian users
   - **OS:** **Ubuntu 22.04 LTS** (or 24.04 if offered — both work). NOT CentOS, NOT Windows
   - **Hostname:** `aks-prod-1` (any memorable name)
   - **Add-ons:** skip extra IPs, cPanel, billing add-ons. We don't need them
3. After payment, the dashboard shows the public IPv4 + initial root password (also emailed)

If you picked the **VDS or Dedicated** plan, your account also includes 24/7 fully-managed support — note their ticket queue / chat link in the welcome email; that's who you call if the server itself misbehaves.

### 2. First SSH

```bash
ssh root@<public-ip>
# Use the password from the welcome email
# You'll be prompted to change it on first login — pick a strong one or
# move straight to key-based auth (recommended below)
```

Once in:

```bash
# 2.1 Update everything
apt update && apt upgrade -y

# 2.2 Install Docker if it isn't already
docker --version 2>/dev/null || curl -fsSL https://get.docker.com | sh
docker compose version || apt install -y docker-compose-plugin

# 2.3 Set up SSH key auth (kills password attacks)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# Paste your laptop's id_ed25519.pub into ~/.ssh/authorized_keys, then:
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd

# 2.4 Firewall — open only what we need
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 3. Domain + DNS

In your domain registrar's DNS panel (HostLelo's, GoDaddy, Namecheap, whoever) add **two A records** pointing at the VPS IP:

| Host | Type | Value | TTL |
|---|---|---|---|
| `api.yourdomain.com` | A | `<your-vps-ip>` | 300 |
| `admin.yourdomain.com` | A | `<your-vps-ip>` | 300 |

Verify after a few minutes:

```bash
dig api.yourdomain.com +short    # should print your VPS IP
dig admin.yourdomain.com +short  # same
```

Don't issue the SSL cert until both records resolve.

### 4. Clone + configure the project

```bash
git clone https://github.com/your-org/apni-kirana-store.git /opt/apni-kirana-store
cd /opt/apni-kirana-store

# Optional one-shot bootstrap — installs UFW rules, fail2ban, deploy user
bash scripts/setup-vps.sh

# Production env
cp .env.prod.example .env.prod
nano .env.prod    # see [Environment](#environment) below for what to fill
chmod 600 .env.prod
```

### 5. SSL + first start + smoke test

```bash
# 5.1 Issue Let's Encrypt cert (uses certbot inside the nginx container)
bash scripts/init-ssl.sh \
  api.yourdomain.com \
  admin.yourdomain.com \
  you@yourdomain.com

# 5.2 Boot the stack
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

# 5.3 Smoke test
curl https://api.yourdomain.com/health     # → { "status": "ok" }
open https://admin.yourdomain.com          # → admin login screen
```

You're live. Test the full order flow from the customer app pointed at this API to confirm matching/notifications/chat all work in production mode.

### 6. Day-2 operations

| Task | Command |
|---|---|
| View live logs | `docker compose -f docker-compose.prod.yml logs -f --tail=200` |
| Deploy a new commit | `bash scripts/deploy.sh` (auto-backs up DB → git pull → rebuild → migrate → rolling restart) |
| Restart one service | `docker compose -f docker-compose.prod.yml restart backend` |
| psql shell | `docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d apni_kirana_store` |
| Manual DB backup | `docker compose -f docker-compose.prod.yml exec postgres pg_dumpall -U postgres \| gzip > /opt/backups/$(date +%F).sql.gz` |
| Tail just OTPs | `docker compose -f docker-compose.prod.yml logs -f backend \| grep OTP` |

### HostLelo-specific gotchas

- **Mumbai latency is real**: pick India region for India users. UAE region adds ~80 ms RTT — only meaningful if you actually serve UAE customers
- **Snapshots**: Cloud VPS plans include "1 free snapshot". Use it before any risky upgrade. Set up daily `pg_dump` separately — snapshots are point-in-time of the whole disk, slow to restore item-level
- **Bandwidth**: VDS plans bundle ~32 TB/mo, Cloud VPS varies — at MVP scale you'll use <100 GB/mo. Don't worry about it
- **DDoS protection**: included at all data centers per HostLelo's homepage. No extra config needed for the basic level
- **Managed support tiers**: VDS/Dedicated plans optionally upgrade to **Semi-Managed (+$49/mo)** or **Fully-Managed (+$149/mo)**. Skip these for MVP — you don't need someone managing the box for 5 containers. Reach for them when you have multiple servers
- **Reverse DNS / PTR**: only matters if you send email directly from the VPS (we don't — email goes via 2Factor / MSG91 / Twilio APIs). Skip
- **Outgoing port 25**: blocked by default on most providers including HostLelo. Doesn't affect us — we don't send mail
- **Their support tagline**: "2 min average response" via 24/7 live chat. Useful when the box itself misbehaves; not for app-level help. Phone: +91 9892278936, email: support@hostlelo.com

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

### Beta / pilot (~0–500 users, 1 city)

| Item | Cost |
| --- | --- |
| HostLelo Multi-Region Cloud VPS (4 vCPU / 4 GB / 100 GB, Mumbai) | $16.52 (~₹1,450) |
| 2Factor.in SMS (free tier) | ₹0 (up to 100 OTP/day) |
| Cloudinary | Free tier (25 GB storage, 25 GB bandwidth) |
| Expo Push (mobile) | Free |
| Web Push for admin (VAPID) | Free |
| Razorpay | per-transaction fee (~2% UPI/cards) |
| Domain | ~₹100 |
| **Total fixed** | **~₹1,550 / mo** |

### Public launch (~500–10K users, 2-3 cities)

| Item | Cost |
| --- | --- |
| HostLelo AMD EPYC VDS (~6 vCPU / 12 GB, India) | ~$50–60 (~₹4,500) |
| MSG91 SMS (~₹0.18 / OTP × ~3K OTPs/mo) | ~₹540 |
| Cloudinary Pro (if free tier exceeded) | $89 (~₹7,800) |
| Razorpay | per-transaction fee (~2%) |
| Domain | ~₹100 |
| **Total fixed** | **~₹5,200–₹13,000 / mo** depending on Cloudinary tier |

### Scale (10K+ users, 5+ cities)

| Item | Cost |
| --- | --- |
| HostLelo Dedicated Server (Ryzen 5950X, 128 GB) | $50.12 (~₹4,360) |
| Semi-managed support add-on | $49 (~₹4,260) |
| Separate Postgres VDS | ~$30 (~₹2,600) |
| Cloudinary, MSG91, Razorpay | as above + linear with volume |
| **Total fixed** | **~₹15,000+ / mo** before transaction fees |

Variable costs (SMS, Razorpay) scale with revenue, so unit economics stay healthy.

One-time launch costs:
- Apple Developer account: **$99/yr (~₹8000)** — required for iOS App Store
- Google Play Console: **$25 once (~₹2000)** — required for Play Store

If you're launching Android-only first, you can defer the Apple cost by 6+ months without losing functionality.

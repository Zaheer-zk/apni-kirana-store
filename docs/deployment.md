# Deployment

The entire backend runs on **one Ubuntu 22.04 VPS** with Docker Compose, Nginx, and Let's Encrypt TLS. The three mobile apps are not deployed here — they ship to the app stores via EAS Build (see the bottom of this doc).

## What gets deployed

One `docker compose` command brings up **six containers** on the single VPS:

| Container | What it is | Reachable from |
|---|---|---|
| `postgres` | PostgreSQL 16 — all application data | internal network only |
| `redis` | Redis 7 — cache + BullMQ job queue | internal network only |
| `backend` | Express API + Socket.io + BullMQ workers | internal `:3000` |
| `admin` | Next.js admin dashboard | internal `:3000` |
| `nginx` | Reverse proxy + TLS termination | **public `:80` / `:443`** |
| `certbot` | Auto-renews the Let's Encrypt certificates | — |

Only Nginx is exposed to the internet. It routes `api.<domain>` → `backend` and `admin.<domain>` → `admin`. Postgres and Redis are never exposed.

## Production server

This guide targets a **HyperVPS-class VPS**:

| Spec | Value |
|---|---|
| CPU | 6 vCPU — AMD EPYC 7282 (2.8 GHz) |
| RAM | 12 GB |
| Disk | 150 GB NVMe |
| Bandwidth | 32 TB/mo (effectively unlimited for this app) |
| Region | India — the POP closest to your users |
| OS | Ubuntu 22.04 LTS |

The full six-container stack uses **~2 GB RAM under MVP load**, so 12 GB leaves generous headroom for traffic spikes, the `next build` step during deploys, and growth. You only split Postgres onto its own server past ~10K daily users or several cities — see [Resource sizing](#resource-sizing-for-apni-kirana-store).

## Pre-deployment checklist

Before you `ssh` to the VPS, gather these. The deploy script won't run without most of them.

| ✓ | Item | Where to get it |
| --- | --- | --- |
| ☐ | A domain (any registrar, e.g. Hostinger / Namecheap / GoDaddy) | ~₹100-1000/yr |
| ☐ | A VPS — **6 vCPU / 12 GB RAM / 150 GB NVMe** ("HyperVPS" tier), Ubuntu 22.04, India region | ~₹1,500–2,500/mo |
| ☐ | SMS provider account — **2Factor.in** (free 100/day) is the easiest start | <https://2factor.in> |
| ☐ | Cloudinary account for image uploads (free tier OK) | <https://cloudinary.com> |
| ☐ | Razorpay account for payments (Indian businesses) | <https://razorpay.com> |
| ☐ | VAPID keys (admin web push) — generate locally: `npx web-push generate-vapid-keys --json` | local |
| ☐ | (Optional) Firebase project — only if you need raw FCM tokens; Expo Push doesn't need this | <https://console.firebase.google.com> |
| ☐ | (Optional) Apple Developer account for iOS production push | $99/yr — only at App Store submission |
| ☐ | (Optional) Sentry account for error tracking | <https://sentry.io> free tier |

The mobile apps (customer/driver/store-portal) are not deployed to a VPS — they ship to **Apple App Store** + **Google Play** via [EAS Build](https://docs.expo.dev/build/introduction/). Build commands at the bottom of this doc.

## Choosing a VPS

This guide targets the **HyperVPS** plan (6 vCPU / 12 GB / 150 GB NVMe). Any VPS works as long as it gives you:

- **Root SSH access** and the ability to run arbitrary **Docker** containers. The stack is Postgres + Redis + Node + Next.js — cPanel-only "Shared" or "WordPress" hosting **cannot run it**.
- **NVMe storage** (not a spinning HDD) — Postgres is I/O-sensitive.
- **An India region / POP** — this is a real-time app; a US/EU region adds 200–300 ms to every request.
- **Ubuntu 22.04 LTS** (24.04 also works).

> ⚠️ **Do not buy "Shared", "WordPress", or any cPanel-only plan.** They cannot run our Docker stack — it needs root SSH and arbitrary process control.

### If you host on HostLelo

HostLelo (<https://www.hostlelo.com>) was the originally-scoped provider. Their closest equivalent to the HyperVPS is the **Multi-Region Cloud VPS** (pick the Mumbai region); the **AMD EPYC VDS** line is the next step up if you want dedicated CPU cores and managed support. Avoid their **Shared / WordPress / UAE Web Hosting** plans — those are cPanel-only and cannot run Docker.

### Resource sizing for Apni Kirana Store

What the core stack actually uses at idle and under MVP load (~50 stores, ~500 customers, ~10 orders/min peak). `nginx` and `certbot` add only a few MB each:

| Container | Idle RAM | Peak RAM | CPU | Disk |
|---|---|---|---|---|
| `backend` (Node + Express + tsx) | ~250 MB | ~450 MB | bursty | minimal |
| `admin` (Next.js prod) | ~200 MB | ~400 MB | bursty | minimal |
| `postgres` | ~150 MB | ~600 MB | low-moderate | grows with order volume |
| `redis` | ~50 MB | ~150 MB | low | minimal |
| **Headroom** (OS, snapshots, bursts) | — | ~600 MB | — | logs + DB backups |
| **TOTAL** | **~650 MB** | **~2.2 GB** | **~2 vCPU** | **30–50 GB** |

So **4 GB RAM / 2 vCPU / 100 GB NVMe is the bare MVP floor**. The recommended **HyperVPS (12 GB / 6 vCPU / 150 GB NVMe)** runs the stack at roughly 15–20% memory use under MVP load — that headroom absorbs traffic spikes, the `next build` step during deploys, and growth without an early resize. Split Postgres onto its own box only past ~10K daily users or several cities.

### Recommended plan by phase

| Phase | Customers | Plan | Approx cost | Why |
|---|---|---|---|---|
| **Beta / pilot** | 0–500, 1 city | 4 vCPU / 4 GB / 100 GB NVMe | ~₹1,450 / mo | Smallest box that fits the stack — fine for a closed pilot |
| **Launch (recommended)** | 500–10K, 1–3 cities | **HyperVPS — 6 vCPU / 12 GB / 150 GB NVMe** | ~₹1,500–2,500 / mo | The plan this guide targets. Handles a few thousand daily users + real-time tracking with headroom |
| **Scale** | 10K+, 5+ cities | Dedicated app server + a separate Postgres box | ~₹15,000+ / mo | Move Postgres off-box; add a CDN. Same Docker Compose, split across machines |

**Start on the HyperVPS** — it covers beta and launch both. The Docker Compose setup never changes; scaling just means a bigger box, then eventually a separate database server.

## Deploying to the HyperVPS — step-by-step

End-to-end: from "I just bought the VPS" to "stack live at https://api.yourdomain.com". Budget ~30–45 minutes the first time. Every command runs **on the VPS** unless noted otherwise.

> These steps work on **any Ubuntu 22.04 VPS** — only Step 1 (buying the box) differs by provider. If you instead picked a HostLelo Cloud VPS, the rest of this guide is identical.

### Step 1 — Buy and provision the HyperVPS

1. Order the **HyperVPS** plan (6 vCPU / 12 GB / 150 GB NVMe) from your provider.
2. At checkout, choose:
   - **OS:** Ubuntu 22.04 LTS (24.04 also works). Not CentOS, not Windows.
   - **Region:** India / the POP closest to your users — keeps latency low for real-time order tracking.
   - **Storage:** the **NVMe** option (not SSD) — Postgres is I/O-sensitive.
   - Skip extra IPs, cPanel, and managed-backup add-ons.
3. After payment the provider dashboard shows the **public IPv4** and an **initial root password** (also emailed).

### Step 2 — First SSH and basic hardening

From your laptop:

```bash
ssh root@<public-ip>          # use the password from the welcome email
```

Then, on the VPS:

```bash
# 2.1 — Update the OS and make sure git is present
apt update && apt upgrade -y && apt install -y git

# 2.2 — Add your laptop's SSH public key for key-based login
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys      # paste your laptop's ~/.ssh/id_ed25519.pub
chmod 600 ~/.ssh/authorized_keys
```

Docker, the firewall, fail2ban, and a non-root `deploy` user are all installed by the bootstrap script in Step 4 — no need to do them by hand here.

### Step 3 — Point your domain at the server (DNS)

In your domain registrar's DNS panel, add **two A records** pointing at the VPS IP:

| Host | Type | Value | TTL |
|---|---|---|---|
| `api.yourdomain.com` | A | `<your-vps-ip>` | 300 |
| `admin.yourdomain.com` | A | `<your-vps-ip>` | 300 |

Wait a few minutes, then confirm **both** resolve before continuing — SSL issuance in Step 5 fails otherwise:

```bash
dig api.yourdomain.com +short      # must print your VPS IP
dig admin.yourdomain.com +short    # must print your VPS IP
```

### Step 4 — Get the code and configure it

```bash
# 4.1 — Clone the repo
git clone https://github.com/your-org/apni-kirana-store.git /opt/apni-kirana-store
cd /opt/apni-kirana-store

# 4.2 — One-shot server bootstrap. Installs Docker + Compose, the UFW firewall
#        (opens 22/80/443 only), fail2ban, a non-root `deploy` user, and
#        unattended security updates. Idempotent — safe to re-run.
bash scripts/setup-vps.sh

# 4.3 — Create the production env file from the template
cp .env.prod.example .env.prod
nano .env.prod                   # fill in real values — see "Environment" below
chmod 600 .env.prod
```

**Set a shell shortcut for the rest of this guide.** Every Compose command must
pass `--env-file .env.prod` so the Redis password and Postgres settings get
substituted into the Compose file correctly. Add a persistent alias so you
can't forget it:

```bash
echo "alias dc='docker compose --env-file .env.prod -f docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc
```

From here on, **`dc`** means `docker compose --env-file .env.prod -f docker-compose.prod.yml`.

**Replace the placeholder domain in the Nginx configs.** The committed files in
`nginx/conf.d/` ship with `api.yourdomain.com` / `admin.yourdomain.com` as
placeholders:

```bash
sed -i 's/api\.yourdomain\.com/api.YOURDOMAIN.com/g'     nginx/conf.d/*.conf
sed -i 's/admin\.yourdomain\.com/admin.YOURDOMAIN.com/g' nginx/conf.d/*.conf
grep -h server_name nginx/conf.d/*.conf      # verify it now shows YOUR domain
```

### Step 5 — Issue SSL certificates

```bash
bash scripts/init-ssl.sh \
  api.yourdomain.com \
  admin.yourdomain.com \
  you@yourdomain.com
```

This serves the ACME HTTP-01 challenge on port 80, calls Certbot for both
hostnames, and installs the certificates. The `certbot` container then
auto-renews them on a 12-hour loop.

### Step 6 — Start the stack

```bash
# 6.1 — Build the images and start all six containers
dc up -d --build

# 6.2 — Apply the database migrations
dc run --rm backend npx prisma migrate deploy

# 6.3 — Check everything is up
dc ps
```

Every service should show `running`, and `healthy` where it has a healthcheck
(`postgres`, `redis`, `backend`).

### Step 7 — Create the first admin user

Production ships with **no seed data** (by design — the seed creates fake test
users). Admins log in with a **username + password** (no OTP). Create one with
the `create-admin` script — replace `<username>` and `<password>` with your own:

```bash
dc exec backend node dist/scripts/create-admin.js <username> <password>
```

That hashes the password (bcrypt) and creates an `ADMIN` account. Re-run it any
time to reset the password. You then sign in at `https://admin.yourdomain.com`
with that username and password.

> ⚠️ **Never run `prisma db seed` in production.** It inserts 11 fake users
> (phones like `8888888881`) — useful in dev, dangerous in prod.

### Step 8 — Smoke test — confirm it's live

```bash
curl https://api.yourdomain.com/health      # → {"status":"ok"}
```

Then open `https://admin.yourdomain.com` in a browser — you should see the admin
login screen. Sign in with the username + password from Step 7.

Customers/stores/drivers (the mobile apps) still log in with phone + OTP, which
arrives via your configured `SMS_PROVIDER` (or in the backend logs if `CONSOLE`):

```bash
dc logs -f backend | grep OTP
```

Finally, point a customer app at `https://api.yourdomain.com` and place a test
order to confirm matching, notifications, and chat all work in production mode.

You're live. 🎉

### Day-2 operations

| Task | Command |
|---|---|
| View live logs (all services) | `dc logs -f --tail=200` |
| Logs for one service | `dc logs -f backend` |
| Tail just OTPs | `dc logs -f backend \| grep OTP` |
| Deploy a new commit | `bash scripts/deploy.sh` (DB backup → `git pull` → rebuild → migrate → rolling restart) |
| Restart one service | `dc restart backend` |
| Container status | `dc ps` |
| psql shell | `dc exec postgres psql -U postgres -d apni_kirana_store` |
| Manual DB backup | `dc exec -T postgres pg_dump -U postgres apni_kirana_store \| gzip > backup-$(date +%F).sql.gz` |
| Stop everything | `dc down` (data survives — it lives in named volumes) |

`scripts/deploy.sh` already passes `--env-file .env.prod` internally, so day-2
deploys need no special flags.

### Hosting gotchas

- **Always pass `--env-file .env.prod`.** The Compose file substitutes the Redis
  password and Postgres user/db from it. Run a plain `docker compose -f
  docker-compose.prod.yml ...` and those values come out blank — Redis ends up
  with no password and the Postgres healthcheck fails. The `dc` alias from
  Step 4 and `scripts/deploy.sh` both handle this; only watch out if you type a
  raw `docker compose` command.
- **Region matters.** This is a real-time app (Socket.io order tracking). Host
  in India — a US/EU region adds 200–300 ms to every request.
- **Snapshots are whole-disk, not item-level.** Take one before a risky upgrade,
  but also keep the daily `pg_dump` (see [Backups](#backups)) for fast,
  granular restores.
- **Bandwidth is a non-issue.** The app moves small JSON payloads — you'll use a
  tiny fraction of the 32 TB/mo allowance.
- **Outgoing port 25 is usually blocked** by VPS providers. Doesn't affect us —
  all SMS and push goes through provider APIs, not direct mail.

## Environment

`.env.prod` holds every production secret. Create it from the template (this is
Step 4.3 of the walkthrough above):

```bash
cp .env.prod.example .env.prod
nano .env.prod
chmod 600 .env.prod
```

What to put in each value:

| Var | What to put | Notes |
| --- | --- | --- |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | DB name, user, and a strong password | Generate the password with `openssl rand -base64 24` |
| `DATABASE_URL` | `postgresql://<user>:<password>@postgres:5432/<db>` | **Must embed the same user/password/db as above.** Host is `postgres` (the container name) |
| `REDIS_PASSWORD` | A strong password | `openssl rand -base64 24` |
| `REDIS_URL` | `redis://:<REDIS_PASSWORD>@redis:6379` | **Must embed the same password.** Host is `redis` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Two *different* random strings | `openssl rand -base64 48` for each |
| `SMS_PROVIDER` | `TWOFACTOR` (free 100/day, India), `MSG91` (~₹0.18/OTP), or `TWILIO` | Never `CONSOLE` in prod. See [SMS OTP setup](#sms-otp-setup) |
| `TWOFACTOR_API_KEY` / `MSG91_*` / `TWILIO_*` | Credentials for the provider you chose | Only the chosen provider's block needs values |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | From the Cloudinary dashboard | Image uploads |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `npx web-push generate-vapid-keys --json` | Admin browser push |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | From the Razorpay dashboard | Payments |
| `FIREBASE_PROJECT_ID` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` | From a Firebase service account | Optional — only for raw FCM tokens. Expo Push needs none of this |
| `CORS_ORIGIN` | `https://admin.yourdomain.com` | Locks the API to the admin origin |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` | Baked into the admin build — the URL the dashboard calls |

> The database and Redis passwords each appear **twice** — once as the raw
> value and once embedded in `DATABASE_URL` / `REDIS_URL`. If you change one,
> change both, or the backend won't be able to connect.

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
6. Restart backend: `dc restart backend`
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

## Updating production

The initial install — SSL, first start, smoke test — is covered in
[the step-by-step walkthrough](#deploying-to-the-hypervps--step-by-step) above.
To deploy a **new commit** afterwards, from `/opt/apni-kirana-store` on the VPS:

```bash
bash scripts/deploy.sh
```

The script:

1. `pg_dump`s the current DB to `backups/db_<timestamp>.sql` (14-day rolling retention).
2. `git pull`s the latest code.
3. Rebuilds the `backend` and `admin` images.
4. Runs `prisma migrate deploy`.
5. Brings the stack up with a healthcheck-gated restart.

It already passes `--env-file .env.prod` internally, so no extra flags are needed.

**Rollback:** restore the latest pre-deploy dump from `backups/`, then
`git checkout <last-good-sha>` and re-run `bash scripts/deploy.sh`.

## Backups

`scripts/deploy.sh` already dumps the DB before every deploy. For continuous
protection add a daily cron (run `crontab -e` on the VPS):

```cron
0 2 * * * cd /opt/apni-kirana-store && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres apni_kirana_store | gzip > /opt/backups/$(date +\%F).sql.gz && aws s3 cp /opt/backups/$(date +\%F).sql.gz s3://apni-kirana-backups/
```

Match `-U postgres` / `apni_kirana_store` to your `.env.prod`. Pair with an S3
lifecycle rule to delete dumps beyond 30 days.

## Monitoring

For an MVP, tail the logs:

```bash
dc logs -f --tail=200      # dc = the alias set up in Step 4
```

Once you have users, plug in:

- **Sentry** for backend + mobile error tracking (free tier covers ~5k events/mo).
- **Uptime Kuma** on the VPS pinging `/health` every minute.
- **Grafana + Prometheus** for container metrics (heavier; add when scaling).

## Mobile apps — store submission

Mobile apps (customer / driver / store-portal) ship via the **EAS Build** service (free tier covers ~30 builds/month — enough for early-stage iteration).

> 🧪 **For testing the apps on your own Android phone before going live**, see [docs/android-local-install.md](./android-local-install.md). It covers Expo Go (fastest), EAS Build APKs (real install with working push), and local dev builds.

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

### Beta / launch (~0–10K users, 1–3 cities) — the HyperVPS

| Item | Cost |
| --- | --- |
| HyperVPS (6 vCPU / 12 GB / 150 GB NVMe, India) | ~₹1,500–2,500 |
| SMS — 2Factor.in free tier, or MSG91 (~₹0.18/OTP) once you exceed 100/day | ₹0 → ~₹540 |
| Cloudinary | Free tier (25 GB storage + bandwidth) |
| Expo Push (mobile) | Free |
| Web Push for admin (VAPID) | Free |
| Razorpay | per-transaction fee (~2% UPI/cards) |
| Domain | ~₹100 |
| **Total fixed** | **~₹1,600–3,100 / mo** |

The HyperVPS carries you from a closed pilot through public launch — there's no
mid-stage server upgrade. If image volume outgrows Cloudinary's free tier, add
Cloudinary Pro (~$89 / ~₹7,800/mo).

### Scale (10K+ users, 5+ cities)

| Item | Cost |
| --- | --- |
| Dedicated app server (8+ cores, 32+ GB RAM) | ~₹4,000–6,000 |
| Optional managed-support add-on | ~₹4,000 |
| Separate Postgres VPS/server | ~₹2,500–4,000 |
| Cloudinary, MSG91, Razorpay | as above + linear with volume |
| **Total fixed** | **~₹15,000+ / mo** before transaction fees |

Variable costs (SMS, Razorpay) scale with revenue, so unit economics stay healthy.

One-time launch costs:
- Apple Developer account: **$99/yr (~₹8000)** — required for iOS App Store
- Google Play Console: **$25 once (~₹2000)** — required for Play Store

If you're launching Android-only first, you can defer the Apple cost by 6+ months without losing functionality.

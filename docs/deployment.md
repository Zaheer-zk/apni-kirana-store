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
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | Twilio console |
| `CLOUDINARY_URL` | Cloudinary dashboard |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase console → Project settings → Service accounts (paste full JSON) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay dashboard |
| `ADMIN_PUBLIC_URL` | `https://admin.yourdomain.com` |
| `API_PUBLIC_URL` | `https://api.yourdomain.com` |

Permissions: `chmod 600 .env.prod`.

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

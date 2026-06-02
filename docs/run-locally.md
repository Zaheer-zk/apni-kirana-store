Here's everything in one go.

1. Backend, admin, db, redis (Docker)

# Start everything (one-time per session)

docker compose up -d

# Verify all 4 services are up

docker compose ps

# Tail logs (great for watching OTPs, BullMQ jobs, push events)

docker compose logs -f backend
docker compose logs -f admin

# Restart just one service after env changes

docker compose restart backend
docker compose restart admin

# Stop everything (keeps DB volumes)

docker compose stop

# Nuke + rebuild (loses DB unless you keep volumes)

docker compose down
docker compose up -d --build
Endpoints once up:

Backend API → http://localhost:3001 (/health to ping)
Admin dashboard → http://localhost:3000 2. Mobile apps (Expo, in 3 separate terminals)

# Terminal 1 — customer (port 8081)

cd apps/customer && npm run start

# Terminal 2 — store-portal (port 8082)

cd apps/store-portal && npx expo start --port 8082

# Terminal 3 — driver (port 8083)

cd apps/driver && npx expo start --port 8083
Scan each QR code with Expo Go on a physical device. Push notifications won't fire on iOS Simulator.

If a port is already in use:

lsof -ti :8081 | xargs kill # frees 8081 3. Seed users (already in DB)
Role Phone OTP (when SMS_PROVIDER=CONSOLE)
Customer (Zaheer) 8888888881 any 6 digits in dev
Store owner (Baqala) 8888888882 same
Driver (Chotu) 8888888883 same
Admin 9999999999 same 4. Get the OTP from the right place

# When SMS_PROVIDER=CONSOLE (dev default)

docker compose logs backend --tail 5 | grep OTP

# When SMS_PROVIDER=TWOFACTOR / MSG91 / TWILIO

# (real SMS goes to phone, BUT Redis still holds it for 5 min):

docker compose exec redis redis-cli GET "otp:8888888881" 5. Database operations

# Open a psql shell against the dev DB

docker compose exec postgres psql -U postgres -d apni_kirana_store

# Run a one-shot SQL query

docker compose exec -T postgres psql -U postgres -d apni_kirana_store \
 -c "SELECT name, role, phone FROM \"User\" LIMIT 10;"

# Apply pending Prisma migrations (after schema changes)

docker compose exec -T backend npx prisma migrate deploy
docker compose exec -T backend npx prisma generate

# Plus regenerate on host so editors / tests see the types:

npx prisma generate --schema=backend/prisma/schema.prisma

# Re-seed (wipes + reloads test data)

docker compose exec -T backend npx prisma db seed

# Open Prisma Studio (GUI on port 5555)

docker compose exec backend npx prisma studio --port 5555

# then visit http://localhost:5555

6. Backend tests

# All 8 suites, 106 tests

cd backend && /Users/zaheerkhan/Shared/P-p/apni-kirana-store/node_modules/.bin/jest --forceExit

# Just one suite

cd backend && /Users/zaheerkhan/Shared/P-p/apni-kirana-store/node_modules/.bin/jest --testPathPattern=admin --forceExit 7. Sync local edits → Docker (when you change backend/admin code)
The dev images don't bind-mount your source, so after editing backend or admin files:

# Backend file → container

docker compose cp backend/src/routes/orders.routes.ts \
 backend:/app/backend/src/routes/orders.routes.ts

# Admin file → container

docker compose cp 'apps/admin/app/(dashboard)/orders/page.tsx' \
 'admin:/app/apps/admin/app/(dashboard)/orders/page.tsx'

# Both have hot-reload — no manual restart needed

(Mobile apps run on the host so editing them auto-reloads via Expo's bundler.)

8. Quick API smoke tests

# Send OTP (will SMS if SMS_PROVIDER set, else logs to backend console)

curl -X POST http://localhost:3001/api/v1/auth/send-otp \
 -H 'Content-Type: application/json' \
 -d '{"phone":"8888888881"}'

# Verify and capture token (OTP=123456 in dev console mode, or whatever Redis returns)

TOKEN=$(curl -sX POST http://localhost:3001/api/v1/auth/verify-otp \
 -H 'Content-Type: application/json' \
 -d '{"phone":"8888888881","otp":"123456","role":"CUSTOMER"}' \
 | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Use the token

curl http://localhost:3001/api/v1/users/me -H "Authorization: Bearer $TOKEN"
For everything else, import the Postman collection (docs/postman/) — it's already wired up with auto-token capture.

9. Useful shortcuts

# Watch backend logs filtered for what matters

docker compose logs -f backend | grep -E "OTP|Error|FAIL|notify|Expo|FCM"

# Active orders right now

docker compose exec -T postgres psql -U postgres -d apni_kirana_store -c \
 "SELECT id, status, \"createdAt\" FROM \"Order\" WHERE status NOT IN ('DELIVERED','CANCELLED','REJECTED') ORDER BY \"createdAt\" DESC LIMIT 10"

# Currently registered push devices

docker compose exec -T postgres psql -U postgres -d apni_kirana_store -c \
 "SELECT u.name, d.platform, LEFT(d.token, 30) AS token FROM \"Device\" d JOIN \"User\" u ON u.id = d.\"userId\" ORDER BY d.\"lastSeenAt\" DESC"

# Reset chat retention (run the sweep manually)

docker compose exec backend node -e "require('./dist/services/chat.service').runChatRetention().then(console.log)" 10. Common workflows
Place a test order end-to-end (you can drive this from the customer app on your phone, or via Postman):

Customer phone → log in as Zaheer (8888888881)
Make sure default address is in Delhi, not Jaipur (toggle in Account → Addresses)
Add 2-3 items from Baqala → Place order
Watch:
Customer phone gets ORDER_PLACED push
Store-portal phone (Baqala / 8888888882) gets STORE_ORDER_OFFERED push
Admin browser bell badge increments (ADMIN_ORDER_PLACED)
On store-portal: Accept → drives STORE_ACCEPTED → chat opens
Driver (Chotu / 8888888883) goes online → gets DRIVER_NEW_DELIVERY → accepts
Driver enters pickup OTP → marks delivered → customer rates
Switch to real SMS (if you set up 2Factor):

# Already done in your .env — just restart

docker compose restart backend

# Now Send OTP delivers via real SMS to any Indian phone

Force-fix a stuck queue / Redis state:

docker compose exec redis redis-cli FLUSHDB # wipes Redis (BullMQ jobs + OTP cache)
docker compose restart backend

# Postman collection

Import these two files into Postman to exercise the API end-to-end.

## Files

- `apni-kirana-store.postman_collection.json` — every endpoint, organized by domain (Auth, Users, Stores, Orders, Drivers, Notifications, Chats, Promos, Admin).
- `local.postman_environment.json` — local Docker baseUrl and the seed phone numbers.

## Import

1. Open Postman → **File → Import** → drop both files in
2. Top-right environment dropdown → pick **"Apni Kirana Store — Local"**

## Login flow (do this first)

The collection uses a Bearer token from the `accessToken` variable. To populate it:

1. Run **Auth → Send OTP** (uses `{{phone}}`, defaults to `8888888881` = Zaheer)
2. Look at backend logs for the OTP: `docker compose logs backend --tail 5 | grep OTP`
3. Set the **`otp` variable** to that 6-digit code (or just keep `123456` if you set `SMS_PROVIDER=CONSOLE` — anything works in dev)
4. Run **Auth → Verify OTP (and capture token)** — the **test script automatically saves** `accessToken`, `refreshToken`, and `userId` into the collection variables
5. Every authed request uses `{{accessToken}}` automatically

To switch user roles, set `phone` to a different seed value:

| Phone | Role | Name |
|---|---|---|
| `8888888881` | CUSTOMER | Zaheer Khan |
| `8888888882` | STORE_OWNER | Baqala Owner |
| `8888888883` | DRIVER | Chotu Singh |
| `9999999999` | ADMIN | Admin User |

For non-customer roles, **also set the `role` field in Verify OTP's body** to `STORE_OWNER` / `DRIVER` / `ADMIN` so the backend's strict-role check passes.

## Variables auto-captured by test scripts

| Variable | Set by | Used by |
|---|---|---|
| `accessToken` | Auth → Verify OTP | every request via collection-level Bearer |
| `refreshToken` | Auth → Verify OTP | Auth → Refresh |
| `userId` | Auth → Verify OTP | informational |
| `orderId` | Orders → Place order | every Orders / Chats / Admin Orders request |
| `chatId` | Chats → Resolve chat for order | Chats → List/Send messages |

Other path-param variables (`storeId`, `driverId`, `addressId`, `itemId`, `catalogItemId`) are **not** auto-captured — set them manually after running the relevant list endpoint.

## Notes

- The collection's default `Authorization` is collection-level Bearer using `{{accessToken}}`. Public endpoints (`Send OTP`, `Verify OTP`, `Refresh`, `Nearby stores`, `Catalog list`, `VAPID public key`) override that with `noauth` to make them work without a token.
- `Send OTP` always returns `{success: true}` even for unknown numbers — by design (don't leak which numbers are registered).
- `Verify OTP` returns `404` for STORE_OWNER / DRIVER if the phone isn't pre-provisioned by an admin.
- All response bodies are `{ success, data, message }` envelopes. Use `r.data` in test scripts.

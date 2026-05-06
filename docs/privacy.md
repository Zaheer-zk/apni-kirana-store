# Privacy Model

This document describes how Apni Kirana protects customer PII from delivery
drivers, and how delivery handoff works without exposing phone numbers or
addresses.

## Why

Drivers are gig workers. Many are short-term partners we have minimal vetting
on. Customers — especially women, kids ordering for elderly parents, people in
gated apartment complexes — should not have their **name, phone number, or
exact street address** shipped to a stranger every time they order milk.

Pre-pivot, the order detail returned to a driver included the customer's full
profile and the full delivery address. Post-pivot we strip everything the
driver does not strictly need to do their job.

## What drivers see

The minimum useful set to pick up and drop off an order:

- The pickup **store**: name, coordinates, full street address (it's a public business).
- The **items**: name, qty, total — so the driver can verify the bag.
- The order **total** and **payment method** (so the driver knows whether to collect cash on delivery).
- The **dropoff coordinates** (`lat`, `lng`) for navigation.
- The dropoff **`label`** ("Home", "Office"), **`city`**, and **`pincode`** for orientation.

That is enough to navigate to the doorstep and complete the handoff.

## What drivers do NOT see

Stripped server-side from `GET /api/v1/orders/:id` whenever
`req.user.role === 'DRIVER'` (see `backend/src/routes/orders.routes.ts`):

| Field | Why hidden |
| --- | --- |
| `customer.name` | No need; OTP handoff doesn't require knowing who the customer is. |
| `customer.phone` | Removes spam, harassment, and "off-platform" delivery rerouting. |
| `deliveryAddress.street` (`line1`, `line2`) | Coordinates + label are enough; full street name is unnecessary breadcrumb data. |
| Recipient name | Same as customer name. |
| `Order.dropoffOtp` | Driver must learn the OTP from the customer in person, not from the API. |

The strip is enforced server-side, regardless of which client is calling. A
malicious driver app cannot just request the field — the response simply does
not contain it. Sockets do not leak PII either: `order:assigned` /
`order:offered` payloads only carry `orderId`, `distanceKm`, and `score`.

## Dropoff OTP — handoff verification

The dropoff OTP is the privacy-preserving alternative to "driver calls
customer to coordinate". Flow:

1. **Order placement.** Server generates a 4-digit numeric code:

   ```ts
   const dropoffOtp = Math.floor(1000 + Math.random() * 9000).toString();
   ```

   Stored in `Order.dropoffOtp` (nullable for legacy orders).

2. **Pickup.** Driver picks up the order and calls
   `PUT /drivers/orders/:id/pickup`. Status moves to `PICKED_UP`. Customer
   receives a push and sees the OTP in their app's order tracking screen.
   Driver still does **not** see it.

3. **Handoff at the door.** Customer reads the 4 digits aloud. Driver types
   them into the deliver sheet:

   ```bash
   curl -X PUT http://localhost:3001/api/v1/drivers/orders/$ORDER_ID/deliver \
     -H "Authorization: Bearer $DRIVER_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"dropoffOtp": "3471"}'
   ```

4. **Server check.** Implemented in `backend/src/routes/drivers.routes.ts`:

   ```ts
   if (order.dropoffOtp) {
     if (!submittedOtp) return sendError(res, 'Dropoff OTP required to confirm delivery', 400);
     if (submittedOtp !== order.dropoffOtp) return sendError(res, 'Incorrect dropoff OTP', 400);
   }
   ```

   - **Correct** → status moves to `DELIVERED`, driver earnings credit the delivery fee, customer is notified.
   - **Wrong / missing** → `400`; status stays `PICKED_UP`; the driver app retries.

There is no override in the driver app. If a customer has lost their phone or
can't read the screen, an admin can:

- Read the OTP off `GET /api/v1/admin/orders/:id` and tell the driver, or
- Manually finalize via a (planned) admin "force deliver" endpoint.

## Future: Twilio masked-call number

For cases where the driver genuinely needs to talk to the customer (gate code,
"left the package at the wrong floor"), the plan is a Twilio Programmable
Voice masked number:

- Driver app shows a "Call customer" button → dials a Twilio proxy number.
- Twilio routes the call to the customer's real number, swapping caller IDs.
- Recording is on by default for dispute resolution.
- The proxy expires when the order is `DELIVERED` or `CANCELLED`.

Until then, the OTP-only handoff is the contract.

## Audit trail (planned)

Admin manual overrides — `PUT /admin/orders/:id/assign-store`,
`PUT /admin/orders/:id/assign-driver`, and any future "force deliver" — will
write to a `OrderAuditLog` table capturing `(orderId, adminUserId, action,
beforeJson, afterJson, reason, createdAt)`. This is on the roadmap; the
endpoints already gate on `authorize('ADMIN')` so the actor is identifiable
from the access token.

## Where this is enforced in code

| Concern | File |
| --- | --- |
| PII strip in `GET /orders/:id` | `backend/src/routes/orders.routes.ts` |
| `dropoffOtp` generation at order create | `backend/src/routes/orders.routes.ts` |
| `dropoffOtp` validation at deliver | `backend/src/routes/drivers.routes.ts` |
| Driver service contract docstring | `backend/src/services/driver.service.ts` |
| `Order.dropoffOtp` column | `backend/prisma/schema.prisma`, migration `20260506_marketplace_catalog` |

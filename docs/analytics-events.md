# Analytics Events & Metric Definitions

Single source of truth for the event taxonomy. Server-generated events are
authoritative for money and fulfillment; browser events are informational
only and never prove a purchase or payment.

## Authoritative (server) event flow

Checkout → order → payment → shipment → delivery:

1. `order_create_attempt` — POST /orders received (userId only, no PII).
2. `checkout_started` + `payment_initiated` — attempt created
   (server-priced cart snapshot; NOT an order).
3. `order_placed` — order persisted with server-validated totals.
   COD additionally fires `cod_created` + `cod_collection_pending`.
3. `payment_initiated` — Razorpay gateway order created (or stub).
4. `payment_succeeded` — ONLY after HMAC verify or verified webhook.
   `payment_failed` / `payment_cancelled` / `payment_verification_failed`
   on the respective outcomes.
5. `payment_webhook_received` → `payment_webhook_verified` (or
   `payment_duplicate_ignored` on redelivery).
6. `shipment_serviceability_check` → `shipment_create_attempt` →
   `shipment_created` (or `shipment_create_failed` with reason; stubs
   included) → `shipment_pickup` / `shipment_in_transit` /
   `shipment_out_for_delivery` / `shipment_delivered` /
   `shipment_cancelled` / `shipment_rto` → `shipment_track_synced`.
7. `cod_collected` (or `cod_collection_failed`) via admin-only collect.
8. `order_status_changed`, `order_create_failed` on lifecycle/failure paths.

Pre-existing events (`order_updated/cancelled/completed/return_requested`,
cart/wishlist/product/user/session events) still fire from their original
call sites and now feed the shared analytics engine described below.
Product rating changes distinguish `product_rated` (first rating) from
`product_rating_updated` (changed rating) and `product_unrated` (removed
rating). New in this cycle: `checkout_started`, `order_status_changed`,
`ticket_created/replied/resolved/reopened/closed` (ids only, never message
bodies), `search_submitted` / `search_rate_limited` (taxonomy reserved;
product search already emits `site_searched`).

## Analytics pipeline (buffered, incremental)

- Every event goes through one global listener. `activities` records keep
  major events and operational/troubleshooting events; `analytics_events`
  records the analytics subset used for counters and reporting.
- Business routes never recalculate whole days. They append to in-memory
  buffers and the engine applies `$inc` deltas, so free-tier databases see
  batching instead of one write per request.
- Agenda flushes buffered activities/events/counters and product
  interaction metrics every few minutes. Ratings are flushed immediately
  because stars/review counts are user-visible.
- Daily and site counters are reconciled periodically from stored
  analytics events to repair drift from lost batches. Reconciliation never
  runs per request.
- Guest sessions are traffic, not logged-in users: `users.loggedInUsers`
  and `lastLogin` only move for authenticated accounts.
- Activity records store ids, statuses, amounts and request paths only —
  never request bodies or PII payloads.

Counter rules for daily/site analytics:

| Counter | Incremented by |
| --- | --- |
| `orders.total` / `orders.totalOrders` | `order_placed` (once per order) |
| `orders.revenue` | `order_paid` + `cod_collected` − `order_refunded` |
| `orders.delivered` | `order_completed` (admin or courier delivery) |
| `orders.cancelled` / `orders.returned` | `order_cancelled` / `order_return_requested` |
| `engagement.ratings` | `product_rated` +1, `product_unrated` −1 (updates do not count) |
| `engagement.comments` / `reviews.total` | comment created +1, deleted −1 (edits do not count) |
| `engagement.shares` / `engagement.wishlists` | share +1, wishlist add +1, wishlist remove −1 |
| `products.views` | `product_viewed` (raw views; unique counts are separate) |
| `traffic.uniqueUsers` / `uniqueGuests` | first `site_viewed` per user/guest per UTC day |

User presentation fields are maintained by the same buffered pipeline:
`lastLogin` and `currentlyLoggedIn` on session events, `totalOrders` on
`order_placed`, and `totalSpent` on `order_paid` / `cod_collected` minus
refunds. All are deduplicated by order id, and profile updates strip these
server-owned fields so clients cannot overwrite them.


## Deduplication & double-counting rules

- Order creation: `X-Idempotency-Key` header (or `idempotencyKey` body).
  Same key + user returns the original order (`deduplicated:true`).
- Payment verify: same `razorpay_payment_id` processed once; repeats return
  `deduplicated:true` and fire `payment_duplicate_ignored`.
- Webhooks: `(provider, eventId)` persisted in `webhook_events`; redeliveries
  short-circuit before mutating orders.
- Shipment create: refuses when `shipmozoOrderId`/`awb` already set unless
  admin passes `force:true`.
- Analytics handlers are fire-and-forget: an event failure never fails the
  order/payment/shipment write (see `safeEvent` wrappers).

## Metric definitions (`GET /api/analytics/orders-summary`)

- `revenue` = Σ `totalAmount` WHERE `payment.status = paid`.
  Unpaid COD is never revenue.
- `paidOrders` = count WHERE `payment.status = paid`.
- `aov` = `revenue / paidOrders` (null when zero).
- `cod.pendingCollection` = Σ `totalAmount` WHERE `method = cod` AND
  `codStatus = pending_collection`.
- `cod.collected` = Σ `amountPaid` WHERE `method = cod` AND
  `codStatus = collected`.
- `byStatus` / `byPaymentMethod` = counts in the requested date range
  (`createdAt`, UTC, end-exclusive).
- `shipments` = counts by `fulfillment.status`.
- `series` = per day/week/month buckets `{ orders, revenue }`
  (revenue bucket uses the paid-only rule).

## Privacy

Events carry ids, statuses, amounts, pincodes-level courier data only.
No passwords, tokens, API secrets, full card details, Razorpay secrets,
or Shipmozo keys are ever written to analytics records or logs.

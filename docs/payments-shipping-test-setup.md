# Payments & Shipping — Test Setup (Razorpay Test Mode + Shipmozo)

Test mode is mandatory for development. Live payments and real shipments
stay disabled unless explicitly configured for production.

## 1. Razorpay Test Mode

1. Sign in at https://dashboard.razorpay.com and switch to **Test Mode**.
2. Go to Settings → API Keys → Generate **Test** key pair (`rzp_test_*`).
3. Set server env:
   - `RAZORPAY_KEY_ID=rzp_test_...`
   - `RAZORPAY_KEY_SECRET=...` (server only, never frontend)
   - `RAZORPAY_WEBHOOK_SECRET=...` (from Dashboard → Webhooks)
4. Set frontend env: `VITE_RAZORPAY_KEY_ID=rzp_test_...` (public key only).
5. Register webhook: Dashboard → Webhooks → Add:
   - URL: `https://<your-server>/api/payments/webhooks/razorpay`
   - Secret: same as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.authorized`, `payment.captured`, `payment.failed`,
     `refund.created` (minimum).
   - Webhook URLs must use port 80/443.
6. Test flow (payment-first — no order exists before verification):
   - Checkout → server `POST /api/payments/razorpay/create` with cart
     items + addresses (server-validated INR→paise). Creates a payment
     ATTEMPT, not an order. Fails 503 `PAYMENT_CONFIGURATION_MISSING`
     when keys are absent (never a stub).
   - Razorpay Checkout opens with `key=VITE_RAZORPAY_KEY_ID`, order_id from step above.
   - On success the browser posts to `POST /api/payments/razorpay/verify`
     (attemptId + order_id + payment_id + signature); only HMAC-verified
     payments create the single order (idempotent on payment id).
   - Closed browser? The verified webhook reconciles the same attempt.
   - `POST /api/orders` with a prepaid method is rejected (422) — COD only.
   - Use Razorpay test cards/UPI from https://razorpay.com/docs/payments/test-card-details/.
   - Also test: failure, cancelled checkout (`POST /api/payments/:id/failed`),
     retry (reuses same `razorpayOrderId`), duplicate verify/webhook (idempotent).
7. Without keys, payment creation fails closed with 503
   `PAYMENT_CONFIGURATION_MISSING` before any record is made — the
   checkout shows "Online payment is temporarily unavailable" and offers
   COD. (Shipmozo calls likewise fail closed with 503
   `SHIPMENT_CONFIGURATION_MISSING`; see §3.)

## 2. Cash on Delivery (COD)

- Server: `COD_ENABLED=true`, `COD_FEE=30`, `COD_MIN_ORDER_VALUE=450`,
  `COD_MAX_ORDER_VALUE=3000` — single rule in
  `Server/utils/orderPricing.js` (`codEligibility`, inclusive).
  Revalidated on every order submit; manipulated requests get 422.
- Checkout sends `payment.method=cod` via `POST /api/orders` (COD-only;
  prepaid methods are rejected with 422 and directed to the
  payment-attempt flow); server prices fee, sets
  `payment.codStatus=pending_collection`, keeps `payment.status=pending`
  (NOT paid) and confirms the order via the normal lifecycle.
- Collection: admin only `POST /api/payments/cod/:id/collect`
  → `codStatus=collected` + `amountPaid`. Never mark COD paid at placement.
- Storefront shows fee table on `/shipping`; checkout shows COD fee line.

## 3. Shipmozo (official PDF + Swagger verified 2026-10-11)

Contract source: `public/Shipmozo API.pdf` + live Swagger
`https://shipping-api.com/api/v1?api-docs-v1.json` (both agree).

- Base URL: `https://shipping-api.com/app/api/v1` (`SHIPMOZO_API_BASE`,
  no trailing slash — trailing slash causes CORS issues per the PDF).
- Auth: `public-key` + `private-key` headers on EVERY request, from panel
  profile or `POST /login` (`SHIPMOZO_PUBLIC_KEY` / `SHIPMOZO_PRIVATE_KEY`,
  arrive after KYC approval).
- All responses: `{ result:"1"|"0", message, data }` — check `result`
  even on HTTP 200.
- Endpoint map (exact field names in `Server/utils/shipmozo.js`):
  `info`, `login`, `pincode-serviceability` (`pickup_pincode` +
  `delivery_pincode` only → `data.serviceable`), `rate-calculator`
  (weight in GRAMS + `dimensions[]`, `payment_type` PREPAID/COD),
  `push-order` (requires `warehouse_id`; response is only
  `{Info, order_id, reference_id}` — no AWB yet), `assign-courier`
  (`courier_id` from rate-calculator), `auto-assign-order` (needs panel
  Setting > Auto assign), `schedule-pickup` (body `{order_id}` only →
  returns `courier` + `awb_number` + `lr_number`), `cancel-order`
  (requires `order_id` + `awb_number`), `get-order-detail/{order_id}`,
  `track-order?awb_number=` (→ `current_status`, `courier`,
  `expected_delivery_date`, `scan_detail[]`), `get-order-label/{awb}`
  (base64 PNG, `?type_of_label=PDF` for PDF), `generate-manifest`
  (`?awb_numbers=` csv, max 25), `get-ndr-all` + `ndr-action/{awb}`
  (`?action=` REATTEMPT|RETURN), `get-warehouses` /
  `create-warehouse` / `order/update-warehouse`, `push-return-order` +
  `get-return-reason`.
- Our create flow: push-order → auto-assign (or assign-courier with an
  explicit `courierId`, or `pushOnly:true`) → AWB stored. Without keys
  the provider helper returns `{ stub:true }`, and every shipment route
  maps that to HTTP 503 `SHIPMENT_CONFIGURATION_MISSING` (never a fake
  success). Follow-up calls use the provider `order_id` from push-order
  (`fulfillment.shipmozoOrderId`), not the internal `ORD-…` id.
- Tracking sync classifies courier text precisely: `Out for Delivery`
  does NOT complete the order; only a true delivered status transitions
  `shipped → delivered`. `RTO` and `delivery exception/NDR` are reported
  separately, and repeated scans are de-duplicated before append.
- Tracking page: `https://panel.shipmozo.com/track-order` (customer enters
  AWB). We store `awb` + link to this page; we never fabricate AWBs.
- No webhooks are documented: tracking syncs via explicit
  `GET /api/shipments/:orderId/track` polling / admin refresh. The
  `POST /api/shipments/webhooks` receiver is future-proofing only.
- Safety: keep `SHIPMOZO_ALLOW_LIVE` unset/`false` in dev. Set
  `SHIPMOZO_WAREHOUSE_ID` (or rely on default ACTIVE warehouse lookup)
  and `SHIPMOZO_PICKUP_PINCODE` before live tests.
- Test checklist (after KYC keys land): serviceability true/false,
  `POST /api/shipments/rates`, `:orderId/create` (+ retry → 409 unless
  `force:true`, `pushOnly` path), `:orderId/track` sync + delivered
  transition, `:orderId/label`, `:orderId/pickup`, `:orderId/cancel-shipment`
  (needs AWB), `:orderId/push-return`.

## 4. Webhook endpoint summary

| Provider | URL | Verify |
|---|---|---|
| Razorpay | `POST /api/payments/webhooks/razorpay` | HMAC-SHA256 raw body vs `RAZORPAY_WEBHOOK_SECRET` (`X-Razorpay-Signature`) |
| Shipmozo | none documented — sync via `GET /api/shipments/:orderId/track` | `POST /api/shipments/webhooks` exists as future-proofing only; unverified payloads are recorded, never trusted |

Both handlers deduplicate (`webhook_events` / payment-id checks) and never
let analytics failures fail the order/payment update.

## 5. Order & refund lifecycle (single state machine)

All transitions live in `Server/models/schema/order.js` and are reused by
both the dedicated admin endpoints and the generic
`POST /api/orders/:id/updateStatus`. `validate:false` is ignored — a
client can never bypass the machine.

- `pending → confirmed → processing → shipped → delivered`
- `delivered → return_requested → returned` (or back to `delivered` when
  the return is rejected)
- `pending|confirmed|processing → cancelled` (terminal)
- Same-status and terminal-state calls are idempotent where retries are
  legitimate (packing/shipping/delivery polls) and rejected otherwise.
- Cancellation releases reserved stock and, for a captured prepaid
  payment, queues exactly one refund (`ensureCancellationRefund`).
  Stock release uses marker fields (`stockReleasedAt`,
  `returnStockReleasedAt`), so a retried click cannot inflate stock.
- `POST /api/orders/:id/refund/complete` performs a Razorpay refund for
  prepaid orders (or accepts `transactionId`, or `manual:true` after an
  operator already issued it). COD refunds complete manually. Retried
  completions return the final state instead of double-refunding.
- Generic admin status dispatch maps to the domain methods:
  `processing → startProcessing`, `shipped → markAsShipped`,
  `delivered → markAsDelivered`, `cancelled → cancelOrder + finalize`,
  `return_requested → requestReturn`, `returned → completeReturn`.

## 6. Local regression tests (no live keys needed)

Backend (`Server/`):

```bash
MONGODB_TEST_URI=mongodb://localhost:27017 npm test
```

- `tests/order-status.e2e.test.js` runs the full lifecycle against a real
  MongoDB (`razorbillz_order_status_test`): every order status, COD
  collection, cancellation/stock idempotency, prepaid refund queue,
  partial/full refunds, returns/restock, rejected returns, failed
  payments, invalid transitions and terminal idempotency.
- `tests/shipmozo.test.js` covers the offline-safe surface: the typed
  configuration-missing error, courier status classification, and
  tracking-history de-duplication. Live Shipmozo calls require KYC keys.
- The suite generates its own `ENCRYPTION_KEYS_JSON` before importing the
  order model; no production secrets are read.

Frontend (`razorbills/`):

```bash
npm run build
```

StrictMode-safe data loading uses
`src/utils/hooks/useStrictEffect.js`, and `api.client.get` coalesces
identical in-flight GETs, so mount effects no longer fire duplicate
reads.

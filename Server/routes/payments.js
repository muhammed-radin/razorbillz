import express from "express";
import crypto from "node:crypto";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import {
  OrderModel,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  CODStatus,
} from "../models/schema/order.js";
import {
  PaymentAttemptModel,
  AttemptStatus,
} from "../models/schema/paymentAttempt.js";
import {
  createRazorpayOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  razorpayConfig,
  razorpayMode,
  refundRazorpayPayment,
} from "../utils/razorpay.js";
import { priceOrderItems, PRICING_DEFAULTS } from "../utils/orderPricing.js";
import { assertCartMatchesServerCart } from "../utils/cartValidation.js";
import { reserveStock } from "../utils/inventory.js";
import { createOrderRecord, decryptOrderAddresses } from "../utils/orderFactory.js";
import {
  openAddressObject,
  sealAddressObject,
} from "../utils/crypto/index.js";
import { evt, Evts } from "../utils/events.manage.js";
import { db } from "../utils/db.js";
import { HttpError, Errors } from "../utils/httpError.js";
import { ah } from "../utils/middlewares/errorHandler.js";

const router = express.Router();

function newAttemptId() {
  return `ATT-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function safeEvent(name, payload) {
  try {
    evt.fire(name, payload);
  } catch (err) {
    console.error(`analytics event ${name} failed:`, err?.message);
  }
}

/* An order created by the legacy pre-verification flow that never got
 * paid must not be treated as placed: only pending/failed-payment
 * orders without a captured payment can be linked to an attempt. */
function assertLegacyOrderRetryable(order, userId) {
  if (!order) throw Errors.notFound("Order not found.");
  if (order.userId !== userId) throw Errors.forbidden("Access denied.");
  if (order.payment.method !== PaymentMethod.RAZORPAY) {
    throw Errors.validation("Order is not a Razorpay order.");
  }
  if (order.payment.status === PaymentStatus.PAID) {
    throw Errors.conflict("Order is already paid.");
  }
  if (!["pending", "confirmed"].includes(order.status)) {
    throw Errors.validation(
      `Order can no longer be paid for (status: ${order.status}).`,
    );
  }
}

function snapshotFromLegacyOrder(order) {
  return {
    products: order.products.map((p) => ({
      productId: p.productId,
      title: p.title,
      thumbnail: p.thumbnail,
      originalPrice: p.originalPrice,
      price: p.price,
      sku: p.sku,
      category: p.category,
      brand: p.brand,
      quantity: p.quantity,
      specialInfo: p.specialInfo ?? {},
      returnedQuantity: 0,
      refundedQuantity: 0,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    taxAmount: order.taxAmount,
    shippingAmount: order.shippingAmount,
    codFee: order.codFee ?? 0,
    totalAmount: order.totalAmount,
    currency: order.currency ?? "INR",
    weightKg: order.fulfillment?.packageWeightKg ?? 0.5,
    itemCount: order.products.reduce((t, p) => t + p.quantity, 0),
  };
}

/* =========================================================
 * POST /payments/razorpay/create
 * Canonical body: { items:[{productId,quantity}], shippingAddress,
 *   billingAddress, idempotencyKey }
 * Legacy retry body: { orderId } (pending unpaid order only).
 *
 * Validates + prices server-side, creates the gateway order and a
 * payment ATTEMPT. No Order, no stock move, no revenue event.
 * Fail-closed when Razorpay is unconfigured (503, no stub).
 * ========================================================= */
router.post(
  "/razorpay/create",
  requireAuth,
  passUserAuth,
  ah(async (req, res) => {
    const { orderId, items, shippingAddress, billingAddress, idempotencyKey } =
      req.body ?? {};
    const userId = req.user?.id;

    // Idempotent retry: same key returns the live attempt.
    if (idempotencyKey) {
      const existing = await PaymentAttemptModel.findOne({
        idempotencyKey,
        userId,
        status: AttemptStatus.CREATED,
      });
      if (existing) {
        safeEvent(Evts.PAYMENT_INITIATED, {
          attemptId: existing.id,
          reused: true,
        });
        return res.status(200).json({
          attemptId: existing.id,
          amount: existing.pricedTotal,
          currency: "INR",
          razorpayOrderId: existing.razorpayOrderId,
          keyId: razorpayConfig().keyId || null,
          reused: true,
        });
      }
    }

    let priced;
    let legacyOrder = null;
    if (orderId) {
      legacyOrder = await OrderModel.findOne({ id: orderId });
      assertLegacyOrderRetryable(legacyOrder, userId);
      priced = snapshotFromLegacyOrder(legacyOrder);
    } else {
      if (!Array.isArray(items) || items.length === 0) {
        throw Errors.validation("Checkout must contain at least one product.");
      }
      if (!shippingAddress || !billingAddress) {
        throw Errors.validation("shippingAddress and billingAddress are required.");
      }
      /* Cart integrity: the submitted items must match the persisted
       * server cart before a payment attempt is opened. */
      await assertCartMatchesServerCart({ userId, items });
      try {
        priced = await priceOrderItems(items, { method: "razorpay" });
      } catch (err) {
        throw new HttpError(
          err?.code ?? 400,
          "VALIDATION_FAILED",
          err?.message ?? "Invalid checkout items.",
        );
      }
    }

    // Fail-closed BEFORE any record pretends payment was initialized.
    const rzp = await createRazorpayOrder({
      amountInr: priced.totalAmount,
      receipt: legacyOrder?.id ?? `ATT-${Date.now()}`,
      notes: { userId },
    });

    const attempt = await PaymentAttemptModel.create({
      id: newAttemptId(),
      userId,
      idempotencyKey: idempotencyKey ?? null,
      items: priced.products.map((p) => ({
        productId: p.productId,
        quantity: p.quantity,
      })),
      pricedTotal: priced.totalAmount,
      currency: "INR",
      pricedSnapshot: priced,
      shippingAddress: sealAddressObject(
        legacyOrder?.shippingAddress ?? shippingAddress,
      ),
      billingAddress: sealAddressObject(
        legacyOrder?.billingAddress ?? billingAddress,
      ),
      razorpayOrderId: rzp.id,
      legacyOrderId: legacyOrder?.id ?? null,
      status: AttemptStatus.CREATED,
    });

    if (legacyOrder) {
      legacyOrder.payment.razorpayOrderId = rzp.id;
      legacyOrder.payment.attempts = (legacyOrder.payment.attempts ?? 0) + 1;
      await legacyOrder.save();
    }

    safeEvent(Evts.PAYMENT_INITIATED, {
      attemptId: attempt.id,
      orderId: legacyOrder?.id,
    });
    safeEvent(Evts.CHECKOUT_STARTED, {
      attemptId: attempt.id,
      amount: priced.totalAmount,
    });
    return res.status(201).json({
      attemptId: attempt.id,
      amount: priced.totalAmount,
      currency: "INR",
      razorpayOrderId: rzp.id,
      keyId: razorpayConfig().keyId || null,
    });
  }),
);

/* Atomically claim an attempt for confirmation — exactly one
 * concurrent verify/webhook wins; losers read the winner's order. */
async function claimAttempt(attemptId, razorpayPaymentId) {
  return PaymentAttemptModel.findOneAndUpdate(
    { id: attemptId, status: AttemptStatus.CREATED },
    {
      $set: {
        status: AttemptStatus.CONSUMED,
        razorpayPaymentId,
      },
    },
    { returnDocument: "after" },
  );
}

async function readConsumedOrder(attempt, tries = 6) {
  for (let i = 0; i < tries; i += 1) {
    const fresh = await PaymentAttemptModel.findOne({ id: attempt.id });
    if (fresh?.resultingOrderId) {
      const order = await OrderModel.findOne({ id: fresh.resultingOrderId });
      if (order) return order;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/* Create the real order for a verified payment. Shared by checkout
 * verify + webhook reconciliation (closed browser). Exactly-once via
 * the attempt claim + razorpayPaymentId dedup. */
async function confirmAttemptOrder(attempt, { razorpayPaymentId, razorpaySignature }) {
  // Payment already captured under a previous confirm?
  const dup = await OrderModel.findOne({
    "payment.razorpayPaymentId": razorpayPaymentId,
    "payment.status": PaymentStatus.PAID,
  });
  if (dup) {
    safeEvent(Evts.PAYMENT_DUPLICATE_IGNORED, {
      attemptId: attempt.id,
      razorpayPaymentId,
    });
    return { order: dup, deduplicated: true };
  }

  const claimed = await claimAttempt(attempt.id, razorpayPaymentId);
  if (!claimed) {
    const order = await readConsumedOrder(attempt);
    if (order) {
      safeEvent(Evts.PAYMENT_DUPLICATE_IGNORED, { attemptId: attempt.id });
      return { order, deduplicated: true };
    }
    throw Errors.conflict("Payment is already being processed. Retry shortly.");
  }

  const snap = claimed.pricedSnapshot;
  try {
    let order;
    if (claimed.legacyOrderId) {
      const legacy = await OrderModel.findOne({ id: claimed.legacyOrderId });
      if (!legacy) throw Errors.notFound("Linked order no longer exists.");
      if (legacy.payment.status === PaymentStatus.PAID) {
        return { order: legacy, deduplicated: true };
      }
      await reserveStock(snap.products);
      legacy.payment.razorpayPaymentId = razorpayPaymentId;
      legacy.payment.razorpaySignature = razorpaySignature;
      legacy.payment.transactionId = razorpayPaymentId;
      legacy.payment.verifiedAt = new Date();
      await legacy.save();
      order = await legacy.markAsPaid({
        transactionId: razorpayPaymentId,
        amount: legacy.totalAmount,
      });
      safeEvent(Evts.ORDER_PAID, {
        orderId: order.id,
        userId: order.userId,
        amount: order.payment?.amountPaid ?? order.totalAmount,
      });
    } else {
      order = await createOrderRecord({
        userId: claimed.userId,
        priced: snap,
        shippingAddress: openAddressObject(claimed.shippingAddress),
        billingAddress: openAddressObject(claimed.billingAddress),
        method: PaymentMethod.RAZORPAY,
        idempotencyKey: claimed.idempotencyKey,
        paymentFields: {
          status: PaymentStatus.PENDING,
          razorpayOrderId: claimed.razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          transactionId: razorpayPaymentId,
          verifiedAt: new Date(),
          amountPaid: snap.totalAmount,
        },
        markPaid: { transactionId: razorpayPaymentId, amount: snap.totalAmount },
      });
    }
    claimed.resultingOrderId = order.id;
    await claimed.save();
    safeEvent(Evts.PAYMENT_SUCCEEDED, {
      attemptId: attempt.id,
      orderId: order.id,
      amount: snap.totalAmount,
    });
    return { order, deduplicated: false };
  } catch (err) {
    // Stock (or creation) failed AFTER capture: mark failed and attempt
    // a gateway refund so the customer is not charged for nothing.
    claimed.status = AttemptStatus.FAILED;
    claimed.failureReason = err?.message ?? "order confirmation failed";
    await claimed.save().catch(() => {});
    let refund = null;
    try {
      refund = await refundRazorpayPayment({
        paymentId: razorpayPaymentId,
        amountInr: snap.totalAmount,
      });
    } catch (refundErr) {
      console.error("[payments] auto-refund failed:", refundErr?.message);
    }
    safeEvent(Evts.PAYMENT_FAILED, {
      attemptId: attempt.id,
      reason: claimed.failureReason,
      refunded: Boolean(refund),
    });
    throw new HttpError(
      409,
      "ORDER_CONFIRMATION_FAILED",
      "Payment was captured but the order could not be placed (item unavailable). " +
        (refund
          ? "A refund has been initiated to your source."
          : "Contact support with this reference for a refund."),
    );
  }
}

/* =========================================================
 * POST /payments/razorpay/verify
 * { attemptId, razorpay_order_id, razorpay_payment_id,
 *   razorpay_signature }
 * ONLY trusted backend verification creates the order.
 * ========================================================= */
router.post(
  "/razorpay/verify",
  requireAuth,
  passUserAuth,
  ah(async (req, res) => {
    const {
      attemptId,
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body ?? {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw Errors.validation(
        "razorpay_order_id, razorpay_payment_id and razorpay_signature are required.",
      );
    }
    let attempt = attemptId
      ? await PaymentAttemptModel.findOne({ id: attemptId })
      : await PaymentAttemptModel.findOne({
          razorpayOrderId: razorpay_order_id,
          userId: req.user?.id,
          status: AttemptStatus.CREATED,
        }).sort({ createdAt: -1 });
    // Legacy fallback: lookup by pending order id.
    if (!attempt && orderId) {
      attempt = await PaymentAttemptModel.findOne({
        legacyOrderId: orderId,
        userId: req.user?.id,
        status: AttemptStatus.CREATED,
      }).sort({ createdAt: -1 });
    }
    if (!attempt) throw Errors.notFound("Payment attempt not found or expired.");
    if (attempt.userId !== req.user?.id) throw Errors.forbidden("Access denied.");
    if (attempt.razorpayOrderId !== razorpay_order_id) {
      throw Errors.validation("Gateway order does not match this checkout.");
    }

    if (
      !verifyCheckoutSignature({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      })
    ) {
      attempt.status = AttemptStatus.FAILED;
      attempt.failureReason = "signature mismatch";
      await attempt.save();
      safeEvent(Evts.PAYMENT_VERIFICATION_FAILED, { attemptId: attempt.id });
      throw new HttpError(400, "SIGNATURE_MISMATCH", "Payment verification failed.");
    }

    const { order, deduplicated } = await confirmAttemptOrder(attempt, {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });
    return res.status(deduplicated ? 200 : 201).json({
      success: true,
      order: decryptOrderAddresses(order),
      ...(deduplicated ? { deduplicated: true } : {}),
    });
  }),
);

/* =========================================================
 * POST /payments/webhooks/razorpay — verified reconciliation.
 * Covers the closed-browser case: captured payments confirm the
 * attempt's order even when verify was never called.
 * ========================================================= */
router.post(
  "/webhooks/razorpay",
  ah(async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody =
      req.rawBody ??
      (Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(JSON.stringify(req.body ?? {})));
    safeEvent(Evts.PAYMENT_WEBHOOK_RECEIVED, {
      signaturePresent: Boolean(signature),
    });

    if (!verifyWebhookSignature(rawBody, signature)) {
      safeEvent(Evts.PAYMENT_VERIFICATION_FAILED, { source: "webhook" });
      throw new HttpError(400, "SIGNATURE_MISMATCH", "Invalid webhook signature.");
    }
    const payload = req.rawBody
      ? JSON.parse(req.rawBody.toString("utf8"))
      : Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString("utf8"))
        : req.body;
    const event = payload?.event ?? "unknown";
    const paymentEntity = payload?.payload?.payment?.entity ?? {};
    const orderEntity = payload?.payload?.order?.entity ?? {};
    const eventId = payload?.id ?? `${event}-${Date.now()}`;

    const seen = await db
      .collection("webhook_events")
      .findOne({ provider: "razorpay", eventId });
    if (seen) {
      safeEvent(Evts.PAYMENT_DUPLICATE_IGNORED, { eventId, event });
      return res.status(200).json({ ok: true, deduplicated: true });
    }
    await db.collection("webhook_events").insertOne({
      provider: "razorpay",
      eventId,
      event,
      receivedAt: new Date(),
      payload: {
        event,
        paymentId: paymentEntity.id,
        orderId: orderEntity.id ?? paymentEntity.order_id,
        status: paymentEntity.status,
      },
    });
    safeEvent(Evts.PAYMENT_WEBHOOK_VERIFIED, { eventId, event });

    const gatewayOrderId = orderEntity.id ?? paymentEntity.order_id;
    if (gatewayOrderId && (event.includes("captured") || event.includes("authorized"))) {
      const attempt = await PaymentAttemptModel.findOne({
        razorpayOrderId: gatewayOrderId,
      });
      if (attempt && attempt.status === AttemptStatus.CREATED && paymentEntity.id) {
        try {
          await confirmAttemptOrder(attempt, {
            razorpayPaymentId: paymentEntity.id,
            razorpaySignature: null,
          });
        } catch (err) {
          console.error("[payments] webhook confirm failed:", err?.message);
        }
      } else if (!attempt) {
        // Legacy pending order without an attempt: reconcile in place.
        const order = await OrderModel.findOne({
          "payment.razorpayOrderId": gatewayOrderId,
        });
        if (
          order &&
          order.payment.status !== PaymentStatus.PAID &&
          ![OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(
            order.status,
          ) &&
          ![
            PaymentStatus.REFUND_PENDING,
            PaymentStatus.PARTIALLY_REFUNDED,
            PaymentStatus.REFUNDED,
          ].includes(order.payment.status) &&
          paymentEntity.id
        ) {
          const dup = await OrderModel.findOne({
            "payment.razorpayPaymentId": paymentEntity.id,
            "payment.status": PaymentStatus.PAID,
          });
          if (!dup) {
            try {
              await reserveStock(order.products);
              order.payment.razorpayPaymentId = paymentEntity.id;
              order.payment.transactionId = paymentEntity.id;
              order.payment.verifiedAt = new Date();
              await order.save();
              await order.markAsPaid({
                transactionId: paymentEntity.id,
                amount: order.totalAmount,
              });
              safeEvent(Evts.ORDER_PAID, {
                orderId: order.id,
                userId: order.userId,
                amount: order.payment?.amountPaid ?? order.totalAmount,
              });
              safeEvent(Evts.PAYMENT_SUCCEEDED, {
                orderId: order.id,
                userId: order.userId,
                amount: order.payment?.amountPaid ?? order.totalAmount,
                source: "webhook",
              });
            } catch (err) {
              console.error("[payments] legacy webhook confirm failed:", err?.message);
            }
          }
        }
      }
    } else if (gatewayOrderId && event.includes("failed")) {
      const attempt = await PaymentAttemptModel.findOne({
        razorpayOrderId: gatewayOrderId,
        status: AttemptStatus.CREATED,
      });
      if (attempt) {
        attempt.status = AttemptStatus.FAILED;
        attempt.failureReason =
          paymentEntity.error_description ?? "payment failed (webhook)";
        await attempt.save();
      }
      const order = await OrderModel.findOne({
        "payment.razorpayOrderId": gatewayOrderId,
      });
      if (
        order &&
        order.payment.status !== PaymentStatus.PAID &&
        ![OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(order.status) &&
        ![
          PaymentStatus.REFUND_PENDING,
          PaymentStatus.PARTIALLY_REFUNDED,
          PaymentStatus.REFUNDED,
        ].includes(order.payment.status)
      ) {
        try {
          await order.markPaymentFailed(
            paymentEntity.error_description ?? "payment failed (webhook)",
          );
        } catch (err) {
          // Late failure events must never 500 the webhook or downgrade
          // money already captured/refunded.
          console.error("[payments] webhook failure update skipped:", err?.message);
        }
      }
      safeEvent(Evts.PAYMENT_FAILED, { source: "webhook", gatewayOrderId });
    }
    return res.status(200).json({ ok: true });
  }),
);

/* =========================================================
 * POST /payments/attempts/:id/failed | POST /payments/:id/failed
 * Client-reported failure/cancel. Records only — never pays.
 * ========================================================= */
async function recordFailure(req) {
  const { attemptId, reason, cancelled } = req.body ?? {};
  const id = req.params.id;
  if (attemptId || !orderIdLike(id)) {
    const attempt = await PaymentAttemptModel.findOne({
      id: attemptId ?? id,
      userId: req.user?.id,
    });
    if (!attempt) throw Errors.notFound("Payment attempt not found.");
    if (attempt.status === AttemptStatus.CONSUMED) {
      const order = await OrderModel.findOne({ id: attempt.resultingOrderId });
      return { order, alreadyPaid: true };
    }
    attempt.status = AttemptStatus.FAILED;
    attempt.failureReason = cancelled
      ? "checkout cancelled by customer"
      : (reason ?? "payment failed");
    await attempt.save();
    safeEvent(cancelled ? Evts.PAYMENT_CANCELLED : Evts.PAYMENT_FAILED, {
      attemptId: attempt.id,
    });
    return { attempt, recorded: true };
  }
  const order = await OrderModel.findOne({ id });
  if (!order) throw Errors.notFound("Order not found.");
  if (order.userId !== req.user?.id) throw Errors.forbidden("Access denied.");
  if (order.payment.status === PaymentStatus.PAID) {
    return { order, alreadyPaid: true };
  }
  if (
    [OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(order.status) ||
    [
      PaymentStatus.REFUND_PENDING,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.REFUNDED,
    ].includes(order.payment.status)
  ) {
    // Late/canceled client reports are not payment state changes.
    return { order, skipped: true };
  }
  await order.markPaymentFailed(
    cancelled ? "checkout cancelled by customer" : (reason ?? "payment failed"),
  );
  safeEvent(cancelled ? Evts.PAYMENT_CANCELLED : Evts.PAYMENT_FAILED, {
    orderId: order.id,
  });
  return { order, recorded: true };
}

const orderIdLike = (v) => typeof v === "string" && v.startsWith("ORD-");

router.post(
  "/attempts/:id/failed",
  requireAuth,
  passUserAuth,
  ah(async (req, res) => {
    return res.status(200).json({ success: true, ...(await recordFailure(req)) });
  }),
);

router.post(
  "/:id/failed",
  requireAuth,
  passUserAuth,
  ah(async (req, res) => {
    return res.status(200).json({ success: true, ...(await recordFailure(req)) });
  }),
);

/* Customer: inspect own attempts (diagnostics; attempts are not orders). */
router.get(
  "/attempts/mine",
  requireAuth,
  passUserAuth,
  ah(async (req, res) => {
    const attempts = await PaymentAttemptModel.find({ userId: req.user?.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return res.status(200).json(
      attempts.map((a) => ({
        id: a.id,
        status: a.status,
        amount: a.pricedTotal,
        currency: a.currency,
        resultingOrderId: a.resultingOrderId,
        createdAt: a.createdAt,
      })),
    );
  }),
);

/* =========================================================
 * POST /payments/cod/:id/collect  (admin, trusted)
 * ========================================================= */
router.post(
  "/cod/:id/collect",
  requireAuth,
  requireAdmin,
  requirePermission({ payments: ["manage"] }),
  ah(async (req, res) => {
    const order = await OrderModel.findOne({ id: req.params.id });
    if (!order) throw Errors.notFound("Order not found.");
    try {
      const alreadyCollected =
        order.payment?.codStatus === CODStatus.COLLECTED;
      const updated = await order.markCodCollected({
        actorId: req.user?.id ?? null,
        amount: req.body?.amount ?? order.totalAmount,
      });
      // Idempotent endpoint: repeated clicks must not add revenue twice.
      if (!alreadyCollected) {
        safeEvent(Evts.COD_COLLECTED, {
          orderId: order.id,
          userId: order.userId,
          amount: Number(
            req.body?.amount ?? updated.payment?.amountPaid ?? order.totalAmount,
          ),
        });
      }
      return res
        .status(200)
        .json({ success: true, order: decryptOrderAddresses(updated) });
    } catch (err) {
      safeEvent(Evts.COD_COLLECTION_FAILED, {
        orderId: req.params.id,
        reason: err?.message,
      });
      throw Errors.validation(err?.message ?? "Collection failed.");
    }
  }),
);

/* GET /payments/config — safe public flags (no secrets).
 * mode: test | live | unconfigured | unknown. */
router.get(
  "/config",
  ah(async (_req, res) => {
    const { configured, keyId } = razorpayConfig();
    res.json({
      success: true,
      razorpayConfigured: configured,
      razorpayMode: razorpayMode(),
      razorpayKeyId: configured ? keyId : null,
      currency: "INR",
      codEnabled: (process.env.COD_ENABLED ?? "true") !== "false",
      codFee: Number(process.env.COD_FEE ?? 30),
      codMinOrderValue: PRICING_DEFAULTS.codMinOrderValue,
      codMaxOrderValue: PRICING_DEFAULTS.codMaxOrderValue,
    });
  }),
);

export default router;

import express from "express";
import { db } from "../utils/db.js";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import { useMemory } from "../utils/memory.js";
import { priceOrderItems } from "../utils/orderPricing.js";
import { assertCartMatchesServerCart } from "../utils/cartValidation.js";
import { createOrderRecord, releaseOrderStock, decryptOrderAddresses } from "../utils/orderFactory.js";
import { evt, Evts, OrderEvent } from "../utils/events.manage.js";
import { isStaffUser } from "../utils/roles.js";
import { refundRazorpayPayment } from "../utils/razorpay.js";
import {
  OrderModel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  CODStatus,
  FulfillmentStatus,
  CancellationStatus,
  ReturnStatus,
  RefundStatus,
} from "../models/schema/order.js";

/* =========================================================
 * ORDER API ENDPOINTS
 * ========================================================= */

/* Fire a lifecycle event with the full order snapshot so analytics,
 * user stats and activity logs all see the same authoritative data. */
function fireOrderEvent(type, order, extra = {}) {
  try {
    if (!order) return;
    const plain =
      typeof order.toObject === "function" ? order.toObject() : order;
    const event = new OrderEvent({ type, order: plain });
    Object.assign(event, extra);
    evt.fire(type, event);
  } catch (error) {
    console.error("[orders] event fire failed:", error?.message);
  }
}

function orderStatusEventType(status) {
  if (status === OrderStatus.DELIVERED) return Evts.ORDER_COMPLETED;
  if (status === OrderStatus.CANCELLED) return Evts.ORDER_CANCELLED;
  if (status === OrderStatus.RETURN_REQUESTED) {
    return Evts.ORDER_RETURN_REQUESTED;
  }
  return Evts.ORDER_STATUS_CHANGED;
}

/* A cancellation is only final once reserved stock is released and any
 * captured money is queued for refund. Both steps are idempotent, so an
 * approve retry / double click cannot restock twice or double-queue. */
async function finalizeCancellation(order, { actorId = null, reason = "Order cancelled" } = {}) {
  await releaseOrderStock(order);

  let updated = order;
  if (updated.payment?.status === PaymentStatus.PAID) {
    try {
      updated = await updated.ensureCancellationRefund({ reason });
    } catch (err) {
      // Never fail the cancellation because the refund queue hiccuped;
      // the payment stays paid and an admin can queue it manually.
      console.error("[orders] cancellation refund queue failed:", err?.message);
    }
  }
  return updated;
}

/* Generic admin status changes must go through the domain methods so the
 * same guards (payment, returns, inventory) apply as the dedicated
 * endpoints. `validate:false` from clients is intentionally ignored. */
async function applyAdminStatusTransition(order, body, actorId) {
  const status = body?.status;
  const note = body?.note ?? null;
  const reason = body?.reason ?? note ?? null;

  switch (status) {
    case OrderStatus.PROCESSING:
      return order.startProcessing({ actor: "admin", actorId });

    case OrderStatus.SHIPPED:
      return order.markAsShipped({
        trackingNumber: body?.trackingNumber ?? null,
        serviceName: body?.serviceName ?? null,
        contactNumber: body?.contactNumber ?? null,
        email: body?.email ?? null,
        estimatedDelivery: body?.estimatedDelivery ?? null,
        actor: "admin",
        actorId,
      });

    case OrderStatus.DELIVERED:
      return order.markAsDelivered({ actor: "admin", actorId });

    case OrderStatus.CANCELLED:
      return order.cancelOrder({
        reason: reason ?? "Cancelled by admin",
        actor: "admin",
        actorId,
      });

    case OrderStatus.RETURN_REQUESTED:
      return order.requestReturn({
        reason: reason ?? "Return requested by admin",
        detail: body?.detail ?? null,
        actor: "admin",
        actorId,
      });

    case OrderStatus.RETURNED:
      return order.completeReturn({ actorId });

    default:
      // PENDING / CONFIRMED have no dedicated method; transitionTo still
      // validates the edge and rejects same-status calls.
      return order.transitionTo(status, { note, actor: "admin", actorId });
  }
}

/*
 * GET    /orders/list
 * Admin permissions [read]
 * Get paginated, filtered, and sorted list of all orders.
 */

/*
 * GET    /orders/:id
 * Client / Admin
 * Get complete order details by order ID.
 */

/*
 * GET    /orders/user-orders
 * Client
 * Get all orders belonging to the authenticated user.
 */

/*
 * POST   /orders
 * Client
 * Create a new order for the authenticated user.
 */

/*
 * GET    /orders/:id/status
 * Client / Admin
 * Get order status, payment status, fulfillment status,
 * cancellation status, return status, refund status,
 * and status history.
 */

/*
 * POST   /orders/:id/cancel
 * Client
 * Request cancellation of the authenticated user's order.
 */

/*
 * POST   /orders/:id/cancel/approve
 * Admin permissions [update]
 * Approve a pending order cancellation request.
 */

/*
 * POST   /orders/:id/cancel/reject
 * Admin permissions [update]
 * Reject a pending order cancellation request.
 */

/*
 * POST   /orders/:id/updateStatus
 * Admin permissions [update]
 * Manually transition the order to a valid order status.
 */

/*
 * POST   /orders/:id/payment/paid
 * Admin permissions [update]
 * Mark an order payment as successfully paid.
 */

/*
 * POST   /orders/:id/payment/failed
 * Admin permissions [update]
 * Mark an order payment as failed.
 */

/*
 * POST   /orders/:id/process
 * Admin permissions [update]
 * Start processing a confirmed order.
 */

/*
 * POST   /orders/:id/packed
 * Admin permissions [update]
 * Mark an order as packed and ready for shipment.
 */

/*
 * POST   /orders/:id/ship
 * Admin permissions [update]
 * Ship an order and update tracking/shipping information.
 */

/*
 * POST   /orders/:id/deliver
 * Admin permissions [update]
 * Mark a shipped order as delivered.
 */

/*
 * POST   /orders/:id/return
 * Client
 * Request a return for the authenticated user's delivered order.
 */

/*
 * POST   /orders/:id/return/approve
 * Admin permissions [update]
 * Approve a customer's return request.
 */

/*
 * POST   /orders/:id/return/reject
 * Admin permissions [update]
 * Reject a customer's return request.
 */

/*
 * POST   /orders/:id/return/received
 * Admin permissions [update]
 * Confirm that the returned package has been received.
 */

/*
 * POST   /orders/:id/return/complete
 * Admin permissions [update]
 * Complete the return process and mark the order as returned.
 */

/*
 * POST   /orders/:id/refund
 * Admin permissions [update]
 * Create/request a refund for an order.
 */

/*
 * POST   /orders/:id/refund/complete
 * Admin permissions [update]
 * Confirm that the refund has been successfully completed.
 */

/*
 * PATCH  /orders/:id/shipping
 * Admin permissions [update]
 * Update courier, tracking number, contact, and shipping information.
 */

/*
 * PATCH  /orders/:id/shipping/estimated-delivery
 * Admin permissions [update]
 * Update the estimated delivery date of an order.
 */

/*
 * GET    /orders/admin/pending
 * Admin permissions [read]
 * Get all pending orders.
 */

/*
 * GET    /orders/admin/processing
 * Admin permissions [read]
 * Get all orders currently being processed.
 */

/*
 * GET    /orders/admin/returns
 * Admin permissions [read]
 * Get all orders with pending return requests.
 */

/*
 * GET    /orders/admin/refunds
 * Admin permissions [read]
 * Get all orders with pending refunds.
 */

/*
 * DELETE /orders/:id
 * Admin permissions [delete]
 * Permanently delete an eligible terminal order.
 */

const router = express.Router();

/* =========================================================
 * CACHE
 * ========================================================= */

const globalMemory = typeof useMemory === "function" ? useMemory() : null;

/* Any non-GET order mutation can change what /list returns (statuses,
 * cancellation/return subdocs, totals). Invalidate cached list responses
 * after the response is sent so admin queues never go stale. */
router.use((req, res, next) => {
  if (req.method !== "GET" && typeof res.on === "function") {
    res.on("finish", () => {
      try {
        globalMemory?.clearByPrefix?.("/list?");
      } catch {
        // Cache invalidation is best-effort; never break the response.
      }
    });
  }
  next();
});

/* =========================================================
 * HELPERS
 * ========================================================= */

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getRequestValue(req, key, fallback = undefined) {
  return req.query?.[key] ?? req.body?.[key] ?? fallback;
}

function isValidOrderStatus(status) {
  return Object.values(OrderStatus).includes(status);
}

function isValidPaymentStatus(status) {
  return Object.values(PaymentStatus).includes(status);
}

function isValidFulfillmentStatus(status) {
  return Object.values(FulfillmentStatus).includes(status);
}

/* =========================================================
 * GET /orders/list
 *
 * Admin order listing
 * ========================================================= */

router.get(
  "/list",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["read"] }),
  async (req, res) => {
    try {
      const realtime = req.query?.realtime === "true";

      const cached = !realtime && globalMemory?.getLocalMemory(req.url);

      if (cached) {
        /* Cache holds the SEALED payload (no plaintext in memory
         * snapshots); Tier A decrypt-on-read happens at the response
         * boundary so admin UI gets plaintext addresses. */
        return res.json({
          ...cached,
          orders: (cached.orders ?? []).map(decryptOrderAddresses),
        });
      }

      const page = parsePositiveInt(getRequestValue(req, "page"), 1);

      const limit = Math.min(
        parsePositiveInt(getRequestValue(req, "limit"), 10),
        100,
      );

      const allowedSort = ["createdAt", "updatedAt", "totalAmount", "status"];
      const rawSortBy = getRequestValue(req, "sortBy", "createdAt");
      const sortBy = allowedSort.includes(rawSortBy) ? rawSortBy : "createdAt";

      const sortOrder = getRequestValue(req, "sortOrder") === "asc" ? 1 : -1;

      const startIndex =
        page > 1
          ? (page - 1) * limit
          : parseNonNegativeInt(getRequestValue(req, "startIndex"), 0);

      /* ---------------------------------------------
       * BUILD FILTER
       * --------------------------------------------- */

      const query = {};

      const status = req.query?.status ?? req.body?.status;

      const userId = req.query?.userId ?? req.body?.userId;

      const paymentStatus = req.query?.paymentStatus ?? req.body?.paymentStatus;

      const fulfillmentStatus =
        req.query?.fulfillmentStatus ?? req.body?.fulfillmentStatus;

      if (status) {
        if (!isValidOrderStatus(status)) {
          return res.status(400).json({
            code: 400,
            error: `Invalid order status: ${status}`,
          });
        }

        query.status = status;
      }

      if (userId) {
        query.userId = userId;
      }

      if (paymentStatus) {
        if (!isValidPaymentStatus(paymentStatus)) {
          return res.status(400).json({
            code: 400,
            error: `Invalid payment status: ${paymentStatus}`,
          });
        }

        query["payment.status"] = paymentStatus;
      }

      if (fulfillmentStatus) {
        if (!isValidFulfillmentStatus(fulfillmentStatus)) {
          return res.status(400).json({
            code: 400,
            error: `Invalid fulfillment status: ${fulfillmentStatus}`,
          });
        }

        query["fulfillment.status"] = fulfillmentStatus;
      }

      /* ---------------------------------------------
       * QUERY
       * --------------------------------------------- */

      const [orders, totalCount] = await Promise.all([
        OrderModel.find(query)
          .sort({
            [sortBy]: sortOrder,
            createdAt: -1,
          })
          .skip(startIndex)
          .limit(limit)
          .lean(),

        OrderModel.countDocuments(query),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      const result = {
        orders,

        page,
        limit,

        count: totalCount,

        totalPages,

        next: page < totalPages ? page + 1 : null,

        previous: page > 1 ? page - 1 : null,

        startIndex,

        endIndex: startIndex + orders.length - 1,

        sort: {
          by: sortBy,
          order: sortOrder,
        },

        fromCache: false,
      };

      globalMemory?.setLocalMemory(
        req.url,
        {
          ...result,
          fromCache: true,
        },
        60 * 2,
      );

      /* Decrypt-on-read: shipping/billing snapshots are sealed at rest
       * (envelope AES-GCM, server-only key). The admin listing needs
       * plaintext client fields; the cache above stays sealed. */
      return res.json({
        ...result,
        orders: result.orders.map(decryptOrderAddresses),
      });
    } catch (err) {
      console.error("Error fetching orders:", err);

      return res.status(500).json({
        code: 500,
        error: "Failed to fetch orders",
      });
    }
  },
);

/* =========================================================
 * GET /user-orders
 *
 * Get orders orderd by user
 * NOTE: must be registered before GET /:id, otherwise "user-orders"
 * is captured as :id and this route is unreachable.
 * ========================================================= */

router.get("/user-orders", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        code: 401,
        error: "Authenticated user ID is required",
      });
    }

    const orders = await OrderModel.find({
      userId,
    });

    // Addresses are sealed at rest — open them only for this response.
    return res.json(orders.map((o) => decryptOrderAddresses(o)));
  } catch (err) {
    console.error("Error fetching user orders:", err);

    return res.status(500).json({
      code: 500,
      error: "Failed to fetch user orders",
    });
  }
});

/* =========================================================
 * GET /orders/:id
 *
 * Get complete order
 * ========================================================= */

router.get("/:id", requireAuth, passUserAuth, async (req, res) => {
  try {
    const order = await OrderModel.findOne({
      id: req.params.id,
    });

    if (!order) {
      return res.status(404).json({
        code: 404,
        error: "Order not found",
      });
    }

    const isAdmin = isStaffUser(req.user);
    if (!isAdmin && order.userId !== req.user?.id) {
      return res.status(403).json({
        code: 403,
        error: "Access denied",
      });
    }

    return res.json(decryptOrderAddresses(order));
  } catch (err) {
    console.error("Error fetching order:", err);

    return res.status(500).json({
      code: 500,
      error: "Failed to fetch order",
    });
  }
});

/* =========================================================
 * POST /orders
 *
 * Create order from user
 * ========================================================= */

/* =========================================================
 * POST /orders — Cash on Delivery ONLY.
 *
 * Order-creation rule: no placed order exists before payment.
 * - COD: explicit opt-in + eligibility (₹450–₹3,000) -> order is
 *   created CONFIRMED with payment pending_collection (never paid).
 * - Razorpay: rejected here (422). Prepaid MUST use the
 *   payment-attempt flow (POST /payments/razorpay/create ->
 *   verify), which creates the order only after verification.
 * ========================================================= */

router.post("/", requireAuth, passUserAuth, async (req, res) => {
  const body = req.body ?? {};
  const userId = req.user?.id ?? body.userId;

  if (!userId) {
    return res.status(401).json({
      code: 401,
      error: "Authenticated user ID is required",
    });
  }

  /* Idempotency: same key + same user returns the original order
   * instead of creating a duplicate (double-submit / retry safe). */
  const idempotencyKey =
    req.headers["x-idempotency-key"] ?? body.idempotencyKey ?? null;

  if (idempotencyKey) {
    try {
      const existing = await OrderModel.findOne({ idempotencyKey, userId });
      if (existing) {
        return res
          .status(200)
          .json({ ...decryptOrderAddresses(existing), deduplicated: true });
      }
    } catch {
      // fall through to creation
    }
  }

  evt.fire(Evts.ORDER_CREATE_ATTEMPT, { userId });

  if (!Array.isArray(body.products) || body.products.length === 0) {
    evt.fire(Evts.ORDER_CREATE_FAILED, { userId, reason: "empty products" });
    return res.status(400).json({
      code: 400,
      error: "Order must contain at least one product",
    });
  }

  if (!body.shippingAddress || !body.billingAddress) {
    evt.fire(Evts.ORDER_CREATE_FAILED, { userId, reason: "missing address" });
    return res.status(400).json({
      code: 400,
      error: "shippingAddress and billingAddress are required",
    });
  }

  const rawMethod = String(body.payment?.method ?? "")
    .toLowerCase()
    .trim();
  if (rawMethod !== PaymentMethod.COD) {
    evt.fire(Evts.ORDER_CREATE_FAILED, { userId, reason: "non-cod method" });
    return res.status(422).json({
      code: 422,
      error:
        "Prepaid orders must use the verified payment flow: POST /api/payments/razorpay/create, then verify. " +
        "Direct order creation is Cash on Delivery only.",
    });
  }

  /* Cart integrity: the items being checked out must match the user's
   * persisted server cart (guards stale/optimistic client carts). */
  try {
    await assertCartMatchesServerCart({ userId, items: body.products });
  } catch (err) {
    evt.fire(Evts.ORDER_CREATE_FAILED, { userId, reason: "cart mismatch" });
    return res.status(err?.status ?? 409).json({
      code: err?.code ?? "CART_MISMATCH",
      error:
        err?.message ??
        "Your cart changed. Please review the cart and try again.",
      ...(err?.details ? { details: err.details } : {}),
    });
  }

  /* Server-authoritative pricing + COD eligibility (₹450–₹3,000).
   * Client prices/totals are ignored; manipulated requests fail here. */
  let priced;
  try {
    priced = await priceOrderItems(body.products, {
      method: PaymentMethod.COD,
    });
  } catch (err) {
    evt.fire(Evts.ORDER_CREATE_FAILED, {
      userId,
      reason: err?.message ?? "pricing failed",
    });
    return res.status(err?.code ?? 400).json({
      code: err?.code ?? 400,
      error: err?.message ?? "Invalid order items",
      productId: err?.productId,
    });
  }

  if (
    body.totalAmount !== undefined &&
    Number(body.totalAmount) !== priced.totalAmount
  ) {
    evt.fire(Evts.ORDER_CREATE_FAILED, {
      userId,
      reason: "total mismatch",
      expected: priced.totalAmount,
      received: Number(body.totalAmount),
    });
    return res.status(400).json({
      code: 8001,
      error:
        "Invalid order data, totalAmount does not match server calculation",
      expected: priced.totalAmount,
      received: Number(body.totalAmount),
    });
  }

  try {
    const order = await createOrderRecord({
      userId,
      priced,
      shippingAddress: body.shippingAddress,
      billingAddress: body.billingAddress,
      method: PaymentMethod.COD,
      idempotencyKey,
      confirm: true,
      confirmNote: "COD order confirmed",
    });
    return res.status(201).json(decryptOrderAddresses(order));
  } catch (err) {
    console.error("Error creating order:", err);

    if (err?.code === 11000) {
      if (idempotencyKey) {
        const existing = await OrderModel.findOne({
          idempotencyKey,
          userId,
        }).catch(() => null);
        if (existing) {
          return res
            .status(200)
            .json({ ...decryptOrderAddresses(existing), deduplicated: true });
        }
      }
      return res.status(409).json({
        code: 11000,
        error: "Order ID already exists",
      });
    }

    return res.status(err?.code === 422 ? 422 : 500).json({
      code: err?.code ?? 500,
      error: err?.message ?? "Failed to create order",
    });
  }
});

/* =========================================================
 * GET /orders/:id/status
 * ========================================================= */

router.get("/:id/status", requireAuth, passUserAuth, async (req, res) => {
  try {
    const order = await OrderModel.findOne({
      id: req.params.id,
    }).select(
      "id userId status statusHistory payment.status fulfillment.status cancellation.status return.status refund.status createdAt updatedAt",
    );

    if (!order) {
      return res.status(404).json({
        code: 404,
        error: "Order not found",
      });
    }

    /*
     * User ownership check.
     *
     * Admins may access any order.
     */
    const isAdmin = isStaffUser(req.user);

    if (!isAdmin && order.userId !== req.user?.id) {
      return res.status(403).json({
        code: 403,
        error: "Access denied",
      });
    }

    return res.json({
      id: order.id,

      status: order.status,

      paymentStatus: order.payment?.status,

      fulfillmentStatus: order.fulfillment?.status,

      cancellationStatus: order.cancellation?.status,

      returnStatus: order.return?.status,

      refundStatus: order.refund?.status,

      statusHistory: order.statusHistory,

      createdAt: order.createdAt,

      updatedAt: order.updatedAt,
    });
  } catch (err) {
    console.error("Error fetching order status:", err);

    return res.status(500).json({
      code: 500,
      error: "Failed to fetch order status",
    });
  }
});

/* =========================================================
 * POST /orders/:id/cancel
 *
 * Customer cancellation request
 * ========================================================= */

router.post("/:id/cancel", requireAuth, passUserAuth, async (req, res) => {
  try {
    const order = await OrderModel.findOne({
      id: req.params.id,
    });

    if (!order) {
      return res.status(404).json({
        code: 404,
        error: "Order not found",
      });
    }

    if (order.userId !== req.user?.id) {
      return res.status(403).json({
        code: 403,
        error: "Access denied",
      });
    }

    if (!order.canCancel()) {
      return res.status(400).json({
        code: 400,
        error: `Order cannot be cancelled from status: ${order.status}. Only pending, confirmed, or processing orders can be cancelled.`,
      });
    }

    const reason = String(req.body?.reason ?? "").trim();
    const detail = String(req.body?.detail ?? "").trim();
    if (!reason) {
      return res.status(400).json({
        code: 400,
        error: "A cancellation reason is required.",
      });
    }
    if (reason === "Other" && !detail) {
      return res.status(400).json({
        code: 400,
        error: "Please explain the reason when selecting Other.",
      });
    }

    let updatedOrder;
    try {
      updatedOrder = await order.requestCancellation({
        reason,
        detail: detail || null,
        actorId: req.user?.id ?? null,
      });
    } catch (err) {
      return res.status(400).json({
        code: 400,
        error: err?.message ?? "Cancellation request failed.",
      });
    }

    // A cancellation *request* is not a cancellation yet; only approval
    // moves the order out of circulation (and decrements counters).
    fireOrderEvent(Evts.ORDER_STATUS_CHANGED, updatedOrder, {
      requested: true,
      reason,
    });

    return res.json({
      success: true,
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Error requesting cancellation:", err);

    return res.status(500).json({
      code: 500,
      error: "Failed to request cancellation",
    });
  }
});

/* =========================================================
 * POST /orders/:id/cancel/approve
 *
 * Admin
 * ========================================================= */

router.post(
  "/:id/cancel/approve",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.approveCancellation({
        actorId: req.user?.id ?? null,
      });

      /* Terminal cancellation restores reserved inventory and (for a
       * captured payment) enters the refund queue. Both are idempotent. */
      const finalized = await finalizeCancellation(updatedOrder, {
        actorId: req.user?.id ?? null,
        reason: updatedOrder.cancellation?.reason ?? "Order cancelled",
      });

      fireOrderEvent(Evts.ORDER_CANCELLED, finalized, {
        approved: true,
        actorId: req.user?.id ?? null,
        refundPending: finalized.refund?.status === RefundStatus.PENDING,
      });

      return res.json({
        success: true,
        order: finalized,
      });
    } catch (err) {
      console.error("Error approving cancellation:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/cancel/reject
 *
 * Admin
 * ========================================================= */

router.post(
  "/:id/cancel/reject",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.rejectCancellation({
        reason: req.body?.reason ?? null,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error rejecting cancellation:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/status
 *
 * Admin generic status transition
 * ========================================================= */

router.post(
  "/:id/updateStatus",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const status = body.status;

      if (!status) {
        return res.status(400).json({
          code: 400,
          error: "status is required",
        });
      }

      if (!isValidOrderStatus(status)) {
        return res.status(400).json({
          code: 400,
          error: `Invalid order status: ${status}`,
        });
      }

      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      /* `validate:false` used to bypass the state machine entirely.
       * It is no longer honoured: every transition is validated. */
      let updatedOrder = await applyAdminStatusTransition(
        order,
        body,
        req.user?.id ?? null,
      );

      if (status === OrderStatus.CANCELLED) {
        updatedOrder = await finalizeCancellation(updatedOrder, {
          actorId: req.user?.id ?? null,
          reason: body.reason ?? body.note ?? "Cancelled by admin",
        });
      } else if (status === OrderStatus.RETURNED) {
        // Completing a return puts the units back into inventory once.
        await releaseOrderStock(updatedOrder, { reason: "return" });
      }

      fireOrderEvent(orderStatusEventType(status), updatedOrder, {
        note: body.note ?? null,
        actorId: req.user?.id ?? null,
        ...(status === OrderStatus.CANCELLED
          ? { refundPending: updatedOrder.refund?.status === RefundStatus.PENDING }
          : {}),
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error updating order status:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/payment/paid
 * ========================================================= */

router.post(
  "/:id/payment/paid",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const wasPaid = order.payment.status === PaymentStatus.PAID;

      if (
        [
          PaymentStatus.REFUND_PENDING,
          PaymentStatus.PARTIALLY_REFUNDED,
          PaymentStatus.REFUNDED,
        ].includes(order.payment.status)
      ) {
        return res.status(409).json({
          code: "PAYMENT_ALREADY_REFUNDED",
          error: "A refunded order cannot be marked as paid.",
        });
      }

      if ([OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(order.status)) {
        return res.status(409).json({
          code: "ORDER_TERMINAL",
          error: `Cannot mark a ${order.status} order as paid.`,
        });
      }

      const updatedOrder = await order.markAsPaid({
        transactionId: req.body?.transactionId ?? null,

        amount:
          req.body?.amount !== undefined
            ? Number(req.body.amount)
            : order.totalAmount,
      });

      // Idempotent endpoint: never count the same payment twice.
      if (!wasPaid) {
        fireOrderEvent(Evts.ORDER_PAID, updatedOrder);
      }

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error marking order as paid:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/payment/failed
 * ========================================================= */

router.post(
  "/:id/payment/failed",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      if (
        [
          PaymentStatus.PAID,
          PaymentStatus.REFUND_PENDING,
          PaymentStatus.PARTIALLY_REFUNDED,
          PaymentStatus.REFUNDED,
        ].includes(order.payment.status)
      ) {
        return res.status(409).json({
          code: "PAYMENT_ALREADY_CAPTURED",
          error: "A paid/refunded order cannot be marked as payment failed.",
        });
      }

      if ([OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(order.status)) {
        return res.status(409).json({
          code: "ORDER_TERMINAL",
          error: `Cannot fail payment on a ${order.status} order.`,
        });
      }

      const updatedOrder = await order.markPaymentFailed(
        req.body?.reason ?? null,
      );

      fireOrderEvent(Evts.PAYMENT_FAILED, updatedOrder, {
        reason: req.body?.reason ?? null,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error marking payment failed:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/process
 * ========================================================= */

router.post(
  "/:id/process",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.startProcessing({
        actor: "admin",
        actorId: req.user?.id ?? null,
      });

      fireOrderEvent(Evts.ORDER_STATUS_CHANGED, updatedOrder, {
        note: "order processing",
        actorId: req.user?.id ?? null,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error processing order:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/packed
 * ========================================================= */

router.post(
  "/:id/packed",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.markAsPacked();

      fireOrderEvent(Evts.ORDER_STATUS_CHANGED, updatedOrder, {
        note: "order packed",
        actorId: req.user?.id ?? null,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error packing order:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/ship
 * ========================================================= */

router.post(
  "/:id/ship",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.markAsShipped({
        trackingNumber: req.body?.trackingNumber ?? null,

        serviceName: req.body?.serviceName ?? null,

        contactNumber: req.body?.contactNumber ?? null,

        email: req.body?.email ?? null,

        estimatedDelivery: req.body?.estimatedDelivery ?? null,

        actor: "admin",

        actorId: req.user?.id ?? null,
      });

      fireOrderEvent(Evts.ORDER_STATUS_CHANGED, updatedOrder, {
        note: "order shipped",
        actorId: req.user?.id ?? null,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error shipping order:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/deliver
 * ========================================================= */

router.post(
  "/:id/deliver",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.markAsDelivered({
        actor: "admin",
        actorId: req.user?.id ?? null,
      });

      fireOrderEvent(Evts.ORDER_COMPLETED, updatedOrder, {
        actorId: req.user?.id ?? null,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error delivering order:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/return
 *
 * Customer requests return
 * ========================================================= */

router.post("/:id/return", requireAuth, passUserAuth, async (req, res) => {
  try {
    const order = await OrderModel.findOne({
      id: req.params.id,
    });

    if (!order) {
      return res.status(404).json({
        code: 404,
        error: "Order not found",
      });
    }

    if (order.userId !== req.user?.id) {
      return res.status(403).json({
        code: 403,
        error: "Access denied",
      });
    }

    // Returns are accepted for delivered orders within 7 days.
    if (
      order.status === OrderStatus.DELIVERED &&
      order.fulfillment?.deliveredAt
    ) {
      const days =
        (Date.now() - new Date(order.fulfillment.deliveredAt).getTime()) /
        86400000;
      if (days > Number(process.env.RETURN_WINDOW_DAYS ?? 7)) {
        return res.status(400).json({
          code: 400,
          error: `Return window closed (${process.env.RETURN_WINDOW_DAYS ?? 7} days after delivery). Contact support for help.`,
        });
      }
    }

    const reason = String(req.body?.reason ?? "").trim();
    const detail = String(req.body?.detail ?? "").trim();
    if (!reason) {
      return res.status(400).json({
        code: 400,
        error: "A return reason is required.",
      });
    }
    if (reason === "Other" && !detail) {
      return res.status(400).json({
        code: 400,
        error: "Please explain the reason when selecting Other.",
      });
    }

    let updatedOrder;
    try {
      updatedOrder = await order.requestReturn({
        reason,
        detail: detail || null,
        actor: "user",
        actorId: req.user?.id ?? null,
      });
    } catch (err) {
      return res.status(400).json({
        code: 400,
        error: err?.message ?? "Return request failed.",
      });
    }

    // A request never marks items returned, refunds payment, or
    // triggers courier pickup — admin review is required first.
    fireOrderEvent(Evts.ORDER_RETURN_REQUESTED, updatedOrder, { reason });

    return res.json({
      success: true,
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Error requesting return:", err);

    return res.status(400).json({
      code: 400,
      error: err.message,
    });
  }
});

/* =========================================================
 * POST /orders/:id/return/approve
 * ========================================================= */

router.post(
  "/:id/return/approve",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.approveReturn({
        actorId: req.user?.id ?? null,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error approving return:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/return/reject
 * ========================================================= */

router.post(
  "/:id/return/reject",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.rejectReturn({
        reason: req.body?.reason ?? null,
        actorId: req.user?.id ?? null,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error rejecting return:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/return/received
 * ========================================================= */

router.post(
  "/:id/return/received",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.markReturnReceived();

      fireOrderEvent(Evts.ORDER_STATUS_CHANGED, updatedOrder, {
        note: "return package received",
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error receiving return:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/return/complete
 * ========================================================= */

router.post(
  "/:id/return/complete",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.completeReturn({
        actorId: req.user?.id ?? null,
      });

      // Returned units re-enter inventory exactly once.
      await releaseOrderStock(updatedOrder, { reason: "return" });

      fireOrderEvent(Evts.ORDER_STATUS_CHANGED, updatedOrder, {
        note: "return completed",
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error completing return:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/refund
 *
 * Create refund request
 * ========================================================= */

router.post(
  "/:id/refund",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const amount =
        req.body?.amount !== undefined
          ? Number(req.body.amount)
          : order.getRemainingRefundAmount();

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          code: 400,
          error: "Invalid refund amount",
        });
      }

      const updatedOrder = await order.requestRefund({
        amount,
        reason: req.body?.reason ?? null,
      });

      fireOrderEvent(Evts.ORDER_STATUS_CHANGED, updatedOrder, {
        note: "refund requested",
        amount,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error requesting refund:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * POST /orders/:id/refund/complete
 * ========================================================= */

router.post(
  "/:id/refund/complete",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      if (order.refund.status !== RefundStatus.PENDING) {
        // Idempotent: a retried "complete" returns the final state.
        if (
          order.refund.status === RefundStatus.REFUNDED ||
          order.refund.status === RefundStatus.PARTIALLY_REFUNDED
        ) {
          return res.json({ success: true, order, deduplicated: true });
        }
        return res.status(400).json({
          code: 400,
          error: "No pending refund exists.",
        });
      }

      let transactionId = req.body?.transactionId ?? null;
      const manual = req.body?.manual === true;
      const method = order.payment?.method;

      /* Prepaid refunds go back through the gateway unless an operator
       * explicitly records an already-issued manual refund (with its
       * reference). COD refunds have no gateway payment, so the operator
       * supplies the bank/UPI reference (or none for cash). */
      if (!transactionId && !manual && method === PaymentMethod.RAZORPAY) {
        const paymentId =
          order.payment?.razorpayPaymentId ?? order.payment?.transactionId;
        if (!paymentId) {
          return res.status(400).json({
            code: "REFUND_REFERENCE_REQUIRED",
            error:
              "No Razorpay payment reference on this order. Pass transactionId or manual:true after issuing the refund.",
          });
        }
        try {
          const gatewayRefund = await refundRazorpayPayment({
            paymentId,
            amountInr: order.refund.amount,
          });
          transactionId = gatewayRefund?.id ?? null;
        } catch (err) {
          console.error("[orders] gateway refund failed:", err?.message);
          return res.status(502).json({
            code: "REFUND_GATEWAY_FAILED",
            error:
              err?.message ??
              "The gateway refund could not be completed. The refund stays pending.",
          });
        }
      }

      if (!transactionId && !manual && method !== PaymentMethod.COD) {
        return res.status(400).json({
          code: "REFUND_REFERENCE_REQUIRED",
          error:
            "A refund reference is required. Pass transactionId, or manual:true after issuing the refund.",
        });
      }

      const updatedOrder = await order.completeRefund({ transactionId });

      fireOrderEvent(Evts.ORDER_REFUNDED, updatedOrder, {
        amount: updatedOrder.refund?.amount ?? 0,
        actorId: req.user?.id ?? null,
        method,
        manual,
      });

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error completing refund:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * PATCH /orders/:id/shipping
 * ========================================================= */

router.patch(
  "/:id/shipping",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.updateShipmentInfo({
        serviceName: req.body?.serviceName,

        contactNumber: req.body?.contactNumber,

        email: req.body?.email,

        trackingNumber: req.body?.trackingNumber,
      });

      /* Decrypt-on-read: the admin client renders these fields
       * directly — never hand back sealed envelopes. */
      return res.json({
        success: true,
        order: decryptOrderAddresses(updatedOrder),
      });
    } catch (err) {
      console.error("Error updating shipping info:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * PATCH /orders/:id/shipping/estimated-delivery
 * ========================================================= */

router.patch(
  "/:id/shipping/estimated-delivery",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["update"] }),
  async (req, res) => {
    try {
      const { estimatedDate } = req.body ?? {};

      if (!estimatedDate) {
        return res.status(400).json({
          code: 400,
          error: "estimatedDate is required",
        });
      }

      const date = new Date(estimatedDate);

      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({
          code: 400,
          error: "Invalid estimated delivery date",
        });
      }

      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      const updatedOrder = await order.updateEstimatedDelivery(date);

      return res.json({
        success: true,
        order: updatedOrder,
      });
    } catch (err) {
      console.error("Error updating estimated delivery:", err);

      return res.status(400).json({
        code: 400,
        error: err.message,
      });
    }
  },
);

/* =========================================================
 * ADMIN SHORTCUTS
 * ========================================================= */

/* Legacy reconciliation: Razorpay orders stuck in pending/failed
 * payment (e.g. created by the old pre-verification flow or stubs).
 * These are NOT placed orders: no revenue, no shipment, no stock
 * move is assumed. Never auto-mark paid; use the retry flow or
 * cancel them explicitly. */
router.get(
  "/admin/unverified",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["read"] }),
  async (req, res) => {
    try {
      const limit = Math.min(
        Number.parseInt(req.query?.limit ?? "50", 10) || 50,
        100,
      );
      const orders = await OrderModel.find({
        "payment.method": PaymentMethod.RAZORPAY,
        "payment.status": {
          $in: [PaymentStatus.PENDING, PaymentStatus.FAILED],
        },
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      return res.json({
        count: orders.length,
        orders: orders.map(decryptOrderAddresses),
      });
    } catch (err) {
      console.error("Error fetching unverified orders:", err);
      return res.status(500).json({
        code: 500,
        error: "Failed to fetch unverified orders",
      });
    }
  },
);

router.get(
  "/admin/pending",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["read"] }),
  async (req, res) => {
    try {
      const orders = await OrderModel.getPendingOrders();

      return res.json({
        count: orders.length,
        orders: orders.map(decryptOrderAddresses),
      });
    } catch (err) {
      console.error("Error fetching pending orders:", err);

      return res.status(500).json({
        code: 500,
        error: "Failed to fetch pending orders",
      });
    }
  },
);

router.get(
  "/admin/processing",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["read"] }),
  async (req, res) => {
    try {
      const orders = await OrderModel.getProcessingOrders();

      return res.json({
        count: orders.length,
        orders: orders.map(decryptOrderAddresses),
      });
    } catch (err) {
      console.error("Error fetching processing orders:", err);

      return res.status(500).json({
        code: 500,
        error: "Failed to fetch processing orders",
      });
    }
  },
);

router.get(
  "/admin/returns",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["read"] }),
  async (req, res) => {
    try {
      const orders = await OrderModel.getReturnRequests();

      return res.json({
        count: orders.length,
        orders: orders.map(decryptOrderAddresses),
      });
    } catch (err) {
      console.error("Error fetching return requests:", err);

      return res.status(500).json({
        code: 500,
        error: "Failed to fetch return requests",
      });
    }
  },
);

router.get(
  "/admin/refunds",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["read"] }),
  async (req, res) => {
    try {
      const orders = await OrderModel.getPendingRefunds();

      return res.json({
        count: orders.length,
        orders: orders.map(decryptOrderAddresses),
      });
    } catch (err) {
      console.error("Error fetching pending refunds:", err);

      return res.status(500).json({
        code: 500,
        error: "Failed to fetch pending refunds",
      });
    }
  },
);

/* =========================================================
 * DELETE /orders/:id
 *
 * Prefer archive instead of physical deletion.
 * Kept here only if your admin system explicitly needs it.
 * ========================================================= */

router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  requirePermission({ orders: ["delete"] }),
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        id: req.params.id,
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          error: "Order not found",
        });
      }

      if (!order.isTerminal()) {
        return res.status(400).json({
          code: 400,
          error: "Only completed/cancelled orders can be deleted.",
        });
      }

      await OrderModel.deleteOne({
        id: req.params.id,
      });

      return res.json({
        success: true,
        message: "Order deleted successfully",
      });
    } catch (err) {
      console.error("Error deleting order:", err);

      return res.status(500).json({
        code: 500,
        error: "Failed to delete order",
      });
    }
  },
);

export default router;

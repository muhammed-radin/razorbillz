import express from "express";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import {
  OrderModel,
  OrderStatus,
} from "../models/schema/order.js";
import {
  shipmozoConfig,
  isShipmozoSuccess,
  checkServiceability,
  rateCalculator,
  getWarehouses,
  getReturnReasons,
  getOrderDetail,
  getOrderLabel,
  generateManifest,
  getNdrOrders,
  ndrAction,
  pushOrder,
  buildPushOrderPayload,
  autoAssignCourier,
  assignCourier,
  trackOrder,
  normalizeTrackingHistory,
  trackingUrlFor,
  schedulePickup,
  cancelShipment,
  pushReturnOrder,
} from "../utils/shipmozo.js";
import { evt, Evts, OrderEvent } from "../utils/events.manage.js";

const router = express.Router();

function safeEvent(name, payload) {
  try {
    evt.fire(name, payload);
  } catch (err) {
    console.error(`analytics event ${name} failed:`, err?.message);
  }
}

async function loadOrderForAdmin(orderId) {
  return OrderModel.findOne({ id: orderId });
}

function applyAwbToOrder(order, { awbNumber, courier, lrNumber, source }) {
  if (awbNumber) {
    order.fulfillment.awb = String(awbNumber);
    order.fulfillment.trackingNumber = String(awbNumber);
    order.fulfillment.trackingUrl = trackingUrlFor(String(awbNumber));
  }
  if (courier) order.fulfillment.courierName = courier;
  order.fulfillment.history.push({
    status: "shipment_created",
    message: `AWB ${awbNumber ?? "pending"} via ${courier ?? "courier"}${
      lrNumber ? ` (LR ${lrNumber})` : ""
    }`,
    timestamp: new Date(),
    source: source ?? "api",
  });
}

/* =========================================================
 * GET /shipments/config — safe flags + tracking base URL.
 * ========================================================= */
router.get("/config", requireAuth, passUserAuth, async (_req, res) => {
  const cfg = shipmozoConfig();
  res.json({
    configured: cfg.configured,
    allowLive: cfg.allowLive,
    trackingBase: cfg.trackingBase,
    pickupPincode: process.env.SHIPMOZO_PICKUP_PINCODE ?? null,
    warehouseConfigured: Boolean(cfg.warehouseId),
  });
});

/* =========================================================
 * POST /shipments/serviceability
 * Body: { orderId } or { pickupPincode, deliveryPincode }.
 * PDF: POST /pincode-serviceability takes ONLY the two pincodes and
 * returns data:{ serviceable:true|false }.
 * ========================================================= */
router.post(
  "/serviceability",
  requireAuth,
  passUserAuth,
  async (req, res) => {
    try {
      let { pickupPincode, deliveryPincode, orderId } = req.body ?? {};
      if (orderId) {
        const order = await OrderModel.findOne({ id: orderId });
        if (!order) {
          return res.status(404).json({ code: 404, error: "Order not found" });
        }
        const isAdmin =
          req.user?.role === "admin" || req.user?.role === "owner";
        if (!isAdmin && order.userId !== req.user?.id) {
          return res.status(403).json({ code: 403, error: "Access denied" });
        }
        pickupPincode ??= process.env.SHIPMOZO_PICKUP_PINCODE ?? null;
        deliveryPincode ??= order.shippingAddress?.postalCode ?? null;
      }
      safeEvent(Evts.SHIPMENT_SERVICEABILITY_CHECK, { deliveryPincode });
      const resp = await checkServiceability({
        pickupPincode,
        deliveryPincode,
      });
      return res.status(200).json(resp);
    } catch (err) {
      return res
        .status(400)
        .json({ code: 400, error: err?.message ?? "Serviceability check failed" });
    }
  },
);

/* =========================================================
 * POST /shipments/rates (admin) — rate-calculator for an order.
 * ========================================================= */
router.post(
  "/rates",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["view"] }),
  async (req, res) => {
    try {
      const { orderId } = req.body ?? {};
      let order = null;
      if (orderId) {
        order = await loadOrderForAdmin(orderId);
        if (!order) {
          return res.status(404).json({ code: 404, error: "Order not found" });
        }
      }
      const isCod = order
        ? order.payment?.method === "cod"
        : req.body?.cod === true;
      const resp = await rateCalculator({
        orderId: order?.id ?? req.body?.orderId ?? "",
        pickupPincode:
          req.body?.pickupPincode ?? process.env.SHIPMOZO_PICKUP_PINCODE,
        deliveryPincode:
          req.body?.deliveryPincode ?? order?.shippingAddress?.postalCode,
        paymentType: isCod ? "COD" : "PREPAID",
        shipmentType: req.body?.shipmentType ?? "FORWARD",
        orderAmount: order?.totalAmount ?? req.body?.orderAmount ?? 0,
        codAmount: isCod
          ? String(Math.round(Number(order?.totalAmount ?? 0)))
          : "",
        weightGrams:
          req.body?.weightGrams ??
          Math.max(
            1,
            Math.round(Number(order?.fulfillment?.packageWeightKg ?? 0.5) * 1000),
          ),
      });
      return res.status(200).json(resp);
    } catch (err) {
      return res
        .status(400)
        .json({ code: 400, error: err?.message ?? "Rate lookup failed" });
    }
  },
);

/* =========================================================
 * POST /shipments/:orderId/create  (admin)
 * Flow per PDF: push-order (no AWB back) -> auto-assign-order
 * (or assign-courier when courierId given) -> AWB + courier stored.
 * Idempotent: refuses if shipmozoOrderId/AWB already set unless
 * { force:true }.
 * Body opts: { warehouseId, weightKg, courierId, autoAssign=true }
 * ========================================================= */
router.post(
  "/:orderId/create",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["update"] }),
  async (req, res) => {
    try {
      const order = await loadOrderForAdmin(req.params.orderId);
      if (!order) {
        return res.status(404).json({ code: 404, error: "Order not found" });
      }
      if (
        (order.fulfillment?.shipmozoOrderId || order.fulfillment?.awb) &&
        !req.body?.force
      ) {
        return res.status(409).json({
          code: 409,
          error: "Shipment already created for this order. Pass force:true to retry.",
          fulfillment: order.fulfillment,
        });
      }
      if (
        ![OrderStatus.CONFIRMED, OrderStatus.PROCESSING].includes(order.status)
      ) {
        return res.status(400).json({
          code: 400,
          error: `Order must be confirmed/processing to create shipment (now: ${order.status})`,
        });
      }
      safeEvent(Evts.SHIPMENT_CREATE_ATTEMPT, {
        orderId: order.id,
        userId: order.userId,
      });

      // 1. push-order (PDF response: { Info, order_id, reference_id })
      let payload;
      try {
        payload = await buildPushOrderPayload(order, {
          weightKg: req.body?.weightKg,
          warehouseId: req.body?.warehouseId,
        });
      } catch (err) {
        order.fulfillment.shipmentFailure = err?.message;
        await order.save();
        return res.status(400).json({ code: 400, error: err?.message });
      }
      const pushed = await pushOrder(payload);
      if (!isShipmozoSuccess(pushed)) {
        order.fulfillment.shipmentFailure =
          pushed?.message ?? "Shipment creation failed";
        await order.save();
        safeEvent(Evts.SHIPMENT_CREATE_FAILED, {
          orderId: order.id,
          userId: order.userId,
          reason: order.fulfillment.shipmentFailure,
          stub: pushed?.stub === true,
        });
        return res.status(pushed?.stub ? 503 : 502).json({
          code: pushed?.stub ? 503 : 502,
          error: order.fulfillment.shipmentFailure,
          stub: pushed?.stub === true,
          provider: pushed,
        });
      }
      const pdata = pushed.data ?? {};
      order.fulfillment.shipmozoOrderId =
        pdata.order_id ?? pdata.reference_id ?? order.id;
      order.fulfillment.pickupPincode =
        process.env.SHIPMOZO_PICKUP_PINCODE ?? null;
      order.fulfillment.deliveryPincode =
        order.shippingAddress?.postalCode ?? null;

      // 2. courier assignment -> AWB (unless caller wants push-only)
      let assignment = null;
      if (req.body?.pushOnly !== true) {
        if (req.body?.courierId !== undefined) {
          assignment = await assignCourier({
            orderId: order.id,
            courierId: req.body.courierId,
          });
        } else if (req.body?.autoAssign !== false) {
          assignment = await autoAssignCourier({ orderId: order.id });
        }
        if (assignment) {
          if (isShipmozoSuccess(assignment)) {
            const adata = assignment.data ?? {};
            applyAwbToOrder(order, {
              awbNumber: adata.awb_number ?? adata.awb ?? null,
              courier:
                adata.courier_company ??
                adata.courier ??
                adata.courier_company_service ??
                null,
              lrNumber: adata.lr_number ?? null,
              source: "api",
            });
          } else {
            // Push succeeded; AWB pending — admin can retry assignment.
            order.fulfillment.history.push({
              status: "courier_assign_failed",
              message: assignment?.message ?? "Courier assignment failed",
              timestamp: new Date(),
              source: "api",
            });
          }
        }
      } else {
        order.fulfillment.history.push({
          status: "order_pushed",
          message: "Order pushed (push-only, no courier assigned yet)",
          timestamp: new Date(),
          source: "admin",
        });
      }

      order.fulfillment.shipmentFailure = null;
      await order.save();
      safeEvent(Evts.SHIPMENT_CREATED, {
        orderId: order.id,
        userId: order.userId,
        awb: order.fulfillment.awb,
      });
      return res.status(201).json({
        success: true,
        fulfillment: order.fulfillment,
        provider: { push: pushed, assignment },
      });
    } catch (err) {
      console.error("Shipment create failed:", err);
      safeEvent(Evts.SHIPMENT_CREATE_FAILED, {
        orderId: req.params.orderId,
        reason: err?.message,
      });
      return res
        .status(500)
        .json({ code: 500, error: err?.message ?? "Shipment creation failed" });
    }
  },
);

/* =========================================================
 * GET /shipments/:orderId/track — GET track-order?awb_number=
 * Persists current_status + scan_detail, syncs expected delivery.
 * ========================================================= */
router.get(
  "/:orderId/track",
  requireAuth,
  passUserAuth,
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({ id: req.params.orderId });
      if (!order) {
        return res.status(404).json({ code: 404, error: "Order not found" });
      }
      const isAdmin =
        req.user?.role === "admin" || req.user?.role === "owner";
      if (!isAdmin && order.userId !== req.user?.id) {
        return res.status(403).json({ code: 403, error: "Access denied" });
      }
      const awb = order.fulfillment?.awb ?? order.fulfillment?.trackingNumber;
      if (!awb) {
        return res.status(200).json({
          trackingAvailable: false,
          message: "No tracking information available yet.",
          trackingUrl: shipmozoConfig().trackingBase,
          fulfillment: order.fulfillment,
        });
      }
      const resp = await trackOrder({ awbNumber: awb });
      if (resp?.stub) {
        return res.status(200).json({
          trackingAvailable: false,
          stub: true,
          message: "Shipmozo not configured — live tracking unavailable.",
          trackingUrl: trackingUrlFor(awb),
          fulfillment: order.fulfillment,
        });
      }
      if (!isShipmozoSuccess(resp)) {
        return res.status(502).json({
          code: 502,
          error: resp?.message ?? "Tracking lookup failed",
          provider: resp,
        });
      }
      const history = normalizeTrackingHistory(resp);
      if (history.length) {
        order.fulfillment.history.push(...history);
      }
      const tdata = resp.data ?? {};
      if (tdata.courier) order.fulfillment.courierName = tdata.courier;
      if (tdata.expected_delivery_date) {
        const eta = new Date(tdata.expected_delivery_date);
        if (!Number.isNaN(eta.getTime())) {
          order.fulfillment.estimatedDelivery = eta;
        }
      }
      const latest = String(tdata.current_status ?? "").toLowerCase();
      if (latest.includes("deliver") && order.status === OrderStatus.SHIPPED) {
        try {
          await order.markAsDelivered({ actor: "system" });
          safeEvent(Evts.SHIPMENT_DELIVERED, {
            orderId: order.id,
            userId: order.userId,
          });
          // Keep the order lifecycle counter in sync with courier events.
          safeEvent(
            Evts.ORDER_COMPLETED,
            new OrderEvent({
              type: Evts.ORDER_COMPLETED,
              order: order.toObject(),
            }),
          );
        } catch {
          // keep tracking data even if transition invalid
        }
      } else if (latest.includes("cancel")) {
        safeEvent(Evts.SHIPMENT_CANCELLED, {
          orderId: order.id,
          userId: order.userId,
        });
      } else if (latest.includes("rto") || latest.includes("return")) {
        safeEvent(Evts.SHIPMENT_RTO, {
          orderId: order.id,
          userId: order.userId,
        });
      }
      order.fulfillment.lastSyncAt = new Date();
      order.fulfillment.trackingUrl = trackingUrlFor(awb);
      await order.save();
      safeEvent(Evts.SHIPMENT_TRACK_SYNCED, {
        orderId: order.id,
        userId: order.userId,
        awb,
      });
      return res.status(200).json({
        trackingAvailable: true,
        awb,
        courier: order.fulfillment.courierName,
        currentStatus: tdata.current_status ?? null,
        expectedDeliveryDate: tdata.expected_delivery_date ?? null,
        trackingUrl: order.fulfillment.trackingUrl,
        history: order.fulfillment.history,
        provider: resp,
      });
    } catch (err) {
      return res
        .status(500)
        .json({ code: 500, error: err?.message ?? "Tracking sync failed" });
    }
  },
);

/* GET /shipments/:orderId/label[?pdf=true] — base64 PNG (or PDF). */
router.get(
  "/:orderId/label",
  requireAuth,
  passUserAuth,
  async (req, res) => {
    try {
      const order = await OrderModel.findOne({ id: req.params.orderId });
      if (!order) {
        return res.status(404).json({ code: 404, error: "Order not found" });
      }
      const isAdmin =
        req.user?.role === "admin" || req.user?.role === "owner";
      if (!isAdmin && order.userId !== req.user?.id) {
        return res.status(403).json({ code: 403, error: "Access denied" });
      }
      const awb = order.fulfillment?.awb ?? order.fulfillment?.trackingNumber;
      if (!awb) {
        return res.status(404).json({ code: 404, error: "No AWB for this order yet" });
      }
      const resp = await getOrderLabel(awb, { pdf: req.query.pdf === "true" });
      return res.status(200).json(resp);
    } catch (err) {
      return res
        .status(500)
        .json({ code: 500, error: err?.message ?? "Label fetch failed" });
    }
  },
);

/* GET /shipments/:orderId/order-detail — panel-side order detail. */
router.get(
  "/:orderId/order-detail",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["view"] }),
  async (req, res) => {
    const resp = await getOrderDetail(req.params.orderId);
    return res.status(200).json(resp);
  },
);

/* Admin: schedule pickup (PDF body is { order_id } only) /
 * cancel shipment (needs order_id + awb_number). */
router.post(
  "/:orderId/pickup",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["update"] }),
  async (req, res) => {
    const order = await loadOrderForAdmin(req.params.orderId);
    if (!order) {
      return res.status(404).json({ code: 404, error: "Order not found" });
    }
    const resp = await schedulePickup({ orderId: order.id });
    if (isShipmozoSuccess(resp)) {
      const data = resp.data ?? {};
      applyAwbToOrder(order, {
        awbNumber: data.awb_number ?? null,
        courier: data.courier ?? null,
        lrNumber: data.lr_number ?? null,
        source: "api",
      });
      await order.save();
      safeEvent(Evts.SHIPMENT_PICKUP, {
        orderId: order.id,
        userId: order.userId,
        awb: data.awb_number,
      });
    }
    return res.status(200).json(resp);
  },
);

router.post(
  "/:orderId/cancel-shipment",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["update"] }),
  async (req, res) => {
    const order = await loadOrderForAdmin(req.params.orderId);
    if (!order) {
      return res.status(404).json({ code: 404, error: "Order not found" });
    }
    const awbNumber =
      req.body?.awbNumber ??
      order.fulfillment?.awb ??
      order.fulfillment?.trackingNumber;
    if (!awbNumber) {
      return res.status(400).json({
        code: 400,
        error: "awbNumber is required (order has no AWB yet)",
      });
    }
    const resp = await cancelShipment({ orderId: order.id, awbNumber });
    if (isShipmozoSuccess(resp)) {
      order.fulfillment.history.push({
        status: "shipment_cancelled",
        message: `Shipment cancelled (AWB ${awbNumber})`,
        timestamp: new Date(),
        source: "admin",
      });
      await order.save();
      safeEvent(Evts.SHIPMENT_CANCELLED, {
        orderId: order.id,
        userId: order.userId,
      });
    }
    return res.status(200).json(resp);
  },
);

/* Admin: warehouses / return reasons / NDR / manifest / push return. */
router.get(
  "/warehouses/list",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["view"] }),
  async (_req, res) => {
    return res.status(200).json(await getWarehouses());
  },
);

/* GET /shipments/ndr/list?from=dd-mm-yyyy&to=&per_page=&page= */
router.get(
  "/ndr/list",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["view"] }),
  async (req, res) => {
    const { from, to, per_page, perPage, page } = req.query ?? {};
    return res
      .status(200)
      .json(
        await getNdrOrders({
          from,
          to,
          perPage: per_page ?? perPage,
          page,
        }),
      );
  },
);

/* POST /shipments/ndr/:awb/action { action: REATTEMPT|RETURN } */
router.post(
  "/ndr/:awb/action",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["update"] }),
  async (req, res) => {
    try {
      const resp = await ndrAction({
        awbNumber: req.params.awb,
        action: req.body?.action,
      });
      if (isShipmozoSuccess(resp)) {
        const order = await OrderModel.findOne({
          "fulfillment.awb": req.params.awb,
        }).catch(() => null);
        if (order) {
          order.fulfillment.history.push({
            status: `ndr_${String(req.body?.action ?? "").toLowerCase()}`,
            message: `NDR action ${req.body?.action} for AWB ${req.params.awb}`,
            timestamp: new Date(),
            source: "admin",
          });
          await order.save();
        }
        safeEvent(Evts.SHIPMENT_TRACK_SYNCED, {
          source: "ndr",
          awb: req.params.awb,
          orderId: order?.id ?? null,
          userId: order?.userId ?? null,
          action: req.body?.action,
        });
      }
      return res.status(200).json(resp);
    } catch (err) {
      return res
        .status(400)
        .json({ code: 400, error: err?.message ?? "NDR action failed" });
    }
  },
);

/* POST /shipments/manifest { awbNumbers: [...] } (max 25). */
router.post(
  "/manifest",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["view"] }),
  async (req, res) => {
    try {
      const { awbNumbers } = req.body ?? {};
      return res.status(200).json(await generateManifest(awbNumbers));
    } catch (err) {
      return res
        .status(400)
        .json({ code: 400, error: err?.message ?? "Manifest failed" });
    }
  },
);

router.get(
  "/returns/reasons",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["view"] }),
  async (_req, res) => {
    return res.status(200).json(await getReturnReasons());
  },
);

router.post(
  "/:orderId/push-return",
  requireAuth,
  requireAdmin,
  requirePermission({ shipping: ["update"] }),
  async (req, res) => {
    try {
      const order = await loadOrderForAdmin(req.params.orderId);
      if (!order) {
        return res.status(404).json({ code: 404, error: "Order not found" });
      }
      const { pickup, returnReasonId, customerRequest, reasonComment } =
        req.body ?? {};
      if (!pickup || !returnReasonId) {
        return res.status(400).json({
          code: 400,
          error: "pickup {name,phone,addressLineOne,pinCode,city,state} and returnReasonId are required",
        });
      }
      const resp = await pushReturnOrder({
        orderId: order.id,
        pickup,
        productDetail: (order.products ?? []).map((p) => ({
          name: p.title,
          sku_number: p.sku ?? "",
          quantity: Number(p.quantity) || 1,
          discount: "",
          hsn: "",
          unit_price: Number(p.price),
          product_category: process.env.SHIPMOZO_PRODUCT_CATEGORY ?? "Other",
        })),
        paymentType: order.payment?.method === "cod" ? "COD" : "PREPAID",
        weightGrams: Math.max(
          1,
          Math.round(Number(order.fulfillment?.packageWeightKg ?? 0.5) * 1000),
        ),
        warehouseId: req.body?.warehouseId,
        returnReasonId,
        customerRequest: customerRequest ?? "REFUND",
        reasonComment: reasonComment ?? "",
      });
      return res.status(200).json(resp);
    } catch (err) {
      return res
        .status(400)
        .json({ code: 400, error: err?.message ?? "Push return failed" });
    }
  },
);

/* NOTE: Shipmozo documents NO webhooks. This receiver exists only for
 * future use if they add signed callbacks: it verifies an optional
 * shared secret and otherwise records without trusting the payload.
 * Tracking sync is done via explicit GET :orderId/track polling. */
router.post("/webhooks", express.json(), async (req, res) => {
  try {
    const secret = process.env.SHIPMOZO_WEBHOOK_SECRET ?? "";
    const provided =
      req.headers["x-shipmozo-signature"] ?? req.body?.signature ?? "";
    if (secret && provided !== secret) {
      return res.status(401).json({ code: 401, error: "Invalid webhook signature" });
    }
    const { order_id, awb, status } = req.body ?? {};
    if (!secret) {
      safeEvent(Evts.SHIPMENT_TRACK_SYNCED, {
        source: "webhook-unverified",
        order_id,
        awb,
        status,
      });
      return res.status(200).json({ ok: true, verified: false });
    }
    if (order_id || awb) {
      const order = await OrderModel.findOne({
        $or: [{ id: order_id }, { "fulfillment.awb": awb }],
      });
      if (order) {
        order.fulfillment.history.push({
          status: status ?? "webhook_update",
          message: "Shipmozo webhook update",
          timestamp: new Date(),
          source: "webhook",
        });
        order.fulfillment.lastSyncAt = new Date();
        await order.save();
      }
    }
    return res.status(200).json({ ok: true, verified: true });
  } catch (err) {
    return res.status(500).json({ code: 500, error: "Webhook failed" });
  }
});

export default router;

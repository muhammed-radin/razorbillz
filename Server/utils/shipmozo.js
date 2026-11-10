/* =========================================================
 * Shipmozo courier service (test-first, stub-safe)
 *
 * Contract source: official Shipmozo API PDF
 * (public/Shipmozo API.pdf) + live Swagger
 * https://shipping-api.com/api/v1?api-docs-v1.json — both agree.
 *
 * - Base URL: https://shipping-api.com/app/api/v1 (NO trailing slash;
 *   trailing slash causes CORS issues per the PDF).
 * - Auth: EVERY request carries `public-key` + `private-key` headers.
 *   Keys come from POST /login (panel username/password) or the panel
 *   user-profile section -> SHIPMOZO_PUBLIC_KEY / SHIPMOZO_PRIVATE_KEY.
 * - All responses: { result:"1"|"0", message, data }. Check `result`
 *   even on HTTP 200.
 * - Key endpoints used here: info, pincode-serviceability,
 *   rate-calculator, push-order, assign-courier, auto-assign-order,
 *   schedule-pickup, cancel-order (needs order_id + awb_number),
 *   get-order-detail/{order_id}, track-order (?awb_number=),
 *   get-order-label/{awb_number}, get-warehouses, create-warehouse,
 *   order/update-warehouse, push-return-order, get-return-reason.
 * - No Shipmozo webhooks are documented; tracking is synced via
 *   explicit poll (GET track-order) or admin refresh.
 * - Tracking page: https://panel.shipmozo.com/track-order
 *   (customer enters AWB). AWBs are never fabricated.
 *
 * No sandbox exists: when credentials are missing OR
 * SHIPMOZO_ALLOW_LIVE!=true, every operation returns { stub:true }
 * and NEVER creates shipments. Live keys arrive after KYC approval.
 * ========================================================= */

const DEFAULT_BASE = "https://shipping-api.com/app/api/v1";
export const SHIPMOZO_TRACKING_URL =
  process.env.SHIPMOZO_TRACKING_BASE ?? "https://panel.shipmozo.com/track-order";

export function shipmozoConfig() {
  const base = (process.env.SHIPMOZO_API_BASE ?? DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
  const publicKey = process.env.SHIPMOZO_PUBLIC_KEY ?? "";
  const privateKey = process.env.SHIPMOZO_PRIVATE_KEY ?? "";
  const allowLive = process.env.SHIPMOZO_ALLOW_LIVE === "true";
  return {
    base,
    publicKey,
    privateKey,
    allowLive,
    configured: Boolean(publicKey && privateKey && allowLive),
    trackingBase: SHIPMOZO_TRACKING_URL,
    warehouseId: process.env.SHIPMOZO_WAREHOUSE_ID ?? "",
  };
}

/* Typed error for the only expected failure in local/test
 * environments: credentials/live switch are placeholders. Routes map
 * this to HTTP 503 with a stable code; unrelated provider failures are
 * never swallowed. */
export const SHIPMENT_CONFIGURATION_MISSING =
  "SHIPMENT_CONFIGURATION_MISSING";

export function shipmentConfigError(message) {
  const err = new Error(
    message ??
      "Shipmozo is not configured. Set SHIPMOZO_PUBLIC_KEY, SHIPMOZO_PRIVATE_KEY and SHIPMOZO_ALLOW_LIVE=true.",
  );
  err.code = SHIPMENT_CONFIGURATION_MISSING;
  err.status = 503;
  return err;
}

export function isShipmozoConfigured() {
  return shipmozoConfig().configured;
}

export function assertShipmozoConfigured() {
  if (!shipmozoConfig().configured) throw shipmentConfigError();
}


function authHeaders() {
  const { publicKey, privateKey } = shipmozoConfig();
  return {
    "Content-Type": "application/json",
    "public-key": publicKey,
    "private-key": privateKey,
  };
}

function stubResult(op, message) {
  return {
    stub: true,
    result: "0",
    op,
    message:
      message ??
      "Shipmozo credentials missing or SHIPMOZO_ALLOW_LIVE!=true — stub result. No shipment created.",
    data: null,
  };
}

async function post(path, body) {
  const { base, configured } = shipmozoConfig();
  if (!configured) return stubResult(path);
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return data;
}

async function get(path, params = {}) {
  const { base, configured } = shipmozoConfig();
  if (!configured) return stubResult(path);
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null),
    ),
  ).toString();
  const res = await fetch(`${base}${path}${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(),
  });
  return res.json().catch(() => ({}));
}

export const isShipmozoSuccess = (resp) =>
  resp && !resp.stub && String(resp.result) === "1";

/* Strip a phone string to the numeric form Shipmozo expects
 * (digits only, last 10 for Indian mobiles). Returns a Number or null. */
export function toShipmozoPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  const num = Number(local);
  return Number.isFinite(num) ? num : null;
}

/* Split a single street line into Shipmozo's line_one / line_two. */
export function splitStreet(street) {
  const s = String(street ?? "").trim();
  if (s.length <= 120) return { lineOne: s, lineTwo: "" };
  const cut = s.lastIndexOf(",", 120);
  const idx = cut > 40 ? cut : 120;
  return { lineOne: s.slice(0, idx).trim(), lineTwo: s.slice(idx + 1).trim() };
}

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/* =========================================================
 * Utility APIs (exact PDF field names)
 * ========================================================= */

export function apiInfo() {
  return get("/info");
}

export function login({ username, password }) {
  if (!username || !password) throw new Error("username/password required");
  return post("/login", { username, password });
}

/* POST /pincode-serviceability { pickup_pincode, delivery_pincode }
 * -> { result, message, data:{ serviceable:true|false } } */
export function checkServiceability({ pickupPincode, deliveryPincode }) {
  if (!pickupPincode || !deliveryPincode) {
    throw new Error("pickupPincode and deliveryPincode are required");
  }
  return post("/pincode-serviceability", {
    pickup_pincode: num(pickupPincode),
    delivery_pincode: num(deliveryPincode),
  });
}

/* POST /rate-calculator — full PDF field set.
 * weightGrams in GRAMS; dimensions = [{no_of_box,length,width,height}]. */
export function rateCalculator({
  pickupPincode,
  deliveryPincode,
  paymentType = "PREPAID",
  shipmentType = "FORWARD",
  orderAmount = 0,
  typeOfPackage = "SPS",
  rovType = "ROV_OWNER",
  codAmount = "",
  weightGrams = 500,
  dimensions,
  orderId = "",
}) {
  if (!pickupPincode || !deliveryPincode) {
    throw new Error("pickupPincode and deliveryPincode are required");
  }
  return post("/rate-calculator", {
    order_id: orderId,
    pickup_pincode: num(pickupPincode),
    delivery_pincode: num(deliveryPincode),
    payment_type: paymentType,
    shipment_type: shipmentType,
    order_amount: num(orderAmount),
    type_of_package: typeOfPackage,
    rov_type: rovType,
    cod_amount: codAmount,
    weight: num(weightGrams, 500),
    dimensions: dimensions ?? [
      {
        no_of_box: "1",
        length: String(process.env.SHIPMOZO_LENGTH_CM ?? 10),
        width: String(process.env.SHIPMOZO_WIDTH_CM ?? 20),
        height: String(process.env.SHIPMOZO_HEIGHT_CM ?? 15),
      },
    ],
  });
}

export function getWarehouses() {
  return get("/get-warehouses");
}

export function createWarehouse({
  addressTitle,
  name,
  phone,
  alternatePhone,
  email,
  addressLineOne,
  addressLineTwo,
  pinCode,
}) {
  if (!addressTitle || !addressLineOne || !pinCode) {
    throw new Error("addressTitle, addressLineOne and pinCode are required");
  }
  return post("/create-warehouse", {
    address_title: addressTitle,
    name,
    phone,
    alternate_phone: alternatePhone,
    email,
    address_line_one: addressLineOne,
    address_line_two: addressLineTwo,
    pin_code: pinCode,
  });
}

export function updateOrderWarehouse({ orderId, warehouseId }) {
  if (!orderId || warehouseId === undefined) {
    throw new Error("orderId and warehouseId are required");
  }
  return post("/order/update-warehouse", {
    order_id: orderId,
    warehouse_id: warehouseId,
  });
}

export function getReturnReasons() {
  return get("/get-return-reason");
}

/* =========================================================
 * Order APIs
 * ========================================================= */

/* Resolve the warehouse_id push-order requires:
 * explicit opt -> env -> default ACTIVE warehouse from panel. */
export async function resolveWarehouseId(explicit) {
  assertShipmozoConfigured();
  if (explicit ?? process.env.SHIPMOZO_WAREHOUSE_ID) {
    return explicit ?? process.env.SHIPMOZO_WAREHOUSE_ID;
  }
  const resp = await getWarehouses();
  if (!isShipmozoSuccess(resp) || !Array.isArray(resp.data)) {
    throw shipmentConfigError(
      "No SHIPMOZO_WAREHOUSE_ID configured and warehouse lookup failed. Set the env or create a warehouse first.",
    );
  }
  const def =
    resp.data.find((w) => w.default === "YES" && w.status === "ACTIVE") ??
    resp.data.find((w) => w.status === "ACTIVE") ??
    resp.data[0];
  if (!def?.id) throw shipmentConfigError("No usable Shipmozo warehouse found.");
  return def.id;
}

/* Map an internal order -> exact push-order body from the PDF.
 * weight: PDF wants GRAMS (orderPricing gives kg -> x1000).
 * Response data is { Info, order_id, reference_id } — AWB/courier
 * arrive later via auto-assign / schedule-pickup. */
export async function buildPushOrderPayload(order, opts = {}) {
  const addr = order.shippingAddress ?? {};
  const { lineOne, lineTwo } = splitStreet(addr.street);
  const phone = toShipmozoPhone(addr.phoneNumber);
  if (!phone) throw new Error("Valid consignee phone number is required");
  const isCod = order.payment?.method === "cod";
  const warehouseId = await resolveWarehouseId(opts.warehouseId);
  const weightKg = num(
    opts.weightKg ?? order.fulfillment?.packageWeightKg ?? 0.5,
    0.5,
  );
  return {
    order_id: order.id,
    order_date: new Date(order.orderDate ?? Date.now())
      .toISOString()
      .slice(0, 10),
    ...(process.env.SHIPMOZO_ORDER_TYPE
      ? { order_type: process.env.SHIPMOZO_ORDER_TYPE }
      : {}),
    consignee_name: addr.name ?? "",
    consignee_phone: phone,
    ...(addr.email ? { consignee_email: addr.email } : {}),
    consignee_address_line_one: lineOne,
    ...(lineTwo ? { consignee_address_line_two: lineTwo } : {}),
    consignee_pin_code: num(addr.postalCode),
    consignee_city: addr.city ?? "",
    consignee_state: addr.state ?? "",
    product_detail: (order.products ?? []).map((p) => ({
      name: p.title,
      sku_number: p.sku ?? "",
      quantity: num(p.quantity, 1),
      discount: "",
      hsn: "",
      unit_price: num(p.price),
      product_category: process.env.SHIPMOZO_PRODUCT_CATEGORY ?? "Other",
    })),
    payment_type: isCod ? "COD" : "PREPAID",
    cod_amount: isCod ? String(Math.round(num(order.totalAmount))) : "",
    weight: Math.max(1, Math.round(weightKg * 1000)),
    length: num(process.env.SHIPMOZO_LENGTH_CM ?? 10, 10),
    width: num(process.env.SHIPMOZO_WIDTH_CM ?? 20, 20),
    height: num(process.env.SHIPMOZO_HEIGHT_CM ?? 15, 15),
    warehouse_id: warehouseId,
  };
}

export function pushOrder(payload) {
  if (!payload?.order_id) throw new Error("order_id is required");
  if (!payload?.warehouse_id) throw new Error("warehouse_id is required");
  return post("/push-order", payload);
}

/* POST /assign-courier { order_id, courier_id } — courier_id from
 * rate-calculator. -> data:{ order_id, reference_id, courier } */
export function assignCourier({ orderId, courierId }) {
  if (!orderId || courierId === undefined) {
    throw new Error("orderId and courierId are required");
  }
  return post("/assign-courier", { order_id: orderId, courier_id: courierId });
}

/* POST /auto-assign-order { order_id } — needs auto-assign configured
 * in panel (Setting > Auto assign).
 * -> data:{ order_id, reference_id, awb_number, courier_company, ... } */
export function autoAssignCourier({ orderId }) {
  if (!orderId) throw new Error("orderId is required");
  return post("/auto-assign-order", { order_id: orderId });
}

/* POST /schedule-pickup { order_id } — body is order_id ONLY per PDF.
 * -> data:{ order_id, reference_id, courier, awb_number, lr_number } */
export function schedulePickup({ orderId }) {
  if (!orderId) throw new Error("orderId is required");
  return post("/schedule-pickup", { order_id: orderId });
}

/* POST /cancel-order { order_id, awb_number } — BOTH required per PDF. */
export function cancelShipment({ orderId, awbNumber }) {
  if (!orderId || !awbNumber) {
    throw new Error("orderId and awbNumber are required");
  }
  return post("/cancel-order", {
    order_id: orderId,
    awb_number: awbNumber,
  });
}

/* GET /get-order-detail/{order_id} */
export function getOrderDetail(orderId) {
  if (!orderId) throw new Error("orderId is required");
  return get(`/get-order-detail/${encodeURIComponent(orderId)}`);
}

/* GET /track-order?awb_number= — data:{ order_id, reference_id,
 * awb_number, courier, expected_delivery_date, current_status,
 * status_time, scan_detail[] } */
export function trackOrder({ awbNumber }) {
  if (!awbNumber) throw new Error("awbNumber is required");
  return get("/track-order", { awb_number: awbNumber });
}

/* Precise courier-status classifier. Substring matching on "deliver"
 * wrongly treated "Out for Delivery" as delivered, which completed
 * orders before the parcel reached the customer. Order matters:
 * terminal/side states are checked before the generic delivery word. */
export function classifyTrackingStatus(status) {
  const s = String(status ?? "")
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "unknown";

  if (/\bcancel/.test(s)) return "cancelled";
  if (
    /\brto\b|\breturn(ed)? to (origin|seller|shipper|consignor)\b|\breverse pickup\b|\breturn shipment\b/.test(
      s,
    )
  ) {
    return "rto";
  }
  if (/\b(out for delivery|out for dispatch|ofd)\b/.test(s)) {
    return "out_for_delivery";
  }
  if (
    /\b(undelivered|not delivered|delivery attempted|attempted delivery|delivery failed|failed delivery|delivery exception|ndr)\b/.test(
      s,
    )
  ) {
    return "delivery_exception";
  }
  if (/\b(delivered|delivery successful|delivery completed|delivery complete)\b/.test(s)) {
    return "delivered";
  }
  return "in_transit";
}

const historySignature = (entry) =>
  [
    entry?.status ?? "",
    entry?.message ?? "",
    entry?.location ?? "",
  ].join("|");

/* Tracking polls repeat the same scans. Merge only unseen entries so a
 * refresh loop cannot grow fulfillment.history without bound. */
export function appendUniqueHistory(order, entries = []) {
  if (!order?.fulfillment) return order;
  const history = order.fulfillment.history ?? [];
  const seen = new Set(history.map(historySignature));
  for (const entry of entries) {
    if (!entry) continue;
    const key = historySignature(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    history.push(entry);
  }
  order.fulfillment.history = history;
  return order;
}

/* Normalize the real track-order payload into fulfillment.history.
 * scan_detail entries have no documented shape, so map best-effort. */
export function normalizeTrackingHistory(trackResp) {
  const data = trackResp?.data ?? {};
  const entries = [];
  if (Array.isArray(data.scan_detail) && data.scan_detail.length) {
    for (const s of data.scan_detail) {
      if (s && typeof s === "object") {
        entries.push({
          status: s.status ?? s.current_status ?? s.remark ?? null,
          message:
            s.message ?? s.remark ?? s.description ?? s.location ?? null,
          location: s.location ?? s.city ?? null,
          timestamp: s.date ?? s.timestamp ?? s.status_time ?? new Date(),
          source: "api",
        });
      } else if (s != null) {
        entries.push({
          status: null,
          message: String(s),
          location: null,
          timestamp: new Date(),
          source: "api",
        });
      }
    }
  }
  if (data.current_status) {
    entries.push({
      status: data.current_status,
      message: `Courier: ${data.courier ?? "—"}${
        data.expected_delivery_date
          ? `, expected ${data.expected_delivery_date}`
          : ""
      }`,
      location: null,
      timestamp: data.status_time ?? new Date(),
      source: "api",
    });
  }
  return entries;
}

/* GET /get-order-label/{awb_number}[?type_of_label=PDF] — data is an
 * array of { label: base64 PNG, created_at }. */
export function getOrderLabel(awbNumber, { pdf = false } = {}) {
  if (!awbNumber) throw new Error("awbNumber is required");
  return get(
    `/get-order-label/${encodeURIComponent(awbNumber)}`,
    pdf ? { type_of_label: "PDF" } : {},
  );
}

/* GET /generate-manifest?awb_numbers=a,b,c (comma-separated, max 25). */
export function generateManifest(awbNumbers) {
  const list = (Array.isArray(awbNumbers) ? awbNumbers : [awbNumbers])
    .map((a) => String(a ?? "").trim())
    .filter(Boolean);
  if (!list.length) throw new Error("At least one AWB number is required");
  if (list.length > 25) throw new Error("Maximum 25 AWB numbers per manifest");
  return get("/generate-manifest", { awb_numbers: list.join(",") });
}

/* GET /get-ndr-all?from=dd-mm-yyyy&to=&per_page=&page= — non-delivery
 * (failed delivery attempt) shipments needing action. */
export function getNdrOrders({ from, to, perPage = 25, page = 1 } = {}) {
  return get("/get-ndr-all", {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    per_page: Math.min(Math.max(num(perPage, 25), 1), 100),
    page: Math.max(num(page, 1), 1),
  });
}

/* POST /ndr-action/{awb_number}?action=REATTEMPT|RETURN */
export function ndrAction({ awbNumber, action }) {
  if (!awbNumber) throw new Error("awbNumber is required");
  const act = String(action ?? "").toUpperCase();
  if (!["REATTEMPT", "RETURN"].includes(act)) {
    throw new Error("action must be REATTEMPT or RETURN");
  }
  return post(`/ndr-action/${encodeURIComponent(awbNumber)}?action=${act}`, {});
}

/* POST /push-return-order — exact PDF fields. weight in GRAMS
 * per the swagger schema (PDF text says kg; swagger example uses
 * grams-scale values — we send grams like push-order). */
export function pushReturnOrder({
  orderId,
  orderDate,
  pickup,
  productDetail,
  paymentType = "PREPAID",
  weightGrams = 500,
  length,
  width,
  height,
  warehouseId,
  returnReasonId,
  customerRequest = "REFUND",
  reasonComment = "",
}) {
  if (!orderId || !pickup || !productDetail?.length || !returnReasonId) {
    throw new Error(
      "orderId, pickup, productDetail and returnReasonId are required",
    );
  }
  return post("/push-return-order", {
    order_id: orderId,
    order_date: orderDate ?? new Date().toISOString().slice(0, 10),
    pickup_name: pickup.name,
    pickup_phone: pickup.phone,
    ...(pickup.email ? { pickup_email: pickup.email } : {}),
    pickup_address_line_one: pickup.addressLineOne,
    ...(pickup.addressLineTwo
      ? { pickup_address_line_two: pickup.addressLineTwo }
      : {}),
    pickup_pin_code: num(pickup.pinCode),
    pickup_city: pickup.city,
    pickup_state: pickup.state,
    product_detail: productDetail,
    payment_type: paymentType,
    weight: num(weightGrams, 500),
    length: length ?? num(process.env.SHIPMOZO_LENGTH_CM ?? 10, 10),
    width: width ?? num(process.env.SHIPMOZO_WIDTH_CM ?? 20, 20),
    height: height ?? num(process.env.SHIPMOZO_HEIGHT_CM ?? 15, 15),
    ...(warehouseId ? { warehouse_id: warehouseId } : {}),
    return_reason_id: returnReasonId,
    customer_request: customerRequest,
    reason_comment: reasonComment,
  });
}

export function trackingUrlFor(awbNumber) {
  const { trackingBase } = shipmozoConfig();
  if (!awbNumber) return trackingBase;
  return trackingBase; // panel page where customer enters AWB; never fabricate deep links
}

export default {
  shipmozoConfig,
  isShipmozoConfigured,
  assertShipmozoConfigured,
  shipmentConfigError,
  SHIPMENT_CONFIGURATION_MISSING,
  isShipmozoSuccess,
  classifyTrackingStatus,
  appendUniqueHistory,
  apiInfo,
  login,
  checkServiceability,
  rateCalculator,
  getWarehouses,
  createWarehouse,
  updateOrderWarehouse,
  getReturnReasons,
  resolveWarehouseId,
  buildPushOrderPayload,
  pushOrder,
  assignCourier,
  autoAssignCourier,
  schedulePickup,
  cancelShipment,
  getOrderDetail,
  trackOrder,
  normalizeTrackingHistory,
  getOrderLabel,
  generateManifest,
  getNdrOrders,
  ndrAction,
  pushReturnOrder,
  toShipmozoPhone,
  splitStreet,
  trackingUrlFor,
  SHIPMOZO_TRACKING_URL,
};

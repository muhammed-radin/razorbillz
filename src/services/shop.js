import { api } from "@/utils/api";
import { decryptAddress, encryptAddress } from "@/utils/crypt";

const unwrap = (promise) => promise.then((res) => res.data);
const get = (url, config) => unwrap(api.client.get(url, config));
const post = (url, body, config) => unwrap(api.client.post(url, body, config));
const put = (url, body, config) => unwrap(api.client.put(url, body, config));
const patch = (url, body, config) =>
  unwrap(api.client.patch(url, body, config));
const del = (url, config) => unwrap(api.client.delete(url, config));

export const cartApi = {
  get: () => get("/api/cart"),
  add: (productId, quantity = 1) => post("/api/cart", { productId, quantity }),
  remove: (productId) => del("/api/cart", { data: { productId } }),
  clear: () => del("/api/cart/clear"),
  setQuantity: (productId, quantity, signal) =>
    put("/api/cart", { productId, quantity }, signal ? { signal } : undefined),
};

export const wishlistApi = {
  get: (folder = "/") => get("/api/wishlists", { params: { folder } }),
  add: (product, folder = "/") => post("/api/wishlists", { product, folder }),
  remove: (productId, folder = "/") =>
    del("/api/wishlists", { data: { productId, folder } }),
  setProducts: (products, folder = "/") =>
    put("/api/wishlists", { products, folder }),
};

const decryptAddressResponse = (response) => ({
  ...response,
  address: response.address
    ? decryptAddress(response.address)
    : response.address,
  addressBook: Array.isArray(response.addressBook)
    ? response.addressBook.map(decryptAddress)
    : response.addressBook,
});

export const addressApi = {
  list: async () => {
    const addresses = await get("/api/address");
    return Array.isArray(addresses) ? addresses.map(decryptAddress) : [];
  },
  current: async () => decryptAddress(await get("/api/address/current")),
  add: async (address) =>
    decryptAddressResponse(
      await post("/api/address", {
        address: encryptAddress(address),
      }),
    ),
  setCurrent: async (address) =>
    decryptAddressResponse(
      await put("/api/address", {
        address: encryptAddress(address),
      }),
    ),
  remove: (addressId) => del("/api/address", { data: { addressId } }),
  update: async (address) =>
    decryptAddressResponse(
      await put("/api/address/update", {
        address: encryptAddress(address),
      }),
    ),
};

export const ordersApi = {
  list: (params) => get("/api/orders/list", { params }),
  get: (id) => get(`/api/orders/${id}`),
  userOrders: () => get("/api/orders/user-orders"),
  create: (payload) => post("/api/orders", payload),
  status: (id) => get(`/api/orders/${id}/status`),
  cancel: (id, reason, detail) =>
    post(`/api/orders/${id}/cancel`, { reason, detail }),
  approveCancel: (id) => post(`/api/orders/${id}/cancel/approve`),
  rejectCancel: (id, reason) =>
    post(`/api/orders/${id}/cancel/reject`, { reason }),
  updateStatus: (id, status, note) =>
    post(`/api/orders/${id}/updateStatus`, { status, note }),
  markPaid: (id, transactionId, amount) =>
    post(`/api/orders/${id}/payment/paid`, { transactionId, amount }),
  markFailed: (id, reason) =>
    post(`/api/orders/${id}/payment/failed`, { reason }),
  process: (id) => post(`/api/orders/${id}/process`),
  packed: (id) => post(`/api/orders/${id}/packed`),
  ship: (id, shipment) => post(`/api/orders/${id}/ship`, shipment),
  deliver: (id) => post(`/api/orders/${id}/deliver`),
  requestReturn: (id, reason, detail) =>
    post(`/api/orders/${id}/return`, { reason, detail }),
  approveReturn: (id) => post(`/api/orders/${id}/return/approve`),
  rejectReturn: (id, reason) =>
    post(`/api/orders/${id}/return/reject`, { reason }),
  returnReceived: (id) => post(`/api/orders/${id}/return/received`),
  completeReturn: (id) => post(`/api/orders/${id}/return/complete`),
  requestRefund: (id, amount, reason) =>
    post(`/api/orders/${id}/refund`, { amount, reason }),
  completeRefund: (id, transactionId, options = {}) =>
    post(`/api/orders/${id}/refund/complete`, { transactionId, ...options }),
  patchShipping: (id, shipment) =>
    patch(`/api/orders/${id}/shipping`, shipment),
  patchEta: (id, estimatedDate) =>
    patch(`/api/orders/${id}/shipping/estimated-delivery`, { estimatedDate }),
  pending: () => get("/api/orders/admin/pending"),
  processing: () => get("/api/orders/admin/processing"),
  returns: () => get("/api/orders/admin/returns"),
  refunds: () => get("/api/orders/admin/refunds"),
  remove: (id) => del(`/api/orders/${id}`),
};

export const commentsApi = {
  list: (productId, params) => get(`/api/comments/${productId}`, { params }),
  create: (productId, content, rating) =>
    post("/api/comments", { productId, content, rating: rating ?? 0 }),
  update: (productId, content) =>
    put(`/api/comments/${productId}`, { content }),
  remove: (productId) => del(`/api/comments/${productId}`),
};

const visitedProducts = new Map();
const VISIT_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

export const interactionsApi = {
  visit: (productId) => {
    if (!productId) return Promise.resolve(null);
    const now = Date.now();
    const last = visitedProducts.get(productId);
    if (last && now - last < VISIT_THROTTLE_MS) {
      return Promise.resolve({ suppressed: true, cached: true });
    }
    visitedProducts.set(productId, now);
    return post("/api/interactions/product/visit", { productId }).catch(
      (err) => {
        visitedProducts.delete(productId);
        throw err;
      },
    );
  },
  share: (productId) => post("/api/interactions/product/share", { productId }),
  rate: (productId, rating) =>
    post("/api/interactions/product/rate", { productId, rating }),
  mine: (productId) => get(`/api/interactions/p/${productId}`),
};

export const productsApi = {
  list: (params) => get("/api/products", { params }),
  get: (id, params) => get(`/api/products/${id}`, { params }),
  similar: (id, params) => get(`/api/products/similar/${id}`, { params }),
  feed: () => get("/api/products/feed"),
  status: (params) => get("/api/products/status", { params }),
};

export const usersApi = {
  profile: () => get("/api/users/profile"),
  list: (params) => get("/api/users", { params }),
  get: (id) => get(`/api/users/${id}`),
  update: (id, payload) => put(`/api/users/${id}`, payload),
  setStatus: (id, banned, banReason) =>
    patch(`/api/users/${id}/status`, { banned, banReason }),
};

export const categoriesApi = {
  list: (params) => get("/api/categories", { params }),
  get: (id) => get(`/api/categories/${id}`, { params: { realtime: "true" } }),
  create: (payload) => post("/api/categories", payload),
  update: (id, payload) => put(`/api/categories/${id}`, payload),
  remove: (id) => del(`/api/categories/${id}`),
};

export const settingsApi = {
  get: () => get("/api/users/settings"),
  save: (prefs) => post("/api/users/settings", prefs),
};

/** Profile updates are patches — only send the fields that actually changed. */
export const profileApi = {
  update: (patch) => post("/api/users/profile", patch),
};

export const analyticsApi = {
  global: () => get("/api/analytics"),
  daily: (dayid) => get(`/api/analytics/${dayid}`),
  events: (params) => get("/api/analytics/events", { params }),
  report: (params) => get("/api/analytics/report", { params }),
  ordersSummary: (params) => get("/api/analytics/orders-summary", { params }),
};

/** Owner-only live telemetry. The stream itself uses useLiveEventsStream. */
export const liveEventsApi = {
  snapshot: (params, config) =>
    get("/api/live-events/snapshot", { ...config, params }),
  past: (params, config) =>
    get("/api/live-events/past", { ...config, params }),
  pastSummary: (params, config) =>
    get("/api/live-events/past/summary", { ...config, params }),
};

export const paymentsApi = {
  config: () => get("/api/payments/config"),
  createRazorpay: (payload) =>
    post(
      "/api/payments/razorpay/create",
      typeof payload === "string" ? { orderId: payload } : payload,
    ),
  verifyRazorpay: (payload) => post("/api/payments/razorpay/verify", payload),
  reportFailed: (id, payload) => post(`/api/payments/${id}/failed`, payload),
  reportAttemptFailed: (attemptId, payload) =>
    post(`/api/payments/attempts/${attemptId}/failed`, {
      ...payload,
      attemptId,
    }),
  myAttempts: () => get("/api/payments/attempts/mine"),
  collectCod: (id, amount) =>
    post(`/api/payments/cod/${id}/collect`, { amount }),
};

export const supportApi = {
  create: (payload) => post("/api/support", payload),
  mine: (params) => get("/api/support/mine", { params }),
  get: (id) => get(`/api/support/${id}`),
  message: (id, message) => post(`/api/support/${id}/messages`, { message }),
  list: (params) => get("/api/support", { params }),
  reply: (id, message) => post(`/api/support/${id}/reply`, { message }),
  setStatus: (id, status, note) =>
    patch(`/api/support/${id}/status`, { status, note }),
  assign: (id, adminId) => patch(`/api/support/${id}/assign`, { adminId }),
  setPriority: (id, priority) =>
    patch(`/api/support/${id}/priority`, { priority }),
};

export const shipmentsApi = {
  config: () => get("/api/shipments/config"),
  serviceability: (payload) => post("/api/shipments/serviceability", payload),
  rates: (payload) => post("/api/shipments/rates", payload ?? {}),
  create: (orderId, payload) =>
    post(`/api/shipments/${orderId}/create`, payload ?? {}),
  track: (orderId) => get(`/api/shipments/${orderId}/track`),
  label: (orderId, pdf = false) =>
    get(`/api/shipments/${orderId}/label`, { params: { pdf } }),
  orderDetail: (orderId) => get(`/api/shipments/${orderId}/order-detail`),
  schedulePickup: (orderId) => post(`/api/shipments/${orderId}/pickup`),
  cancelShipment: (orderId, awbNumber) =>
    post(`/api/shipments/${orderId}/cancel-shipment`, { awbNumber }),
  warehouses: () => get("/api/shipments/warehouses/list"),
  ndrList: (params) => get("/api/shipments/ndr/list", { params }),
  ndrAction: (awb, action) =>
    post(`/api/shipments/ndr/${awb}/action`, { action }),
  manifest: (awbNumbers) => post("/api/shipments/manifest", { awbNumbers }),
  returnReasons: () => get("/api/shipments/returns/reasons"),
  pushReturn: (orderId, payload) =>
    post(`/api/shipments/${orderId}/push-return`, payload),
};

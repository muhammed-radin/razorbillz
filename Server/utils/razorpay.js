import crypto from "node:crypto";
import HttpError, { Errors } from "./httpError.js";

/* =========================================================
 * Razorpay service (Test Mode first)
 * Docs: https://razorpay.com/docs/api/orders
 * - POST https://api.razorpay.com/v1/orders (Basic key_id:secret)
 *   body { amount (paise int), currency INR, receipt, notes }
 * - Checkout verify: HMAC_SHA256(order_id|payment_id, secret) === signature
 * - Webhook verify: HMAC_SHA256(rawBody, webhookSecret) === X-Razorpay-Signature
 * ========================================================= */

const API_BASE = "https://api.razorpay.com/v1";

export function razorpayConfig() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
    configured: Boolean(
      process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
    ),
  };
}

/* Test-mode guard: key IDs are never hard-coded anywhere — they come
 * from env only. Mode is derived from the key PREFIX:
 * rzp_test_* -> test, rzp_live_* -> live. Live payments are REFUSED
 * outside production so dev/test can never move real money. */
export function razorpayMode() {
  const { keyId, configured } = razorpayConfig();
  if (!configured) return "unconfigured";
  if (keyId.startsWith("rzp_live_")) return "live";
  if (keyId.startsWith("rzp_test_")) return "test";
  return "unknown";
}

export function assertTestModeAllowed() {
  const mode = razorpayMode();
  if (mode === "live" && process.env.NODE_ENV !== "production") {
    throw new HttpError(
      503,
      "LIVE_KEYS_BLOCKED",
      "Live Razorpay keys are blocked outside production. Use rzp_test_* keys for development.",
    );
  }
  return mode;
}

function basicAuthHeader(keyId, keySecret) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/** amount in paise (integer). Throws on invalid amount. */
export function toPaise(inrAmount) {
  const paise = Math.round(Number(inrAmount) * 100);
  if (!Number.isFinite(paise) || paise <= 0 || !Number.isInteger(paise)) {
    throw new Error("Invalid amount for Razorpay order");
  }
  return paise;
}

/* Create a Razorpay order for a server-validated internal order.
 * FAIL-CLOSED: without credentials this throws 503
 * PAYMENT_CONFIGURATION_MISSING instead of returning a misleading
 * stub — the real payment workflow never simulates success. */
export async function createRazorpayOrder({ amountInr, receipt, notes = {} }) {
  const { keyId, keySecret, configured } = razorpayConfig();
  const amount = toPaise(amountInr);
  if (!configured) {
    throw Errors.paymentConfigMissing();
  }
  // Live keys are refused outside production — test mode only in dev.
  assertTestModeAllowed();
  const res = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(keyId, keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt: String(receipt).slice(0, 40),
      notes,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data?.error?.description ?? "Razorpay order creation failed",
    );
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

export async function fetchRazorpayOrder(razorpayOrderId) {
  const { keyId, keySecret, configured } = razorpayConfig();
  if (!configured) throw new Error("Razorpay not configured");
  const res = await fetch(
    `${API_BASE}/orders/${encodeURIComponent(razorpayOrderId)}`,
    { headers: { Authorization: basicAuthHeader(keyId, keySecret) } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.description ?? "Failed to fetch order");
  }
  return data;
}

export async function fetchRazorpayPayments(razorpayOrderId) {
  const { keyId, keySecret, configured } = razorpayConfig();
  if (!configured) throw new Error("Razorpay not configured");
  const res = await fetch(
    `${API_BASE}/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
    { headers: { Authorization: basicAuthHeader(keyId, keySecret) } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.description ?? "Failed to fetch payments");
  }
  return data;
}

/* Refund a captured payment (partial edge-case use: stock failure
 * after capture). Amount in INR; defaults to full payment amount. */
export async function refundRazorpayPayment({ paymentId, amountInr }) {
  const { keyId, keySecret, configured } = razorpayConfig();
  if (!configured) throw new Error("Razorpay not configured");
  if (!paymentId) throw new Error("paymentId is required");
  const body = {};
  if (amountInr !== undefined) body.amount = toPaise(amountInr);
  body.speed = "normal";
  const res = await fetch(
    `${API_BASE}/payments/${encodeURIComponent(paymentId)}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(keyId, keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.description ?? "Refund failed");
  }
  return data;
}

/* Verify checkout signature: HMAC_SHA256(orderId|paymentId, keySecret). */
export function verifyCheckoutSignature({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  const { keySecret } = razorpayConfig();
  if (!keySecret) return false;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(razorpaySignature),
    );
  } catch {
    return false;
  }
}

/* Verify webhook signature over the RAW request body. */
export function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = razorpayConfig();
  if (!webhookSecret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

export default {
  razorpayConfig,
  toPaise,
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayments,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  refundRazorpayPayment,
  razorpayMode,
  assertTestModeAllowed,
};

import { db } from "./db.js";

/* =========================================================
 * Server-authoritative order pricing.
 * NEVER trust client prices/totals. Re-fetch products from DB,
 * validate active + stock, and compute subtotal/tax/shipping/COD.
 *
 * Rules (match storefront):
 * - subtotal = Σ serverPrice × qty
 * - discount: currently unsupported coupons -> must be 0 unless
 *   codes provided in future; reject discount > subtotal.
 * - tax: per-product tax% if present else TAX_RATE_DEFAULT (18).
 *   taxAmount computed on (subtotal - discount).
 * - shipping: free when taxable >= FREE_SHIPPING_THRESHOLD else fee.
 * - COD fee: flat COD_FEE when method=cod.
 * ========================================================= */

export const PRICING_DEFAULTS = {
  taxRate: Number(process.env.TAX_RATE_DEFAULT ?? 18),
  freeShippingThreshold: Number(process.env.FREE_SHIPPING_THRESHOLD ?? 500),
  shippingFee: Number(process.env.SHIPPING_FEE ?? 50),
  codFee: Number(process.env.COD_FEE ?? 30),
  /* Single source of truth for COD eligibility (inclusive, INR).
   * Final payable amount (discounts + tax + delivery + COD fee
   * included) must satisfy MIN <= total <= MAX. */
  codMinOrderValue: Number(process.env.COD_MIN_ORDER_VALUE ?? 450),
  codMaxOrderValue: Number(process.env.COD_MAX_ORDER_VALUE ?? 3000),
  codEnabled: (process.env.COD_ENABLED ?? "true") !== "false",
};

/** Pure COD eligibility check on a final payable total.
 * Returns { eligible, reason } — reused by backend + tests. */
export function codEligibility(totalAmount) {
  const total = round2(Number(totalAmount));
  if (!Number.isFinite(total) || total <= 0) {
    return { eligible: false, reason: "Invalid order total." };
  }
  if (total < PRICING_DEFAULTS.codMinOrderValue) {
    return {
      eligible: false,
      reason: `Cash on Delivery needs a minimum order of ₹${PRICING_DEFAULTS.codMinOrderValue}. Add more items or pay online.`,
    };
  }
  if (total > PRICING_DEFAULTS.codMaxOrderValue) {
    return {
      eligible: false,
      reason: `Cash on Delivery is available up to ₹${PRICING_DEFAULTS.codMaxOrderValue}. Please pay online for this order.`,
    };
  }
  return { eligible: true, reason: null };
}

export function round2(n) {
  return Number(Number(n).toFixed(2));
}

export async function priceOrderItems(items, { method = "razorpay" } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("Order must contain at least one product"), {
      code: 400,
    });
  }
  const ids = [...new Set(items.map((i) => String(i.productId ?? i.id)))];
  const docs = await db
    .collection("products")
    .find({ id: { $in: ids } })
    .toArray();
  const byId = new Map(docs.map((d) => [String(d.id), d]));

  const priced = [];
  for (const item of items) {
    const pid = String(item.productId ?? item.id);
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw Object.assign(new Error(`Invalid quantity for ${pid}`), {
        code: 400,
      });
    }
    const doc = byId.get(pid);
    if (!doc || doc.isActive === false) {
      throw Object.assign(
        new Error(`Product unavailable: ${pid}`),
        { code: 400, productId: pid },
      );
    }
    if (Number(doc.stock ?? 0) < qty) {
      throw Object.assign(
        new Error(`Insufficient stock for ${doc.title ?? pid}`),
        { code: 400, productId: pid },
      );
    }
    priced.push({
      productId: pid,
      title: doc.title,
      thumbnail: doc.thumbnail,
      originalPrice: Number(doc.originalPrice ?? doc.price),
      price: Number(doc.price),
      sku: doc.sku,
      category: doc.category,
      brand: doc.brand,
      quantity: qty,
      specialInfo: doc.specialInfo ?? {},
      returnedQuantity: 0,
      refundedQuantity: 0,
      taxRate: Number(doc.tax ?? PRICING_DEFAULTS.taxRate),
      weightKg: Number(doc.weight ?? 0.5),
    });
  }

  const subtotal = round2(
    priced.reduce((t, p) => t + p.price * p.quantity, 0),
  );
  // Weighted tax rate fallback; storefront uses flat 18 — keep server flat for consistency
  const taxRate = PRICING_DEFAULTS.taxRate;
  const discountAmount = 0; // coupons not yet supported; client discount ignored
  const taxable = round2(subtotal - discountAmount);
  const taxAmount = round2((taxable * taxRate) / 100);
  const shippingAmount =
    taxable >= PRICING_DEFAULTS.freeShippingThreshold
      ? 0
      : PRICING_DEFAULTS.shippingFee;
  let codFee = 0;
  if (method === "cod") {
    if (!PRICING_DEFAULTS.codEnabled) {
      throw Object.assign(new Error("Cash on Delivery is disabled"), {
        code: 400,
      });
    }
    codFee = PRICING_DEFAULTS.codFee;
  }
  const totalAmount = round2(taxable + taxAmount + shippingAmount + codFee);
  const weightKg = round2(
    priced.reduce((t, p) => t + (p.weightKg || 0.5) * p.quantity, 0),
  );

  if (method === "cod") {
    const { eligible, reason } = codEligibility(totalAmount);
    if (!eligible) {
      throw Object.assign(new Error(reason), { code: 422 });
    }
  }

  return {
    products: priced.map(
      // strip server-only helpers before persisting
      // eslint-disable-next-line no-unused-vars
      ({ taxRate, weightKg, ...rest }) => rest,
    ),
    subtotal,
    discount: { codes: [], amount: discountAmount },
    tax: taxRate,
    taxAmount,
    shippingAmount,
    codFee,
    totalAmount,
    currency: "INR",
    weightKg,
    itemCount: priced.reduce((t, p) => t + p.quantity, 0),
  };
}

export default { priceOrderItems, codEligibility, PRICING_DEFAULTS, round2 };

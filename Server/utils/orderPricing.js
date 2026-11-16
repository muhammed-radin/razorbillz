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
 * - tax: per-product tax% when set (> 0), else TAX_RATE_DEFAULT (18).
 *   Products store `taxExcluded`:
 *     false (default) -> the price already contains GST. The GST
 *       component is extracted for invoices but NOT added again.
 *     true -> GST is added on top of the price.
 *   `taxAmount` = tax added on top (part of totalAmount).
 *   `taxIncludedAmount` = GST contained in prices (informational).
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

/** Explicit positive tax rates win; 0/missing means "use the store default". */
export function resolveTaxRate(tax) {
  const rate = Number(tax);
  return Number.isFinite(rate) && rate > 0
    ? rate
    : PRICING_DEFAULTS.taxRate;
}

/**
 * GST for one line.
 * - taxExcluded=true : GST is added on top of the line total.
 * - taxExcluded=false: the line total already contains GST, so the
 *   included component is price * rate / (100 + rate).
 */
export function computeLineTax({ price, quantity = 1, tax, taxExcluded = false }) {
  const base = Number(price) * Number(quantity);
  const rate = resolveTaxRate(tax);
  if (taxExcluded === true) {
    return {
      base: round2(base),
      rate,
      excluded: true,
      taxAmount: round2((base * rate) / 100),
      taxIncludedAmount: 0,
    };
  }
  return {
    base: round2(base),
    rate,
    excluded: false,
    taxAmount: 0,
    taxIncludedAmount: round2((base * rate) / (100 + rate)),
  };
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
    const taxExcluded = doc.taxExcluded === true;
    const lineTax = computeLineTax({
      price: doc.price,
      quantity: qty,
      tax: doc.tax,
      taxExcluded,
    });
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
      taxRate: lineTax.rate,
      taxExcluded,
      taxAmount: lineTax.taxAmount,
      taxIncludedAmount: lineTax.taxIncludedAmount,
      weightKg: Number(doc.weight ?? 0.5),
    });
  }

  const subtotal = round2(
    priced.reduce((t, p) => t + p.price * p.quantity, 0),
  );
  const discountAmount = 0; // coupons not yet supported; client discount ignored
  const taxable = round2(subtotal - discountAmount);
  // Tax added ON TOP of prices (only tax-excluded lines).
  const taxAmount = round2(
    priced.reduce((t, p) => t + p.taxAmount, 0),
  );
  // GST already contained in tax-inclusive prices (invoice info only).
  const taxIncludedAmount = round2(
    priced.reduce((t, p) => t + p.taxIncludedAmount, 0),
  );
  // Nominal weighted rate, for display ("GST 18%").
  const taxRate =
    subtotal > 0
      ? round2(
          priced.reduce(
            (t, p) => t + p.taxRate * p.price * p.quantity,
            0,
          ) / subtotal,
        )
      : PRICING_DEFAULTS.taxRate;
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
      ({ weightKg, taxIncludedAmount, ...rest }) => rest,
    ),
    subtotal,
    discount: { codes: [], amount: discountAmount },
    tax: taxRate,
    taxAmount,
    taxIncludedAmount,
    shippingAmount,
    codFee,
    totalAmount,
    currency: "INR",
    weightKg,
    itemCount: priced.reduce((t, p) => t + p.quantity, 0),
  };
}

export default {
  priceOrderItems,
  codEligibility,
  computeLineTax,
  resolveTaxRate,
  PRICING_DEFAULTS,
  round2,
};

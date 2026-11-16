/**
 * Client-side mirror of the server tax rules (Server/utils/orderPricing.js).
 *
 * A product's selling price either already contains GST (`taxExcluded`
 * false, the default) or excludes it (`taxExcluded` true), in which case the
 * tax percentage is added on top at checkout.
 */

export const DEFAULT_TAX_RATE = 18;

/** Explicit positive tax rates win; 0/missing means "use the default". */
export function resolveTaxRate(tax) {
  const rate = Number(tax);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_TAX_RATE;
}

/**
 * GST for one cart/order line.
 * - `taxAmount` is the tax ADDED on top (0 for tax-inclusive lines).
 * - `taxIncludedAmount` is the GST already inside the line total.
 */
export function computeLineTax({ price, quantity = 1, tax, taxExcluded = false }) {
  const base = Number(price) * Number(quantity);
  const rate = resolveTaxRate(tax);
  if (taxExcluded === true) {
    return {
      base,
      rate,
      excluded: true,
      taxAmount: (base * rate) / 100,
      taxIncludedAmount: 0,
    };
  }
  return {
    base,
    rate,
    excluded: false,
    taxAmount: 0,
    taxIncludedAmount: (base * rate) / (100 + rate),
  };
}

import test from "node:test";
import assert from "node:assert/strict";

import {
  computeLineTax,
  resolveTaxRate,
  PRICING_DEFAULTS,
} from "../utils/orderPricing.js";

test("resolveTaxRate falls back to the default for 0/missing", () => {
  assert.equal(resolveTaxRate(0), PRICING_DEFAULTS.taxRate);
  assert.equal(resolveTaxRate(undefined), PRICING_DEFAULTS.taxRate);
  assert.equal(resolveTaxRate(null), PRICING_DEFAULTS.taxRate);
  assert.equal(resolveTaxRate(5), 5);
  assert.equal(resolveTaxRate("12.5"), 12.5);
});

test("tax-inclusive lines extract GST without adding it", () => {
  const line = computeLineTax({
    price: 1180,
    quantity: 1,
    tax: 18,
    taxExcluded: false,
  });
  assert.equal(line.taxAmount, 0);
  assert.equal(line.taxIncludedAmount, 180);
});

test("tax-inclusive line rounds the embedded GST to paise", () => {
  const line = computeLineTax({
    price: 999,
    quantity: 1,
    tax: 18,
    taxExcluded: false,
  });
  assert.equal(line.taxIncludedAmount, 152.39);
});

test("tax-excluded lines add GST on top of the price", () => {
  const line = computeLineTax({
    price: 1000,
    quantity: 2,
    tax: 18,
    taxExcluded: true,
  });
  assert.equal(line.base, 2000);
  assert.equal(line.taxAmount, 360);
  assert.equal(line.taxIncludedAmount, 0);
});

test("default (field absent) behaves as tax-inclusive", () => {
  const line = computeLineTax({ price: 1180, quantity: 1, tax: 18 });
  assert.equal(line.excluded, false);
  assert.equal(line.taxAmount, 0);
  assert.equal(line.taxIncludedAmount, 180);
});

test("an unspecified tax rate uses the store default", () => {
  const included = computeLineTax({ price: 1180, quantity: 1 });
  assert.equal(included.rate, PRICING_DEFAULTS.taxRate);
  assert.equal(included.taxIncludedAmount, 180);

  const excluded = computeLineTax({
    price: 1000,
    quantity: 1,
    taxExcluded: true,
  });
  assert.equal(excluded.rate, PRICING_DEFAULTS.taxRate);
  assert.equal(excluded.taxAmount, 180);
});

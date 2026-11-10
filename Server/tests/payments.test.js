import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

/* COD eligibility boundaries (inclusive ₹450–₹3,000 by default). */
describe("codEligibility", async () => {
  const { codEligibility, PRICING_DEFAULTS } = await import(
    "../utils/orderPricing.js"
  );

  it("uses the single documented rule", () => {
    assert.equal(PRICING_DEFAULTS.codMinOrderValue, 450);
    assert.equal(PRICING_DEFAULTS.codMaxOrderValue, 3000);
  });

  it("rejects below minimum", () => {
    assert.equal(codEligibility(449.99).eligible, false);
    assert.equal(codEligibility(0).eligible, false);
    assert.equal(codEligibility(-5).eligible, false);
  });

  it("accepts inclusive boundaries", () => {
    assert.equal(codEligibility(450).eligible, true);
    assert.equal(codEligibility(3000).eligible, true);
    assert.equal(codEligibility(1500).eligible, true);
  });

  it("rejects above maximum", () => {
    assert.equal(codEligibility(3000.01).eligible, false);
    assert.equal(codEligibility(50000).eligible, false);
  });
});

/* Razorpay HMAC verification contract. */
describe("verifyCheckoutSignature", async () => {
  process.env.RAZORPAY_KEY_SECRET = "test_secret_123";
  const { verifyCheckoutSignature } = await import("../utils/razorpay.js");

  it("accepts a genuine signature", () => {
    const oid = "order_test123";
    const pid = "pay_test456";
    const sig = crypto
      .createHmac("sha256", "test_secret_123")
      .update(`${oid}|${pid}`)
      .digest("hex");
    assert.equal(
      verifyCheckoutSignature({
        razorpayOrderId: oid,
        razorpayPaymentId: pid,
        razorpaySignature: sig,
      }),
      true,
    );
  });

  it("rejects tampered signatures", () => {
    assert.equal(
      verifyCheckoutSignature({
        razorpayOrderId: "order_test123",
        razorpayPaymentId: "pay_test456",
        razorpaySignature: "0".repeat(64),
      }),
      false,
    );
    assert.equal(
      verifyCheckoutSignature({
        razorpayOrderId: "",
        razorpayPaymentId: "",
        razorpaySignature: "",
      }),
      false,
    );
  });
});

/* Razorpay mode guard: test keys only outside production. */
describe("razorpayMode", async () => {
  const { razorpayMode, assertTestModeAllowed } = await import(
    "../utils/razorpay.js"
  );

  it("derives mode from the key prefix, never hard-coded", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
    process.env.RAZORPAY_KEY_SECRET = "s";
    assert.equal(razorpayMode(), "test");
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc";
    assert.equal(razorpayMode(), "live");
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    assert.equal(razorpayMode(), "unconfigured");
  });

  it("blocks live keys outside production", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc";
    process.env.RAZORPAY_KEY_SECRET = "s";
    assert.throws(() => assertTestModeAllowed(), (err) => {
      assert.equal(err.code, "LIVE_KEYS_BLOCKED");
      return true;
    });
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  });
});
describe("createRazorpayOrder fail-closed", async () => {
  it("throws PAYMENT_CONFIGURATION_MISSING without keys", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const { createRazorpayOrder } = await import("../utils/razorpay.js");
    await assert.rejects(() => createRazorpayOrder({ amountInr: 100 }), (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, "PAYMENT_CONFIGURATION_MISSING");
      return true;
    });
  });
});

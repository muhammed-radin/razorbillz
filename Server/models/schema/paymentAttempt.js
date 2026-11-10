import mongoose, { Schema } from "mongoose";

/* =========================================================
 * Payment attempts (NOT orders).
 *
 * Enforces: no successfully-placed order exists before Razorpay
 * verification. An attempt holds the server-validated checkout
 * snapshot + gateway order id; the real Order is created exactly
 * once by confirmAttemptOrder() after trusted verification
 * (checkout signature or verified webhook for closed browsers).
 *
 * Attempts are never presented as orders and never touch
 * revenue analytics, inventory, or shipments.
 * ========================================================= */

export const AttemptStatus = Object.freeze({
  CREATED: "created",
  CONSUMED: "consumed", // order created
  FAILED: "failed",
  EXPIRED: "expired",
});

const AttemptItemSchema = new Schema(
  {
    productId: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false, id: false },
);

export const PaymentAttemptSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: { type: String, required: true, index: true, trim: true },
    idempotencyKey: { type: String, default: null, trim: true, index: true },
    items: { type: [AttemptItemSchema], required: true },
    pricedTotal: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    pricedSnapshot: { type: Schema.Types.Mixed, default: null },
    shippingAddress: { type: Schema.Types.Mixed, required: true },
    billingAddress: { type: Schema.Types.Mixed, required: true },
    razorpayOrderId: { type: String, default: null, trim: true, index: true },
    razorpayPaymentId: { type: String, default: null, trim: true },
    legacyOrderId: { type: String, default: null, trim: true, index: true },
    resultingOrderId: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: Object.values(AttemptStatus),
      default: AttemptStatus.CREATED,
      index: true,
    },
    failureReason: { type: String, default: null, trim: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
      index: true,
    },
  },
  { timestamps: true },
);

PaymentAttemptSchema.index({ idempotencyKey: 1, userId: 1 }, { sparse: true });
PaymentAttemptSchema.index({ razorpayPaymentId: 1 }, { sparse: true });

export const PaymentAttemptModel = mongoose.model(
  "PaymentAttempt",
  PaymentAttemptSchema,
  "payment_attempts",
);

export default { PaymentAttemptSchema, PaymentAttemptModel, AttemptStatus };

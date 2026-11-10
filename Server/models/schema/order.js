import mongoose, { Schema } from "mongoose";
import { isSealed, sealString } from "../../utils/crypto/index.js";

/* =========================================================
 * ENUMS
 * ========================================================= */

export const OrderStatus = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PROCESSING: "processing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",

  CANCELLED: "cancelled",

  RETURN_REQUESTED: "return_requested",
  RETURNED: "returned",
});

export const PaymentMethod = Object.freeze({
  RAZORPAY: "razorpay",
  COD: "cod",
});

export const PaymentStatus = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",

  REFUND_PENDING: "refund_pending",
  PARTIALLY_REFUNDED: "partially_refunded",
  REFUNDED: "refunded",
});

export const CODStatus = Object.freeze({
  NOT_APPLICABLE: "na",
  PENDING_COLLECTION: "pending_collection",
  COLLECTED: "collected",
  FAILED: "failed",
});

export const FulfillmentStatus = Object.freeze({
  UNFULFILLED: "unfulfilled",
  PROCESSING: "processing",
  PACKED: "packed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
});

export const CancellationStatus = Object.freeze({
  NONE: "none",
  REQUESTED: "requested",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export const ReturnStatus = Object.freeze({
  NONE: "none",
  REQUESTED: "requested",
  APPROVED: "approved",
  REJECTED: "rejected",
  RECEIVED: "received",
  COMPLETED: "completed",
});

export const RefundStatus = Object.freeze({
  NONE: "none",
  PENDING: "pending",
  PARTIALLY_REFUNDED: "partially_refunded",
  REFUNDED: "refunded",
  FAILED: "failed",
});

/* =========================================================
 * VALID ORDER TRANSITIONS
 * ========================================================= */

const ORDER_TRANSITIONS = Object.freeze({
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],

  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],

  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],

  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],

  [OrderStatus.DELIVERED]: [OrderStatus.RETURN_REQUESTED],

  /* A rejected return puts the order back in the customer's hands.
   * Without this edge the order stayed stuck at return_requested. */
  [OrderStatus.RETURN_REQUESTED]: [
    OrderStatus.RETURNED,
    OrderStatus.DELIVERED,
  ],

  [OrderStatus.RETURNED]: [],

  [OrderStatus.CANCELLED]: [],
});

/* =========================================================
 * ORDER ADDRESS SNAPSHOT
 * ========================================================= */

export const OrderAddressSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    street: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    postalCode: {
      type: String,
      required: true,
      trim: true,
    },

    country: {
      type: String,
      required: true,
      trim: true,
      default: "India",
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    _id: false,
    id: false,
  },
);

/* =========================================================
 * ORDER ITEM
 * ========================================================= */

export const OrderItemSchema = new Schema(
  {
    productId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    thumbnail: {
      type: String,
      required: true,
    },

    originalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    sku: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    brand: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    returnedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    refundedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    specialInfo: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    _id: false,
    id: false,
  },
);

/* =========================================================
 * ORDER HISTORY
 * ========================================================= */

export const OrderHistorySchema = new Schema(
  {
    status: {
      type: String,
      required: true,
      enum: Object.values(OrderStatus),
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },

    note: {
      type: String,
      default: null,
      trim: true,
    },

    actor: {
      type: String,
      enum: ["system", "user", "admin", "owner"],
      default: "system",
    },

    actorId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    _id: false,
    id: false,
  },
);

/* =========================================================
 * PAYMENT
 * ========================================================= */

export const OrderPaymentSchema = new Schema(
  {
    method: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      enum: [...Object.values(PaymentMethod), "card", "upi", "netbanking"],
    },

    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },

    transactionId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    /* Razorpay references (never store secrets) */
    razorpayOrderId: { type: String, default: null, trim: true },
    razorpayPaymentId: { type: String, default: null, trim: true },
    razorpaySignature: { type: String, default: null, trim: true },
    idempotencyKey: { type: String, default: null, trim: true },
    attempts: { type: Number, default: 0, min: 0 },
    verifiedAt: { type: Date, default: null },
    failureReason: {
      type: String,
      default: null,
      trim: true,
    },

    /* COD collection tracking (independent of order status) */
    codStatus: {
      type: String,
      enum: Object.values(CODStatus),
      default: CODStatus.NOT_APPLICABLE,
    },
    codCollectedAt: { type: Date, default: null },
    codCollectedBy: { type: String, default: null, trim: true },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },

    refundTransactionId: {
      type: String,
      default: null,
      trim: true,
    },

    failureReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    _id: false,
    id: false,
  },
);

/* Shipment tracking history entry (Shipmozo sync / webhook) */
export const ShipmentHistorySchema = new Schema(
  {
    status: { type: String, default: null, trim: true },
    message: { type: String, default: null, trim: true },
    location: { type: String, default: null, trim: true },
    timestamp: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ["api", "webhook", "poll", "admin", "system"],
      default: "api",
    },
  },
  { _id: false, id: false },
);

/* =========================================================
 * FULFILLMENT / SHIPPING
 * ========================================================= */

export const OrderFulfillmentSchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(FulfillmentStatus),
      default: FulfillmentStatus.UNFULFILLED,
    },

    serviceName: {
      type: String,
      default: null,
      trim: true,
    },

    contactNumber: {
      type: String,
      default: null,
      trim: true,
    },

    email: {
      type: String,
      default: null,
      trim: true,
    },

    trackingNumber: {
      type: String,
      default: null,
      trim: true,
      // Remove index: true
    },

    /* Shipmozo references (server-side only) */
    shipmozoOrderId: { type: String, default: null, trim: true, index: true },
    shipmentId: { type: String, default: null, trim: true },
    awb: { type: String, default: null, trim: true },
    courierName: { type: String, default: null, trim: true },
    trackingUrl: { type: String, default: null, trim: true },
    labelUrl: { type: String, default: null, trim: true },
    pickupPincode: { type: String, default: null, trim: true },
    deliveryPincode: { type: String, default: null, trim: true },
    packageWeightKg: { type: Number, default: null, min: 0 },
    history: { type: [ShipmentHistorySchema], default: [] },
    lastSyncAt: { type: Date, default: null },
    shipmentFailure: { type: String, default: null, trim: true },

    estimatedDelivery: {
      type: Date,
      default: null,
    },

    shippedAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
    id: false,
  },
);

/* =========================================================
 * CANCELLATION
 * ========================================================= */

export const OrderCancellationSchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(CancellationStatus),
      default: CancellationStatus.NONE,
    },

    requestedAt: {
      type: Date,
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    reason: {
      type: String,
      default: null,
      trim: true,
    },

    detail: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },

    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },

    actorId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    _id: false,
    id: false,
  },
);

/* =========================================================
 * RETURN
 * ========================================================= */

export const OrderReturnSchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(ReturnStatus),
      default: ReturnStatus.NONE,
    },

    requestedAt: {
      type: Date,
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    receivedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    reason: {
      type: String,
      default: null,
      trim: true,
    },

    detail: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },

    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    _id: false,
    id: false,
  },
);

/* =========================================================
 * REFUND
 * ========================================================= */

export const OrderRefundSchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(RefundStatus),
      default: RefundStatus.NONE,
    },

    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    reason: {
      type: String,
      default: null,
      trim: true,
    },

    requestedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    transactionId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    _id: false,
    id: false,
  },
);

/* =========================================================
 * MAIN ORDER SCHEMA
 * ========================================================= */

export const OrderSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    /* =====================================================
     * PRODUCTS
     * ===================================================== */

    products: {
      type: [OrderItemSchema],
      required: true,

      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },

        message: "Order must contain at least one product.",
      },
    },

    /* =====================================================
     * PRICING
     * ===================================================== */

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discount: {
      codes: {
        type: [String],
        default: [],
      },

      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    tax: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    shippingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    /* =====================================================
     * ORDER LIFECYCLE
     * ===================================================== */

    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
      index: true,
    },

    statusHistory: {
      type: [OrderHistorySchema],

      default: () => [
        {
          status: OrderStatus.PENDING,
          timestamp: new Date(),
          actor: "system",
        },
      ],
    },

    /* =====================================================
     * SUBSYSTEMS
     * ===================================================== */

    payment: {
      type: OrderPaymentSchema,
      required: true,
    },

    fulfillment: {
      type: OrderFulfillmentSchema,
      default: () => ({}),
    },

    cancellation: {
      type: OrderCancellationSchema,
      default: () => ({}),
    },

    return: {
      type: OrderReturnSchema,
      default: () => ({}),
    },

    refund: {
      type: OrderRefundSchema,
      default: () => ({}),
    },

    /* =====================================================
     * ADDRESSES
     * ===================================================== */

    shippingAddress: {
      type: OrderAddressSchema,
      required: true,
    },

    billingAddress: {
      type: OrderAddressSchema,
      required: true,
    },

    /* =====================================================
     * DATES
     * ===================================================== */

    orderDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /* Idempotency: client-generated key to prevent duplicate orders
     * on retries / double-submit / payment callbacks. */
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
    },

    codFee: { type: Number, default: 0, min: 0 },

    /* Idempotency guards for inventory side effects. A cancellation
     * restocks an order exactly once; completing a return restocks the
     * returned units exactly once. */
    stockReleasedAt: { type: Date, default: null },
    returnStockReleasedAt: { type: Date, default: null },
  },

  {
    timestamps: true,
    strict: true,
    minimize: false,
  },
);

/* =========================================================
 * GENERIC STATUS METHODS
 * ========================================================= */

OrderSchema.methods.canTransitionTo = function (nextStatus) {
  if (!Object.values(OrderStatus).includes(nextStatus)) {
    return false;
  }

  return ORDER_TRANSITIONS[this.status]?.includes(nextStatus) ?? false;
};

OrderSchema.methods.transitionTo = async function (
  nextStatus,
  { note = null, actor = "system", actorId = null } = {},
) {
  if (!Object.values(OrderStatus).includes(nextStatus)) {
    throw new Error(`Invalid order status: ${nextStatus}`);
  }

  /* Same-status calls are bugs, not idempotent retries: silently
   * appending duplicate history made it impossible to tell a real
   * transition from a double click/retry. Every caller has an
   * idempotent branch where repetition is legitimate. */
  if (this.status === nextStatus) {
    throw new Error(`Order is already ${nextStatus}.`);
  }

  if (!this.canTransitionTo(nextStatus)) {
    throw new Error(
      `Invalid order transition: ${this.status} -> ${nextStatus}`,
    );
  }

  this.status = nextStatus;

  this.statusHistory.push({
    status: nextStatus,
    timestamp: new Date(),
    note,
    actor,
    actorId,
  });

  return this.save();
};

OrderSchema.methods.isTerminal = function () {
  return [OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(this.status);
};

/* =========================================================
 * HISTORY
 * ========================================================= */

OrderSchema.methods.addHistory = async function ({
  status = this.status,
  note = null,
  actor = "system",
  actorId = null,
} = {}) {
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    note,
    actor,
    actorId,
  });

  return this.save();
};

OrderSchema.methods.getStatusHistory = function () {
  return [...this.statusHistory].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
  );
};

/* =========================================================
 * PAYMENT METHODS
 * ========================================================= */

OrderSchema.methods.isPaymentSuccessful = function () {
  return this.payment.status === PaymentStatus.PAID;
};

OrderSchema.methods.markAsPaid = async function ({
  transactionId = null,
  amount = this.totalAmount,
} = {}) {
  // Already paid: idempotent. A different payment reference on an
  // already-paid order is a reconciliation bug, never a second charge.
  if (this.payment.status === PaymentStatus.PAID) {
    return this;
  }

  if (
    [
      PaymentStatus.REFUND_PENDING,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.REFUNDED,
    ].includes(this.payment.status)
  ) {
    throw new Error("A refunded order cannot be marked paid again.");
  }

  if (
    [OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(this.status)
  ) {
    throw new Error(`Cannot mark a ${this.status} order as paid.`);
  }

  const paidAmount = Number(amount);
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  if (paidAmount > Number(this.totalAmount) + 0.01) {
    throw new Error("Payment amount exceeds the order total.");
  }

  this.payment.status = PaymentStatus.PAID;
  this.payment.transactionId = transactionId;
  this.payment.amountPaid = paidAmount;
  this.payment.paidAt = new Date();
  this.payment.failureReason = null;

  if (this.status === OrderStatus.PENDING) {
    return this.transitionTo(OrderStatus.CONFIRMED, {
      note: "Payment confirmed",
      actor: "system",
    });
  }

  return this.save();
};

OrderSchema.methods.markPaymentFailed = async function (reason = null) {
  /* Never downgrade money that was actually collected. Late webhook
   * "failed" events can arrive after a successful capture. */
  if (
    [
      PaymentStatus.PAID,
      PaymentStatus.REFUND_PENDING,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.REFUNDED,
    ].includes(this.payment.status)
  ) {
    throw new Error("A paid order cannot be marked as payment failed.");
  }

  if (
    [OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(this.status)
  ) {
    throw new Error(`Cannot fail payment on a ${this.status} order.`);
  }

  this.payment.status = PaymentStatus.FAILED;
  this.payment.failureReason = reason;

  return this.save();
};

/* COD: mark cash collected only via trusted admin workflow. Collection
 * marks the payment paid (once) so refunds and paid-order reports work. */
OrderSchema.methods.markCodCollected = async function ({
  actorId = null,
  amount = null,
} = {}) {
  if (this.payment.method !== PaymentMethod.COD) {
    throw new Error("Only COD orders can record cash collection.");
  }
  if (
    [
      OrderStatus.CANCELLED,
      OrderStatus.RETURNED,
    ].includes(this.status)
  ) {
    throw new Error(`Cannot collect cash for a ${this.status} order.`);
  }
  if (
    [
      PaymentStatus.REFUND_PENDING,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.REFUNDED,
    ].includes(this.payment.status)
  ) {
    throw new Error("A refunded order cannot record fresh COD collection.");
  }
  if (this.payment.codStatus === CODStatus.COLLECTED) {
    // Legacy records collected before this rule may still say pending;
    // repair the payment status without touching the collection fields.
    if (this.payment.status === PaymentStatus.PENDING) {
      this.payment.status = PaymentStatus.PAID;
      this.payment.paidAt = this.payment.paidAt || new Date();
      return this.save();
    }
    return this; // idempotent
  }

  const collectedAmount =
    amount === null || amount === undefined ? this.totalAmount : Number(amount);
  if (!Number.isFinite(collectedAmount) || collectedAmount <= 0) {
    throw new Error("Collected amount must be greater than zero.");
  }
  if (collectedAmount > Number(this.totalAmount) + 0.01) {
    throw new Error("Collected amount exceeds the order total.");
  }

  this.payment.codStatus = CODStatus.COLLECTED;
  this.payment.codCollectedAt = new Date();
  this.payment.codCollectedBy = actorId;
  this.payment.amountPaid = collectedAmount;

  // Cash collected means the order is actually paid. Keeping the
  // status at "pending" blocked refunds and made paid-order reports
  // (and totalSpent reconciliation) treat collected COD as unpaid.
  if (
    [PaymentStatus.PENDING, PaymentStatus.FAILED].includes(
      this.payment.status,
    )
  ) {
    this.payment.status = PaymentStatus.PAID;
    this.payment.paidAt = new Date();
  }

  return this.save();
};

OrderSchema.methods.getRemainingRefundAmount = function () {
  return Math.max(0, this.payment.amountPaid - this.payment.refundedAmount);
};

OrderSchema.methods.isFullyRefunded = function () {
  return this.payment.status === PaymentStatus.REFUNDED;
};

/* =========================================================
 * PROCESSING / FULFILLMENT
 * ========================================================= */

OrderSchema.methods.startProcessing = async function ({
  actor = "admin",
  actorId = null,
} = {}) {
  if (this.status === OrderStatus.PROCESSING) {
    return this; // idempotent retry
  }
  if (this.status !== OrderStatus.CONFIRMED) {
    throw new Error("Only confirmed orders can enter processing.");
  }

  this.fulfillment.status = FulfillmentStatus.PROCESSING;

  return this.transitionTo(OrderStatus.PROCESSING, {
    actor,
    actorId,
  });
};

OrderSchema.methods.markAsPacked = async function () {
  if (this.fulfillment.status === FulfillmentStatus.PACKED) {
    return this; // idempotent retry
  }
  if (this.status !== OrderStatus.PROCESSING) {
    throw new Error("Only processing orders can be packed.");
  }

  this.fulfillment.status = FulfillmentStatus.PACKED;

  return this.save();
};

OrderSchema.methods.markAsShipped = async function ({
  trackingNumber = null,
  serviceName = null,
  contactNumber = null,
  email = null,
  estimatedDelivery = null,
  actor = "admin",
  actorId = null,
} = {}) {
  if (this.status === OrderStatus.SHIPPED) {
    return this; // idempotent retry
  }
  if (this.status !== OrderStatus.PROCESSING) {
    throw new Error(`Cannot ship order from status: ${this.status}`);
  }

  this.fulfillment.status = FulfillmentStatus.SHIPPED;

  /* Only write fields the caller actually supplied. Passing an empty
   * sheet used to null out an AWB/shipment already synced by Shipmozo. */
  if (trackingNumber !== null && trackingNumber !== undefined) {
    this.fulfillment.trackingNumber = String(trackingNumber);
  }
  if (serviceName !== null && serviceName !== undefined) {
    this.fulfillment.serviceName = serviceName;
  }
  if (contactNumber !== null && contactNumber !== undefined) {
    this.fulfillment.contactNumber = contactNumber;
  }
  if (email !== null && email !== undefined) {
    this.fulfillment.email = email;
  }
  if (estimatedDelivery !== null && estimatedDelivery !== undefined) {
    this.fulfillment.estimatedDelivery = estimatedDelivery;
  }

  this.fulfillment.shippedAt = new Date();

  return this.transitionTo(OrderStatus.SHIPPED, {
    actor,
    actorId,
  });
};

OrderSchema.methods.markAsDelivered = async function ({
  actor = "system",
  actorId = null,
} = {}) {
  if (this.status === OrderStatus.DELIVERED) {
    return this; // idempotent courier poll
  }
  if (this.status !== OrderStatus.SHIPPED) {
    throw new Error("Only shipped orders can be delivered.");
  }

  this.fulfillment.status = FulfillmentStatus.DELIVERED;

  this.fulfillment.deliveredAt = new Date();

  return this.transitionTo(OrderStatus.DELIVERED, {
    actor,
    actorId,
  });
};

/* =========================================================
 * CANCELLATION
 * ========================================================= */

OrderSchema.methods.canCancel = function () {
  return [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
  ].includes(this.status);
};

OrderSchema.methods.requestCancellation = async function ({
  reason = null,
  detail = null,
  actorId = null,
} = {}) {
  if (!this.canCancel()) {
    throw new Error(`Cannot cancel order from status: ${this.status}`);
  }
  if (this.cancellation.status === CancellationStatus.REQUESTED) {
    throw new Error("A cancellation request is already pending review.");
  }

  this.cancellation.status = CancellationStatus.REQUESTED;

  this.cancellation.requestedAt = new Date();

  this.cancellation.reason = reason;
  this.cancellation.detail = detail ? String(detail).slice(0, 1000) : null;
  this.cancellation.actorId = actorId;

  return this.save();
};

OrderSchema.methods.approveCancellation = async function ({
  actorId = null,
} = {}) {
  if (this.cancellation.status !== CancellationStatus.REQUESTED) {
    throw new Error("No cancellation request exists.");
  }

  this.cancellation.status = CancellationStatus.APPROVED;

  this.cancellation.approvedAt = new Date();

  return this.transitionTo(OrderStatus.CANCELLED, {
    actor: "admin",
    actorId,
    note: this.cancellation.reason,
  });
};

OrderSchema.methods.rejectCancellation = async function ({
  reason = null,
} = {}) {
  if (this.cancellation.status !== CancellationStatus.REQUESTED) {
    throw new Error("No cancellation request exists.");
  }

  this.cancellation.status = CancellationStatus.REJECTED;

  this.cancellation.rejectionReason = reason;

  return this.save();
};

OrderSchema.methods.cancelOrder = async function ({
  reason = null,
  actor = "admin",
  actorId = null,
} = {}) {
  if (!this.canCancel()) {
    throw new Error(`Cannot cancel order from status: ${this.status}`);
  }

  this.cancellation.status = CancellationStatus.APPROVED;

  this.cancellation.requestedAt ??= new Date();

  this.cancellation.approvedAt = new Date();

  this.cancellation.reason = reason;
  this.cancellation.actorId = actorId;

  return this.transitionTo(OrderStatus.CANCELLED, {
    actor,
    actorId,
    note: reason,
  });
};

/* A cancelled prepaid order must enter the refund queue — otherwise
 * the money sits with the gateway until someone remembers. COD orders
 * only qualify once cash was actually collected. Idempotent: a second
 * call while a refund is pending is a no-op. */
OrderSchema.methods.ensureCancellationRefund = async function ({
  reason = "Order cancelled",
} = {}) {
  if (this.payment.status !== PaymentStatus.PAID) {
    return this;
  }
  if (this.refund.status === RefundStatus.PENDING) {
    return this;
  }
  if (!this.canRefund()) {
    return this;
  }
  return this.requestRefund({
    amount: this.getRemainingRefundAmount(),
    reason,
  });
};

/* =========================================================
 * RETURNS
 * ========================================================= */

OrderSchema.methods.canRequestReturn = function () {
  return this.status === OrderStatus.DELIVERED;
};

OrderSchema.methods.requestReturn = async function ({
  reason = null,
  detail = null,
  actor = "user",
  actorId = null,
} = {}) {
  if (!this.canRequestReturn()) {
    throw new Error(`Cannot request return from status: ${this.status}`);
  }
  if (this.return.status === ReturnStatus.REQUESTED) {
    throw new Error("A return request is already pending review.");
  }

  this.return.status = ReturnStatus.REQUESTED;

  this.return.requestedAt = new Date();

  this.return.reason = reason;
  this.return.detail = detail ? String(detail).slice(0, 1000) : null;

  return this.transitionTo(OrderStatus.RETURN_REQUESTED, {
    actor,
    actorId,
    note: reason,
  });
};

OrderSchema.methods.approveReturn = async function ({ actorId = null } = {}) {
  if (this.return.status !== ReturnStatus.REQUESTED) {
    throw new Error("No return request exists.");
  }

  this.return.status = ReturnStatus.APPROVED;

  this.return.approvedAt = new Date();

  /*
   * Return approval is a subsystem state.
   * Main order status remains return_requested
   * until the item is actually returned.
   */
  return this.save();
};

OrderSchema.methods.rejectReturn = async function ({
  reason = null,
  actorId = null,
} = {}) {
  if (this.return.status !== ReturnStatus.REQUESTED) {
    throw new Error("No return request exists.");
  }

  this.return.status = ReturnStatus.REJECTED;

  this.return.rejectionReason = reason;

  /* Rejection returns the order to delivered: the customer keeps the
   * item, so leaving it at return_requested made the order permanently
   * un-cancellable/un-actionable. */
  return this.transitionTo(OrderStatus.DELIVERED, {
    actor: "admin",
    actorId,
    note: reason ? `Return rejected: ${reason}` : "Return rejected",
  });
};

OrderSchema.methods.markReturnReceived = async function () {
  if (this.return.status === ReturnStatus.RECEIVED) {
    return this; // idempotent retry
  }
  if (this.return.status !== ReturnStatus.APPROVED) {
    throw new Error("Return must be approved first.");
  }

  this.return.status = ReturnStatus.RECEIVED;

  this.return.receivedAt = new Date();

  return this.save();
};

OrderSchema.methods.completeReturn = async function ({ actorId = null } = {}) {
  if (
    this.return.status === ReturnStatus.COMPLETED &&
    this.status === OrderStatus.RETURNED
  ) {
    return this; // idempotent retry
  }
  if (this.return.status !== ReturnStatus.RECEIVED) {
    throw new Error("Return must be received first.");
  }

  this.return.status = ReturnStatus.COMPLETED;

  this.return.completedAt = new Date();

  /* A completed return means every unit is physically back. Track it on
   * the line items so reports and stock release agree. */
  for (const item of this.products ?? []) {
    item.returnedQuantity = Number(item.quantity) || 0;
  }

  return this.transitionTo(OrderStatus.RETURNED, {
    actor: "admin",
    actorId,
  });
};

/* =========================================================
 * REFUND
 * ========================================================= */

OrderSchema.methods.canRefund = function () {
  return (
    [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED].includes(
      this.payment.status,
    ) && this.getRemainingRefundAmount() > 0
  );
};

OrderSchema.methods.requestRefund = async function ({
  amount = this.getRemainingRefundAmount(),
  reason = null,
} = {}) {
  if (this.refund.status === RefundStatus.PENDING) {
    throw new Error("A refund is already pending for this order.");
  }
  if (!this.canRefund()) {
    throw new Error("Order cannot be refunded.");
  }

  const refundAmount = Number(amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }

  if (refundAmount > this.getRemainingRefundAmount() + 0.001) {
    throw new Error("Refund amount exceeds remaining refundable amount.");
  }

  this.payment.status = PaymentStatus.REFUND_PENDING;

  this.refund.status = RefundStatus.PENDING;

  this.refund.amount = refundAmount;
  this.refund.reason = reason;

  this.refund.requestedAt = new Date();

  return this.save();
};

OrderSchema.methods.completeRefund = async function ({
  transactionId = null,
} = {}) {
  if (
    this.refund.status === RefundStatus.REFUNDED &&
    this.payment.status === PaymentStatus.REFUNDED
  ) {
    return this; // idempotent retry
  }
  if (this.refund.status !== RefundStatus.PENDING) {
    throw new Error("No pending refund exists.");
  }

  const amount = Number(this.refund.amount);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > this.getRemainingRefundAmount() + 0.001
  ) {
    throw new Error("Invalid refund amount.");
  }

  this.payment.refundedAmount += amount;

  const fullyRefunded = this.getRemainingRefundAmount() === 0;

  this.payment.status = fullyRefunded
    ? PaymentStatus.REFUNDED
    : PaymentStatus.PARTIALLY_REFUNDED;

  this.payment.refundedAt = new Date();

  this.payment.refundTransactionId = transactionId;

  this.refund.status = fullyRefunded
    ? RefundStatus.REFUNDED
    : RefundStatus.PARTIALLY_REFUNDED;

  this.refund.completedAt = new Date();

  this.refund.transactionId = transactionId;

  return this.save();
};

/* =========================================================
 * ORDER / PRODUCT INFORMATION
 * ========================================================= */

OrderSchema.methods.getItemCount = function () {
  return this.products.reduce((total, item) => total + item.quantity, 0);
};

OrderSchema.methods.getUniqueItemCount = function () {
  return this.products.length;
};

OrderSchema.methods.getSubtotal = function () {
  return this.products.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
};

OrderSchema.methods.getProduct = function (productId) {
  return this.products.find((item) => item.productId === productId);
};

OrderSchema.methods.hasProduct = function (productId) {
  return this.products.some((item) => item.productId === productId);
};

OrderSchema.methods.getProductQuantity = function (productId) {
  return this.getProduct(productId)?.quantity ?? 0;
};

OrderSchema.methods.getTotalDiscount = function () {
  return this.discount.amount;
};

OrderSchema.methods.getTotalRefunded = function () {
  return this.payment.refundedAmount;
};

OrderSchema.methods.isPaid = function () {
  return this.payment.status === PaymentStatus.PAID;
};

OrderSchema.methods.isShipped = function () {
  return (
    this.fulfillment.status === FulfillmentStatus.SHIPPED ||
    this.fulfillment.status === FulfillmentStatus.DELIVERED
  );
};

OrderSchema.methods.isDelivered = function () {
  return this.status === OrderStatus.DELIVERED;
};

OrderSchema.methods.isCancelled = function () {
  return this.status === OrderStatus.CANCELLED;
};

OrderSchema.methods.isReturned = function () {
  return this.status === OrderStatus.RETURNED;
};

OrderSchema.methods.isInProgress = function () {
  return [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
  ].includes(this.status);
};

OrderSchema.methods.isAwaitingPayment = function () {
  return this.payment.status === PaymentStatus.PENDING;
};

OrderSchema.methods.hasTracking = function () {
  return Boolean(this.fulfillment.trackingNumber);
};

/* =========================================================
 * SHIPPING METHODS
 * ========================================================= */

OrderSchema.methods.updateShipmentInfo = async function ({
  serviceName,
  contactNumber,
  email,
  trackingNumber,
} = {}) {
  if (serviceName !== undefined) {
    this.fulfillment.serviceName = serviceName;
  }

  if (contactNumber !== undefined) {
    this.fulfillment.contactNumber = contactNumber;
  }

  if (email !== undefined) {
    this.fulfillment.email = email;
  }

  if (trackingNumber !== undefined) {
    this.fulfillment.trackingNumber = trackingNumber;
  }

  return this.save();
};

OrderSchema.methods.updateEstimatedDelivery = async function (estimatedDate) {
  this.fulfillment.estimatedDelivery = estimatedDate;

  return this.save();
};

/* =========================================================
 * STATIC METHODS
 * ========================================================= */

OrderSchema.statics.createOrder = function (orderData) {
  return this.create(orderData);
};

OrderSchema.statics.getOrderById = function (orderId) {
  return this.findOne({
    id: orderId,
  });
};

OrderSchema.statics.getOrdersByUserId = function (
  userId,
  { limit = 20, skip = 0 } = {},
) {
  return this.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit);
};

OrderSchema.statics.countOrdersByUserId = function (userId) {
  return this.countDocuments({
    userId,
  });
};

OrderSchema.statics.getOrdersByStatus = function (
  status,
  { limit = 50, skip = 0 } = {},
) {
  if (!Object.values(OrderStatus).includes(status)) {
    throw new Error(`Invalid order status: ${status}`);
  }

  return this.find({ status }).sort({ createdAt: -1 }).skip(skip).limit(limit);
};

OrderSchema.statics.countByStatus = function (status) {
  return this.countDocuments({
    status,
  });
};

OrderSchema.statics.getRecentOrders = function (limit = 20) {
  return this.find().sort({ createdAt: -1 }).limit(limit);
};

OrderSchema.statics.getPendingOrders = function () {
  return this.find({
    status: OrderStatus.PENDING,
  }).sort({ createdAt: 1 });
};

OrderSchema.statics.getProcessingOrders = function () {
  return this.find({
    status: OrderStatus.PROCESSING,
  }).sort({ createdAt: 1 });
};

OrderSchema.statics.getOrdersAwaitingShipment = function () {
  return this.find({
    status: {
      $in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
    },
  }).sort({ createdAt: 1 });
};

OrderSchema.statics.getShippedOrders = function () {
  return this.find({
    status: OrderStatus.SHIPPED,
  }).sort({ createdAt: 1 });
};

OrderSchema.statics.getDeliveredOrders = function () {
  return this.find({
    status: OrderStatus.DELIVERED,
  }).sort({ createdAt: -1 });
};

OrderSchema.statics.getCancellationRequests = function () {
  return this.find({
    "cancellation.status": CancellationStatus.REQUESTED,
  }).sort({ createdAt: 1 });
};

OrderSchema.statics.getReturnRequests = function () {
  return this.find({
    "return.status": ReturnStatus.REQUESTED,
  }).sort({ createdAt: 1 });
};

OrderSchema.statics.getPendingRefunds = function () {
  return this.find({
    "payment.status": PaymentStatus.REFUND_PENDING,
  }).sort({ createdAt: 1 });
};

OrderSchema.statics.getOrdersByPaymentStatus = function (status) {
  return this.find({
    "payment.status": status,
  }).sort({ createdAt: -1 });
};

OrderSchema.statics.getOrdersByFulfillmentStatus = function (status) {
  return this.find({
    "fulfillment.status": status,
  }).sort({ createdAt: -1 });
};

OrderSchema.statics.updateOrderStatus = async function (
  orderId,
  status,
  { note = null, actor = "system", actorId = null } = {},
) {
  const order = await this.findOne({
    id: orderId,
  });

  if (!order) {
    return null;
  }

  return order.transitionTo(status, {
    note,
    actor,
    actorId,
  });
};

OrderSchema.statics.cancelOrderById = async function (
  orderId,
  { reason = null, actorId = null } = {},
) {
  const order = await this.findOne({
    id: orderId,
  });

  if (!order) {
    return null;
  }

  return order.cancelOrder({
    reason,
    actor: "admin",
    actorId,
  });
};

OrderSchema.statics.deleteOrder = function (orderId) {
  return this.findOneAndDelete({
    id: orderId,
  });
};

/* =========================================================
 * INDEXES
 * ========================================================= */

OrderSchema.index({
  userId: 1,
  createdAt: -1,
});

OrderSchema.index({
  status: 1,
  createdAt: -1,
});

OrderSchema.index({
  "payment.status": 1,
  createdAt: -1,
});

OrderSchema.index({
  "fulfillment.status": 1,
  createdAt: -1,
});

OrderSchema.index({
  "fulfillment.trackingNumber": 1,
});

OrderSchema.index({ idempotencyKey: 1 }, { sparse: true });
OrderSchema.index({ "payment.razorpayOrderId": 1 }, { sparse: true });
OrderSchema.index({ "payment.razorpayPaymentId": 1 }, { sparse: true });
OrderSchema.index({ "fulfillment.awb": 1 }, { sparse: true });
OrderSchema.index({ "payment.method": 1, "payment.status": 1 });

/* =========================================================
 * AT-REST ADDRESS SEALING (Tier A envelope encryption)
 *
 * Whatever writes the snapshot — COD checkout, verified prepaid
 * (payments verify/webhook), an admin editing data mid-flow — every
 * plaintext address string is sealed with AES-256-GCM just before
 * validation persists it. Sealed values (ze1.…) pass through
 * untouched, so re-sealing legacy plaintext rows happens lazily on
 * any save. The shipmozo/ops flows open the snapshot transiently
 * (routes/shipments.js) and re-seal automatically on save.
 * ========================================================= */

OrderSchema.pre("validate", async function () {
  for (const parentKey of ["shippingAddress", "billingAddress"]) {
    const addr = this[parentKey];
    if (!addr || typeof addr !== "object") continue;
    for (const [field, value] of Object.entries(addr)) {
      if (typeof value === "string" && value && !isSealed(value)) {
        this[parentKey][field] = sealString(value, {
          context: `order:${field}`,
        });
      }
    }
  }
});

/* =========================================================
 * MODEL
 * ========================================================= */

export const OrderModel = mongoose.model("Order", OrderSchema, "orders");

export default {
  OrderSchema,
  OrderModel,

  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  CODStatus,
  FulfillmentStatus,
  CancellationStatus,
  ReturnStatus,
  RefundStatus,
};

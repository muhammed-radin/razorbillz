import mongoose, { Schema } from "mongoose";

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

  [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURNED],

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
  { note = null, actor = "system", actorId = null, validate = true } = {},
) {
  if (!Object.values(OrderStatus).includes(nextStatus)) {
    throw new Error(`Invalid order status: ${nextStatus}`);
  }

  if (
    validate &&
    this.status !== nextStatus &&
    !this.canTransitionTo(nextStatus)
  ) {
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
  this.payment.status = PaymentStatus.PAID;
  this.payment.transactionId = transactionId;
  this.payment.amountPaid = amount;
  this.payment.paidAt = new Date();

  if (this.status === OrderStatus.PENDING) {
    return this.transitionTo(OrderStatus.CONFIRMED, {
      note: "Payment confirmed",
      actor: "system",
    });
  }

  return this.save();
};

OrderSchema.methods.markPaymentFailed = async function (reason = null) {
  this.payment.status = PaymentStatus.FAILED;
  this.payment.failureReason = reason;

  return this.save();
};

/* COD: mark cash collected only via trusted admin workflow.
 * Never marks payment.status=paid; COD uses codStatus independently. */
OrderSchema.methods.markCodCollected = async function ({
  actorId = null,
  amount = null,
} = {}) {
  if (this.payment.method !== PaymentMethod.COD) {
    throw new Error("Only COD orders can record cash collection.");
  }
  if (this.payment.codStatus === CODStatus.COLLECTED) {
    return this; // idempotent
  }
  this.payment.codStatus = CODStatus.COLLECTED;
  this.payment.codCollectedAt = new Date();
  this.payment.codCollectedBy = actorId;
  if (amount !== null && Number.isFinite(Number(amount))) {
    this.payment.amountPaid = Number(amount);
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
  if (![OrderStatus.PROCESSING, OrderStatus.CONFIRMED].includes(this.status)) {
    throw new Error(`Cannot ship order from status: ${this.status}`);
  }

  this.fulfillment.status = FulfillmentStatus.SHIPPED;

  this.fulfillment.trackingNumber = trackingNumber;

  this.fulfillment.serviceName = serviceName;

  this.fulfillment.contactNumber = contactNumber;

  this.fulfillment.email = email;

  this.fulfillment.estimatedDelivery = estimatedDelivery;

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

/* =========================================================
 * RETURNS
 * ========================================================= */

OrderSchema.methods.canRequestReturn = function () {
  return this.status === OrderStatus.DELIVERED;
};

OrderSchema.methods.requestReturn = async function ({
  reason = null,
  detail = null,
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
    actor: "user",
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

OrderSchema.methods.rejectReturn = async function ({ reason = null } = {}) {
  if (this.return.status !== ReturnStatus.REQUESTED) {
    throw new Error("No return request exists.");
  }

  this.return.status = ReturnStatus.REJECTED;

  this.return.rejectionReason = reason;

  return this.save();
};

OrderSchema.methods.markReturnReceived = async function () {
  if (this.return.status !== ReturnStatus.APPROVED) {
    throw new Error("Return must be approved first.");
  }

  this.return.status = ReturnStatus.RECEIVED;

  this.return.receivedAt = new Date();

  return this.save();
};

OrderSchema.methods.completeReturn = async function ({ actorId = null } = {}) {
  if (this.return.status !== ReturnStatus.RECEIVED) {
    throw new Error("Return must be received first.");
  }

  this.return.status = ReturnStatus.COMPLETED;

  this.return.completedAt = new Date();

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
    this.payment.status === PaymentStatus.PAID &&
    this.getRemainingRefundAmount() > 0
  );
};

OrderSchema.methods.requestRefund = async function ({
  amount = this.getRemainingRefundAmount(),
  reason = null,
} = {}) {
  if (!this.canRefund()) {
    throw new Error("Order cannot be refunded.");
  }

  if (amount <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }

  if (amount > this.getRemainingRefundAmount()) {
    throw new Error("Refund amount exceeds remaining refundable amount.");
  }

  this.payment.status = PaymentStatus.REFUND_PENDING;

  this.refund.status = RefundStatus.PENDING;

  this.refund.amount = amount;
  this.refund.reason = reason;

  this.refund.requestedAt = new Date();

  return this.save();
};

OrderSchema.methods.completeRefund = async function ({
  transactionId = null,
} = {}) {
  if (this.refund.status !== RefundStatus.PENDING) {
    throw new Error("No pending refund exists.");
  }

  const amount = this.refund.amount;

  if (amount <= 0 || amount > this.getRemainingRefundAmount()) {
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
  { note = null, actor = "system", actorId = null, validate = true } = {},
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
    validate,
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

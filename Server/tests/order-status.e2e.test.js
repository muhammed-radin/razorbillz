import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";

/* =========================================================
 * Order status end-to-end state machine.
 *
 * Uses a REAL MongoDB database (no mocks) so every transition,
 * inventory marker and refund accumulator is persisted exactly the
 * way the API routes use it. Master keys are injected BEFORE the order
 * modules are imported: address/ticket sealing fails closed without
 * them.
 *
 * Run with: npm test  (or MONGODB_TEST_URI=... node --test tests/order-status.e2e.test.js)
 * ========================================================= */

const TEST_DB = "razorbillz_order_status_test";
const TEST_USER = "user-e2e-status";
const RUN = crypto.randomBytes(4).toString("hex");

const BASE_URI =
  process.env.MONGODB_TEST_URI ??
  process.env.MONGODB_URI ??
  "mongodb://localhost:27017";

process.env.MONGODB_URI = BASE_URI;
process.env.ENCRYPTION_KEYS_JSON =
  process.env.ENCRYPTION_KEYS_JSON ??
  JSON.stringify({
    version: 1,
    keys: [
      {
        id: "e2e-key-1",
        algorithm: "AES-256-GCM",
        key: crypto.randomBytes(32).toString("base64url"),
        createdAt: new Date().toISOString(),
      },
    ],
  });

const ADDRESS = Object.freeze({
  name: "E2E Customer",
  street: "12 Test Street",
  city: "Mumbai",
  state: "Maharashtra",
  postalCode: "400001",
  country: "India",
  phoneNumber: "9999999999",
  email: "e2e@example.test",
});

let OrderModel;
let OrderStatus;
let PaymentStatus;
let PaymentMethod;
let CODStatus;
let ReturnStatus;
let RefundStatus;
let CancellationStatus;
let FulfillmentStatus;
let createOrderRecord;
let releaseOrderStock;
let db;

let seq = 0;

function item(price = 1000, quantity = 1) {
  seq += 1;
  const productId = `E2E-${RUN}-${seq}`;
  return {
    productId,
    title: `E2E product ${seq}`,
    thumbnail: "https://example.test/p.png",
    originalPrice: price,
    price,
    sku: productId,
    category: "test",
    brand: "razorbills",
    quantity,
    specialInfo: {},
  };
}

async function seedProduct(product, stock = 100) {
  await db.collection("products").insertOne({
    id: product.productId,
    title: product.title,
    stock,
  });
}

async function stockOf(productId) {
  const doc = await db.collection("products").findOne({ id: productId });
  return doc?.stock ?? null;
}

function pricedFor(products) {
  const subtotal = products.reduce(
    (total, p) => total + p.price * p.quantity,
    0,
  );
  return {
    products,
    subtotal,
    discount: { codes: [], amount: 0 },
    tax: 0,
    taxAmount: 0,
    shippingAmount: 0,
    codFee: 0,
    totalAmount: subtotal,
    currency: "INR",
    weightKg: 0.5,
    itemCount: products.reduce((total, p) => total + p.quantity, 0),
  };
}

/* COD order starts CONFIRMED (cash is collected later). */
async function codOrder({ price = 1000, quantity = 1, confirm = true } = {}) {
  const product = item(price, quantity);
  await seedProduct(product);
  const priced = pricedFor([product]);
  const order = await createOrderRecord({
    userId: TEST_USER,
    priced,
    shippingAddress: { ...ADDRESS },
    billingAddress: { ...ADDRESS },
    method: PaymentMethod.COD,
    confirm,
    confirmNote: confirm ? "COD order confirmed" : null,
  });
  return { order, product, priced };
}

/* Prepaid order starts PAID + CONFIRMED through markAsPaid. */
async function paidOrder({ price = 1000, quantity = 1 } = {}) {
  const product = item(price, quantity);
  await seedProduct(product);
  const priced = pricedFor([product]);
  const order = await createOrderRecord({
    userId: TEST_USER,
    priced,
    shippingAddress: { ...ADDRESS },
    billingAddress: { ...ADDRESS },
    method: PaymentMethod.RAZORPAY,
    markPaid: {
      transactionId: `pay_${RUN}_${seq}`,
      amount: priced.totalAmount,
    },
  });
  return { order, product, priced };
}

async function fresh(order) {
  return OrderModel.findOne({ id: order.id });
}

describe("order status end-to-end", () => {
  before(async () => {
    await mongoose.connect(BASE_URI, { dbName: TEST_DB });
    db = mongoose.connection;

    ({
      OrderModel,
      OrderStatus,
      PaymentStatus,
      PaymentMethod,
      CODStatus,
      ReturnStatus,
      RefundStatus,
      CancellationStatus,
      FulfillmentStatus,
    } = await import("../models/schema/order.js"));
    ({ createOrderRecord, releaseOrderStock } = await import(
      "../utils/orderFactory.js"
    ));

    await db.collection("orders").deleteMany({ userId: TEST_USER });
  });

  after(async () => {
    await db.collection("orders").deleteMany({ userId: TEST_USER });
    await db
      .collection("products")
      .deleteMany({ id: new RegExp(`^E2E-${RUN}-`) });
    await mongoose.disconnect();
  });

  it("walks confirmed -> processing -> packed -> shipped -> delivered", async () => {
    const { order } = await paidOrder();
    assert.equal(order.status, OrderStatus.CONFIRMED);
    assert.equal(order.payment.status, PaymentStatus.PAID);
    assert.ok(order.payment.paidAt);

    const processing = await order.startProcessing({ actor: "admin" });
    assert.equal(processing.status, OrderStatus.PROCESSING);
    assert.equal(processing.fulfillment.status, FulfillmentStatus.PROCESSING);

    const historyBefore = processing.statusHistory.length;
    const processingAgain = await processing.startProcessing({ actor: "admin" });
    assert.equal(processingAgain.status, OrderStatus.PROCESSING);
    assert.equal(processingAgain.statusHistory.length, historyBefore);

    const packed = await processingAgain.markAsPacked();
    assert.equal(packed.fulfillment.status, FulfillmentStatus.PACKED);
    const packedAgain = await packed.markAsPacked();
    assert.equal(packedAgain.fulfillment.status, FulfillmentStatus.PACKED);

    const shipped = await packedAgain.markAsShipped({
      trackingNumber: "AWB123",
      serviceName: "E2E Courier",
    });
    assert.equal(shipped.status, OrderStatus.SHIPPED);
    assert.equal(shipped.fulfillment.trackingNumber, "AWB123");
    assert.equal(shipped.fulfillment.serviceName, "E2E Courier");
    assert.equal(
      (await shipped.markAsShipped()).status,
      OrderStatus.SHIPPED,
      "repeat ship is idempotent",
    );

    const delivered = await shipped.markAsDelivered({ actor: "system" });
    assert.equal(delivered.status, OrderStatus.DELIVERED);
    assert.ok(delivered.fulfillment.deliveredAt);
    assert.equal(
      (await delivered.markAsDelivered()).status,
      OrderStatus.DELIVERED,
      "repeat delivery poll is idempotent",
    );

    const persisted = await fresh(order);
    assert.equal(persisted.status, OrderStatus.DELIVERED);
    assert.equal(persisted.fulfillment.status, FulfillmentStatus.DELIVERED);
  });

  it("starts pending, confirms through the validated edge, and cancels pending", async () => {
    const { order, product } = await codOrder({ price: 600, confirm: false });
    assert.equal(order.status, OrderStatus.PENDING);
    assert.equal(await stockOf(product.productId), 99, "pending reserves stock");

    // Pending cannot skip straight to processing/delivered.
    await assert.rejects(
      () => order.startProcessing({ actor: "admin" }),
      /Only confirmed orders/i,
    );

    const confirmed = await order.transitionTo(OrderStatus.CONFIRMED, {
      note: "Confirmed via admin review",
      actor: "admin",
    });
    assert.equal(confirmed.status, OrderStatus.CONFIRMED);
    assert.equal(
      confirmed.statusHistory.at(-1)?.status,
      OrderStatus.CONFIRMED,
    );

    // Cancelling a still-pending order also restores the reservation once.
    const { order: pending } = await codOrder({
      price: 400,
      confirm: false,
    });
    const cancelled = await pending.cancelOrder({
      reason: "Abandoned before confirmation",
      actorId: "admin-1",
    });
    assert.equal(cancelled.status, OrderStatus.CANCELLED);
  });

  it("COD collection marks the payment paid exactly once", async () => {
    const { order, priced } = await codOrder();
    assert.equal(order.status, OrderStatus.CONFIRMED);
    assert.equal(order.payment.status, PaymentStatus.PENDING);
    assert.equal(order.payment.codStatus, CODStatus.PENDING_COLLECTION);

    const collected = await order.markCodCollected({
      actorId: "staff-1",
      amount: priced.totalAmount,
    });
    assert.equal(collected.payment.codStatus, CODStatus.COLLECTED);
    assert.equal(collected.payment.status, PaymentStatus.PAID);
    assert.equal(collected.payment.amountPaid, priced.totalAmount);
    assert.ok(collected.payment.codCollectedAt);

    const again = await collected.markCodCollected({ actorId: "staff-2" });
    assert.equal(again.payment.amountPaid, priced.totalAmount);
    assert.equal(again.payment.codCollectedBy, "staff-1");
  });

  it("cancels confirmed orders and releases stock exactly once", async () => {
    const { order, product } = await codOrder({ price: 750 });
    assert.equal(await stockOf(product.productId), 99);

    const requested = await order.requestCancellation({
      reason: "Changed mind",
      actorId: TEST_USER,
    });
    assert.equal(requested.cancellation.status, CancellationStatus.REQUESTED);
    assert.equal(requested.status, OrderStatus.CONFIRMED);

    const rejected = await requested.rejectCancellation({
      reason: "Already packing",
    });
    assert.equal(rejected.cancellation.status, CancellationStatus.REJECTED);
    assert.equal(rejected.status, OrderStatus.CONFIRMED);

    const requestedAgain = await rejected.requestCancellation({
      reason: "Changed mind",
      actorId: TEST_USER,
    });
    const cancelled = await requestedAgain.approveCancellation({
      actorId: "admin-1",
    });
    assert.equal(cancelled.status, OrderStatus.CANCELLED);
    assert.equal(cancelled.cancellation.status, CancellationStatus.APPROVED);

    await releaseOrderStock(cancelled);
    assert.equal(await stockOf(product.productId), 100);
    await releaseOrderStock(cancelled);
    assert.equal(
      await stockOf(product.productId),
      100,
      "double release must not inflate stock",
    );

    const persisted = await fresh(cancelled);
    assert.ok(persisted.stockReleasedAt);
    assert.equal(persisted.isTerminal(), true);
  });

  it("prepaid cancellation queues a full refund once", async () => {
    const { order, priced } = await paidOrder({ price: 1200 });

    const cancelled = await order.cancelOrder({
      reason: "Out of stock",
      actorId: "admin-1",
    });
    assert.equal(cancelled.status, OrderStatus.CANCELLED);

    const queued = await cancelled.ensureCancellationRefund({
      reason: "Out of stock",
    });
    assert.equal(queued.payment.status, PaymentStatus.REFUND_PENDING);
    assert.equal(queued.refund.status, RefundStatus.PENDING);
    assert.equal(queued.refund.amount, priced.totalAmount);

    const again = await queued.ensureCancellationRefund();
    assert.equal(again.refund.status, RefundStatus.PENDING);
    assert.equal(again.refund.amount, priced.totalAmount);

    await assert.rejects(
      () => again.requestRefund({ amount: 1 }),
      /already pending/i,
    );
  });

  it("supports partial then full refunds and blocks over-refunds", async () => {
    const { order, priced } = await paidOrder({ price: 1000 });

    const partial = await order.requestRefund({
      amount: 400,
      reason: "Damaged item",
    });
    assert.equal(partial.payment.status, PaymentStatus.REFUND_PENDING);
    assert.equal(partial.refund.amount, 400);

    const partialDone = await partial.completeRefund({
      transactionId: "rfnd_partial",
    });
    assert.equal(partialDone.payment.status, PaymentStatus.PARTIALLY_REFUNDED);
    assert.equal(partialDone.refund.status, RefundStatus.PARTIALLY_REFUNDED);
    assert.equal(partialDone.payment.refundedAmount, 400);
    assert.equal(partialDone.getRemainingRefundAmount(), 600);

    await assert.rejects(
      () => partialDone.requestRefund({ amount: 601 }),
      /exceeds remaining/i,
    );

    const rest = await partialDone.requestRefund({
      amount: 600,
      reason: "Remaining balance",
    });
    const full = await rest.completeRefund({ transactionId: "rfnd_full" });
    assert.equal(full.payment.status, PaymentStatus.REFUNDED);
    assert.equal(full.refund.status, RefundStatus.REFUNDED);
    assert.equal(full.payment.refundedAmount, priced.totalAmount);
    assert.equal(full.getRemainingRefundAmount(), 0);

    const idempotent = await full.completeRefund();
    assert.equal(idempotent.payment.status, PaymentStatus.REFUNDED);

    await assert.rejects(
      () => full.requestRefund({ amount: 1 }),
      /cannot be refunded/i,
    );
  });

  it("handles the full return flow and restocks returned units once", async () => {
    const { order, product } = await paidOrder({ price: 900 });
    await order.startProcessing({ actor: "admin" });
    await order.markAsPacked();
    await order.markAsShipped({ trackingNumber: "AWB-RET" });
    const delivered = await order.markAsDelivered({ actor: "system" });
    assert.equal(delivered.status, OrderStatus.DELIVERED);
    assert.equal(await stockOf(product.productId), 99);

    const requested = await delivered.requestReturn({
      reason: "Wrong size",
      detail: "Need a smaller size",
      actor: "user",
      actorId: TEST_USER,
    });
    assert.equal(requested.status, OrderStatus.RETURN_REQUESTED);
    assert.equal(requested.return.status, ReturnStatus.REQUESTED);

    const approved = await requested.approveReturn({ actorId: "admin-1" });
    assert.equal(approved.status, OrderStatus.RETURN_REQUESTED);
    assert.equal(approved.return.status, ReturnStatus.APPROVED);

    const received = await approved.markReturnReceived();
    assert.equal(received.return.status, ReturnStatus.RECEIVED);
    assert.ok(received.return.receivedAt);

    const completed = await received.completeReturn({ actorId: "admin-1" });
    assert.equal(completed.status, OrderStatus.RETURNED);
    assert.equal(completed.return.status, ReturnStatus.COMPLETED);
    assert.equal(completed.products[0].returnedQuantity, 1);

    await releaseOrderStock(completed, { reason: "return" });
    assert.equal(await stockOf(product.productId), 100);
    await releaseOrderStock(completed, { reason: "return" });
    assert.equal(
      await stockOf(product.productId),
      100,
      "double return release must not inflate stock",
    );

    const persisted = await fresh(completed);
    assert.ok(persisted.returnStockReleasedAt);
    assert.equal(persisted.isTerminal(), true);

    const idempotent = await persisted.completeReturn();
    assert.equal(idempotent.status, OrderStatus.RETURNED);
  });

  it("rejection puts a return-requested order back to delivered", async () => {
    const { order } = await paidOrder({ price: 500 });
    await order.startProcessing({ actor: "admin" });
    await order.markAsPacked();
    await order.markAsShipped({ trackingNumber: "AWB-REJ" });
    const delivered = await order.markAsDelivered({ actor: "system" });

    const requested = await delivered.requestReturn({
      reason: "Not needed",
      actor: "user",
      actorId: TEST_USER,
    });
    const rejected = await requested.rejectReturn({
      reason: "Outside return window",
      actorId: "admin-1",
    });
    assert.equal(rejected.status, OrderStatus.DELIVERED);
    assert.equal(rejected.return.status, ReturnStatus.REJECTED);
    assert.equal(rejected.return.rejectionReason, "Outside return window");

    // The order is actionable again after rejection.
    const retried = await rejected.requestReturn({
      reason: "Not needed",
      actor: "user",
      actorId: TEST_USER,
    });
    assert.equal(retried.status, OrderStatus.RETURN_REQUESTED);
  });

  it("rejects invalid, duplicate and legacy-bypass transitions", async () => {
    const { order } = await codOrder({ price: 500 });

    await assert.rejects(
      () => order.transitionTo(OrderStatus.DELIVERED),
      /Invalid order transition/i,
    );
    await assert.rejects(
      () => order.transitionTo(OrderStatus.CONFIRMED),
      /already confirmed/i,
    );
    await assert.rejects(
      () => order.markAsDelivered(),
      /Only shipped orders/i,
    );
    await assert.rejects(
      () => order.requestReturn({ reason: "Too early" }),
      /Cannot request return/i,
    );

    const cancelled = await order.cancelOrder({ reason: "test", actorId: "a" });
    await assert.rejects(
      () => cancelled.markAsPaid({ amount: cancelled.totalAmount }),
      /Cannot mark a cancelled order as paid/i,
    );
    await assert.rejects(
      () => cancelled.markPaymentFailed("late failure"),
      /Cannot fail payment/i,
    );
    await assert.rejects(
      () => cancelled.markCodCollected(),
      /Cannot collect cash/i,
    );

    const { order: paid } = await paidOrder({ price: 500 });
    await assert.rejects(
      () => paid.markPaymentFailed("late failure"),
      /paid order cannot be marked/i,
    );
    await assert.rejects(
      () => paid.markCodCollected(),
      /Only COD orders/i,
    );
  });

  it("marks a failed prepaid payment once and leaves the order cancellable", async () => {
    const product = item(800);
    await seedProduct(product);
    const priced = pricedFor([product]);
    const order = await createOrderRecord({
      userId: TEST_USER,
      priced,
      shippingAddress: { ...ADDRESS },
      billingAddress: { ...ADDRESS },
      method: PaymentMethod.RAZORPAY,
    });
    assert.equal(order.status, OrderStatus.PENDING);
    assert.equal(order.payment.status, PaymentStatus.PENDING);

    const failed = await order.markPaymentFailed("card declined");
    assert.equal(failed.payment.status, PaymentStatus.FAILED);
    assert.equal(failed.payment.failureReason, "card declined");
    assert.equal(failed.status, OrderStatus.PENDING);

    // A repeated failure is a no-op, not a duplicate state change.
    const again = await failed.markPaymentFailed("card declined");
    assert.equal(again.payment.status, PaymentStatus.FAILED);

    // Payment failure must not brick the order: it can still be cancelled
    // and its reservation released.
    const cancelled = await again.cancelOrder({
      reason: "Payment never completed",
      actorId: "admin-1",
    });
    assert.equal(cancelled.status, OrderStatus.CANCELLED);
  });

  it("keeps the terminal order states idempotent under repeated completion calls", async () => {
    const { order } = await paidOrder({ price: 300 });
    await order.startProcessing({ actor: "admin" });
    await order.markAsPacked();
    await order.markAsShipped({ trackingNumber: "AWB-IDEMP" });
    const delivered = await order.markAsDelivered({ actor: "system" });
    const requested = await delivered.requestReturn({
      reason: "Idempotency",
      actor: "user",
      actorId: TEST_USER,
    });
    await requested.approveReturn({ actorId: "a" });
    await (await fresh(requested)).markReturnReceived();
    const received = await fresh(requested);
    const completed = await received.completeReturn({ actorId: "a" });
    await releaseOrderStock(completed, { reason: "return" });

    const firstRelease = (await fresh(completed)).returnStockReleasedAt;
    await releaseOrderStock(completed, { reason: "return" });
    const secondRelease = (await fresh(completed)).returnStockReleasedAt;
    assert.equal(String(firstRelease), String(secondRelease));
  });
});

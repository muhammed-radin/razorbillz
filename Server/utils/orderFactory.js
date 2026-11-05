import {
  OrderModel,
  OrderStatus,
  PaymentStatus,
  CODStatus,
  PaymentMethod,
  FulfillmentStatus,
  CancellationStatus,
  ReturnStatus,
  RefundStatus,
} from "../models/schema/order.js";
import { reserveStock, releaseStock } from "./inventory.js";
import { evt, Evts, OrderEvent } from "./events.manage.js";

/* =========================================================
 * Single order-creation path for COD (POST /orders) and
 * verified prepaid (payments verify/webhook). Stock is
 * reserved BEFORE the document is created and released if
 * creation fails — attempts/failed payments never touch stock.
 * ========================================================= */

export function newOrderId() {
  return (
    `ORD-${Date.now()}-` +
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

function buildOrderData({
  userId,
  priced,
  shippingAddress,
  billingAddress,
  method,
  idempotencyKey,
  paymentFields = {},
}) {
  const isCod = method === PaymentMethod.COD;
  return {
    id: newOrderId(),
    userId,
    products: priced.products,
    subtotal: priced.subtotal,
    discount: priced.discount,
    tax: priced.tax,
    taxAmount: priced.taxAmount,
    shippingAmount: priced.shippingAmount,
    codFee: priced.codFee,
    totalAmount: priced.totalAmount,
    currency: "INR",
    idempotencyKey: idempotencyKey ?? null,
    status: OrderStatus.PENDING,
    payment: {
      method,
      status: PaymentStatus.PENDING,
      transactionId: null,
      amountPaid: 0,
      refundedAmount: 0,
      codStatus: isCod
        ? CODStatus.PENDING_COLLECTION
        : CODStatus.NOT_APPLICABLE,
      ...paymentFields,
    },
    fulfillment: {
      status: FulfillmentStatus.UNFULFILLED,
      packageWeightKg: priced.weightKg,
      deliveryPincode: shippingAddress?.postalCode ?? null,
    },
    cancellation: { status: CancellationStatus.NONE },
    return: { status: ReturnStatus.NONE },
    refund: { status: RefundStatus.NONE },
    shippingAddress,
    billingAddress,
  };
}

/* Create + confirm an order. Options:
 * - confirm: transition PENDING -> CONFIRMED immediately
 *   (COD eligible orders, verified prepaid).
 * - markPaid: { transactionId, amount } — use markAsPaid so the
 *   CONFIRMED transition + paidAt stay in one audited method. */
export async function createOrderRecord({
  userId,
  priced,
  shippingAddress,
  billingAddress,
  method,
  idempotencyKey,
  paymentFields,
  confirm = false,
  confirmNote = null,
  markPaid = null,
}) {
  await reserveStock(priced.products);
  let order;
  try {
    order = await OrderModel.create(
      buildOrderData({
        userId,
        priced,
        shippingAddress,
        billingAddress,
        method,
        idempotencyKey,
        paymentFields,
      }),
    );
  } catch (err) {
    await releaseStock(priced.products);
    throw err;
  }

  if (markPaid) {
    order = await order.markAsPaid(markPaid);
  } else if (confirm) {
    order = await order.transitionTo(OrderStatus.CONFIRMED, {
      note: confirmNote,
      actor: "system",
      actorId: userId,
    });
  }

  try {
    evt.fire(
      Evts.ORDER_PLACED,
      new OrderEvent({ type: Evts.ORDER_PLACED, order: order.toObject() }),
    );

    if (markPaid) {
      evt.fire(
        Evts.ORDER_PAID,
        new OrderEvent({ type: Evts.ORDER_PAID, order: order.toObject() }),
      );
    }

    if (method === PaymentMethod.COD) {
      evt.fire(Evts.COD_CREATED, {
        orderId: order.id,
        userId,
        amount: order.totalAmount,
      });
      evt.fire(Evts.COD_COLLECTION_PENDING, {
        orderId: order.id,
        userId,
        amount: order.totalAmount,
      });
    }
  } catch (err) {
    console.error("[orderFactory] analytics event failed:", err?.message);
  }

  // totalOrders/totalSpent are maintained by the buffered user-stats
  // listener for ORDER_PLACED / COD_COLLECTED / ORDER_REFUNDED.
  return order;
}

/* Release reserved stock after a terminal cancellation.
 * Best-effort: failures are logged, never thrown. */
export async function releaseOrderStock(order) {
  try {
    await releaseStock(order?.products ?? []);
  } catch (err) {
    console.error("[orderFactory] stock release failed:", err?.message);
  }
}

export default { newOrderId, createOrderRecord, releaseOrderStock };

import { db } from "./db.js";

/* =========================================================
 * Inventory reservation. Stock decrements happen ONLY when a
 * real order is created (verified prepaid or eligible COD) —
 * never for payment attempts, failed, or abandoned checkouts.
 * Releases happen on cancellation paths. Best-effort: stock
 * errors never corrupt order state, but insufficient stock
 * blocks order creation (checked atomically where possible).
 * ========================================================= */

/** Atomically decrement stock for priced items.
 * Throws { code:400, productId } when any line lacks stock. */
export async function reserveStock(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const col = db.collection("products");
  const done = [];
  for (const i of items) {
    const pid = String(i.productId);
    const qty = Number(i.quantity);
    const res = await col.updateOne(
      { id: pid, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
    );
    if ((res.modifiedCount ?? 0) !== 1) {
      for (const d of done) {
        await col
          .updateOne({ id: d.pid }, { $inc: { stock: d.qty } })
          .catch(() => {});
      }
      const stillThere = await col.findOne({ id: pid });
      const err = new Error(
        stillThere
          ? `Insufficient stock for ${stillThere.title ?? pid}.`
          : `Product unavailable: ${pid}.`,
      );
      err.code = 400;
      err.productId = pid;
      throw err;
    }
    done.push({ pid, qty });
  }
}

/** Best-effort release (cancellation paths). Never throws. */
export async function releaseStock(items) {
  try {
    if (!Array.isArray(items) || items.length === 0) return;
    await db.collection("products").bulkWrite(
      items.map((i) => ({
        updateOne: {
          filter: { id: String(i.productId ?? i.id) },
          update: { $inc: { stock: Number(i.quantity) || 0 } },
        },
      })),
      { ordered: false },
    );
  } catch (err) {
    console.error("[inventory] release failed:", err?.message);
  }
}

export default { reserveStock, releaseStock };

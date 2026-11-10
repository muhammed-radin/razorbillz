import { CartModel } from "../models/schema/cart.js";
import { HttpError } from "./httpError.js";

const normalizeId = (value) => String(value ?? "").trim();

/**
 * Guard checkout against a client cart that has drifted from the
 * persisted server cart — e.g. an optimistic quantity edit that never
 * reached the server, or a stale tab.
 *
 * The submitted items must match the stored cart EXACTLY (same products,
 * same quantities). Throws HttpError(409, "CART_MISMATCH") with the
 * authoritative server cart in `details.serverCart` when they differ, so
 * the client can refresh and retry.
 *
 * @param {{ userId: string, items: Array<{productId?: string, id?: string, quantity?: number}> }} args
 */
export async function assertCartMatchesServerCart({ userId, items }) {
  if (!userId) {
    throw new HttpError(401, "UNAUTHORIZED", "Authenticated user is required.");
  }

  const submitted = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const productId = normalizeId(item?.productId ?? item?.id);
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(
        400,
        "VALIDATION_FAILED",
        "Invalid cart item encountered.",
        { productId: productId || null },
      );
    }
    submitted.set(productId, (submitted.get(productId) ?? 0) + quantity);
  }

  if (submitted.size === 0) {
    throw new HttpError(400, "VALIDATION_FAILED", "Cart is empty.");
  }

  const cart = await CartModel.findOne({ userId });
  const serverProducts = Array.isArray(cart?.products) ? cart.products : [];

  const server = new Map();
  for (const product of serverProducts) {
    const productId = normalizeId(product?.productId ?? product?.id);
    if (!productId) continue;
    const quantity = Number(product?.quantity ?? 0);
    server.set(productId, (server.get(productId) ?? 0) + quantity);
  }

  if (server.size === 0) {
    throw new HttpError(
      409,
      "CART_MISMATCH",
      "Your cart is empty on the server. Please refresh the cart and try again.",
    );
  }

  const mismatched = new Set();
  for (const [productId, quantity] of submitted) {
    if (server.get(productId) !== quantity) mismatched.add(productId);
  }
  for (const productId of server.keys()) {
    if (!submitted.has(productId)) mismatched.add(productId);
  }

  if (mismatched.size > 0) {
    throw new HttpError(
      409,
      "CART_MISMATCH",
      "Your cart changed since it was last synced. We refreshed it — please review the quantities and try again.",
      {
        productIds: [...mismatched],
        serverCart: serverProducts.map((product) => ({
          productId: normalizeId(product?.productId ?? product?.id),
          quantity: Number(product?.quantity ?? 0),
        })),
      },
    );
  }

  return true;
}

export default { assertCartMatchesServerCart };

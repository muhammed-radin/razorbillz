import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../utils/db.js";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { CartModel } from "../models/schema/cart.js";
import { evt, Evts } from "../utils/events.manage.js";
import { ClassicEvent } from "../shared/models/event.js";
import { toCartProduct } from "../models/schema/product.js";

const router = express.Router();

/* =========================================================
 * Cart helpers
 * ---------------------------------------------------------
 * The cart is a high-priority surface, so it uses direct writes, but
 * only when something actually changed and always in a single update.
 * ========================================================= */

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function positiveInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const integer = Math.floor(number);
  return integer > 0 ? integer : null;
}

function fire(type, payload, { major = true, sector = "cart" } = {}) {
  evt.fire(
    type,
    new ClassicEvent({
      type,
      isMajor: major,
      sector,
      content: payload,
      userId: payload?.userId ?? payload?.cart?.userId ?? null,
      productId: payload?.productId ?? null,
      cartId: payload?.cartId ?? null,
      quantity: payload?.quantity ?? null,
    }),
  );
}

function fireError(error, data = {}) {
  const code = Number(error?.errorCode || error?.code || 500);
  evt.fire(
    Evts.CART_ERROR,
    new ClassicEvent({
      type: Evts.CART_ERROR,
      isMajor: true,
      sector: "cart",
      content: { error: error?.error || error?.message, ...data },
      userId: data.userId || null,
      productId: data.productId || null,
      error: error?.error || error?.message || "Cart error",
      errorCode: code,
      isError: true,
    }),
  );
}

function cartTotal(products = []) {
  return round2(
    products.reduce(
      (total, item) =>
        total + Number(item.price || 0) * Number(item.quantity || 0),
      0,
    ),
  );
}

function toCartItem(product, quantity) {
  const stock = Math.max(0, Math.floor(Number(product.stock) || 0));
  const safeQuantity = Math.min(Math.max(1, quantity), Math.max(1, stock));
  const item = toCartProduct(product, safeQuantity);
  item.quantity = safeQuantity;
  item.productId = item.id;
  item.stock = stock;
  return item;
}

async function fetchProducts(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
  if (uniqueIds.length === 0) return new Map();
  const docs = await db
    .collection("products")
    .find({ id: { $in: uniqueIds } })
    .toArray();
  return new Map(docs.map((doc) => [String(doc.id), doc]));
}

/* Rebuild cart items from authoritative product documents. Missing or
 * inactive products are dropped; quantities never exceed stock. */
function rebuildProducts(cartProducts, productMap) {
  const result = [];
  for (const item of cartProducts) {
    const productId = String(item?.productId ?? item?.id ?? "");
    if (!productId) continue;

    const product = productMap.get(productId);
    if (!product || product.isActive === false) continue;

    const stock = Math.max(0, Math.floor(Number(product.stock) || 0));
    if (stock <= 0) continue;
    const requested = positiveInt(item.quantity) || 1;
    result.push(toCartItem(product, Math.min(requested, stock)));
  }
  return result;
}

/* =========================================================
 * GET /cart — sync prices/stock and return the cart
 * ========================================================= */
router.get("/", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  try {
    let cart = await CartModel.findOne({ userId });

    if (!cart) {
      return res.json({
        id: null,
        userId,
        products: [],
        totalAmount: 0,
        currency: "INR",
      });
    }

    const sourceProducts = Array.isArray(cart.products) ? cart.products : [];
    const productMap = await fetchProducts(
      sourceProducts.map((item) => item?.productId ?? item?.id),
    );
    const products = rebuildProducts(sourceProducts, productMap);
    const totalAmount = cartTotal(products);

    const changed =
      totalAmount !== Number(cart.totalAmount || 0) ||
      JSON.stringify(products) !== JSON.stringify(sourceProducts);

    if (changed) {
      cart = await CartModel.findOneAndUpdate(
        { userId },
        { $set: { products, totalAmount, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
      fire(
        Evts.CART_UPDATED,
        { cart, userId, totalAmount, products },
        { major: false },
      );
    }

    return res.json(cart);
  } catch (error) {
    console.error("[cart] fetch failed:", error);
    fireError(error, { userId });
    return res.status(500).json({ error: "Failed to fetch cart" });
  }
});

/* =========================================================
 * POST /cart — add product (or increment quantity)
 * ========================================================= */
router.post("/", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  const { productId } = req.body ?? {};
  const quantity = positiveInt(req.body?.quantity ?? 1);

  if (!userId || !productId || !quantity) {
    fireError(
      { error: "Missing required fields: productId or quantity", errorCode: 400 },
      { userId, productId },
    );
    return res.status(400).json({
      error: "Missing required fields: productId or quantity",
    });
  }

  try {
    const product = await db.collection("products").findOne({ id: productId });
    if (!product) {
      fireError({ error: "Product not found", errorCode: 404 }, { userId, productId });
      return res.status(404).json({ error: "Product not found" });
    }
    if (product.isActive === false) {
      fireError(
        { error: "Product is not available", errorCode: 409 },
        { userId, productId },
      );
      return res.status(409).json({ error: "Product is not available" });
    }

    const stock = Math.max(0, Math.floor(Number(product.stock) || 0));
    if (stock <= 0) {
      fireError(
        { error: "Product is out of stock", errorCode: 409 },
        { userId, productId },
      );
      return res.status(409).json({ error: "Product is out of stock" });
    }

    const cart = await CartModel.findOne({ userId });
    const products = Array.isArray(cart?.products) ? [...cart.products] : [];
    const index = products.findIndex(
      (item) => String(item?.productId ?? item?.id) === String(productId),
    );

    let addedQuantity = quantity;
    if (index >= 0) {
      const existing = positiveInt(products[index].quantity) || 1;
      const desired = existing + quantity;
      products[index] = toCartItem(product, Math.min(desired, stock));
      addedQuantity = Math.max(
        0,
        Number(products[index].quantity || 0) - existing,
      );
    } else {
      products.push(toCartItem(product, Math.min(quantity, stock)));
      addedQuantity = Math.min(quantity, stock);
    }

    const totalAmount = cartTotal(products);

    const updatedCart = await CartModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          products,
          totalAmount,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          id: randomUUID(),
          userId,
          createdAt: new Date(),
          currency: "INR",
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (addedQuantity > 0) {
      fire(Evts.PRODUCT_CARTED, {
        cart: updatedCart,
        userId,
        productId,
        quantity: addedQuantity,
        cartId: updatedCart?.id,
      });
      fire(Evts.CART_ITEM_ADDED, {
        cart: updatedCart,
        userId,
        productId,
        quantity: addedQuantity,
        cartId: updatedCart?.id,
      });
    }

    return res.json(updatedCart);
  } catch (error) {
    console.error("[cart] add failed:", error);
    fireError(error, { userId, productId });
    return res.status(500).json({ error: "Failed to add product to cart" });
  }
});

/* =========================================================
 * PUT /cart — set an exact quantity
 * ========================================================= */
router.put("/", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  const { productId } = req.body ?? {};
  const quantity = positiveInt(req.body?.quantity);

  if (!userId || !productId || !quantity) {
    fireError(
      { error: "A positive quantity is required", errorCode: 400 },
      { userId, productId },
    );
    return res.status(400).json({ error: "A positive quantity is required" });
  }

  try {
    const cart = await CartModel.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const index = cart.products.findIndex(
      (item) => String(item?.productId ?? item?.id) === String(productId),
    );
    if (index < 0) {
      fireError(
        { error: "Product not found in cart", errorCode: 404 },
        { userId, productId },
      );
      return res.status(404).json({ error: "Product not found in cart" });
    }

    const product = await db.collection("products").findOne({ id: productId });
    if (!product || product.isActive === false) {
      // Remove stale/deactivated items instead of leaving them in the cart.
      cart.products.splice(index, 1);
      cart.totalAmount = cartTotal(cart.products);
      cart.updatedAt = new Date();
      await cart.save();
      fire(Evts.CART_ITEM_REMOVED, {
        cart,
        userId,
        productId,
        cartId: cart.id,
      });
      return res.status(409).json({
        error: "Product is no longer available and was removed from the cart",
      });
    }

    const stock = Math.max(0, Math.floor(Number(product.stock) || 0));
    if (stock <= 0) {
      // Out-of-stock item must not remain in the cart at quantity 1.
      cart.products.splice(index, 1);
      cart.totalAmount = cartTotal(cart.products);
      cart.updatedAt = new Date();
      await cart.save();
      fire(Evts.CART_ITEM_REMOVED, {
        cart,
        userId,
        productId,
        cartId: cart.id,
      });
      return res.status(409).json({
        error: "Product is out of stock and was removed from the cart",
      });
    }

    const safeQuantity = Math.min(quantity, stock);
    cart.products[index] = toCartItem(product, safeQuantity);
    cart.totalAmount = cartTotal(cart.products);
    cart.updatedAt = new Date();
    await cart.save();

    fire(Evts.CART_ITEM_UPDATED, {
      cart,
      userId,
      productId,
      quantity: safeQuantity,
      requestedQuantity: quantity,
      adjusted: safeQuantity !== quantity,
      cartId: cart.id,
    });

    return res.json({
      ...cart.toObject(),
      adjusted: safeQuantity !== quantity,
    });
  } catch (error) {
    console.error("[cart] update failed:", error);
    fireError(error, { userId, productId });
    return res.status(500).json({ error: "Failed to update cart quantity" });
  }
});

/* =========================================================
 * DELETE /cart — remove one product
 * ========================================================= */
router.delete("/", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  const { productId } = req.body ?? {};

  if (!userId || !productId) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  try {
    const cart = await CartModel.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ error: "Cart or product not found" });
    }

    const before = cart.products.length;
    cart.products = cart.products.filter(
      (item) => String(item?.productId ?? item?.id) !== String(productId),
    );

    if (cart.products.length === before) {
      return res.status(404).json({ error: "Cart or product not found" });
    }

    cart.totalAmount = cartTotal(cart.products);
    cart.updatedAt = new Date();
    await cart.save();

    fire(Evts.CART_ITEM_REMOVED, {
      cart,
      userId,
      productId,
      cartId: cart.id,
    });

    return res.json(cart);
  } catch (error) {
    console.error("[cart] remove failed:", error);
    fireError(error, { userId, productId });
    return res.status(500).json({ error: "Failed to remove product from cart" });
  }
});

/* =========================================================
 * DELETE /cart/clear — remove everything
 * ========================================================= */
router.delete("/clear", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  try {
    const cart = await CartModel.findOneAndUpdate(
      { userId },
      {
        $set: { products: [], totalAmount: 0, updatedAt: new Date() },
        $setOnInsert: {
          id: randomUUID(),
          userId,
          createdAt: new Date(),
          currency: "INR",
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    fire(Evts.CART_CLEARED, { cart, userId, cartId: cart?.id });
    return res.json(cart);
  } catch (error) {
    console.error("[cart] clear failed:", error);
    fireError(error, { userId });
    return res.status(500).json({ error: "Failed to clear cart" });
  }
});

export default router;

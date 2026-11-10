import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../utils/db.js";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { WishlistModel } from "../models/schema/whishlist.js";
import { evt, Evts, ErrorEvent } from "../utils/events.manage.js";
import { ClassicEvent } from "../shared/models/event.js";
import { MinimalProduct } from "../models/schema/product.js";

const router = express.Router();

/* =========================================================
 * Helpers
 * ========================================================= */

function productIdOf(item) {
  return String(item?.productId ?? item?.id ?? "").trim();
}

function toWishlistItem(doc) {
  const item = new MinimalProduct(doc);
  item.productId = item.id;
  return item;
}

async function fetchProductsByIds(ids = []) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();

  const docs = await db
    .collection("products")
    .find({ id: { $in: unique } })
    .toArray();

  return new Map(docs.map((doc) => [String(doc.id), doc]));
}

function reportError(error, data = {}) {
  evt.fire(
    Evts.WISHLIST_ERROR,
    new ErrorEvent({
      type: Evts.WISHLIST_ERROR,
      error,
      errorCode: error?.errorCode || error?.code || 500,
      data,
    }),
  );
}

function newWishlistDocument(userId, folder) {
  return {
    id: null,
    userId,
    folder: folder || "/",
    products: [],
    createdAt: null,
    updatedAt: null,
  };
}

/* Refresh price/stock snapshots without touching promotion counters. */
function syncProducts(wishlist, productMap) {
  const synced = [];
  for (const item of wishlist?.products ?? []) {
    const productId = productIdOf(item);
    if (!productId) continue;
    const doc = productMap.get(productId);
    if (!doc || doc.isActive === false) continue;
    synced.push(toWishlistItem(doc));
  }
  return synced;
}

function needsSync(current = [], synced = []) {
  if (current.length !== synced.length) return true;
  return current.some((item, index) => {
    const next = synced[index];
    return (
      productIdOf(item) !== productIdOf(next) ||
      Number(item.price) !== Number(next.price) ||
      Number(item.stock) !== Number(next.stock) ||
      Boolean(item.isActive) !== Boolean(next.isActive)
    );
  });
}

function wishlistEvent(type, { userId, folder, product, productId, wishlist }) {
  evt.fire(
    type,
    new ClassicEvent({
      type,
      isMajor: type === Evts.PRODUCT_WISHLISTED,
      sector: "wishlist",
      content: { userId, folder, product, productId },
      userId,
      actorId: userId,
      productId: productId || productIdOf(product) || null,
      wishlistId: wishlist?.id || wishlist?._id || null,
    }),
  );
}

/* =========================================================
 * GET /wishlists — current folder, price/stock synced
 * ========================================================= */

router.get("/", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  const folder = req.query?.folder || req.body?.folder || "/";

  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  try {
    let wishlist = await WishlistModel.findOne({ userId, folder });

    if (!wishlist) {
      return res.json(newWishlistDocument(userId, folder));
    }

    const productMap = await fetchProductsByIds(
      (wishlist.products ?? []).map(productIdOf),
    );
    const synced = syncProducts(wishlist, productMap);

    if (needsSync(wishlist.products ?? [], synced)) {
      const updated = await WishlistModel.findOneAndUpdate(
        { userId, folder },
        { $set: { products: synced, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
      if (updated) wishlist = updated;

      wishlistEvent(Evts.WISHLIST_UPDATED, {
        userId,
        folder,
        wishlist,
      });
    }

    return res.json(wishlist);
  } catch (error) {
    reportError(error, { userId, folder, route: "GET /wishlists" });
    console.error("Error fetching wishlists:", error);
    return res.status(500).json({ error: "Failed to fetch wishlists" });
  }
});

/* =========================================================
 * POST /wishlists — add one product (idempotent)
 * ========================================================= */

router.post("/", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  const folder = req.body?.folder || req.query?.folder || "/";
  const productId =
    req.body?.product?.productId ||
    req.body?.product?.id ||
    req.body?.productId ||
    null;

  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }
  if (!productId) {
    reportError(
      { error: "Product ID is required.", errorCode: 400 },
      { userId, folder },
    );
    return res.status(400).json({ error: "Product ID is required." });
  }

  try {
    const product = await db.collection("products").findOne({ id: productId });
    if (!product || product.isActive === false) {
      reportError(
        { error: "Product not found or unavailable", errorCode: 404 },
        { userId, folder, productId },
      );
      return res.status(404).json({ error: "Product not found" });
    }

    const wishlist = await WishlistModel.findOne({ userId, folder });
    const existing = wishlist?.products ?? [];
    const alreadyExists = existing.some(
      (item) => productIdOf(item) === String(productId),
    );

    if (alreadyExists) {
      return res.json(wishlist);
    }

    const productSnapshot = toWishlistItem(product);
    const updated = await WishlistModel.findOneAndUpdate(
      { userId, folder },
      {
        $set: { updatedAt: new Date() },
        $push: { products: productSnapshot },
        $setOnInsert: {
          id: randomUUID(),
          userId,
          folder,
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    wishlistEvent(Evts.WISHLIST_ADDED, {
      userId,
      folder,
      product: productSnapshot,
      productId,
      wishlist: updated,
    });
    wishlistEvent(Evts.PRODUCT_WISHLISTED, {
      userId,
      folder,
      product: productSnapshot,
      productId,
      wishlist: updated,
    });

    return res.json(updated);
  } catch (error) {
    reportError(error, { userId, folder, productId, route: "POST /wishlists" });
    console.error("Error creating wishlist:", error);
    return res.status(500).json({ error: "Failed to create wishlist" });
  }
});

/* =========================================================
 * PUT /wishlists — replace all products in a folder
 * ========================================================= */

router.put("/", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  const folder = req.body?.folder || req.query?.folder || "/";
  const products = req.body?.products;

  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }
  if (!Array.isArray(products)) {
    return res.status(400).json({
      error: "Invalid wishlist data. 'products' must be an array.",
    });
  }

  try {
    const ids = products.map(productIdOf).filter(Boolean);
    const productMap = await fetchProductsByIds(ids);
    const synced = ids
      .map((id) => productMap.get(id))
      .filter((doc) => doc && doc.isActive !== false)
      .map(toWishlistItem);

    const current = await WishlistModel.findOne({ userId, folder });
    const currentIds = new Set((current?.products ?? []).map(productIdOf));
    const nextIds = new Set(synced.map(productIdOf));

    const added = synced.filter((item) => !currentIds.has(productIdOf(item)));
    const removed = (current?.products ?? []).filter(
      (item) => !nextIds.has(productIdOf(item)),
    );

    const updated = await WishlistModel.findOneAndUpdate(
      { userId, folder },
      {
        $set: { products: synced, updatedAt: new Date() },
        $setOnInsert: {
          id: randomUUID(),
          userId,
          folder,
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    for (const item of removed) {
      wishlistEvent(Evts.WISHLIST_REMOVED, {
        userId,
        folder,
        product: item,
        productId: productIdOf(item),
        wishlist: updated,
      });
    }

    for (const item of added) {
      wishlistEvent(Evts.PRODUCT_WISHLISTED, {
        userId,
        folder,
        product: item,
        productId: productIdOf(item),
        wishlist: updated,
      });
    }

    wishlistEvent(Evts.WISHLIST_UPDATED, {
      userId,
      folder,
      wishlist: updated,
    });

    return res.json(updated);
  } catch (error) {
    reportError(error, { userId, folder, route: "PUT /wishlists" });
    console.error("Error updating wishlist:", error);
    return res.status(500).json({ error: "Failed to update wishlist" });
  }
});

/* =========================================================
 * DELETE /wishlists — remove one product (idempotent)
 * ========================================================= */

router.delete("/", requireAuth, passUserAuth, async (req, res) => {
  const userId = req.user?.id;
  const folder = req.body?.folder || req.query?.folder || "/";
  const productId = req.body?.productId || req.body?.product?.id || null;

  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }
  if (!productId) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  try {
    const wishlist = await WishlistModel.findOne({ userId, folder });
    if (!wishlist) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    const existed = (wishlist.products ?? []).some(
      (item) => productIdOf(item) === String(productId),
    );

    if (!existed) {
      // Idempotent remove: the desired end state is already true.
      return res.json(wishlist);
    }

    const updated = await WishlistModel.findOneAndUpdate(
      { userId, folder },
      {
        $pull: {
          products: {
            $or: [{ productId: productId }, { id: productId }],
          },
        },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    );

    wishlistEvent(Evts.WISHLIST_REMOVED, {
      userId,
      folder,
      productId,
      wishlist: updated,
    });

    return res.json(updated);
  } catch (error) {
    reportError(error, {
      userId,
      folder,
      productId,
      route: "DELETE /wishlists",
    });
    console.error("Error deleting wishlist:", error);
    return res.status(500).json({ error: "Failed to delete wishlist" });
  }
});

export default router;

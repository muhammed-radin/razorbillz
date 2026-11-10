import { InteractionModel } from "../models/schema/interactions.js";
import { db, checkCurrentConnection } from "./db.js";
import { evt, Evts } from "./events.manage.js";
import {
  getAgenda,
  useAgenda,
} from "./agenda.js";
import {
  productMemoryCache,
} from "./cache-utils/product-data.js";
import { productFeedCache } from "./cache-utils/product-feed.js";
import { productStatusCache } from "./cache-utils/product-status.js";

/* =========================================================
 * Buffered product interactions
 * ---------------------------------------------------------
 * Views, shares, wishlists, cart adds and ratings are aggregated in
 * memory and flushed to `products.metrics` / `interactions` in batches.
 * This avoids one DB write per click (critical on free tiers).
 * ========================================================= */

const FLUSH_BUFFER_SIZE = 50;
const MAX_PENDING_OPS = 5000;

const productInteractionBuffer = [];
const viewBuffer = {}; // productId -> raw views
const userViewBuffer = {}; // productId -> { userId: true }
const guestViewBuffer = {}; // productId -> { userId/sessionId: true }
const cartBuffer = {}; // productId -> quantity increments
const shareBuffer = {}; // productId -> count
const wishlistBuffer = {}; // productId -> count (can be negative)
const ratingStatsBuffer = {}; // productId -> { stars:{n1..n5}, reviewCount }

function incObject(buffer, productId, amount = 1) {
  if (!productId) return;
  buffer[productId] = (buffer[productId] || 0) + amount;
}

function consumeObject(buffer) {
  const snapshot = { ...buffer };
  for (const key of Object.keys(buffer)) delete buffer[key];
  return snapshot;
}

function restoreObject(buffer, snapshot) {
  for (const [key, value] of Object.entries(snapshot || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      buffer[key] = { ...(buffer[key] || {}), ...value };
    } else {
      buffer[key] = (buffer[key] || 0) + Number(value || 0);
    }
  }
}

function consumeOps() {
  const snapshot = productInteractionBuffer.splice(
    0,
    productInteractionBuffer.length,
  );
  return snapshot;
}

export function mergeInteractionOperation(operation) {
  if (!operation) return;

  // Collapse repeat operations for the same product/user into one pending
  // update. Pushing duplicates made searchInteraction() read the oldest
  // snapshot, so rating changes and idempotency checks saw stale state.
  const filter = operation?.updateOne?.filter;
  const existing = productInteractionBuffer.find(
    (pending) =>
      pending?.updateOne?.filter?.productId === filter?.productId &&
      pending?.updateOne?.filter?.userId === filter?.userId,
  );

  if (existing) {
    const target = existing.updateOne.update ?? {};
    const incoming = operation.updateOne.update ?? {};
    target.$set = { ...(target.$set || {}), ...(incoming.$set || {}) };
    target.$setOnInsert = {
      ...(incoming.$setOnInsert || {}),
      ...(target.$setOnInsert || {}),
    };
    existing.updateOne.update = target;
    return;
  }

  productInteractionBuffer.push(operation);

  if (productInteractionBuffer.length > MAX_PENDING_OPS) {
    productInteractionBuffer.splice(
      0,
      productInteractionBuffer.length - MAX_PENDING_OPS,
    );
    console.warn("[interactions] operation buffer overflow; oldest dropped");
  }

  if (productInteractionBuffer.length >= FLUSH_BUFFER_SIZE) {
    requestInteractionFlush();
  }
}

export function recordView({ productId, userId, isGuest = false }) {
  if (!productId) return;
  incObject(viewBuffer, productId, 1);

  const key = userId || "anonymous";
  const target = isGuest ? guestViewBuffer : userViewBuffer;
  target[productId] = target[productId] || {};
  target[productId][key] = true;
}

export function recordShare(productId) {
  incObject(shareBuffer, productId, 1);
}

export function recordCart(productId, quantity = 1) {
  const amount = Number(quantity) || 0;
  if (amount > 0) incObject(cartBuffer, productId, amount);
}

export function recordWishlist(productId, amount = 1) {
  incObject(wishlistBuffer, productId, amount);
}

export function recordRating(productId, previousRating, nextRating) {
  if (!productId) return;

  const previous = Number(previousRating);
  const next = Number(nextRating);
  const hasPrevious = Number.isFinite(previous) && previous >= 1 && previous <= 5;
  const hasNext = Number.isFinite(next) && next >= 1 && next <= 5;

  if (!hasPrevious && !hasNext) return;

  const stats = ratingStatsBuffer[productId] || {
    stars: { n1: 0, n2: 0, n3: 0, n4: 0, n5: 0 },
    reviewCount: 0,
  };

  if (hasPrevious) stats.stars[`n${previous}`] -= 1;
  if (hasNext) stats.stars[`n${next}`] += 1;

  if (!hasPrevious && hasNext) stats.reviewCount += 1;
  if (hasPrevious && !hasNext) stats.reviewCount -= 1;

  ratingStatsBuffer[productId] = stats;

  if (Object.keys(ratingStatsBuffer).length >= FLUSH_BUFFER_SIZE) {
    requestInteractionFlush();
  }
}

export async function searchInteraction(productId, userId) {
  if (!productId || !userId) return null;

  // Fold every pending operation for this product/user, newest overrides
  // oldest, so callers see the latest buffered state instead of the first.
  let merged = null;
  for (const operation of productInteractionBuffer) {
    if (
      operation?.updateOne?.filter?.productId !== productId ||
      operation?.updateOne?.filter?.userId !== userId
    ) {
      continue;
    }

    merged = {
      ...(merged || {}),
      ...(operation.updateOne?.update?.$setOnInsert || {}),
      ...(operation.updateOne?.update?.$set || {}),
    };
  }

  if (merged && Object.keys(merged).length > 0) {
    return {
      productId,
      userId,
      hasViewed: false,
      hasShared: false,
      hasWishlisted: false,
      rating: null,
      ...merged,
    };
  }

  return InteractionModel.findOne({ productId, userId }).lean();
}

/* =========================================================
 * Flush primitives
 * ========================================================= */

async function flushOps(ops) {
  if (ops.length === 0) return 0;
  await InteractionModel.bulkWrite(ops, { ordered: false });
  return ops.length;
}

async function flushIncrement(collection, property, snapshot, label) {
  const entries = Object.entries(snapshot).filter(([, amount]) => amount !== 0);
  if (entries.length === 0) return 0;

  const ops = entries.map(([productId, amount]) => ({
    updateOne: {
      filter: { id: productId },
      update: { $inc: { [property]: amount } },
      upsert: false,
    },
  }));

  try {
    await db.collection(collection).bulkWrite(ops, { ordered: false });
    return ops.length;
  } catch (error) {
    console.error(`[interactions] ${label} flush failed:`, error?.message);
    throw error;
  }
}

async function flushUniqueViews(userSnapshot, guestSnapshot) {
  const productIds = new Set([
    ...Object.keys(userSnapshot),
    ...Object.keys(guestSnapshot),
  ]);
  if (productIds.size === 0) return 0;

  const ops = [];
  for (const productId of productIds) {
    const users = Object.keys(userSnapshot[productId] || {}).length;
    const guests = Object.keys(guestSnapshot[productId] || {}).length;
    const unique = users + guests;
    if (unique === 0) continue;

    ops.push({
      updateOne: {
        filter: { id: productId },
        update: {
          $inc: {
            "metrics.debouncedViews": unique,
            "metrics.authenticatedViews": users,
            "metrics.guestViews": guests,
          },
        },
        upsert: false,
      },
    });
  }

  if (ops.length === 0) return 0;

  try {
    await db.collection("products").bulkWrite(ops, { ordered: false });
    return ops.length;
  } catch (error) {
    console.error("[interactions] unique views flush failed:", error?.message);
    throw error;
  }
}

async function flushRatings(snapshot) {
  const productIds = Object.keys(snapshot);
  if (productIds.length === 0) return 0;

  const ops = [];

  for (const productId of productIds) {
    const stats = snapshot[productId];
    const stars = stats?.stars || {};
    const deltas = {
      n1: Number(stars.n1 || 0),
      n2: Number(stars.n2 || 0),
      n3: Number(stars.n3 || 0),
      n4: Number(stars.n4 || 0),
      n5: Number(stars.n5 || 0),
    };
    const reviewDelta = Number(stats?.reviewCount || 0);

    if (
      reviewDelta === 0 &&
      Object.values(deltas).every((value) => value === 0)
    ) {
      continue;
    }

    ops.push({
      updateOne: {
        filter: { id: productId },
        update: [
          {
            $set: {
              "metrics.stars.n1": {
                $max: [0, { $add: [{ $ifNull: ["$metrics.stars.n1", 0] }, deltas.n1] }],
              },
              "metrics.stars.n2": {
                $max: [0, { $add: [{ $ifNull: ["$metrics.stars.n2", 0] }, deltas.n2] }],
              },
              "metrics.stars.n3": {
                $max: [0, { $add: [{ $ifNull: ["$metrics.stars.n3", 0] }, deltas.n3] }],
              },
              "metrics.stars.n4": {
                $max: [0, { $add: [{ $ifNull: ["$metrics.stars.n4", 0] }, deltas.n4] }],
              },
              "metrics.stars.n5": {
                $max: [0, { $add: [{ $ifNull: ["$metrics.stars.n5", 0] }, deltas.n5] }],
              },
              "metrics.reviewCount": {
                $max: [
                  0,
                  {
                    $add: [
                      { $ifNull: ["$metrics.reviewCount", 0] },
                      reviewDelta,
                    ],
                  },
                ],
              },
            },
          },
          {
            $set: {
              "metrics.rating": {
                $cond: [
                  { $gt: ["$metrics.reviewCount", 0] },
                  {
                    $divide: [
                      {
                        $add: [
                          { $multiply: [5, "$metrics.stars.n5"] },
                          { $multiply: [4, "$metrics.stars.n4"] },
                          { $multiply: [3, "$metrics.stars.n3"] },
                          { $multiply: [2, "$metrics.stars.n2"] },
                          { $multiply: [1, "$metrics.stars.n1"] },
                        ],
                      },
                      "$metrics.reviewCount",
                    ],
                  },
                  0,
                ],
              },
            },
          },
        ],
        upsert: false,
      },
    });
  }

  if (ops.length === 0) return 0;

  try {
    await db.collection("products").bulkWrite(ops, { ordered: false });
    return ops.length;
  } catch (error) {
    console.error("[interactions] ratings flush failed:", error?.message);
    throw error;
  }
}

function invalidateProductCaches() {
  try {
    productMemoryCache?.clearByPrefix("");
    productFeedCache?.expire();
    productStatusCache?.update().catch(() => {});
  } catch (error) {
    console.error("[interactions] cache invalidation failed:", error?.message);
  }
}

export async function flushInteractionBuffers() {
  if (!checkCurrentConnection()) {
    return { skipped: true, reason: "database-not-ready" };
  }

  const result = {
    ops: 0,
    views: 0,
    uniqueViews: 0,
    shares: 0,
    carts: 0,
    wishlists: 0,
    ratings: 0,
    errors: [],
  };

  const runStep = async (label, snapshot, restore, work) => {
    try {
      return await work(snapshot);
    } catch (error) {
      restore(snapshot);
      result.errors.push(`${label}: ${error?.message || error}`);
      return 0;
    }
  };

  result.ops = await runStep(
    "interactions",
    consumeOps(),
    (snapshot) => productInteractionBuffer.unshift(...snapshot),
    flushOps,
  );

  result.views = await runStep(
    "views",
    consumeObject(viewBuffer),
    (snapshot) => restoreObject(viewBuffer, snapshot),
    (snapshot) =>
      flushIncrement("products", "metrics.allViews", snapshot, "views"),
  );

  const userSnapshot = consumeObject(userViewBuffer);
  const guestSnapshot = consumeObject(guestViewBuffer);
  result.uniqueViews = await runStep(
    "uniqueViews",
    { userSnapshot, guestSnapshot },
    ({ userSnapshot: users, guestSnapshot: guests }) => {
      restoreObject(userViewBuffer, users);
      restoreObject(guestViewBuffer, guests);
    },
    ({ userSnapshot: users, guestSnapshot: guests }) =>
      flushUniqueViews(users, guests),
  );

  result.shares = await runStep(
    "shares",
    consumeObject(shareBuffer),
    (snapshot) => restoreObject(shareBuffer, snapshot),
    (snapshot) =>
      flushIncrement("products", "metrics.shareCount", snapshot, "shares"),
  );

  result.carts = await runStep(
    "cart",
    consumeObject(cartBuffer),
    (snapshot) => restoreObject(cartBuffer, snapshot),
    (snapshot) =>
      flushIncrement("products", "metrics.cartCount", snapshot, "cart"),
  );

  result.wishlists = await runStep(
    "wishlist",
    consumeObject(wishlistBuffer),
    (snapshot) => restoreObject(wishlistBuffer, snapshot),
    (snapshot) =>
      flushIncrement(
        "products",
        "metrics.wishlistCount",
        snapshot,
        "wishlist",
      ),
  );

  result.ratings = await runStep(
    "ratings",
    consumeObject(ratingStatsBuffer),
    (snapshot) => restoreObject(ratingStatsBuffer, snapshot),
    flushRatings,
  );

  const wroteSomething =
    result.ops ||
    result.views ||
    result.uniqueViews ||
    result.shares ||
    result.carts ||
    result.wishlists ||
    result.ratings;

  if (wroteSomething) invalidateProductCaches();

  return result;
}

/* Ratings are user-visible immediately (stars + review count), so the
 * route awaits this instead of waiting for the periodic agenda flush. */
let ratingFlushPromise = null;

export function flushRatingBuffer() {
  if (!checkCurrentConnection()) {
    return Promise.resolve({ skipped: true, count: 0 });
  }
  if (ratingFlushPromise) return ratingFlushPromise;

  const snapshot = consumeObject(ratingStatsBuffer);
  if (Object.keys(snapshot).length === 0) {
    return Promise.resolve({ count: 0 });
  }

  ratingFlushPromise = flushRatings(snapshot)
    .then((count) => {
      if (count) invalidateProductCaches();
      return { count };
    })
    .catch((error) => {
      restoreObject(ratingStatsBuffer, snapshot);
      console.error("[interactions] rating flush failed:", error?.message);
      return { count: 0, error: true };
    })
    .finally(() => {
      ratingFlushPromise = null;
    });

  return ratingFlushPromise;
}

export function requestInteractionFlush({ immediate = false } = {}) {
  if (immediate) {
    return flushInteractionBuffers().catch((error) => {
      console.error("[interactions] immediate flush failed:", error?.message);
      return null;
    });
  }

  return getAgenda()
    .then(({ agenda }) => {
      if (agenda?._processInterval) {
        return useAgenda().now("interactions:flush");
      }
      return flushInteractionBuffers();
    })
    .catch((error) => {
      console.error("[interactions] flush request failed:", error?.message);
      return null;
    });
}

/* =========================================================
 * Event listeners
 * ---------------------------------------------------------
 * Product metrics are derived from events, so any module that fires
 * PRODUCT_VIEWED / PRODUCT_SHARED / PRODUCT_RATED updates the same
 * counters without calling the buffered helpers directly.
 * ========================================================= */

evt.on(Evts.PRODUCT_VIEWED, (event) => {
  const productId = event?.productId;
  if (!productId) return;
  recordView({
    productId,
    userId: event?.userId || null,
    isGuest: Boolean(event?.isGuest),
  });
});

evt.on(Evts.PRODUCT_SHARED, (event) => {
  const productId = event?.productId;
  if (!productId) return;
  recordShare(productId);
});

evt.on(Evts.PRODUCT_RATED, (event) => {
  const productId = event?.productId;
  const rating = Number(
    event?.response?.rating ?? event?.content?.rating ?? event?.rating ?? 0,
  );
  if (!productId || rating < 1 || rating > 5) return;
  // A PRODUCT_RATED event represents a brand-new rating.
  recordRating(productId, null, rating);
});

evt.on(Evts.PRODUCT_RATING_UPDATED, (event) => {
  const productId = event?.productId;
  const previousRating = Number(
    event?.response?.previousRating ?? event?.previousRating ?? 0,
  );
  const rating = Number(
    event?.response?.rating ?? event?.content?.rating ?? event?.rating ?? 0,
  );
  if (!productId || rating < 1 || rating > 5) return;
  recordRating(productId, previousRating || null, rating);
});

evt.on(Evts.PRODUCT_UNRATED, (event) => {
  const productId = event?.productId;
  const previousRating = Number(
    event?.response?.previousRating ?? event?.previousRating ?? 0,
  );
  if (!productId) return;
  recordRating(productId, previousRating || null, null);
});

evt.on(Evts.PRODUCT_WISHLISTED, async (event) => {
  const productId = event?.productId;
  const userId = event?.userId;
  if (!productId || !userId) return;

  const previous = await searchInteraction(productId, userId);
  if (previous?.hasWishlisted === true) return;

  recordWishlist(productId, 1);
  mergeInteractionOperation({
    updateOne: {
      filter: { productId, userId },
      update: {
        $setOnInsert: {
          id: `${productId}_${userId}`,
          productId,
          userId,
          createdAt: new Date(),
        },
        $set: {
          updatedAt: new Date(),
          hasWishlisted: true,
          folder: event?.folder || event?.content?.folder || "/",
          hasViewed: true,
        },
      },
      upsert: true,
    },
  });

  evt.fire(Evts.INTERACTION_RECORDED, {
    productId,
    userId,
    interactionType: "wishlist",
    property: "metrics.wishlistCount",
    timestamp: new Date(),
  });
});

evt.on(Evts.WISHLIST_REMOVED, async (event) => {
  const productId = event?.productId;
  const userId = event?.userId;
  if (!productId || !userId) return;

  const previous = await searchInteraction(productId, userId);
  if (previous?.hasWishlisted !== true) return;

  recordWishlist(productId, -1);
  mergeInteractionOperation({
    updateOne: {
      filter: { productId, userId },
      update: {
        $set: {
          updatedAt: new Date(),
          hasWishlisted: false,
          folder: event?.folder || event?.content?.folder || "/",
        },
      },
      upsert: false,
    },
  });

  evt.fire(Evts.INTERACTION_RECORDED, {
    productId,
    userId,
    interactionType: "wishlist",
    property: "metrics.wishlistCount",
    timestamp: new Date(),
  });
});

evt.on(Evts.CART_ITEM_ADDED, (event) => {
  const productId = event?.productId;
  const quantity = Number(event?.quantity || 0);
  if (!productId || quantity <= 0) return;

  recordCart(productId, quantity);

  evt.fire(Evts.INTERACTION_RECORDED, {
    productId,
    userId: event?.cart?.userId || event?.userId || null,
    interactionType: "cart",
    property: "metrics.cartCount",
    timestamp: new Date(),
  });
});

evt.on(Evts.INTERACTION_RECORDED, () => {
  if (productInteractionBuffer.length >= FLUSH_BUFFER_SIZE) {
    requestInteractionFlush();
  }
});

evt.on(Evts.FLUSH_REQUESTED, (enableQueue = true) => {
  if (enableQueue) {
    requestInteractionFlush();
  } else {
    requestInteractionFlush({ immediate: true });
  }
});

export async function defineInteractionJobs(agenda) {
  agenda.define("interactions:flush", async () => {
    return flushInteractionBuffers();
  });

  // Kept for backwards compatibility with dashboards/tests.
  agenda.define("flush-interactions", async () => {
    return flushInteractionBuffers();
  });

  agenda.define("flush-and-calculate-product-rating", async () => {
    const ratings = consumeObject(ratingStatsBuffer);
    try {
      return await flushRatings(ratings);
    } catch (error) {
      restoreObject(ratingStatsBuffer, ratings);
      throw error;
    }
  });

  agenda.define("flush-buffer", async (job) => {
    const { buffer, property, bufferName, collection } = job.attrs.data || {};
    if (!buffer || !property) {
      throw new Error("flush-buffer requires buffer and property");
    }
    return flushIncrement(
      collection || "products",
      property,
      consumeObject(buffer),
      bufferName || "buffer",
    );
  });
}

export async function scheduleInteractionJobs(agenda) {
  await agenda.every("5 minutes", "interactions:flush");
}

export function getInteractionDebugState() {
  return {
    pendingOps: productInteractionBuffer.length,
    views: { ...viewBuffer },
    uniqueUserViews: Object.keys(userViewBuffer).length,
    uniqueGuestViews: Object.keys(guestViewBuffer).length,
    shares: { ...shareBuffer },
    carts: { ...cartBuffer },
    wishlists: { ...wishlistBuffer },
    ratings: { ...ratingStatsBuffer },
  };
}

export const interactionInternals = {
  productInteractionBuffer,
  viewBuffer,
  userViewBuffer,
  guestViewBuffer,
  cartBuffer,
  shareBuffer,
  wishlistBuffer,
  ratingStatsBuffer,
};

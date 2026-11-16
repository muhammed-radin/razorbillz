import {
  dbEventNames,
  dbEvents,
  evt,
  Evts,
} from "./events.manage.js";
import { productMemoryCache } from "./cache-utils/product-data.js";
import { productFeedCache } from "./cache-utils/product-feed.js";
import { productStatusCache } from "./cache-utils/product-status.js";
import { globalMemory } from "./cache-utils/global-cache.js";

/* =========================================================
 * Event-driven cache invalidation
 * ---------------------------------------------------------
 * Every cache is deleted on the event that makes it stale. It is
 * never repopulated here: the next request rebuilds it from the
 * database, so the response can never be older than the write that
 * triggered the deletion.
 *
 * Cache keys are namespaced by domain so one event can drop exactly
 * the affected snapshots without touching unrelated data:
 *
 *   products:list:<url>      product listing / search pages
 *   products:similar:<url>   similar-product lookups
 *   categories:list          category list
 *   users:list:<url>         admin user listing
 *   orders:list:<url>        admin order listing
 *   comments:<id>:<user>:... per-product comment pages
 * ========================================================= */

export const CACHE_PREFIX = {
  products: "products:",
  productList: "products:list:",
  productSimilar: "products:similar:",
  categories: "categories:",
  categoryList: "categories:list",
  users: "users:",
  userList: "users:list:",
  orders: "orders:",
  orderList: "orders:list:",
  comments: "comments:",
};

export const CATEGORY_CACHE_KEY = CACHE_PREFIX.categoryList;

export function productListCacheKey(reqUrl) {
  return `${CACHE_PREFIX.productList}${String(reqUrl ?? "")}`;
}

export function productSimilarCacheKey(reqUrl) {
  return `${CACHE_PREFIX.productSimilar}${String(reqUrl ?? "")}`;
}

export function userListCacheKey(reqUrl) {
  return `${CACHE_PREFIX.userList}${String(reqUrl ?? "")}`;
}

export function orderListCacheKey(reqUrl) {
  return `${CACHE_PREFIX.orderList}${String(reqUrl ?? "")}`;
}

export function commentListCacheKey(productId, userId, reqUrl) {
  return `${CACHE_PREFIX.comments}${String(productId ?? "")}:${
    userId ?? "guest"
  }:${String(reqUrl ?? "")}`;
}

/** Delete every product read cache. The next request rebuilds it. */
export function invalidateProductCaches() {
  productMemoryCache.clearByPrefix(CACHE_PREFIX.products);
  void productFeedCache.expire();
  void productStatusCache.expire();
}

/** Delete the category list cache. */
export function invalidateCategoryCaches() {
  globalMemory.clearByPrefix(CACHE_PREFIX.categoryList);
}

/** Delete cached comment pages for one product (or all of them). */
export function invalidateCommentCaches(productId) {
  const prefix = productId
    ? `${CACHE_PREFIX.comments}${String(productId)}:`
    : CACHE_PREFIX.comments;
  globalMemory.clearByPrefix(prefix);
  // Comment counts / ratings are embedded in product listings and feeds.
  invalidateProductCaches();
}

/** Delete cached admin user listings. */
export function invalidateUserListCaches() {
  globalMemory.clearByPrefix(CACHE_PREFIX.userList);
}

/**
 * A profile change affects the admin listing and the author snapshots
 * stored inside cached comment pages.
 */
export function invalidateUserCaches() {
  invalidateUserListCaches();
  globalMemory.clearByPrefix(CACHE_PREFIX.comments);
}

/** Delete cached admin order listings plus derived account totals. */
export function invalidateOrderCaches() {
  globalMemory.clearByPrefix(CACHE_PREFIX.orderList);
  invalidateUserListCaches();
  // Orders reserve/release stock, so listings and feeds are stale too.
  invalidateProductCaches();
}

/* ---------------------------------------------------------
 * Global event map
 * ------------------------------------------------------- */

const PRODUCT_MUTATION_EVENTS = new Set([
  Evts.PRODUCT_CREATED,
  Evts.PRODUCT_UPDATED,
  Evts.PRODUCT_DELETED,
  Evts.PRODUCT_STOCK_UPDATED,
  Evts.PRODUCT_PRICE_UPDATED,
  Evts.PRODUCT_IMAGE_UPDATED,
  Evts.PRODUCT_DESCRIPTION_UPDATED,
  Evts.PRODUCT_CATEGORY_UPDATED,
  Evts.PRODUCT_TAGS_UPDATED,
  Evts.PRODUCT_DISCOUNT_UPDATED,
  Evts.PRODUCT_LOW_STOCK,
  Evts.PRODUCT_OUT_OF_STOCK,
  Evts.PRODUCT_RATED,
  Evts.PRODUCT_RATING_UPDATED,
  Evts.PRODUCT_UNRATED,
]);

const COMMENT_MUTATION_EVENTS = new Set([
  Evts.PRODUCT_COMMENTED,
  Evts.PRODUCT_COMMENT_UPDATED,
  Evts.PRODUCT_COMMENT_DELETED,
  Evts.PRODUCT_COMMENT_LIKED,
]);

const USER_MUTATION_EVENTS = new Set([
  /* Login/logout only touch buffered stats (lastLogin/currentlyLoggedIn);
   * user-stats drops the list cache when it flushes them, which is the
   * moment the stored values actually change. Invalidating earlier would
   * rebuild the cache from the pre-flush row and keep that stale snapshot
   * for another hour, so these events are deliberately not listed. */
  Evts.USER_REGISTERED,
  Evts.USER_PROFILE_UPDATED,
  Evts.USER_DELETED,
]);

const ORDER_MUTATION_EVENTS = new Set([
  Evts.ORDER_PLACED,
  Evts.ORDER_PAID,
  Evts.ORDER_REFUNDED,
  Evts.ORDER_UPDATED,
  Evts.ORDER_CANCELLED,
  Evts.ORDER_COMPLETED,
  Evts.ORDER_RETURN_REQUESTED,
  Evts.ORDER_STATUS_CHANGED,
  Evts.ORDER_CREATE_FAILED,
  Evts.PAYMENT_SUCCEEDED,
  Evts.PAYMENT_FAILED,
  Evts.PAYMENT_CANCELLED,
  Evts.COD_COLLECTED,
  Evts.COD_COLLECTION_FAILED,
  Evts.SHIPMENT_CREATED,
  Evts.SHIPMENT_CREATE_FAILED,
  Evts.SHIPMENT_CANCELLED,
  Evts.SHIPMENT_DELIVERED,
  Evts.SHIPMENT_RTO,
  Evts.SHIPMENT_TRACK_SYNCED,
]);

function payloadOf(data) {
  return Array.isArray(data) ? data[0] : data;
}

/**
 * One global listener instead of dozens of per-event handlers. The
 * cache manager stays authoritative: any module that fires an event
 * gets the matching caches dropped without knowing they exist.
 */
evt.onListen(({ event, data } = {}) => {
  const payload = payloadOf(data);

  if (PRODUCT_MUTATION_EVENTS.has(event)) {
    invalidateProductCaches();
    return;
  }

  if (COMMENT_MUTATION_EVENTS.has(event)) {
    invalidateCommentCaches(payload?.comment?.productId);
    return;
  }

  if (USER_MUTATION_EVENTS.has(event)) {
    invalidateUserCaches();
    return;
  }

  if (ORDER_MUTATION_EVENTS.has(event)) {
    invalidateOrderCaches();
  }
});

/* Category write routes emit database document events instead of
 * product/user events. Keep category deletion attached to those. */
const DOCUMENT_WRITE_EVENTS = [
  dbEventNames.DOCUMENT_CREATED,
  dbEventNames.DOCUMENT_UPDATED,
  dbEventNames.DOCUMENT_DELETED,
];

for (const name of DOCUMENT_WRITE_EVENTS) {
  dbEvents.on(name, (event) => {
    if (event?.collection === "categories") {
      invalidateCategoryCaches();
    }
  });
}

export default {
  CACHE_PREFIX,
  CATEGORY_CACHE_KEY,
  productListCacheKey,
  productSimilarCacheKey,
  userListCacheKey,
  orderListCacheKey,
  commentListCacheKey,
  invalidateProductCaches,
  invalidateCategoryCaches,
  invalidateCommentCaches,
  invalidateUserListCaches,
  invalidateUserCaches,
  invalidateOrderCaches,
};

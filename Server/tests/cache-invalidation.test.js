import test from "node:test";
import assert from "node:assert/strict";

import {
  CACHE_PREFIX,
  CATEGORY_CACHE_KEY,
  commentListCacheKey,
  invalidateCommentCaches,
  orderListCacheKey,
  productListCacheKey,
  productSimilarCacheKey,
  userListCacheKey,
} from "../utils/cacheInvalidation.js";
import {
  DatabaseDocumentEvent,
  dbEventNames,
  dbEvents,
  evt,
  Evts,
} from "../utils/events.manage.js";
import { productMemoryCache } from "../utils/cache-utils/product-data.js";
import { productFeedCache } from "../utils/cache-utils/product-feed.js";
import { productStatusCache } from "../utils/cache-utils/product-status.js";
import { globalMemory } from "../utils/cache-utils/global-cache.js";

function resetCaches() {
  productMemoryCache.clearByPrefix("");
  productFeedCache.expire();
  productStatusCache.expire();
  globalMemory.clearByPrefix("");
}

test.beforeEach(resetCaches);

test("memory clearByPrefix only removes matching namespaces", () => {
  globalMemory.setLocalMemory("users:list:/?page=1", { users: [1] }, 60);
  globalMemory.setLocalMemory("orders:list:/list?page=1", { orders: [1] }, 60);

  globalMemory.clearByPrefix("users:list:");

  assert.equal(globalMemory.getLocalMemory("users:list:/?page=1"), null);
  assert.deepEqual(
    globalMemory.getLocalMemory("orders:list:/list?page=1"),
    { orders: [1] },
  );
});

test("cache keys are namespaced by domain", () => {
  assert.equal(productListCacheKey("/?page=1"), "products:list:/?page=1");
  assert.equal(
    productSimilarCacheKey("/similar/p1?limit=8"),
    "products:similar:/similar/p1?limit=8",
  );
  assert.equal(userListCacheKey("/?page=1"), "users:list:/?page=1");
  assert.equal(orderListCacheKey("/list?page=1"), "orders:list:/list?page=1");
  assert.equal(
    commentListCacheKey("p1", "u1", "/p1?page=1"),
    "comments:p1:u1:/p1?page=1",
  );
  assert.equal(CATEGORY_CACHE_KEY, "categories:list");
});

test("product events drop product snapshots, feed and status only", () => {
  const listKey = productListCacheKey("/?page=1");
  productMemoryCache.setLocalMemory(listKey, { products: [] }, 60);
  productFeedCache.set({ latest: [] });
  productStatusCache.set({ total: 3 });
  globalMemory.setLocalMemory(CATEGORY_CACHE_KEY, [{ id: "c1" }], 60);

  evt.fire(Evts.PRODUCT_UPDATED, {});

  assert.equal(productMemoryCache.getLocalMemory(listKey), null);
  assert.equal(productFeedCache.get(), null);
  assert.equal(productStatusCache.get(), null);
  assert.deepEqual(globalMemory.getLocalMemory(CATEGORY_CACHE_KEY), [{ id: "c1" }]);
});

test("comment events drop that product's comment pages and product caches", () => {
  const p1Comments = commentListCacheKey("p1", "guest", "/p1?page=1");
  const p2Comments = commentListCacheKey("p2", "guest", "/p2?page=1");
  globalMemory.setLocalMemory(p1Comments, { comments: [1] }, 60);
  globalMemory.setLocalMemory(p2Comments, { comments: [2] }, 60);
  productFeedCache.set({ latest: [] });

  evt.fire(Evts.PRODUCT_COMMENTED, { comment: { productId: "p1" } });

  assert.equal(globalMemory.getLocalMemory(p1Comments), null);
  assert.deepEqual(globalMemory.getLocalMemory(p2Comments), { comments: [2] });
  assert.equal(productFeedCache.get(), null);
});

test("invalidateCommentCaches without an id drops all comment pages", () => {
  globalMemory.setLocalMemory(
    commentListCacheKey("p1", "guest", "/p1?page=1"),
    { comments: [1] },
    60,
  );
  globalMemory.setLocalMemory(
    commentListCacheKey("p2", "guest", "/p2?page=1"),
    { comments: [2] },
    60,
  );

  invalidateCommentCaches(null);

  assert.equal(
    globalMemory.getLocalMemory(commentListCacheKey("p1", "guest", "/p1?page=1")),
    null,
  );
  assert.equal(
    globalMemory.getLocalMemory(commentListCacheKey("p2", "guest", "/p2?page=1")),
    null,
  );
});

test("order events drop order lists, user lists and product caches", () => {
  globalMemory.setLocalMemory(userListCacheKey("/?page=1"), { users: [1] }, 60);
  globalMemory.setLocalMemory(
    orderListCacheKey("/list?page=1"),
    { orders: [1] },
    60,
  );
  globalMemory.setLocalMemory(
    commentListCacheKey("p1", "guest", "/p1?page=1"),
    { comments: [1] },
    60,
  );
  productStatusCache.set({ total: 1 });

  evt.fire(Evts.ORDER_STATUS_CHANGED, {});

  assert.equal(globalMemory.getLocalMemory(userListCacheKey("/?page=1")), null);
  assert.equal(
    globalMemory.getLocalMemory(orderListCacheKey("/list?page=1")),
    null,
  );
  assert.deepEqual(
    globalMemory.getLocalMemory(commentListCacheKey("p1", "guest", "/p1?page=1")),
    { comments: [1] },
  );
  assert.equal(productStatusCache.get(), null);
});

test("user profile events drop user and comment caches", () => {
  globalMemory.setLocalMemory(userListCacheKey("/?page=1"), { users: [1] }, 60);
  globalMemory.setLocalMemory(
    commentListCacheKey("p1", "guest", "/p1?page=1"),
    { comments: [1] },
    60,
  );

  evt.fire(Evts.USER_PROFILE_UPDATED, {});

  assert.equal(globalMemory.getLocalMemory(userListCacheKey("/?page=1")), null);
  assert.equal(
    globalMemory.getLocalMemory(commentListCacheKey("p1", "guest", "/p1?page=1")),
    null,
  );
});

test("category document events drop only the category list", () => {
  globalMemory.setLocalMemory(CATEGORY_CACHE_KEY, [{ id: "c1" }], 60);
  globalMemory.setLocalMemory(userListCacheKey("/?page=1"), { users: [1] }, 60);

  dbEvents.fire(
    dbEventNames.DOCUMENT_UPDATED,
    new DatabaseDocumentEvent(
      dbEventNames.DOCUMENT_UPDATED,
      "categories",
      { id: "c1" },
    ),
  );

  assert.equal(globalMemory.getLocalMemory(CATEGORY_CACHE_KEY), null);
  assert.deepEqual(globalMemory.getLocalMemory(userListCacheKey("/?page=1")), {
    users: [1],
  });
});

test("non-mutating product events leave caches intact", () => {
  const listKey = productListCacheKey("/?page=1");
  productMemoryCache.setLocalMemory(listKey, { products: [] }, 60);

  evt.fire(Evts.PRODUCT_SEARCHED, {});

  assert.deepEqual(productMemoryCache.getLocalMemory(listKey), { products: [] });
});

test("namespaced prefixes are stable", () => {
  assert.equal(CACHE_PREFIX.products, "products:");
  assert.equal(CACHE_PREFIX.comments, "comments:");
  assert.equal(CACHE_PREFIX.userList, "users:list:");
  assert.equal(CACHE_PREFIX.orderList, "orders:list:");
});

import { useApiCacheStore } from "@/stores/apiCacheStore";

/* =========================================================
 * Client-side event-driven cache deletion
 * ---------------------------------------------------------
 * A successful write drops every client cache that can contain the
 * old value. The cache is not repopulated here: the next component
 * read fetches from the server again (which has its own, already
 * invalidated cache).
 *
 * The rules mirror the server namespaces:
 *   product:<id>              product detail
 *   products:*                lists, similar, showcase feed
 *   comments:*                review pages
 *   interaction:<id>          per-product viewer interaction
 *   users:* / orders:*        admin listings
 * ========================================================= */

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const MUTATION_RULES = [
  {
    // Product create/update/delete and all product write helpers.
    test: /^\/api\/products(?:\/|\?|$)/,
    prefixes: ["product:", "products:", "comments:"],
  },
  {
    // Reviews/ratings change the product average and review counters.
    test: /^\/api\/comments(?:\/|\?|$)/,
    prefixes: ["comments:", "product:", "products:", "interaction:"],
  },
  {
    test: /^\/api\/categories(?:\/|\?|$)/,
    prefixes: ["categories:", "products:", "product:"],
  },
  {
    test: /^\/api\/users(?:\/|\?|$)/,
    prefixes: ["users:", "user:", "profile:", "comments:"],
  },
  {
    test: /^\/api\/orders(?:\/|\?|$)/,
    prefixes: ["orders:", "users:", "products:", "product:"],
  },
  {
    test: /^\/api\/payments(?:\/|\?|$)/,
    prefixes: ["orders:", "users:", "products:", "product:"],
  },
  {
    test: /^\/api\/shipments(?:\/|\?|$)/,
    prefixes: ["orders:", "users:", "products:", "product:"],
  },
  {
    test: /^\/api\/cart(?:\/|\?|$)/,
    prefixes: ["cart:", "interaction:", "products:", "product:"],
  },
  {
    test: /^\/api\/wishlists(?:\/|\?|$)/,
    prefixes: ["wishlist:", "interaction:", "products:", "product:"],
  },
  {
    // A visit is a read-only signal; rating/sharing changes counters.
    test: /^\/api\/interactions\/product\/(?:rate|share)(?:\/|\?|$)/,
    prefixes: ["product:", "products:", "interaction:"],
  },
];

function normalizePath(url) {
  return String(url || "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0];
}

export function invalidateClientCachesForMutation(url, method) {
  const verb = String(method || "GET").toUpperCase();
  if (!MUTATION_METHODS.has(verb)) return;

  const path = normalizePath(url);
  if (!path) return;

  const { invalidatePattern } = useApiCacheStore.getState();
  for (const rule of MUTATION_RULES) {
    if (!rule.test.test(path)) continue;
    for (const prefix of rule.prefixes) invalidatePattern(prefix);
  }
}

export function installClientCacheInvalidation(client) {
  if (!client?.interceptors?.response || client.__cacheInvalidationInstalled) {
    return;
  }
  client.__cacheInvalidationInstalled = true;

  client.interceptors.response.use((response) => {
    invalidateClientCachesForMutation(
      response?.config?.url,
      response?.config?.method,
    );
    return response;
  });
}

export default {
  invalidateClientCachesForMutation,
  installClientCacheInvalidation,
};

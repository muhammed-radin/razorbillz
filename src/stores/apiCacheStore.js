import { create } from "zustand";
import { useCallback } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";

/**
 * Global In-Flight Request Registry.
 * Holds active Promise references to prevent identical concurrent network requests (cache stampede).
 */
const inFlightRequests = new Map();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes default TTL

export const useApiCacheStore = create((set, get) => ({
  /**
   * Normalized cache structure:
   * Record<string, {
   *   data: any,
   *   timestamp: number,
   *   ttl: number,
   *   status: 'idle' | 'loading' | 'success' | 'error',
   *   error: Error | null
   * }>
   */
  cache: {},

  /**
   * Fetch data with enterprise-grade caching, in-flight deduplication, and TTL validation.
   *
   * @param {string} key - Unique cache key (e.g., 'products:feed', 'category:12')
   * @param {() => Promise<any>} fetcher - Async function making the actual network request
   * @param {Object} [options]
   * @param {number} [options.ttl=300000] - Time to live in milliseconds
   * @param {boolean} [options.forceRefresh=false] - Bypass cache and force a new network request
   * @returns {Promise<any>}
   */
  fetchWithCache: async (key, fetcher, options = {}) => {
    const { ttl = DEFAULT_TTL_MS, forceRefresh = false } = options;
    const now = Date.now();
    const entry = get().cache[key];

    // 1. Cache Hit Check: Return instantly if fresh and not forced
    if (
      !forceRefresh &&
      entry &&
      entry.status === "success" &&
      now - entry.timestamp < (entry.ttl || ttl)
    ) {
      return entry.data;
    }

    // 2. In-Flight Request Deduplication: Reuse pending promise if already requesting
    if (inFlightRequests.has(key)) {
      return inFlightRequests.get(key);
    }

    // 3. Mark state as loading (retain existing data for non-blocking UI if revalidating)
    set((state) => ({
      cache: {
        ...state.cache,
        [key]: {
          data: entry?.data ?? null,
          timestamp: entry?.timestamp ?? 0,
          ttl,
          status: "loading",
          error: null,
        },
      },
    }));

    // 4. Dispatch fetch and capture promise
    const requestPromise = (async () => {
      try {
        const result = await fetcher();
        set((state) => ({
          cache: {
            ...state.cache,
            [key]: {
              data: result,
              timestamp: Date.now(),
              ttl,
              status: "success",
              error: null,
            },
          },
        }));
        return result;
      } catch (err) {
        set((state) => ({
          cache: {
            ...state.cache,
            [key]: {
              data: entry?.data ?? null,
              timestamp: entry?.timestamp ?? 0,
              ttl,
              status: "error",
              error: err?.message || "Failed to fetch data",
            },
          },
        }));
        throw err;
      } finally {
        inFlightRequests.delete(key);
      }
    })();

    inFlightRequests.set(key, requestPromise);
    return requestPromise;
  },

  /**
   * Synchronously inspect cache state for a given key.
   */
  getCache: (key) => {
    const entry = get().cache[key];
    if (!entry) return null;
    const isStale = Date.now() - entry.timestamp > entry.ttl;
    return {
      ...entry,
      isStale,
      isValid: entry.status === "success" && !isStale,
    };
  },

  /**
   * Directly write to cache (e.g. optimistic updates or prefetching).
   */
  setCache: (key, data, ttl = DEFAULT_TTL_MS) => {
    set((state) => ({
      cache: {
        ...state.cache,
        [key]: {
          data,
          timestamp: Date.now(),
          ttl,
          status: "success",
          error: null,
        },
      },
    }));
  },

  /**
   * Invalidate a single cache key.
   */
  invalidate: (key) => {
    set((state) => {
      const nextCache = { ...state.cache };
      delete nextCache[key];
      return { cache: nextCache };
    });
  },

  /**
   * Invalidate keys matching a string prefix or RegExp.
   * e.g., invalidatePattern('products:')
   */
  invalidatePattern: (pattern) => {
    set((state) => {
      const nextCache = {};
      const isRegex = pattern instanceof RegExp;

      Object.entries(state.cache).forEach(([k, v]) => {
        const matches = isRegex ? pattern.test(k) : k.startsWith(pattern);
        if (!matches) {
          nextCache[k] = v;
        }
      });

      return { cache: nextCache };
    });
  },

  /**
   * Flush entire cache.
   */
  clear: () => set({ cache: {} }),
}));

/**
 * useCachedQuery
 *
 * High-performance React hook integrating useApiCacheStore with useStrictEffect.
 * Isolates component reactivity so only updates to THIS specific key trigger a re-render.
 *
 * @param {string} key - Cache key
 * @param {() => Promise<any>} fetcher - Async fetch callback
 * @param {Object} [options]
 * @param {number} [options.ttl]
 * @param {boolean} [options.enabled=true]
 */
export function useCachedQuery(key, fetcher, options = {}) {
  const { ttl = DEFAULT_TTL_MS, enabled = true } = options;

  // Granular atomic selector: only re-render when THIS key changes in the Zustand cache
  const cachedEntry = useApiCacheStore((state) => state.cache[key]);
  const fetchWithCache = useApiCacheStore((state) => state.fetchWithCache);
  const invalidateKey = useApiCacheStore((state) => state.invalidate);

  const executeFetch = useCallback(
    (force = false) => {
      if (!enabled || !key) return Promise.resolve(null);
      return fetchWithCache(key, fetcher, { ttl, forceRefresh: force });
    },
    [enabled, key, fetcher, ttl, fetchWithCache]
  );

  // Strict execution control: strictly runs once on mount, immune to React Strict Mode double-firing
  useStrictEffect(() => {
    executeFetch(false).catch(() => {});
  }, [key, enabled]);

  const isStale = cachedEntry
    ? Date.now() - cachedEntry.timestamp > (cachedEntry.ttl || ttl)
    : true;

  return {
    data: cachedEntry?.data ?? null,
    loading: cachedEntry?.status === "loading" && !cachedEntry?.data,
    isValidating: cachedEntry?.status === "loading",
    error: cachedEntry?.error ?? null,
    status: cachedEntry?.status ?? "idle",
    isStale,
    refetch: () => executeFetch(true),
    invalidate: () => invalidateKey(key),
  };
}

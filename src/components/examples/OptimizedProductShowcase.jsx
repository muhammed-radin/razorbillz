import React, { useState, useMemo, useCallback, useRef } from "react";
import { useCachedQuery } from "@/stores/apiCacheStore";
import { api } from "@/utils/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, ShoppingCart, RefreshCw, Filter } from "lucide-react";
import { currency } from "@/utils/currency";

/**
 * ============================================================================
 * 1. MEMOIZED CHILD COMPONENT: OptimizedProductCard
 * ============================================================================
 * Key Performance Optimizations:
 * 1. React.memo: Strictly prevents re-renders when parent states change, unless
 *    the product data or handlers change referentially.
 * 2. Fine-grained Zustand Selectors: Instead of subscribing to the entire cart
 *    or wishlist store, we pass stable callbacks or use atomic slice selectors.
 * 3. Render Profiling Counter: Visual confirmation of zero redundant renders.
 */
export const OptimizedProductCard = React.memo(
  function OptimizedProductCard({ product, onAddToCart, onToggleWishlist, isWished = false }) {
    // Render counter for performance auditing and DevTools verification
    const renderCount = useRef(0);
    renderCount.current += 1;

    return (
      <Card className="overflow-hidden transition-all duration-200 hover:shadow-md border-border/60">
        <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
          <img
            src={product.thumbnail || product.image}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 text-[10px] font-mono opacity-80"
          >
            Renders: {renderCount.current}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
            onClick={() => onToggleWishlist(product.id)}
            aria-label="Wishlist"
          >
            <Heart
              className={`size-4 ${isWished ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
            />
          </Button>
        </div>

        <CardContent className="p-4 space-y-2">
          <h4 className="font-semibold text-sm line-clamp-1 text-foreground">
            {product.title}
          </h4>
          <div className="flex items-center justify-between pt-1">
            <span className="font-bold text-base text-primary">
              {currency(Number(product.price).toFixed(2))}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs font-medium"
              onClick={() => onAddToCart(product)}
            >
              <ShoppingCart className="size-3.5" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  },
  // Custom memo comparator for high-density lists: only re-render if product ID, price, or wish status changes
  (prevProps, nextProps) =>
    prevProps.product.id === nextProps.product.id &&
    prevProps.product.price === nextProps.product.price &&
    prevProps.isWished === nextProps.isWished &&
    prevProps.onAddToCart === nextProps.onAddToCart &&
    prevProps.onToggleWishlist === nextProps.onToggleWishlist
);

OptimizedProductCard.displayName = "OptimizedProductCard";

/**
 * ============================================================================
 * 2. PARENT COMPONENT: OptimizedProductShowcase
 * ============================================================================
 * Demonstrates:
 * 1. Data Fetching via Zustand Cache (`useCachedQuery`) with 0 duplicate fetches.
 * 2. Frequent Local State Updates (search query & category filter) isolated from children.
 * 3. Stable handler references with `useCallback`.
 * 4. Stable computed derivations with `useMemo`.
 */
export default function OptimizedProductShowcase() {
  // Rapidly changing parent states (e.g. typing, filtering)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [wishlistIds, setWishlistIds] = useState(new Set());

  // Parent render counter
  const parentRenderCount = useRef(0);
  parentRenderCount.current += 1;

  // 1. Data fetching using our Zustand Cache Layer + useStrictEffect (immune to StrictMode double-fire)
  const { data: rawProducts, loading, error, isStale, refetch } = useCachedQuery(
    "products:showcase-feed",
    async () => {
      // In production: fetch from api.client.get("/api/products/feed")
      const res = await api.client.get("/api/products/feed");
      return res.data?.latest || res.data?.products || [];
    },
    { ttl: 10 * 60 * 1000 } // 10 minute cache TTL
  );

  // 2. Stable Handler: Memoized with useCallback so Child components do NOT re-render on parent typing
  const handleAddToCart = useCallback((product) => {
    // Add to cart logic or Zustand dispatch
    console.log("Added to cart:", product.id);
  }, []);

  // 3. Stable Wishlist Toggle Handler using functional updater (zero dependencies)
  const handleToggleWishlist = useCallback((productId) => {
    setWishlistIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  // 4. Stable Filtered List: Memoized with useMemo to preserve array reference equality
  const filteredProducts = useMemo(() => {
    const list = Array.isArray(rawProducts) ? rawProducts : [];
    return list.filter((item) => {
      const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "all" || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [rawProducts, searchQuery, selectedCategory]);

  return (
    <section className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header and Performance Telemetry */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border/50">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Enterprise Performance Showcase</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Parent Renders: <span className="font-mono text-primary font-bold">{parentRenderCount.current}</span> | 
            Cache State: <span className="font-mono font-medium">{isStale ? "Stale / Fetching" : "Cached (0ms)"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Force Revalidate
          </Button>
        </div>
      </div>

      {/* High-frequency controls: typing here re-renders ONLY the parent, NOT the product cards */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Type to filter (watches parent re-render isolation)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          {["all", "electronics", "fashion"].map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? "default" : "outline"}
              onClick={() => setSelectedCategory(cat)}
              className="capitalize text-xs"
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Grid rendering memoized children */}
      {loading && !rawProducts ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-4 text-center text-sm text-destructive bg-destructive/10 rounded-lg">
          Failed to load products: {error}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredProducts.map((product) => (
            <OptimizedProductCard
              key={product.id || product.productId}
              product={product}
              isWished={wishlistIds.has(product.id || product.productId)}
              onAddToCart={handleAddToCart}
              onToggleWishlist={handleToggleWishlist}
            />
          ))}
        </div>
      )}
    </section>
  );
}

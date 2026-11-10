import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProductCard from "@/components/product-card/ProductCard";
import { Search, TriangleAlert } from "lucide-react";
import FilterSidebar from "./filters/filter-sidebar";
import PaginationWithPrimaryButton from "@/components/customized/pagination/pagination-02";
import { api } from "@/utils/api";
import { useStore } from "./useSearchStore";
import { Preloader } from "@/components/LoaderScreen";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// migrating to zustand for state management (see ./useSearchStore)

export default function SearchPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  const sortOptions = [
    { value: "relevance", label: t("search.sortBestMatch") },
    { value: "price-low", label: t("search.sortPriceLow") },
    { value: "price-high", label: t("search.sortPriceHigh") },
    { value: "rating", label: t("search.sortRating") },
    { value: "name", label: t("search.sortName") },
    { value: "newest", label: t("search.sortNewest") },
  ];

  const {
    searchQuery,
    selectedCategory,
    sortBy,
    priceRange,
    minRating,
    showOnlyInStock,
    showFilters,
    fixedPriceRange,
    setShowFilters,
    setSearchQuery,
    setSelectedCategory,
    setSortBy,
    setPriceRange,
    setMinRating,
    setShowOnlyInStock,
  } = useStore();

  const [preloaderEnabled, setPreloader] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  /* Bumped on every explicit search (Enter / button / retry) so the
   * fetch effect re-runs even when the committed query is unchanged. */
  const [searchNonce, setSearchNonce] = useState(0);
  const requestSeq = useRef(0);

  const [filteredAndSortedProducts, setFilteredAndSortedProducts] = useState(
    [],
  );

  // URL is the source of truth for q/category/page.
  const queryParam = searchParams.get("q") ?? "";
  const pageParam = Math.max(
    parseInt(searchParams.get("page") || "1", 10) || 1,
    1,
  );
  const categoryParam = searchParams.get("category") ?? "all";

  const sortMapping = useMemo(() => {
    switch (sortBy) {
      case "price-low":
        return { sortBy: "price", sortOrder: "asc" };
      case "price-high":
        return { sortBy: "price", sortOrder: "desc" };
      case "rating":
        return { sortBy: "rating", sortOrder: "desc" };
      case "name":
        return { sortBy: "title", sortOrder: "desc" };
      case "newest":
        return { sortBy: "createdAt", sortOrder: "desc" };
      default:
        return { sortBy: "createdAt", sortOrder: undefined };
    }
  }, [sortBy]);

  // URL -> store sync (guarded: only set on real change, no loops).
  useEffect(() => {
    if (queryParam !== searchQuery) setSearchQuery(queryParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParam]);
  useEffect(() => {
    if (categoryParam !== selectedCategory) setSelectedCategory(categoryParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryParam]);

  // Ensure a page param exists exactly once (no repeated sets).
  useEffect(() => {
    if (!searchParams.get("page")) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("page", "1");
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Typing deliberately does NOT search: the input only updates the
   * local store value. A search is committed to the URL (the fetch
   * source of truth) only on Enter or the search button — see
   * `runSearchNow`. This avoids firing a request on every keystroke. */

  // Filter changes restart at page 1 (single navigation, no loop).
  const priceMin = priceRange[0];
  const priceMax = priceRange[1];
  useEffect(() => {
    if (pageParam !== 1) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("page", "1");
        next.set(
          "category",
          selectedCategory !== "all" ? selectedCategory : "",
        );
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCategory,
    sortBy,
    priceMin,
    priceMax,
    minRating,
    showOnlyInStock,
  ]);

  /* Commit the typed query to the URL and force a fetch. Only called on
   * Enter, the search button, or an explicit retry — never per keystroke. */
  const runSearchNow = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (searchQuery.trim()) next.set("q", searchQuery.trim());
      else next.delete("q");
      next.set("category", selectedCategory !== "all" ? selectedCategory : "");
      next.set("page", "1");
      return next;
    });
    setSearchNonce((n) => n + 1);
  }, [searchQuery, setSearchParams]);

  // Single fetch effect on PRIMITIVE keys, with cancellation and
  // stale-response guards. 429 shows a notice — never a retry loop.
  useEffect(() => {
    const q = queryParam.trim();
    if (q && q.length < 2) {
      setFilteredAndSortedProducts([]);
      setTotalProducts(0);
      setTotalPages(1);
      setPreloader(false);
      return undefined;
    }
    const seq = (requestSeq.current += 1);
    const controller = new AbortController();
    setPreloader(true);
    setRateLimited(false);
    const timer = setTimeout(async () => {
      try {
        const response = await api.client.get("/api/products", {
          signal: controller.signal,
          params: {
            search: q || undefined,
            category: selectedCategory !== "all" ? selectedCategory : undefined,
            priceMin,
            priceMax,
            // Send rating bounds only when the user filters by rating;
            // unrated products must stay visible otherwise.
            ratingMin: minRating > 0 ? minRating : undefined,
            inStock: showOnlyInStock || undefined,
            sortBy: sortMapping.sortBy,
            sortOrder: sortMapping.sortOrder,
            page: pageParam,
          },
        });
        if (requestSeq.current !== seq) return; // stale
        const fetched = response.data;
        setPreloader(false);
        setTotalPages(fetched.totalPages || 1);
        setTotalProducts(fetched.count || 0);
        setFilteredAndSortedProducts(fetched.products || []);
      } catch (error) {
        if (controller.signal.aborted || requestSeq.current !== seq) return;
        setPreloader(false);
        if (error?.response?.status === 429) {
          setRateLimited(true);
          return;
        }
        if (error?.code === "ERR_CANCELED") return;
        console.error("Error fetching products:", error);
        toast.error(t("search.failedToLoad"));
        setTotalPages(1);
        setTotalProducts(0);
        setFilteredAndSortedProducts([]);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    queryParam,
    selectedCategory,
    pageParam,
    sortMapping,
    priceMin,
    priceMax,
    minRating,
    showOnlyInStock,
    searchNonce,
  ]);

  const handlePageChange = useCallback(
    (page) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("page", String(page));
        return next;
      });
    },
    [setSearchParams],
  );

  useStrictEffect(() => {
    // load categories from API
    api.client.get("/api/categories?limit=100").then((response) => {
      const fetchedCategories = response.data;
      setCategories(fetchedCategories || []);
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSortBy("relevance");
    setPriceRange(fixedPriceRange);
    setMinRating(0);
    setShowOnlyInStock(false);
    // The committed query/category live in the URL — clear them there too
    // so removing the auto-search keeps "clear filters" fully working.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("q");
      next.delete("category");
      next.set("page", "1");
      return next;
    });
  }, [
    fixedPriceRange,
    setMinRating,
    setPriceRange,
    setSearchQuery,
    setSelectedCategory,
    setShowOnlyInStock,
    setSortBy,
    setSearchParams,
  ]);

  const activeFiltersCount = [
    selectedCategory !== "all",
    priceRange[0] > fixedPriceRange[0] || priceRange[1] < fixedPriceRange[1],
    minRating > 0,
    showOnlyInStock,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen p-3 sm:p-7 max-sm:p-4 max-sm:mt-3">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{t("search.pageTitle")}</h1>
          <p className="text-gray-600">{t("search.pageSubtitle")}</p>
        </header>

        {/* Search Bar */}
        <div className="relative mb-6 flex flex-row items-center gap-1">
          <div className="relative w-full max-w-2xl">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
              size={20}
            />
            <Input
              type="text"
              placeholder={t("search.inputPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  runSearchNow();
                }
              }}
              className="pl-10 h-10 text-base"
            />
          </div>
          <Button
            onClick={runSearchNow}
            variant="outline"
            className="h-10"
            aria-label={t("search.searchButton")}
          >
            <Search />
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Filters Sidebar */}
          <FilterSidebar
            activeFiltersCount={activeFiltersCount}
            categories={categories}
            clearFilters={clearFilters}
            minRating={minRating}
            priceRange={priceRange}
            selectedCategory={selectedCategory}
            showOnlyInStock={showOnlyInStock}
            showFilters={showFilters}
            setMinRating={setMinRating}
            setPriceRange={setPriceRange}
            setSelectedCategory={setSelectedCategory}
            setShowFilters={setShowFilters}
            setShowOnlyInStock={setShowOnlyInStock}
          />

          {/* Results */}
          <div className="flex-1">
            {/* Results Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {totalProducts === 1
                    ? t("search.productsFound_one", { count: totalProducts })
                    : t("search.productsFound_other", { count: totalProducts })}
                </h2>
                {searchParams.get("q") && (
                  <p className="text-gray-600">
                    {t("search.resultsFor", { query: searchParams.get("q") })}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Label htmlFor="sort" className="text-sm whitespace-nowrap">
                  {t("search.sortBy")}
                </Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Products Grid */}
            {rateLimited && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  Search is rate-limited right now. Wait a moment, then retry —
                  results below are the last successful ones.
                </span>
                <Button size="sm" variant="outline" onClick={runSearchNow}>
                  Retry
                </Button>
              </div>
            )}
            {preloaderEnabled ? (
              <div className="w-full h-1/2 flex justify-center items-center">
                <Preloader />
              </div>
            ) : filteredAndSortedProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 justify-items-center">
                {filteredAndSortedProducts.map((product, idx) => (
                  <ProductCard
                    key={product.id || idx}
                    product={product}
                    index={idx}
                  />
                ))}
              </div>
            ) : (
              /* No Results State */
              <div className="text-center py-16">
                <div className="mb-4">
                  <Search size={64} className="mx-auto text-gray-300" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {t("search.noProductsFound")}
                </h3>
                <p className="text-gray-600 mb-6">
                  {t("search.noProductsFoundDesc")}
                </p>
                <Button onClick={clearFilters} variant="default">
                  {t("search.clearAllFilters")}
                </Button>
                <Button
                  onClick={runSearchNow}
                  variant="outline"
                  className="ml-2"
                >
                  {t("common.tryAgain")}
                </Button>
              </div>
            )}
          </div>
        </div>
        {/* Pagination */}
        <div className="mt-6 sm:p-1">
          <PaginationWithPrimaryButton
            className="w-full"
            page={pageParam}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>
    </div>
  );
}

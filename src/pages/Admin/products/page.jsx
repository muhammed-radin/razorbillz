import { useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";
import { currency as formatCurrency } from "@/utils/currency";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";

// components
import HeroHeader from "./components/hero-header.admin";
import SearchFilters from "./components/search-filters.products.admin";
import { Preloader } from "@/components/LoaderScreen";
import StatsCards from "./components/stats-cards.admin";
import ListViewAdmin from "./components/list-view.admin";
import GridViewAdmin from "./components/grid-view.admin";
import AlertDeleteProductDialog from "./components/alert-delete.admin";
import { toast, Toaster } from "sonner";
import PaginationWithPrimaryButton from "@/components/customized/pagination/pagination-02";

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [statics, setStatics] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isOpenDeleteConfirm, setIsOpenDeleteConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // grid or list
  const [totalPages, setTotalPages] = useState(5);
  const { current: itemsPerPage } = useRef(10);
  const searchTimer = useRef(null);
  const lastSearchRef = useRef(null);

  const [currentPage, setCurrentPage] = useSearchParams();

  if (!currentPage.get("page")) {
    currentPage.set("page", "1");
  }
  const pageNum = parseInt(currentPage.get("page") || "1", 10) || 1;

  // Server-side search + pagination: GET /api/products?search=&page=&limit=
  // One effect drives both page changes and debounced text search, so the
  // initial mount no longer fires the page fetch and the search timer twice.
  useStrictEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const term = searchQuery.trim();
    const changedSearch = lastSearchRef.current !== term;
    lastSearchRef.current = term;

    // A new search always starts from page 1.
    if (term && pageNum !== 1) {
      setCurrentPage({ page: "1" });
      return;
    }

    if (changedSearch && term) {
      searchTimer.current = setTimeout(() => {
        fetchProducts(1, term);
      }, 400);
      return () => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
      };
    }

    fetchProducts(pageNum, term);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [pageNum, searchQuery]);

  useStrictEffect(() => {
    fetchProductStatics();
  }, []);

  const fetchProducts = async (page = 1, search = "") => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await api.client.get(api.products(), {
        params: {
          page,
          limit: itemsPerPage,
          ...(search?.trim() ? { search: search.trim() } : {}),
          realtime: "true",
        },
      });

      setProducts(response.data.products || []);
      setTotalPages(response.data.totalPages || 1);
      setTotalCount(
        typeof response.data.count === "number"
          ? response.data.count
          : (response.data.products || []).length,
      );
    } catch (error) {
      console.error("Error fetching products:", error);
      setProducts([]);
      setLoadError(
        error?.response?.status === 403
          ? "Admin access required to view products."
          : "Could not load products. Check the connection and retry.",
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchProductStatics = async () => {
    try {
      const response = await api.client.get(api.products("status"));
      setStatics(response.data);
    } catch (error) {
      console.error("Error fetching product statics:", error);
    }
  };

  const handleDelete = (productId) => {
    setIsOpenDeleteConfirm(productId); // Open the confirmation dialog
  };

  const deleteProduct = async (productId) => {
    try {
      toast.promise(
        () =>
          new Promise((resolveui, rejectui) => {
            api.client
              .delete(api.products(productId))
              .then((response) => {
                if (response.status !== 200) {
                  rejectui(response.data);
                  return;
                }
                resolveui("Product deleted successfully");
                fetchProducts(pageNum, searchQuery); // Refresh the product list after deletion
              })
              .catch((error) => {
                rejectui(error);
                console.error("There was an error!", error);
              });
          }),
        {
          loading: "Deleting product...",
          success: "Product deleted successfully",
          error: (err) => err?.response?.data?.error ?? "Error deleting product",
        },
      );
    } catch (error) {
      console.error("Error deleting product:", error);
    }
    setIsOpenDeleteConfirm(false);
  };

  const getStockStatus = (stock) => {
    if (stock === 0) {
      return {
        label: "Out of Stock",
        variant: "destructive",
        color: "bg-destructive",
      };
    } else if (stock < 10) {
      return { label: "Low Stock", variant: "secondary", color: "bg-accent" };
    } else {
      return { label: "In Stock", variant: "default", color: "bg-primary" };
    }
  };

  const lowStockCount = products.filter(
    (p) => p.stock > 0 && p.stock < 10,
  ).length;
  const outOfStockCount = products.filter((p) => p.stock === 0).length;
  const inStockCount = products.filter((p) => p.stock >= 10).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Toaster */}

      <div className="container mx-auto p-6 space-y-8">
        {/* Hero Header */}
        <HeroHeader />

        {/* Stats Cards */}
        <StatsCards
          totalProducts={totalCount}
          lowStockCount={lowStockCount}
          outOfStockCount={outOfStockCount}
          inStockCount={inStockCount}
          isLoading={!statics}
        />

        {/* Search and Filter Bar */}
        <SearchFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        {/* Products Display */}
        {loadError && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span className="flex-1 text-destructive">{loadError}</span>
            <Button
              onClick={() => fetchProducts(pageNum, searchQuery)}
              variant="outline"
              size="sm"
            >
              Retry
            </Button>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <Preloader />
              <p className="text-muted-foreground font-medium">
                Loading products...
              </p>
            </div>
          </div>
        ) : products.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <Package className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground max-w-sm">
                {searchQuery
                  ? "Try adjusting your search query to find what you're looking for"
                  : "Get started by adding your first product to the inventory"}
              </p>
              {!searchQuery && (
                <Button asChild className="mt-6">
                  <Link to="/auth/admin/products/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Product
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <GridViewAdmin
            products={products}
            handleDelete={handleDelete}
            getStockStatus={getStockStatus}
            formatCurrency={formatCurrency}
          />
        ) : (
          /* List View */
          <ListViewAdmin
            Badge={Badge}
            products={products}
            handleDelete={handleDelete}
            getStockStatus={getStockStatus}
            formatCurrency={formatCurrency}
          />
        )}
      </div>

      {/* Pagination */}
      <PaginationWithPrimaryButton
        className="w-full"
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(pageNum) => setCurrentPage({ page: pageNum })}
        setCurrentPage={setCurrentPage}
      />

      {/* Delete Confirmation Modal */}
      <AlertDeleteProductDialog
        isOpen={isOpenDeleteConfirm}
        onClose={() => setIsOpenDeleteConfirm(false)}
        onConfirm={() => deleteProduct(isOpenDeleteConfirm)}
      />
    </div>
  );
}

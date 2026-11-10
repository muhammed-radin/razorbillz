import React, { useState, useMemo, useEffect } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import WishlistHeader from "./components/WishlistHeader";
import WishlistToolbar from "./components/WishlistToolbar";
import WishlistProductList from "./components/WishlistProductList";
import WishlistEmpty from "./components/WishlistEmpty";
import WishlistSkeleton from "./components/WishlistSkeleton";
import { useWishlistStore, useCartStore } from "@/stores/shop";

export default function Wishlist() {
  const navigate = useNavigate();
  const storeItems = useWishlistStore((s) => s.items);
  const storeLoading = useWishlistStore((s) => s.loading);
  const fetchWishlist = useWishlistStore((s) => s.fetch);
  const removeFromWishlist = useWishlistStore((s) => s.remove);
  const addToCart = useCartStore((s) => s.add);

  const [selectedIds, setSelectedIds] = useState([]);

  useStrictEffect(() => {
    fetchWishlist().catch(() => {});
  }, [fetchWishlist]);

  // Server snapshots -> display shape
  const items = useMemo(
    () =>
      storeItems.map((p, index) => {
        const id = String(p.productId ?? p.id ?? index);
        const price = p.price ?? 0;
        const originalPrice = p.originalPrice ?? price;
        return {
          id,
          brand: p.brand ?? "",
          title: p.title ?? "Product",
          variant: p.sku ?? "",
          stockStatus: "in_stock",
          stockLabel: "In stock",
          savedDate: "",
          originalPrice: originalPrice > price ? originalPrice : null,
          price,
          savings: originalPrice > price ? originalPrice - price : 0,
          image: p.thumbnail ?? p.image ?? "",
          badge: null,
          inStock: true,
          raw: p,
        };
      }),
    [storeItems],
  );

  const isLoading = storeLoading;

  useEffect(() => {
    setSelectedIds(items.map((item) => item.id));
  }, [storeItems, storeLoading]);

  // Compute stats dynamically from active wishlist items
  const stats = useMemo(() => {
    let priceDropCount = 0;
    let backInStockCount = 0;
    let almostGoneCount = 0;
    let totalSavings = 0;

    items.forEach((item) => {
      if (item.badge?.type === "price_drop") priceDropCount++;
      if (item.badge?.type === "back_in_stock") backInStockCount++;
      if (item.badge?.type === "almost_gone") almostGoneCount++;
      if (item.savings) totalSavings += item.savings;
    });

    return {
      priceDropCount,
      backInStockCount,
      almostGoneCount,
      totalSavings,
    };
  }, [items]);

  // Selection state
  const isAllSelected = items.length > 0 && selectedIds.length === items.length;

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(items.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Count of selected items that are in-stock
  const selectedInStockCount = useMemo(() => {
    return items.filter(
      (item) => selectedIds.includes(item.id) && item.inStock
    ).length;
  }, [items, selectedIds]);

  // Event Handlers
  const handleRemoveItem = async (id, title) => {
    try {
      await removeFromWishlist(id);
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      toast.success(`Removed "${title}" from your wishlist`);
    } catch {
      toast.error("Failed to remove item");
    }
  };

  const handleAddToCart = async (item) => {
    try {
      await addToCart(item.raw ?? { ...item, productId: item.id }, 1);
      toast.success(`Added "${item.title}" to cart`);
    } catch {
      toast.error("Failed to add to cart");
    }
  };

  const handleAddSelectedToCart = async () => {
    const selectedInStock = items.filter(
      (item) => selectedIds.includes(item.id) && item.inStock
    );
    if (selectedInStock.length === 0) return;

    try {
      await Promise.all(
        selectedInStock.map((item) =>
          addToCart(item.raw ?? { ...item, productId: item.id }, 1),
        ),
      );
      toast.success(
        `Added ${selectedInStock.length} item${selectedInStock.length > 1 ? "s" : ""} to cart!`
      );
    } catch {
      toast.error("Failed to add items to cart");
    }
  };

  const handleNotifyMe = (item) => {
    toast.info(`You'll be notified when "${item.title}" is back in stock`);
  };

  const handleShareList = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Wishlist link copied to clipboard!");
    } else {
      toast.success("Wishlist link ready to share!");
    }
  };

  const handleResetDemo = () => {
    fetchWishlist().catch(() => {});
  };

  if (isLoading) {
    return <WishlistSkeleton />;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-neutral-900 dark:text-white selection:bg-neutral-200 dark:selection:bg-neutral-800 transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">
        {/* Header Section */}
        <WishlistHeader itemCount={items.length} stats={stats} />

        {/* Wishlist Main View */}
        {items.length === 0 ? (
          <WishlistEmpty onResetDemo={handleResetDemo} />
        ) : (
          <div>
            {/* Toolbar Row */}
            <WishlistToolbar
              itemCount={items.length}
              isAllSelected={isAllSelected}
              selectedInStockCount={selectedInStockCount}
              onSelectAll={handleSelectAll}
              onShareList={handleShareList}
              onAddSelectedToCart={handleAddSelectedToCart}
            />

            {/* Product List */}
            <WishlistProductList
              items={items}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onRemoveItem={handleRemoveItem}
              onAddToCart={handleAddToCart}
              onNotifyMe={handleNotifyMe}
              onNavigate={(id) => navigate(`/product/${id}`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

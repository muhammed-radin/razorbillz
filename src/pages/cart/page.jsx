import React from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ShoppingCart, Trash2 } from "lucide-react";

import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import EmptyCart from "./components/Empty-cart.jsx";
import ShoppingCart1 from "@/components/shopping-cart-1.jsx";
import { useCartStore } from "@/stores/shop";
import { LoaderScreen } from "@/components/LoaderScreen.jsx";
import { Skeleton } from "@/components/ui/skeleton.jsx";

const CartPage = () => {
  const { t } = useTranslation();
  const items = useCartStore((s) => s.items);
  const loading = useCartStore((s) => s.loading);
  const fetchCart = useCartStore((s) => s.fetch);
  const clearCart = useCartStore((s) => s.clear);

  useStrictEffect(() => {
    fetchCart().catch(() => {});
  }, []);

  const isEmpty = items.length === 0;
  const totalCount = items.reduce((sum, i) => sum + (i.quantity ?? 1), 0);

  const handleClearCart = async () => {
    try {
      await clearCart();
      toast.success(t("cart.cleared", { defaultValue: "Cart cleared" }));
    } catch {
      toast.error(t("common.error", { defaultValue: "Failed to clear cart" }));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">{t("product.home")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("cart.title")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="flex items-center gap-3 mb-4 sm:mb-0">
            <ShoppingCart className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">
              {t("cart.title")}
              {!isEmpty && (
                <span className="ml-2 text-lg font-normal text-muted-foreground">
                  ({totalCount}{" "}
                  {totalCount === 1 ? t("common.item") : t("common.items")})
                </span>
              )}
            </h1>
          </div>

          <div className="flex gap-3">
            {!isEmpty && (
              <Button
                variant="outline"
                onClick={handleClearCart}
                disabled={loading}
                className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("cart.clearCart")}
              </Button>
            )}
          </div>
        </div>

        {isEmpty && !loading ? (
          /* Empty Cart State */
          <EmptyCart />
        ) : isEmpty || loading ? (
          <div>
            {/* Skeleton */}
            <Skeleton className="h-6 w-1/4 mb-4" />
            <Skeleton className="h-6 w-1/2 mb-4" />
            <Skeleton className="h-6 w-3/4 mb-4" />
            <Skeleton className="h-6 w-full mb-4" />
          </div>
        ) : (
          /* Cart with Items */
          <ShoppingCart1 />
        )}
      </div>
    </div>
  );
};

export default CartPage;

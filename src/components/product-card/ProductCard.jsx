import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Preloader } from "../LoaderScreen";
import { ImageOff, Heart, Eye, ShoppingCart, Loader2 } from "lucide-react";
import { currency } from "@/utils/currency";
import { useTranslation } from "react-i18next";
import { useCartStore, useWishlistStore } from "@/stores/shop";
import { toast } from "sonner";

const ProductCard = ({ product, index }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [imageLoaded, setLoadedState] = useState(false);
  const [imageErr, setImageErr] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [pendingWish, setPendingWish] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(false);
  const addToCart = useCartStore((s) => s.add);
  const wishlistHas = useWishlistStore((s) => s.has);
  const wishlistToggle = useWishlistStore((s) => s.toggle);
  const pid = product.productId ?? product.id;
  const isFavorite = wishlistHas(pid);

  // Staggered animation on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, (index || 0) * 100);
    return () => clearTimeout(timer);
  }, [index]);

  const handleProductClick = useCallback(() => {
    const productId = product.id;
    navigate(`/product/${productId}`);
  }, [navigate, product]);

  const onImageLoad = useCallback(() => {
    setLoadedState(true);
  }, []);

  const onImageError = useCallback(() => {
    setImageErr(true);
  }, []);

  const handleFavoriteClick = useCallback(
    async (e) => {
      e.stopPropagation();
      if (pendingWish) return;
      setPendingWish(true);
      try {
        await wishlistToggle(product);
        toast.success(
          wishlistHas(pid)
            ? t("product.addToFavorites")
            : t("product.removeFromFavorites"),
        );
      } catch {
        toast.error(t("common.tryAgain"));
      } finally {
        setPendingWish(false);
      }
    },
    [pendingWish, wishlistToggle, wishlistHas, pid, product, t],
  );

  const handleAddToCart = useCallback(
    async (e) => {
      e?.stopPropagation();
      if (pendingAdd || product.stock === 0) return;
      setPendingAdd(true);
      try {
        await addToCart(product, 1);
        toast.success(t("product.addedToCart"));
      } catch {
        toast.error(t("common.tryAgain"));
      } finally {
        setPendingAdd(false);
      }
    },
    [pendingAdd, addToCart, product, t],
  );

  // Calculate discount percentage
  const discountPercentage =
    product.originalPrice && product.originalPrice !== product.price
      ? Math.round(
          ((product.originalPrice - product.price) / product.originalPrice) *
            100,
        )
      : 0;

  return (
    <Card
      className={cn(
        "w-35 sm:w-45 h-55 border shadow-none border-none rounded-none p-0 bg-transparent gap-3 cursor-pointer group relative",
        "transition-all duration-[600ms] ease-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => {
        setIsHovered(true);
        setTimeout(() => setIsHovered(false), 3000);
      }}
      onClick={handleProductClick}
    >
      <CardHeader className="h-40 border-1 max-sm:border-2 rounded-2xl p-0 m-0 overflow-hidden bg-center relative">
        {/* Image */}
        <img
          src={product.image || product.thumbnail}
          alt={product.title}
          className={cn(
            "w-full h-40 object-cover object-center bg-background transition-all duration-500 ease-out",
            "group-hover:scale-110 group-hover:rotate-1",
            { hidden: !imageLoaded || imageErr },
          )}
          onLoad={onImageLoad}
          onError={onImageError}
        />

        {/* Stock Out */}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <span className="text-white text-sm font-semibold">
              {t("product.outOfStock")}
            </span>
          </div>
        )}

        {/* Loading State */}
        <div
          className={cn(
            "w-full h-40 bg-background flex items-center justify-center",
            { hidden: imageLoaded || imageErr },
          )}
        >
          <Preloader />
        </div>

        {/* Error State */}
        <div
          className={cn(
            "w-full h-40 bg-background flex items-center justify-center",
            { hidden: imageLoaded || !imageErr },
          )}
        >
          <ImageOff />
        </div>

        {/* Gradient Overlay on Hover */}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent",
            "transition-opacity duration-300",
            isHovered ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Discount Badge */}
        {discountPercentage > 0 && (
          <div className="absolute top-2 left-2 z-10">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold px-2 py-1 rounded-xl shadow-lg animate-pulse">
              -{discountPercentage}%
            </div>
          </div>
        )}

        {/* Favorite Button */}
        <button
          onClick={handleFavoriteClick}
          disabled={pendingWish}
          aria-label={isFavorite ? t("product.removeFromFavorites") : t("product.addToFavorites")}
          className={cn(
            "absolute top-2 right-2 z-10 p-2 rounded-full",
            "backdrop-blur-md bg-white/30 dark:bg-black/30",
            "transition-all duration-200 hover:scale-110",
            "shadow-lg border border-white/20",
            "disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100",
          )}
        >
          {pendingWish ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Heart
              className={cn(
                "w-4 h-4 transition-all duration-200",
                isFavorite
                  ? "fill-red-500 text-red-500 scale-110"
                  : "text-white dark:text-gray-200",
              )}
            />
          )}
        </button>

        {/* Quick Action Buttons */}
        <div
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2 z-10",
            "flex gap-2 transition-all duration-300",
            isHovered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          <button
            onClick={handleProductClick}
            aria-label={t("product.productDetails")}
            className="p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:scale-110 transition-transform duration-200"
          >
            <Eye className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          </button>
          <button
            onClick={handleAddToCart}
            disabled={pendingAdd || product.stock === 0}
            aria-label={t("product.addToCart")}
            className="p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:scale-110 transition-transform duration-200 disabled:cursor-wait disabled:opacity-70 disabled:hover:scale-100"
          >
            {pendingAdd ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-700 dark:text-gray-200" />
            ) : (
              <ShoppingCart className="w-4 h-4 text-gray-700 dark:text-gray-200" />
            )}
          </button>
        </div>

        {/* Progress Bar at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent dark:bg-transparent overflow-hidden">
          <div
            className={cn(
              "h-full bg-gradient-to-r from-amber-500 to-amber-700",
              "transition-all duration-500 ease-out",
              isHovered ? "w-full" : "w-0",
            )}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 m-0">
        {/* Title with 2 line clamp */}
        <h2 className="text-sm font-semibold line-clamp-2 mb-1">
          <Link to={`/product/${product.id}`}>{product.title}</Link>
        </h2>

        {/* Price Section */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Current Price */}
            <span
              className={cn(
                "text-base font-bold text-green-600 dark:text-green-400",
                "transition-transform duration-200",
                isHovered ? "scale-105" : "scale-100",
                product.stock === 0 && "text-red-600 dark:text-red-400",
              )}
            >
              {product.stock === 0 ? t("product.outOfStock") : currency(product.price)}
            </span>

            {/* Original Price */}
            {product.originalPrice &&
              product.originalPrice !== product.price && (
                <span className="text-xs text-red-950 dark:text-red-300 line-through">
                  {product.stock === 0 ? "" : currency(product.originalPrice)}
                </span>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(ProductCard);

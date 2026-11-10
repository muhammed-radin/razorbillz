import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingCart, Star, Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { currency } from "@/utils/currency";
import { useTranslation } from "react-i18next";
import { useCartStore, useWishlistStore } from "@/stores/shop";
import { toast } from "sonner";
import RatingStar from "@/components/rating-star";

export default function ProductCard({ product, index = 0 }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [imgOk, setImgOk] = useState(false);
  const [added, setAdded] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(false);
  const [pendingWish, setPendingWish] = useState(false);
  const addToCart = useCartStore((s) => s.add);
  const { has, toggle } = useWishlistStore();
  const pid = product.productId ?? product.id;
  const wished = has(pid);

  const discount =
    product.originalPrice != null && product.originalPrice > product.price
      ? Math.round(
          ((product.originalPrice - product.price) / product.originalPrice) *
            100,
        )
      : 0;
  const hasRating = Number(product.rating) > 0;

  const handleAdd = async (e) => {
    e.stopPropagation();
    if (pendingAdd) return;
    setPendingAdd(true);
    try {
      await addToCart(product, 1);
      setAdded(true);
      toast.success(t("product.addedToCart"));
      setTimeout(() => setAdded(false), 1400);
    } catch {
      toast.error(t("common.tryAgain"));
    } finally {
      setPendingAdd(false);
    }
  };

  const handleWish = async (e) => {
    e.stopPropagation();
    if (pendingWish) return;
    setPendingWish(true);
    try {
      await toggle(product);
      toast.success(
        wished ? t("product.removeFromFavorites") : t("product.addToFavorites"),
      );
    } catch {
      toast.error(t("common.tryAgain"));
    } finally {
      setPendingWish(false);
    }
  };

  return (
    <Card
      onClick={() => navigate(`/product/${pid}`)}
      className="group relative cursor-pointer overflow-hidden rounded-3xl border-muted bg-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-20px_rgba(0,0,0,0.35)]"
      style={{ animation: `card-in 0.6s ${Math.min(index, 8) * 60}ms both` }}
    >
      <div className="relative aspect-square overflow-hidden bg-muted/40">
        {!imgOk && <div className="absolute inset-0 animate-pulse bg-muted" />}
        <img
          src={product.thumbnail || product.image}
          alt={product.title}
          width="400"
          height="400"
          loading="lazy"
          decoding="async"
          onLoad={() => setImgOk(true)}
          className={cn(
            "h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]",
            !imgOk && "opacity-0",
          )}
        />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {discount > 0 && (
            <Badge className="bg-rose-600 hover:bg-rose-600 text-white border-0 shadow-lg">
              -{discount}%
            </Badge>
          )}
          {product.badge && (
            <Badge
              variant="secondary"
              className="backdrop-blur bg-background/85"
            >
              {product.badge}
            </Badge>
          )}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleWish}
                disabled={pendingWish}
                aria-label="Wishlist"
                className={cn(
                  "absolute right-3 top-3 grid size-9 place-items-center rounded-full border backdrop-blur transition active:scale-90 disabled:cursor-wait disabled:opacity-80",
                  wished
                    ? "bg-rose-500 border-rose-500 text-white shadow-lg"
                    : "bg-background/85 hover:bg-background",
                )}
              >
                {pendingWish ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Heart className={cn("size-4", wished && "fill-current")} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {wished ? "Saved" : "Add to wishlist"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {product.stock <= 0 && (
          <div className="absolute inset-0 grid place-items-center bg-black/55">
            <Badge variant="destructive">Out of stock</Badge>
          </div>
        )}
      </div>

      <CardContent className="p-3 sm:p-4">
        <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {product.brand || product.category || t("store.name")}
        </p>
        <h3 className="mt-1 line-clamp-2 min-h-9 sm:min-h-10 text-[13px] sm:text-sm font-semibold leading-snug">
          <Link to={`/product/${pid}`} onClick={(e) => e.stopPropagation()}>
            {product.title}
          </Link>
        </h3>
        {hasRating && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <RatingStar filled={product.rating} size="3" />
            <span className="inline-flex items-center gap-0.5 text-[11px] sm:text-xs text-muted-foreground">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {product.rating}
              {product.reviews
                ? ` (${product.reviews > 1000 ? `${(product.reviews / 1000).toFixed(1)}k` : product.reviews})`
                : ""}
            </span>
          </div>
        )}
        <div className="mt-2 flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[15px] sm:text-lg font-extrabold tracking-tight tabular-nums truncate">
              {currency(product.price)}
            </p>
            {product.originalPrice != null &&
              product.originalPrice !== product.price && (
                <p className="text-[11px] sm:text-xs text-muted-foreground line-through tabular-nums truncate">
                  {currency(product.originalPrice)}
                </p>
              )}
          </div>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={product.stock <= 0 || pendingAdd}
            className={cn(
              "rounded-xl gap-1.5 transition-all min-h-9 w-full justify-center sm:w-auto disabled:cursor-wait",
              added && "bg-emerald-600 hover:bg-emerald-600",
            )}
          >
            {pendingAdd ? (
              <Loader2 className="size-4 animate-spin" />
            ) : added ? (
              <Check className="size-4" />
            ) : (
              <ShoppingCart className="size-4" />
            )}
            {pendingAdd
              ? t("common.loading")
              : added
                ? t("homepage.card.added")
                : t("homepage.card.add")}
          </Button>
        </div>
      </CardContent>
      <style>{`@keyframes card-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}`}</style>
    </Card>
  );
}

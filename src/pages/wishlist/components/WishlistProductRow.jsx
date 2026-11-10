import React from "react";
import { ShoppingBag, Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { currency } from "@/utils/currency";

export function WishlistProductRow({
  item,
  isSelected = false,
  onToggleSelect = () => {},
  onRemove = () => {},
  onAddToCart = () => {},
  onNotifyMe = () => {},
  onNavigate = () => {},
}) {
  if (!item) return null;

  const BadgeIcon = item.badge?.icon;

  return (
    <div className="py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition-colors">
      {/* Left Container: Checkbox + Thumbnail + Product Info */}
      <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 flex-1 min-w-0">
        {/* Selection Checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          className="mt-1 sm:mt-0 border-neutral-300 dark:border-neutral-600 data-[state=checked]:bg-neutral-900 data-[state=checked]:text-white dark:data-[state=checked]:bg-white dark:data-[state=checked]:text-black shrink-0 w-4 h-4 rounded-sm"
        />

        {/* Product Image Thumbnail */}
        <div
          onClick={onNavigate}
          className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-900 shrink-0 border border-neutral-200 dark:border-neutral-800/90 cursor-pointer"
        >
          <img
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>

        {/* Product Details */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 font-medium mb-0.5 tracking-normal">
            {item.brand}
          </p>
          <h3
            onClick={onNavigate}
            className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer transition-colors leading-tight mb-1"
          >
            {item.title}
          </h3>

          {/* Variant, Stock Status & Saved Date */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{item.variant}</span>
            <span className="text-neutral-300 dark:text-neutral-600">•</span>

            {/* Stock status with indicator dot */}
            <span className="inline-flex items-center gap-1.5">
              {item.stockStatus === "in_stock" && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              )}
              {item.stockStatus === "low_stock" && (
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              )}
              <span
                className={cn(
                  item.stockStatus === "in_stock" && "text-neutral-700 dark:text-neutral-300",
                  item.stockStatus === "low_stock" && "text-amber-600 dark:text-amber-400 font-medium",
                  item.stockStatus === "out_of_stock" && "text-neutral-400 dark:text-neutral-400"
                )}
              >
                {item.stockLabel}
              </span>
            </span>

            <span className="text-neutral-300 dark:text-neutral-600">•</span>
            <span>{item.savedDate}</span>
          </div>

          {/* Tag Badges */}
          {item.badge && (
            <div className="mt-2">
              {item.badge.type === "price_drop" && (
                <Badge className="bg-emerald-50 dark:bg-emerald-950/90 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950 text-[11px] font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 shadow-none">
                  {BadgeIcon && <BadgeIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                  {item.badge.label}
                </Badge>
              )}
              {item.badge.type === "almost_gone" && (
                <Badge className="bg-amber-50 dark:bg-amber-950/90 border border-amber-200 dark:border-amber-800/80 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950 text-[11px] font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 shadow-none">
                  {BadgeIcon && <BadgeIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                  {item.badge.label}
                </Badge>
              )}
              {item.badge.type === "back_in_stock" && (
                <Badge className="bg-purple-50 dark:bg-purple-950/90 border border-purple-200 dark:border-purple-800/80 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-950 text-[11px] font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 shadow-none">
                  {BadgeIcon && <BadgeIcon className="w-3 h-3 text-purple-600 dark:text-purple-400" />}
                  {item.badge.label}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Container: Price & Action Buttons */}
      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-200/50 dark:border-neutral-800/40 shrink-0">
        {/* Price Display */}
        <div className="flex items-baseline gap-1.5">
          {item.originalPrice && (
            <span className="text-xs text-neutral-400 dark:text-neutral-500 line-through font-normal">
              {currency(item.originalPrice)}
            </span>
          )}
          <span className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white tracking-tight">
            {currency(item.price)}
          </span>
        </div>

        {/* Action Buttons: Add to Cart / Notify Me + Remove Button */}
        <div className="flex items-center gap-2">
          {item.inStock ? (
            <Button
              variant="outline"
              onClick={onAddToCart}
              className="bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900 dark:bg-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:text-white text-xs font-semibold rounded-lg h-8 px-3.5 gap-1.5 transition-colors shadow-none"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Add to Cart
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={onNotifyMe}
              className="bg-white hover:bg-neutral-100 text-neutral-900 border-neutral-300 dark:bg-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:text-white text-xs font-semibold rounded-lg h-8 px-3.5 gap-1.5 transition-colors shadow-none"
            >
              <Bell className="w-3.5 h-3.5" />
              Notify Me
            </Button>
          )}

          {/* Remove X Action */}
          <button
            onClick={onRemove}
            aria-label="Remove item"
            className="text-neutral-400 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/60 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default WishlistProductRow;

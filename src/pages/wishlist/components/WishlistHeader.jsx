import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { currency } from "@/utils/currency";

export function WishlistHeader({ itemCount = 0, stats = {} }) {
  const { priceDropCount = 0, backInStockCount = 0, almostGoneCount = 0, totalSavings = 0 } = stats;

  return (
    <div>
      {/* Breadcrumb Header */}
      <Breadcrumb className="mb-5">
        <BreadcrumbList className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
          <BreadcrumbItem>
            <BreadcrumbLink
              asChild
              className="hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-neutral-500 dark:text-neutral-400"
            >
              <Link to="/search">Shop</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="text-neutral-400 dark:text-neutral-600">
            <ChevronRight className="w-3.5 h-3.5" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage className="text-neutral-900 dark:text-white font-medium">
              Wishlist
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Top Header Title & Continue Shopping */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Saved For Later
          </h1>
          <span className="text-sm text-neutral-500 dark:text-neutral-400 font-normal">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        <Link
          to="/search"
          className="text-sm font-medium text-neutral-900 hover:text-neutral-600 dark:text-white dark:hover:text-neutral-300 transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto group"
        >
          Continue Shopping
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* Highlights & Stats Bar */}
      {itemCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          {priceDropCount > 0 && (
            <>
              <span>{priceDropCount} price drop</span>
              <span className="text-neutral-300 dark:text-neutral-600">•</span>
            </>
          )}
          {backInStockCount > 0 && (
            <>
              <span>{backInStockCount} back in stock</span>
              <span className="text-neutral-300 dark:text-neutral-600">•</span>
            </>
          )}
          {almostGoneCount > 0 && (
            <>
              <span>{almostGoneCount} almost gone</span>
              <span className="text-neutral-300 dark:text-neutral-600">•</span>
            </>
          )}
          {totalSavings > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              Total savings {currency(totalSavings)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default WishlistHeader;

import React, { memo } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectLabel } from "@radix-ui/react-select";
import { currency } from "@/utils/currency";
import { useStore } from "../useSearchStore";
import { useTranslation } from "react-i18next";

function FilterContent({
  showFilters,
  categories,
  selectedCategory,
  setSelectedCategory,
  priceRange,
  setPriceRange,
  minRating,
  setMinRating,
  showOnlyInStock,
  setShowOnlyInStock,
  className,
}) {
  const { t } = useTranslation();
  const { fixedPriceRange } = useStore();

  return (
    <div>
      <div
        className={cn(
          `space-y-6 px-6 ${showFilters ? "block" : " lg:block"}`,
          className,
        )}
      >
        {/* Category Filter */}
        <div>
          <Label className="text-sm font-medium mb-3 block">{t("search.categories")}</Label>
          <Select
            defaultValue="all"
            value={selectedCategory}
            onValueChange={setSelectedCategory}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("search.allCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-muted-foreground p-1">
                  {t("search.categories")}
                </SelectLabel>
                <SelectItem value="all">{t("search.allCategories")}</SelectItem>
                {categories.length === 0 ? (
                  <SelectLabel className="text-muted-foreground p-1">
                    {t("categories.noCategories")}
                  </SelectLabel>
                ) : (
                  categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Price Range Filter */}
        <div>
          <Label className="text-sm font-medium mb-3 block">
            {t("search.priceRange")}: {currency(priceRange[0])} - {currency(priceRange[1])}
          </Label>
          <Slider
            value={priceRange}
            onValueChange={setPriceRange}
            max={fixedPriceRange[1]}
            min={fixedPriceRange[0]}
            step={(fixedPriceRange[1] - fixedPriceRange[0]) / 100}
            className="w-full"
            dualThumb={true}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{currency(priceRange[0])}</span>
            <span>{currency(priceRange[1])}</span>
          </div>
        </div>

        {/* Rating Filter */}
        <div>
          <Label className="text-sm font-medium mb-3 block">
            {t("search.minRating")}
          </Label>
          <RadioGroup
            value={minRating}
            onValueChange={setMinRating}
            className="space-y-2"
          >
            {[4, 3, 2, 1, 0].map((rating) => (
              <div key={rating} className="flex items-center space-x-2">
                <RadioGroupItem value={rating} id={`rating-${rating}`} />
                <Label
                  htmlFor={`rating-${rating}`}
                  className="flex items-center space-x-1"
                >
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={16}
                        className={
                          star <= (rating || 5)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
                        }
                      />
                    ))}
                  </div>
                  <span className="text-sm">
                    {rating === 0 ? t("search.allRatings") : `${rating} ${t("search.andAbove")}`}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* In Stock Filter */}
        <div className="flex items-center space-x-2 mb-3">
          <Checkbox
            id="in-stock"
            checked={showOnlyInStock}
            onCheckedChange={setShowOnlyInStock}
          />
          <Label htmlFor="in-stock" className="text-sm cursor-pointer">
            {t("search.inStockOnly")}
          </Label>
        </div>
      </div>
    </div>
  );
}

export default memo(FilterContent);

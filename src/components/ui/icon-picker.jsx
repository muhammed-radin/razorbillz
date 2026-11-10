"use client";
import * as React from "react";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AppIcon, ICON_REGISTRY, ICON_SEARCH_DATA } from "@/lib/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVirtualizer } from "@tanstack/react-virtual";
import Fuse from "fuse.js";
import { useDebounceValue } from "usehooks-ts";

const COLS = 5;
const ICON_CELL = 40;
const CATEGORY_ROW = 25;

/* Icon metadata lives in the curated registry (src/lib/icons.jsx) so the
 * picker never pulls in lucide's full dynamic icon map — that map turned every
 * icon into its own network request and stalled first paint. */
const IconRenderer = React.memo(({ name }) => {
  return <Icon name={name} />;
});
IconRenderer.displayName = "IconRenderer";

const IconPicker = React.forwardRef(
  (
    {
      value,
      defaultValue,
      onValueChange,
      open,
      defaultOpen,
      onOpenChange,
      children,
      searchable = true,
      searchPlaceholder = "Search for an icon...",
      triggerPlaceholder = "Select an icon",
      iconsList,
      categorized = true,
      modal = false,
      zIndex,
      ...props
    },
    ref,
  ) => {
    const [selectedIcon, setSelectedIcon] = useState(defaultValue);
    const [isOpen, setIsOpen] = useState(defaultOpen || false);
    const [search, setSearch] = useDebounceValue("", 100);

    const iconsToUse = useMemo(
      () => iconsList || ICON_SEARCH_DATA,
      [iconsList],
    );

    const fuseInstance = useMemo(() => {
      return new Fuse(iconsToUse, {
        keys: ["name", "tags", "categories"],
        threshold: 0.3,
        ignoreLocation: true,
        includeScore: true,
      });
    }, [iconsToUse]);

    const filteredIcons = useMemo(() => {
      if (search.trim() === "") {
        return iconsToUse;
      }

      const results = fuseInstance.search(search.toLowerCase().trim());
      return results.map((result) => result.item);
    }, [search, iconsToUse, fuseInstance]);

    const categorizedIcons = useMemo(() => {
      if (!categorized || search.trim() !== "") {
        return [{ name: "All Icons", icons: filteredIcons }];
      }

      const categories = new Map();

      filteredIcons.forEach((icon) => {
        const list =
          icon.categories && icon.categories.length > 0
            ? icon.categories
            : ["Other"];
        list.forEach((category) => {
          if (!categories.has(category)) {
            categories.set(category, []);
          }
          categories.get(category).push(icon);
        });
      });

      return Array.from(categories.entries())
        .map(([name, icons]) => ({ name, icons }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }, [filteredIcons, categorized, search]);

    const virtualItems = useMemo(() => {
      const items = [];

      categorizedIcons.forEach((category, categoryIndex) => {
        items.push({ type: "category", categoryIndex });

        for (let i = 0; i < category.icons.length; i += COLS) {
          items.push({
            type: "row",
            categoryIndex,
            icons: category.icons.slice(i, i + COLS),
          });
        }
      });

      return items;
    }, [categorizedIcons]);

    const categoryIndices = useMemo(() => {
      const indices = {};

      virtualItems.forEach((item, index) => {
        if (item.type === "category") {
          indices[categorizedIcons[item.categoryIndex].name] = index;
        }
      });

      return indices;
    }, [virtualItems, categorizedIcons]);

    const parentRef = React.useRef(null);

    const virtualizer = useVirtualizer({
      count: virtualItems.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (index) =>
        virtualItems[index]?.type === "category" ? CATEGORY_ROW : ICON_CELL,
      paddingEnd: 2,
      gap: 10,
      overscan: 5,
    });

    // Popover content is mounted while hidden, so the virtualizer can measure
    // a zero-height container on the first open. Re-measure after it becomes
    // visible so the initial icon list is populated.
    useEffect(() => {
      if (!(open ?? isOpen)) return undefined;

      const frame = requestAnimationFrame(() => {
        virtualizer.measure();
      });

      return () => cancelAnimationFrame(frame);
    }, [open, isOpen, virtualItems.length, virtualizer]);

    const handleValueChange = useCallback(
      (icon) => {
        if (value === undefined) {
          setSelectedIcon(icon);
        }
        onValueChange?.(icon);
      },
      [value, onValueChange],
    );

    const handleOpenChange = useCallback(
      (newOpen) => {
        setSearch("");
        if (open === undefined) {
          setIsOpen(newOpen);
        }
        onOpenChange?.(newOpen);
      },
      [open, onOpenChange, setSearch],
    );

    const handleIconClick = useCallback(
      (iconName) => {
        handleValueChange(iconName);
        setIsOpen(false);
        setSearch("");
      },
      [handleValueChange, setSearch],
    );

    const handleSearchChange = useCallback(
      (e) => {
        setSearch(e.target.value);

        if (parentRef.current) {
          parentRef.current.scrollTop = 0;
        }

        virtualizer.scrollToOffset(0);
      },
      [virtualizer, setSearch],
    );

    const scrollToCategory = useCallback(
      (categoryName) => {
        const categoryIndex = categoryIndices[categoryName];

        if (categoryIndex !== undefined && virtualizer) {
          virtualizer.scrollToIndex(categoryIndex, {
            align: "start",
            behavior: "smooth",
          });
        }
      },
      [categoryIndices, virtualizer],
    );

    const categoryButtons = useMemo(() => {
      if (!categorized || search.trim() !== "") return null;

      return categorizedIcons.map((category) => (
        <Button
          key={category.name}
          variant={"outline"}
          size="sm"
          className="text-xs"
          onClick={(e) => {
            e.stopPropagation();
            scrollToCategory(category.name);
          }}
        >
          {category.name.charAt(0).toUpperCase() + category.name.slice(1)}
        </Button>
      ));
    }, [categorizedIcons, scrollToCategory, categorized, search]);

    const renderIcon = useCallback(
      (icon) => (
        <TooltipProvider key={icon.name}>
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label={icon.name}
              className={cn(
                "p-2 rounded-md border hover:bg-foreground/10 transition",
                "flex items-center justify-center",
              )}
              onClick={() => handleIconClick(icon.name)}
            >
              <IconRenderer name={icon.name} />
            </TooltipTrigger>
            <TooltipContent>
              <p>{icon.name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      [handleIconClick],
    );

    return (
      <Popover
        open={open ?? isOpen}
        onOpenChange={handleOpenChange}
        modal={modal}
        zIndex={zIndex}
        className={cn("z-[400]", props.className)}
      >
        <PopoverTrigger ref={ref} asChild {...props}>
          {children || (
            <Button variant="outline">
              {value || selectedIcon ? (
                <>
                  <Icon name={value || selectedIcon} /> {value || selectedIcon}
                </>
              ) : (
                triggerPlaceholder
              )}
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          {searchable && (
            <Input
              placeholder={searchPlaceholder}
              onChange={handleSearchChange}
              className="mb-2"
            />
          )}
          {categorized && search.trim() === "" && (
            <div className="flex flex-row gap-1 mt-2 overflow-x-auto pb-2">
              {categoryButtons}
            </div>
          )}
          <div
            ref={parentRef}
            className="max-h-60 overflow-auto"
            style={{ scrollbarWidth: "thin" }}
          >
            {filteredIcons.length === 0 || virtualItems.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                No icon found
              </div>
            ) : (
              <div
                className="relative w-full overscroll-contain"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const item = virtualItems[virtualItem.index];

                  if (!item) return null;

                  const itemStyle = {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  };

                  if (item.type === "category") {
                    return (
                      <div
                        key={virtualItem.key}
                        style={itemStyle}
                        className="top-0 bg-secondary z-10"
                      >
                        <h3 className="font-medium text-sm capitalize">
                          {categorizedIcons[item.categoryIndex].name}
                        </h3>
                        <div className="h-[1px] bg-foreground/10 w-full" />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      style={itemStyle}
                    >
                      <div className="grid grid-cols-5 gap-2 w-full">
                        {item.icons.map(renderIcon)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
IconPicker.displayName = "IconPicker";

const Icon = React.forwardRef(({ name, ...props }, ref) => {
  const Component = ICON_REGISTRY[name] || AppIcon;
  if (Component === AppIcon) {
    return <AppIcon name={name} ref={ref} {...props} />;
  }
  return <Component ref={ref} {...props} />;
});
Icon.displayName = "Icon";

export { IconPicker, Icon };

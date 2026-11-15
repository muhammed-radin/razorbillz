import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared star rating display/input.
 *
 * Read-only mode renders a compact summary; interactive mode renders
 * one button per star with hover preview and accessible pressed state.
 */
export function ReviewRatingStars({
  value = 0,
  onChange,
  readOnly = false,
  size = "size-4",
  className,
}) {
  const [hovered, setHovered] = useState(0);
  const active = readOnly ? value : hovered || value;

  if (readOnly) {
    return (
      <div
        className={cn("flex items-center gap-0.5", className)}
        aria-label={`Rated ${value} out of 5`}
        role="img"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            aria-hidden="true"
            className={cn(
              size,
              star <= value
                ? "fill-foreground text-foreground"
                : "fill-transparent text-muted-foreground/50",
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(0)}
          aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
          aria-pressed={value === star}
          className="cursor-pointer rounded-full p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            aria-hidden="true"
            className={cn(
              size,
              star <= active
                ? "fill-foreground text-foreground"
                : "fill-transparent text-muted-foreground/60",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export default ReviewRatingStars;

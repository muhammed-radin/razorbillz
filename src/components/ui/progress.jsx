import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef(({ className, value = 0, max = 100, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    value={value}
    max={max}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{
        transform: `translateX(-${
          100 - (Number(value) / Math.max(Number(max), 1)) * 100
        }%)`,
      }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

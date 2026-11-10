import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

/**
 * Enhanced Password Strength meter with animated bars & requirement checklist.
 * Compact & responsive to fit mobile viewport heights.
 */
export function PasswordStrength({ password = "", className }) {
  const requirements = useMemo(() => {
    return [
      {
        id: "length",
        label: "At least 8 chars",
        met: password.length >= 8,
      },
      {
        id: "uppercase",
        label: "Uppercase letter",
        met: /[A-Z]/.test(password),
      },
      {
        id: "lowercase",
        label: "Lowercase letter",
        met: /[a-z]/.test(password),
      },
      {
        id: "number",
        label: "One number",
        met: /[0-9]/.test(password),
      },
      {
        id: "special",
        label: "Special char (@$!%*?&#)",
        met: /[@$!%*?&#]/.test(password),
      },
    ];
  }, [password]);

  const score = useMemo(() => {
    return requirements.filter((r) => r.met).length;
  }, [requirements]);

  const strengthDetails = useMemo(() => {
    switch (score) {
      case 0:
      case 1:
        return { label: "Very Weak", color: "bg-red-500", text: "text-red-500" };
      case 2:
        return { label: "Weak", color: "bg-orange-500", text: "text-orange-500" };
      case 3:
        return { label: "Moderate", color: "bg-yellow-500", text: "text-yellow-500" };
      case 4:
        return { label: "Strong", color: "bg-emerald-500", text: "text-emerald-500" };
      case 5:
        return { label: "Very Strong", color: "bg-green-600", text: "text-green-600" };
      default:
        return { label: "", color: "bg-muted", text: "text-muted-foreground" };
    }
  }, [score]);

  if (!password) return null;

  return (
    <div className={cn("mt-1.5 space-y-1.5 text-xs animate-[auth-fade-in_0.2s_ease-out]", className)} aria-live="polite">
      {/* 5-Segment Progress Bar */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-medium">
          <span className="text-muted-foreground">Strength</span>
          <span className={cn("font-semibold transition-colors duration-200", strengthDetails.text)}>
            {strengthDetails.label}
          </span>
        </div>
        <div className="flex h-1 w-full gap-1 rounded-full overflow-hidden">
          {[1, 2, 3, 4, 5].map((level) => (
            <div
              key={level}
              className={cn(
                "h-full flex-1 rounded-full transition-all duration-300",
                level <= score ? strengthDetails.color : "bg-muted/70"
              )}
            />
          ))}
        </div>
      </div>

      {/* Requirement Checklist */}
      <div className="grid grid-cols-2 gap-1 pt-0.5">
        {requirements.map((req) => (
          <div
            key={req.id}
            className={cn(
              "flex items-center gap-1 text-[10px] sm:text-[11px] transition-colors duration-200",
              req.met ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground/75"
            )}
          >
            <div
              className={cn(
                "flex h-3 w-3 shrink-0 items-center justify-center rounded-full transition-all duration-200",
                req.met
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground/50"
              )}
            >
              {req.met ? <Check className="h-2 w-2 stroke-[2.5]" /> : <X className="h-1.5 w-1.5" />}
            </div>
            <span className="truncate">{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PasswordStrength;

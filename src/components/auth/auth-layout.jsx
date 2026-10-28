import { Link } from "react-router-dom";
import { StoreMeta } from "@/components/store-meta";
import { ArrowLeft, CheckCircle2, Shield, Zap, Sparkles } from "lucide-react";

/**
 * AuthLayout for Login & Signup.
 * Features:
 * - Left Hero: Pure, clean, and distraction-free dark showcase panel with elegant typography.
 *   Zero background shapes, zero distracting animations.
 * - Viewport fitting: Screen height bounded on both desktop and mobile (`h-dvh max-h-dvh`).
 * - Full responsive layout with accessibility landmarks and SEO.
 */
export function AuthLayout({
  title,
  subtitle,
  seoTitle,
  type = "login",
  children,
}) {
  const isLogin = type === "login";

  return (
    <>
      <StoreMeta title={seoTitle || title} noIndex />

      <div className="h-dvh max-h-dvh w-full flex flex-col lg:flex-row bg-background overflow-hidden">
        {/* ── LEFT SHOWCASE PANEL (Abstract 45°/-45° Shapes & Clean Typography) ── */}
        <aside
          aria-label="Brand showcase"
          className="
            hidden lg:flex lg:w-[46%] xl:w-[48%] h-full max-h-dvh
            relative overflow-hidden flex-col justify-between
            p-8 xl:p-12
            bg-zinc-950 text-zinc-100
            border-r border-border/40 select-none
          "
        >
          {/* Top Brand Header */}
          <div className="relative z-10 flex items-center justify-between">
            <Link
              to="/"
              className="group flex items-center gap-2.5 transition-opacity hover:opacity-85"
              title="Return to RazorBillz Home"
            >
              <img
                src="/logo.svg"
                alt="RazorBillz"
                className="w-7 h-7 object-contain"
              />
              <span className="font-semibold text-base tracking-tight text-white font-[Bakbak_One]">
                RazorBillz
              </span>
            </Link>

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors py-1.5 px-3 rounded-full hover:bg-white/5 border border-transparent hover:border-white/10"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Store</span>
            </Link>
          </div>

          {/* Center Minimal Typography & Benefits */}
          <div className="relative z-10 my-auto py-6 max-w-md space-y-6 animate-[auth-fade-in_0.5s_ease-out]">
            {/* Pill tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-border/40 text-zinc-300 text-xs font-medium shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Smarter Electronics Shopping</span>
            </div>

            {/* Title & Description */}
            <div className="space-y-2.5">
              <h2 className="text-2xl xl:text-3xl font-bold tracking-tight text-white leading-tight">
                {isLogin
                  ? "Welcome back to your tech sanctuary."
                  : "Everything you need, engineered for precision."}
              </h2>

              <p className="text-zinc-400 text-xs xl:text-sm leading-relaxed">
                {isLogin
                  ? "Sign in to track orders, manage preferences, and access exclusive member deals."
                  : "Create an account in seconds to unlock member pricing, live package tracking, and 1-click checkout."}
              </p>
            </div>

            {/* 3 Clean points */}
            <div className="space-y-3 pt-1">
              <div className="flex items-start gap-3 text-xs xl:text-sm text-zinc-300">
                <div className="mt-0.5 p-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-medium text-white">
                    Express Dispatch
                  </span>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Fast doorstep delivery with live tracking on every order.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs xl:text-sm text-zinc-300">
                <div className="mt-0.5 p-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-medium text-white">
                    Genuine & Protected
                  </span>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    100% authentic products backed by official warranties.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs xl:text-sm text-zinc-300">
                <div className="mt-0.5 p-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-medium text-white">
                    Encrypted & Private
                  </span>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    End-to-end 256-bit AES encryption protecting your personal
                    data.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Footer Info */}
          <div className="relative z-10 pt-4 border-t border-border/30 flex items-center justify-between text-xs text-zinc-500">
            <span>© {new Date().getFullYear()} RazorBillz</span>
            <span>256-bit SSL Encrypted</span>
          </div>
        </aside>

        {/* ── RIGHT FORM PANEL (Fitted to Screen Height on Mobile & Desktop) ── */}
        <main
          role="main"
          className="
            flex-1 h-full max-h-dvh
            flex flex-col justify-between
            px-4 py-3 sm:px-8 sm:py-5 lg:px-12 xl:px-14
            bg-background
            overflow-y-auto
            max-sm:px-6
          "
        >
          {/* Top navigation row */}
          <div className="w-full max-w-md mx-auto flex items-center justify-between pb-2 sm:pb-3 shrink-0">
            <Link
              to="/"
              className="hidden max-lg:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Store</span>
            </Link>

            <div className="lg:hidden">
              <Link to="/" className="flex items-center gap-1.5">
                <img
                  src="/logo.svg"
                  alt="RazorBillz"
                  className="w-5 h-5 object-contain"
                />
                <span className="font-bold text-xs tracking-tight font-[Bakbak_One]">
                  RazorBillz
                </span>
              </Link>
            </div>
          </div>

          {/* Form Container (compact, centered) */}
          <div className="w-full max-w-md mx-auto my-auto py-1 sm:py-2">
            {/* Header Titles */}
            <div className="space-y-1 mb-3 sm:mb-4">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                  {subtitle}
                </p>
              )}
            </div>

            {/* Child content (Form, Google auth, divider, inputs, etc.) */}
            <div>{children}</div>
          </div>

          {/* Footer security & policies */}
          <div className="w-full max-w-md mx-auto pt-2.5 sm:pt-3 border-t border-border/40 text-center space-y-1 shrink-0">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>
                Encrypted with 256-bit SSL • Official RazorBillz Portal
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground/80 leading-tight">
              By continuing, you agree to RazorBillz’s{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </main>
      </div>
    </>
  );
}

export default AuthLayout;

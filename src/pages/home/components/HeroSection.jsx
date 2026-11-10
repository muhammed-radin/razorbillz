import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  MapPin,
  Search,
  ShieldCheck,
  Truck,
  Zap,
  Store,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoreInfo } from "@/utils/store";
import { useState } from "react";
import { Reveal } from "./Reveal";

function FloatingChip({ className = "", children, delay = "0s" }) {
  return (
    <div
      className={`absolute z-20 animate-[hero-float_5s_ease-in-out_infinite] ${className}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

export default function HeroSection({ featured, loading }) {
  const { t } = useTranslation();
  const store = useStoreInfo();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const heroProduct = featured?.[0];

  return (
    <section className="relative overflow-hidden">
      {/* backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.08),transparent_70%)] dark:bg-[radial-gradient(60%_50%_at_50%_0%,rgba(255,255,255,0.08),transparent_70%)]" />
      <div className="absolute inset-0 hero-grid-pattern opacity-70" />
      {/* <div className="absolute -top-24 -left-24 size-72 rounded-full bg-emerald-400/20 blur-3xl animate-pulse" /> */}
      {/* <div className="absolute top-20 -right-24 size-80 rounded-full bg-violet-500/20 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} /> */}
      {/* <div className="absolute bottom-0 left-1/3 size-64 rounded-full bg-amber-400/15 blur-3xl" /> */}

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 lg:pt-16 pb-10 sm:pb-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Copy */}
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 backdrop-blur px-3 py-1.5 text-xs font-medium shadow-sm">
                <BadgeCheck className="size-3.5 text-emerald-600" />
                <span>{t("homepage.hero.badge")}</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-muted-foreground">
                  <MapPin className="size-3" /> {store.address.city} ·{" "}
                  {store.address.state}
                </span>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <h1 className="mt-5 text-[2.4rem] leading-[1.02] sm:text-6xl lg:text-[4.4rem] font-extrabold tracking-tight">
                {t("homepage.hero.titleA")}
                <span className="block bg-gradient-to-r from-emerald-500 via-teal-500 to-violet-500 bg-clip-text text-transparent">
                  {t("homepage.hero.titleB")}
                </span>
                {t("homepage.hero.titleC")}
              </h1>
            </Reveal>

            <Reveal delay={170}>
              <p className="mt-4 max-w-xl text-sm sm:text-lg text-muted-foreground leading-relaxed">
                {t("homepage.hero.subtitle")}
              </p>
            </Reveal>

            <Reveal delay={240}>
              <form
                className="mt-6 flex max-w-xl items-center gap-2 rounded-2xl border bg-background/90 backdrop-blur p-2 shadow-lg shadow-black/5 focus-within:ring-2 focus-within:ring-primary/30"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(
                    q.trim()
                      ? `/search?q=${encodeURIComponent(q.trim())}`
                      : "/search",
                  );
                }}
              >
                <Search className="ml-2 size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("homepage.hero.searchPlaceholder")}
                  className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm sm:text-base"
                />
                <Button
                  type="submit"
                  className="rounded-xl px-4 sm:px-6 shrink-0"
                >
                  {t("common.search")}
                </Button>
              </form>
            </Reveal>

            <Reveal delay={310}>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Button size="lg" className="rounded-2xl px-7 group" asChild>
                  <Link to="/search">
                    {t("homepage.hero.shopTrending")}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-2xl px-7"
                  asChild
                >
                  <Link to="/categories">
                    {t("homepage.hero.browseCategories")}
                  </Link>
                </Button>
              </div>
            </Reveal>

            <Reveal delay={380}>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs sm:text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Truck className="size-4 text-emerald-600" />{" "}
                  {t("homepage.hero.trustDispatch")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-600" />{" "}
                  {t("homepage.hero.trustGenuine")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-emerald-600" />{" "}
                  {t("homepage.hero.trustGst")}
                </span>
              </div>
            </Reveal>
          </div>

          {/* Visual composition — live catalogue product only */}
          <Reveal delay={200} y={32} className="relative">
            <div className="relative mx-auto w-full max-w-[520px]">
              <div className="absolute inset-0 -z-0 rounded-[2rem] bg-gradient-to-br from-emerald-500/25 via-teal-500/10 to-violet-500/25 blur-2xl" />
              <div className="relative overflow-hidden rounded-[1.8rem] border bg-card shadow-2xl">
                {loading ? (
                  <div className="p-4">
                    <Skeleton className="aspect-[4/3.4] w-full rounded-2xl" />
                    <div className="grid grid-cols-3 gap-2 pt-4">
                      <Skeleton className="h-10 rounded-xl" />
                      <Skeleton className="h-10 rounded-xl" />
                      <Skeleton className="h-10 rounded-xl" />
                    </div>
                  </div>
                ) : heroProduct ? (
                  <>
                    <div className="relative aspect-[4/3.4]">
                      <img
                        src={heroProduct.thumbnail}
                        alt={heroProduct.title}
                        width="800"
                        height="680"
                        fetchPriority="high"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <div className="absolute top-3 left-3 flex gap-2">
                        <Badge className="bg-white/95 text-black hover:bg-white text-[11px]">
                          <Zap className="size-3 mr-1" />{" "}
                          {t("homepage.hero.featured")}
                        </Badge>
                        {heroProduct.category && (
                          <Badge
                            variant="secondary"
                            className="backdrop-blur bg-black/40 text-white border-white/20 text-[11px]"
                          >
                            {heroProduct.category}
                          </Badge>
                        )}
                      </div>
                      <div className="absolute bottom-0 inset-x-0 p-4 sm:p-5 flex items-end justify-between gap-3">
                        <div className="text-white min-w-0">
                          <p className="text-[11px] uppercase tracking-widest text-white/70">
                            {t("homepage.hero.featured")}
                          </p>
                          <p className="font-bold leading-tight line-clamp-2 text-sm sm:text-lg max-w-[280px]">
                            {heroProduct.title}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="rounded-xl shrink-0"
                          asChild
                        >
                          <Link to={`/product/${heroProduct.id}`}>
                            {t("homepage.hero.view")}
                          </Link>
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 divide-x border-t bg-background/80 backdrop-blur text-center">
                      {[
                        {
                          k: t("homepage.hero.statGenuine"),
                          v: t("homepage.hero.statStock"),
                        },
                        {
                          k: t("homepage.hero.statFast"),
                          v: t("homepage.hero.statDispatch"),
                        },
                        {
                          k: t("homepage.hero.statReturns"),
                          v: t("homepage.hero.statReturnsLabel"),
                        },
                      ].map((s) => (
                        <div key={s.v} className="py-3">
                          <p className="font-extrabold text-sm sm:text-base">
                            {s.k}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {s.v}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-center px-8 py-14">
                    <span className="grid size-14 place-items-center rounded-3xl bg-muted">
                      <Store className="size-7 text-muted-foreground" />
                    </span>
                    <h2 className="mt-5 text-xl font-extrabold tracking-tight">
                      {t("homepage.hero.emptyTitle")}
                    </h2>
                    <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                      {t("homepage.hero.emptyDesc")}
                    </p>
                    <Button className="mt-5 rounded-xl" asChild>
                      <Link to="/search">
                        {t("homepage.hero.exploreStore")}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>

              {heroProduct && (
                <>
                  <FloatingChip
                    className="-left-3 sm:-left-8 top-10"
                    delay="0.6s"
                  >
                    <div className="flex items-center gap-2 rounded-2xl border bg-background/95 backdrop-blur px-3 py-2 shadow-xl">
                      <span className="grid size-8 place-items-center rounded-xl bg-emerald-500/15">
                        <BadgeCheck className="size-4 text-emerald-600" />
                      </span>
                      <div className="text-left">
                        <p className="text-xs font-bold leading-none">
                          {t("homepage.hero.genuineStock")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("homepage.hero.gstInvoice")}
                        </p>
                      </div>
                    </div>
                  </FloatingChip>
                  <FloatingChip
                    className="-right-2 sm:-right-6 bottom-24"
                    delay="1.8s"
                  >
                    <div className="flex items-center gap-2 rounded-2xl border bg-background/95 backdrop-blur px-3 py-2 shadow-xl">
                      <span className="grid size-8 place-items-center rounded-xl bg-amber-500/15">
                        <Truck className="size-4 text-amber-600" />
                      </span>
                      <div className="text-left">
                        <p className="text-xs font-bold leading-none">
                          {t("homepage.hero.keralaDelivery")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("homepage.hero.allDistricts")}
                        </p>
                      </div>
                    </div>
                  </FloatingChip>
                </>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, SectionHeading } from "./Reveal";
import ProductCard from "./ProductCard";

export function ProductRail({ products, loading }) {
  const ref = useRef(null);
  const scrollBy = (dir) =>
    ref.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  if (loading) {
    return (
      <div className="flex gap-3 sm:gap-4 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="w-[200px] shrink-0 space-y-2 sm:w-[260px]">
            <Skeleton className="aspect-square rounded-3xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!products?.length) return null;

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p, i) => (
          <div
            key={p.id || p.productId || i}
            className="w-[200px] sm:w-[260px] shrink-0 snap-start"
          >
            <ProductCard product={p} index={i} />
          </div>
        ))}
      </div>
      <div className="hidden md:flex gap-2 absolute -top-16 right-0">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={() => scrollBy(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={() => scrollBy(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export default function FeaturedProducts({ products, loading }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("all");
  const tabs = useMemo(() => {
    const cats = [
      ...new Set((products || []).map((p) => p.category).filter(Boolean)),
    ].slice(0, 5);
    return ["all", ...cats];
  }, [products]);

  const filtered = useMemo(() => {
    if (!products?.length) return [];
    if (tab === "all") return products;
    return products.filter((p) => p.category === tab);
  }, [products, tab]);

  if (!loading && (!products || products.length === 0)) return null;

  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <SectionHeading
          eyebrow={t("homepage.featured.eyebrow")}
          title={t("homepage.featured.title")}
          description={t("homepage.featured.description")}
          action={
            <Button variant="ghost" className="rounded-xl" asChild>
              <Link to="/search">
                {t("homepage.featured.viewAll")}{" "}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
        <Reveal delay={100}>
          {tabs.length > 1 && (
            <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
              <span className="mr-1 hidden sm:inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-600">
                <Flame className="size-3.5" /> {t("homepage.featured.hot")}
              </span>
              <Tabs value={tab} onValueChange={setTab}>
                {/* Filter-only control: there is no tab panel, so drop the
                 * dangling `aria-controls` Radix would otherwise emit. */}
                <TabsList className="h-auto rounded-2xl p-1">
                  {tabs.map((tb) => (
                    <TabsTrigger
                      key={tb}
                      value={tb}
                      aria-controls={undefined}
                      className="rounded-xl px-4 py-2 text-xs sm:text-sm capitalize"
                    >
                      {tb === "all" ? t("common.all") : tb}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}
        </Reveal>
        <Reveal delay={150}>
          <ProductRail products={filtered} loading={loading} />
        </Reveal>
      </div>
    </section>
  );
}

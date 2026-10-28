import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { StoreMeta } from "@/components/store-meta";
import { FolderOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { api } from "@/utils/api";
import HeroSection from "./components/HeroSection";
import CategoryShowcase from "./components/CategoryShowcase";
import FeaturedProducts from "./components/FeaturedProducts";
import { ProductRail } from "./components/FeaturedProducts";
import { SectionHeading, Reveal } from "./components/Reveal";

const OfferSection = lazy(() => import("./components/OfferSection"));
const WhyRazorbills = lazy(() => import("./components/WhyRazorbills"));
const RecommendationSection = lazy(
  () => import("./components/RecommendationSection"),
);
const ServiceHighlights = lazy(() => import("./components/ServiceHighlights"));

// Normalize a raw API product into the shape homepage components expect.
// Returns null when the record is missing the essentials (no placeholder filling).
function normalize(p) {
  if (!p) return null;
  const id = p.id || p._id || p.productId;
  const thumbnail =
    p.thumbnail || p.image || (Array.isArray(p.images) ? p.images[0] : null);
  if (!id || !p.title || thumbnail == null || p.price == null) return null;
  const metrics = p.metrics || p.meterics || {};
  return {
    id,
    productId: p.productId || p.id || p._id,
    title: p.title,
    price: Number(p.price),
    originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
    thumbnail,
    image: p.image || thumbnail,
    category: p.category || null,
    brand: p.brand || null,
    rating: Number(p.rating ?? metrics.rating ?? 0) || 0,
    reviews: Number(p.reviews ?? metrics.reviewCount ?? 0) || 0,
    stock: p.stock ?? 0,
    badge: p.badge || (p.specialInfo?.featured ? "Featured" : null),
  };
}

export default function HomePage() {
  const { t } = useTranslation();
  const [latest, setLatest] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const hydrateUserState = async () => {
      const { useCartStore, useWishlistStore } = await import("@/stores/shop");
      useCartStore
        .getState()
        .fetch()
        .catch(() => {});
      useWishlistStore
        .getState()
        .fetch()
        .catch(() => {});
    };
    if (window.requestIdleCallback) {
      const idleId = window.requestIdleCallback(hydrateUserState);
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(hydrateUserState, 1200);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      api.waitForSession(),
      api.client.get("/api/products/feed"),
      api.client.get("/api/categories?limit=12"),
    ]).then(([sessionGot, feed, cats]) => {
      if (!live) return;
      if (feed.status === "fulfilled") {
        const d = feed.value.data || {};
        const l = d.latest || d.products || [];
        const f = d.featured || [];
        setLatest(l.map(normalize).filter(Boolean));
        setFeatured(f.map(normalize).filter(Boolean));
      } else {
        setLoadError(true);
      }
      if (cats.status === "fulfilled") {
        const c = cats.value.data;
        const list = Array.isArray(c) ? c : c?.categories || [];
        setCategories(list.filter((x) => x && (x.name || x.id)));
      }
      setLoading(false);
    });
    const t = setTimeout(() => {
      if (live) setLoading(false);
    }, 8000);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);

  // Live data only — no placeholder products.
  const trending = useMemo(
    () => (featured.length ? featured : latest),
    [featured, latest],
  );
  const newArrivals = useMemo(() => latest, [latest]);
  const dealProduct = useMemo(() => {
    const discounted = trending.filter(
      (p) => p.originalPrice != null && p.originalPrice > p.price,
    );
    const pool = discounted.length ? discounted : trending;
    return [...pool].sort(
      (a, b) => (b.originalPrice || b.price) - (a.originalPrice || a.price),
    )[0];
  }, [trending]);
  const hasProducts = latest.length > 0 || featured.length > 0;

  return (
    <div className="min-h-screen w-full bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <StoreMeta description={t("home.helmetDescription")} />

      <HeroSection featured={trending} loading={loading} />

      <CategoryShowcase categories={categories} loading={loading} />

      <FeaturedProducts products={trending} loading={loading} />

      <Suspense fallback={null}>
        {dealProduct && <OfferSection product={dealProduct} />}

        <WhyRazorbills />

        {/* New arrivals rail — only when the feed has items */}
        {(loading || newArrivals.length > 0) && (
          <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
            <SectionHeading
              eyebrow={t("homepage.arrivals.eyebrow")}
              title={t("homepage.arrivals.title")}
              description={t("homepage.arrivals.description")}
              action={
                <Button variant="outline" className="rounded-xl" asChild>
                  <Link to="/search">
                    {t("homepage.arrivals.shopAll")}{" "}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            />
            <Reveal delay={100}>
              <ProductRail
                products={newArrivals.slice(0, 10)}
                loading={loading}
              />
            </Reveal>
          </section>
        )}

        {!loading && !hasProducts ? (
          <section className="mx-auto max-w-3xl px-4 py-10">
            <Empty className="border rounded-3xl">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOpen />
                </EmptyMedia>
                <EmptyTitle>
                  {loadError
                    ? t("homepage.empty.loadFailed")
                    : t("homepage.empty.noProducts")}
                </EmptyTitle>
                <EmptyDescription>
                  {loadError
                    ? t("homepage.empty.retryHint")
                    : t("homepage.empty.stocking")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center gap-2">
                {loadError ? (
                  <Button onClick={() => window.location.reload()}>
                    {t("homepage.empty.retry")}
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/contact">{t("homepage.empty.contact")}</Link>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link to="/search">{t("homepage.empty.browse")}</Link>
                </Button>
              </EmptyContent>
            </Empty>
          </section>
        ) : (
          trending.length > 0 && <RecommendationSection products={trending} />
        )}

        <ServiceHighlights />
      </Suspense>
    </div>
  );
}

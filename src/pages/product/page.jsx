import React, { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  StarIcon,
  ShoppingCart,
  Heart,
  Share2,
  Minus,
  Plus,
  PackageSearch,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { currency } from "@/utils/currency";
import StyledMd from "@/components/styled-md";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

import HorizontalProductCard from "@/components/horizontal-card/horizontal-card";
import { LoaderScreen } from "@/components/LoaderScreen";
import { api } from "@/utils/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useCartStore, useWishlistStore } from "@/stores/shop";
import { interactionsApi, productsApi } from "@/services/shop";
import { useUserSession } from "@/contexts/user-session-context";
import { ReviewRatingSection } from "@/components/review/review-rating";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { useApiCacheStore } from "@/stores/apiCacheStore";

/* Videos are optional, so the player (Vidstack runtime + CSS) is only fetched
 * on product pages that actually contain one. */
const ProductVideoPlayer = lazy(
  () => import("@/components/product-video-player"),
);

const ProductDetailsPage = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data } = useUserSession();
  const user = data?.user;
  const [selectedMedia, setSelectedMedia] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState(() => {
    const cached = useApiCacheStore.getState().getCache(`product:${id}`);
    return cached?.isValid && cached.data ? cached.data : { loading: true };
  });
  const [similar, setSimilar] = useState(() => {
    const cached = useApiCacheStore.getState().getCache(`products:similar:${id}`);
    return cached?.isValid && Array.isArray(cached.data) ? cached.data : [];
  });
  const [_rating, setRating] = useState(0);
  // Current user's interaction for this product (GET /api/interactions/p/:productId).
  // Null = unknown (logged out / request failed) -> fall back to local stores.
  const [interaction, setInteraction] = useState(() => {
    const cached = useApiCacheStore.getState().getCache(`interaction:${id}`);
    return cached?.isValid && cached.data ? cached.data : null;
  });
  const navigate = useNavigate();
  const addToCart = useCartStore((s) => s.add);
  const toggleWishlist = useWishlistStore((s) => s.toggle);

  const targetProductId = String(product?.productId ?? product?.id ?? id);

  // Reactive Zustand selector: component automatically re-renders when items array updates
  const isWishedInStore = useWishlistStore((s) =>
    s.items?.some((p) => String(p.productId ?? p.id) === targetProductId)
  );

  // Product is wishlisted if present in wishlist store OR recorded on interaction doc
  const hasWishlisted = Boolean(isWishedInStore || interaction?.hasWishlisted);
  const hasShared = Boolean(interaction?.hasShared);

  useStrictEffect(() => {
    if (!id) return;
    setSelectedMedia(0);
    setQuantity(1);

    // Hydrate wishlist items if empty
    if (useWishlistStore.getState().items.length === 0) {
      useWishlistStore.getState().fetch().catch(() => {});
    }

    // If not cached, initiate loading state
    const cachedProduct = useApiCacheStore.getState().getCache(`product:${id}`);
    if (!cachedProduct?.isValid || !cachedProduct.data) {
      setProduct({ loading: true });
    }

    // 1. Fetch product with caching & in-flight deduplication
    useApiCacheStore
      .getState()
      .fetchWithCache(
        `product:${id}`,
        async () => {
          const response = await api.client.get(api.products(id));
          return response.data.products || response.data || null;
        },
        { ttl: 5 * 60 * 1000 }
      )
      .then((data) => {
        setProduct(data);
      })
      .catch((error) => {
        if (error?.response?.status === 404) {
          navigate("/404");
        }
        console.error("Error fetching products:", error);
      });

    // 2. Record visit (throttled) and load user interaction
    interactionsApi
      .visit(id)
      .catch(() => {})
      .finally(() => {
        useApiCacheStore
          .getState()
          .fetchWithCache(
            `interaction:${id}`,
            async () => {
              const data = await interactionsApi.mine(id);
              return data || {};
            },
            { ttl: 60 * 1000 }
          )
          .then((doc) => {
            const nextInteraction = {
              hasViewed: Boolean(doc.hasViewed),
              hasShared: Boolean(doc.hasShared),
              hasWishlisted: Boolean(doc.hasWishlisted),
              rating: doc.rating ?? 0,
            };
            setInteraction(nextInteraction);
            if (typeof doc.rating === "number" && doc.rating > 0) {
              setRating(doc.rating);
            }
          })
          .catch((error) => {
            if (error?.response?.status === 404) {
              setInteraction({
                hasViewed: false,
                hasShared: false,
                hasWishlisted: false,
                rating: 0,
              });
            } else {
              setInteraction(null);
            }
          });
      });

    // 3. Fetch similar products (cached & deduplicated)
    useApiCacheStore
      .getState()
      .fetchWithCache(
        `products:similar:${id}`,
        async () => {
          const data = await productsApi.similar(id, { limit: 8 });
          return Array.isArray(data) ? data : (data.products ?? []);
        },
        { ttl: 10 * 60 * 1000 }
      )
      .then((list) => {
        setSimilar(list);
      })
      .catch(() => {});
  }, [id, navigate]);

  const handleAddToCart = async () => {
    try {
      await addToCart(product, quantity);
      toast.success(
        t("product.addedToCart", { defaultValue: "Added to cart" }),
      );
    } catch {
      toast.error(t("common.error", { defaultValue: "Failed to add to cart" }));
    }
  };

  const handleToggleWishlist = async () => {
    const nextWish = !hasWishlisted;
    try {
      await toggleWishlist(product);
      // Optimistic update — keep interaction state and Zustand cache in sync
      setInteraction((prev) => {
        const next = {
          ...(prev || {}),
          hasWishlisted: nextWish,
        };
        useApiCacheStore.getState().setCache(`interaction:${id}`, next);
        return next;
      });
      toast.success(
        nextWish
          ? t("product.addedToWishlist", { defaultValue: "Saved to wishlist" })
          : t("product.removedFromWishlist", {
              defaultValue: "Removed from wishlist",
            }),
      );
    } catch {
      toast.error(
        t("common.error", { defaultValue: "Failed to update wishlist" }),
      );
    }
  };

  const handleShare = async () => {
    try {
      await interactionsApi.share(id);
      setInteraction((prev) => {
        const next = prev ? { ...prev, hasShared: true } : prev;
        if (next) useApiCacheStore.getState().setCache(`interaction:${id}`, next);
        return next;
      });
    } catch {
      // sharing is still useful offline — ignore API errors
    }
    const url = window.location.href;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success(
        t("common.linkCopied", { defaultValue: "Product link copied!" }),
      );
    }
  };

  const _handleRate = async (stars) => {
    setRating(stars);
    try {
      await interactionsApi.rate(id, stars);
      setInteraction((prev) => {
        const next = prev ? { ...prev, rating: stars } : prev;
        if (next) useApiCacheStore.getState().setCache(`interaction:${id}`, next);
        return next;
      });
      toast.success(
        t("product.ratingSaved", { defaultValue: "Thanks for rating!" }),
      );
    } catch {
      toast.error(
        t("product.loginToRate", {
          defaultValue: "Please log in to rate this product",
        }),
      );
    }
  };

  const discount = useMemo(() => {
    if (!product || !product.originalPrice || !product.price) return 0;
    return Math.round(
      ((product.originalPrice - product.price) / product.originalPrice) * 100,
    );
  }, [product]);

  const handleQuantityChange = useCallback(
    (change) => {
      setQuantity((prevQuantity) => {
        const newQuantity = prevQuantity + change;
        if (newQuantity >= 1 && newQuantity <= product.stock) {
          return newQuantity;
        }
        return prevQuantity;
      });
    },
    [product.stock],
  );

  if (product.loading) {
    return <LoaderScreen />;
  }

  if (!product || !product.id) {
    return null;
  }

  const galleryImages = product.images?.length
    ? product.images
    : product.thumbnail
      ? [product.thumbnail]
      : [];

  const galleryMedia = [
    ...galleryImages.map((src, index) => ({
      key: `image-${index}`,
      type: "image",
      src,
      poster: "",
      alt: `${product.title} ${index + 1}`,
    })),
    ...(product.videos || []).map((video, index) => ({
      key: `video-${index}`,
      type: "video",
      src: video.url,
      poster: video.poster || "",
      alt: `${product.title} ${index + 1}`,
    })),
  ];

  const activeMedia = galleryMedia[selectedMedia] || galleryMedia[0];

  return (
    <div className="min-h-screen max-w-7xl flex flex-col p-4 lg:p-8 mx-auto">
      <Helmet>
        <title>{`${product.title} - ${t("store.name")}`}</title>
        <meta name="description" content={product.description} />
        <meta
          name="keywords"
          content={`${product.title}, ${product.category}, ${product.brand}, ${(product.tags || []).join(", ")}`}
        />
      </Helmet>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground max-w-7xl justify-start">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link to="/">{t("product.home")}</Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Link to={"/search?category=" + product.category}>
                {product.category}
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{product.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </nav>

      <div className="max-w-7xl justify-items-center lg:justify-items-normal grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 w-full">
        {/* Product Images */}
        <div className="space-y-4 w-full max-w-lg">
          {/* Main media: image or video */}
          <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border">
            {activeMedia?.type === "video" ? (
              <Suspense
                fallback={
                  <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
                    {t("common.loading")}
                  </div>
                }
              >
                <ProductVideoPlayer
                  src={activeMedia.src}
                  poster={activeMedia.poster}
                  title={`${product.title} — ${t("product.video")}`}
                />
              </Suspense>
            ) : (
              <img
                src={activeMedia?.src || product.thumbnail}
                alt={product.title}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              />
            )}
          </div>

          {/* Media thumbnails (images + videos) */}
          {galleryMedia.length > 1 && (
            <div className="flex space-x-3 overflow-x-auto pb-2">
              {galleryMedia.map((media, index) => (
                <button
                  key={media.key}
                  type="button"
                  onClick={() => setSelectedMedia(index)}
                  aria-pressed={selectedMedia === index}
                  aria-label={
                    media.type === "video"
                      ? `${t("product.playVideo")}: ${media.alt}`
                      : media.alt
                  }
                  className={cn(
                    "relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0",
                    selectedMedia === index
                      ? "border-primary"
                      : "border-gray-200",
                  )}
                >
                  {media.type === "video" ? (
                    <>
                      {media.poster ? (
                        <img
                          src={media.poster}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          src={`${media.src}#t=0.1`}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      )}
                      <span className="absolute inset-0 grid place-items-center bg-black/35">
                        <Play className="h-5 w-5 fill-white text-white" />
                      </span>
                    </>
                  ) : (
                    <img
                      src={media.src}
                      alt={media.alt}
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Information */}
        <div className="space-y-6">
          {/* Title and Brand */}
          <div>
            <Badge variant="secondary" className="mb-2">
              {product.brand}
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              {product.title}
            </h1>

            {/* Rating */}
            <div className="flex items-center space-x-2 mt-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <StarIcon
                    key={star}
                    className={cn(
                      "h-4 w-4",
                      star <= Math.round(product.rating || 5)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300",
                    )}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                ({product.rating}) • {product.reviewCount || 0} reviews
              </span>
            </div>
          </div>

          {/* Price */}
          <div className="space-y-1">
            <div className="flex items-center space-x-3">
              <span className="text-3xl font-bold text-foreground">
                {currency(product.price)}
              </span>
              {product.originalPrice > product.price && (
                <>
                  <span className="text-lg text-muted-foreground line-through">
                    {currency(product.originalPrice)}
                  </span>
                  <Badge variant="destructive" className="text-xs">
                    {discount}% {t("common.off")}
                  </Badge>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("product.freeShippingThreshold", { amount: currency(500) })}
            </p>
          </div>

          {/* Description */}
          <div>
            <p className="text-muted-foreground leading-relaxed">
              {product.description}
            </p>
          </div>

          {/* Stock Status */}
          <div className="flex items-center space-x-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                product.stock > 0 ? "bg-green-500" : "bg-red-500",
              )}
            ></div>
            <span className="text-sm">
              {product.stock > 0
                ? t("product.stockCount", { count: product.stock })
                : t("product.outOfStock")}
            </span>
          </div>

          {/* Quantity and Add to Cart */}
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium">
                {t("product.quantity")}
              </label>
              <div className="flex items-center border rounded-md">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleQuantityChange(-1)}
                  disabled={quantity <= 1}
                  className="h-9 w-9 p-0"
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="px-4 text-center min-w-[3rem]">
                  {quantity}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleQuantityChange(1)}
                  disabled={quantity >= product.stock}
                  className="h-9 w-9 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="sm:flex-1"
                disabled={product.stock === 0}
                onClick={handleAddToCart}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {t("product.addToCart")}
              </Button>
              <div className="flex space-x-2 flex-row max-sm:justify-center sm:w-49">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-[49%]"
                  aria-label={t("product.addToFavorites")}
                  onClick={handleToggleWishlist}
                >
                  <Heart
                    className={cn(
                      "w-4 h-4",
                      hasWishlisted && "fill-red-500 text-red-500",
                    )}
                  />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-[49%]"
                  aria-label="Share"
                  onClick={handleShare}
                >
                  <Share2
                    className={cn(
                      "w-4 h-4",
                      hasShared && "fill-primary text-primary",
                    )}
                  />
                </Button>
              </div>
            </div>
          </div>

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("product.tags")}</h3>
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Details Tabs */}
      <div className="max-w-7xl mt-12 space-y-8">
        <Separator />
        {/* Detailed Description */}
        <div className="sm:max-w-3xl max-sm:max-w-full">
          <h2 className="text-2xl font-bold mb-4">
            {t("product.productDetails")}
          </h2>
          <StyledMd>
            {product.detailedDescription || product.description}
          </StyledMd>
        </div>

        <section className="flex flex-col xl:flex-row w-full gap-4">
          {/* Specifications */}
          <Card className="w-full xl:w-1/2">
            <CardHeader>
              <CardTitle>{t("product.specifications")}</CardTitle>
              <CardDescription>{t("product.techSpecs")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 xl:grid-cols-1 gap-x-6 gap-y-1">
                {product.specifications &&
                  product.specifications.map((spec, index) => (
                    <div
                      key={index}
                      className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-2 py-2 border-b last:border-b-0"
                    >
                      <span className="font-medium text-sm shrink-0">
                        {spec.label}
                      </span>
                      <span className="text-sm text-muted-foreground sm:text-right break-words">
                        {spec.value}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          <Card className="w-full xl:w-1/2">
            <CardHeader>
              <CardTitle>{t("product.features")}</CardTitle>
              <CardDescription>{t("product.keyFeatures")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 gap-3">
                {product.features &&
                  product.features.map((feature, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Tabs: Similar Products (default) and Customer Reviews */}
        <div className="max-w-7xl mt-12 space-y-8">
          <Tabs defaultValue="similar">
            <TabsList>
              <TabsTrigger value="similar">
                {t("product.brandProductsTab", {
                  brand: product.brand || "",
                  defaultValue: `Products From ${product.brand || ""}`,
                })}
              </TabsTrigger>
              <TabsTrigger value="review">
                {t("product.reviewsTab", { defaultValue: "Reviews" })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="similar" className="w-full">
              <Card className="bg-background">
                <CardHeader>
                  <CardTitle>
                    {t("product.brandProductsTab", {
                      brand: product.brand || "",
                      defaultValue: `Products From ${product.brand || ""}`,
                    })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="w-full">
                  {similar && similar.length > 0 ? (
                    <div className="flex flex-wrap gap-4 flex-row items-stretch justify-center">
                      {similar.map((item, index) => (
                        <HorizontalProductCard
                          key={item.id ?? item.productId ?? index}
                          product={item}
                          index={index}
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty className="border border-dashed rounded-2xl py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <PackageSearch className="size-6 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle>
                          {t("product.noSimilarTitle", {
                            defaultValue: "No Similar Products Found",
                          })}
                        </EmptyTitle>
                        <EmptyDescription>
                          {t("product.noSimilarDesc", {
                            defaultValue: `We couldn't find any other products from ${product.brand || "this brand"} at the moment.`,
                            brand: product.brand || "",
                          })}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="review" className="w-full">
              <Card className="bg-background">
                <CardHeader>
                  <CardTitle>{t("product.customerReviews")}</CardTitle>
                  <CardDescription>
                    {t("product.reviewsSubtitle")}
                  </CardDescription>
                  <Separator className="my-2" />
                </CardHeader>
                <CardContent className="w-full">
                  <ReviewRatingSection productId={id} userId={user?.id} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailsPage;

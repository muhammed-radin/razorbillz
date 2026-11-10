/**
 * StoreMeta
 * ---------------------------------------------------------------------------
 * Centralised `<head>` tags (title, description, Open Graph, Twitter, canonical)
 * sourced from the shared store config. Pages render this instead of hardcoding
 * brand names or meta copy, so SEO metadata stays consistent everywhere.
 *
 *   <StoreMeta />                       // site defaults (localized)
 *   <StoreMeta title="Checkout" />      // "Checkout | Razorbillz"
 *   <StoreMeta title="X" noIndex />     // adds robots noindex,nofollow
 */
import { Helmet } from "react-helmet-async";
import { useStoreInfo } from "@/utils/store";

function absolute(url, base) {
  if (!url) return base;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

export function StoreMeta({
  title,
  description,
  keywords,
  image,
  url,
  type,
  noIndex = false,
  children,
}) {
  const store = useStoreInfo();

  const pageTitle = title ? `${title} | ${store.name}` : store.seo.title;
  const pageDescription = description || store.seo.description;
  const pageKeywords = keywords || store.seo.keywords;
  const pageImage = image || store.ogImage;
  const canonical = absolute(url, store.canonical);

  return (
    <Helmet prioritizeSeoTags>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      {pageKeywords ? <meta name="keywords" content={pageKeywords} /> : null}
      <meta
        name="robots"
        content={noIndex ? "noindex, nofollow" : store.seo.robots}
      />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content={type || store.seo.ogType} />
      <meta property="og:site_name" content={store.name} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:image" content={pageImage} />
      <meta property="og:url" content={canonical} />

      <meta name="twitter:card" content={store.seo.twitterCard} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:image" content={pageImage} />

      {children}
    </Helmet>
  );
}

export default StoreMeta;

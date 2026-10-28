/**
 * store.config.js
 * ---------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for the store / brand ("RazorBillz").
 *
 * This module is intentionally dependency-free and uses only ESM syntax so it
 * can be imported from BOTH sides of the project:
 *
 *   - Server (Node / Express):  import { storeConfig } from "../shared/store.config.js"
 *   - Client (Vite / React):    import { storeConfig } from "@shared/store.config"
 *
 * Anything that is brand-, store-, contact- or SEO-related belongs here so it
 * only ever has to be updated in one place. Fields that end users read are
 * translated in Malayalam (`ml`) and English (`en`).
 *
 * Shape of a translatable field:
 *   { en: "English copy", ml: "മലയാളം പകർപ്പ്" }
 * Use `getStoreText(field, lang)` / `resolveStore(lang)` to read them safely.
 *
 * NOTE: values marked with `TODO` are sensible defaults recovered from the
 * existing UI. Replace them with the real registered business details.
 * ---------------------------------------------------------------------------
 */

export const STORE_LOCALES = ["en", "ml"];
export const DEFAULT_STORE_LOCALE = "en";

/** Supported language meta (used by switchers, SEO, i18n). */
export const STORE_LANGUAGES = {
  en: { label: "English", nativeLabel: "English", htmlLang: "en", dir: "ltr" },
  ml: { label: "Malayalam", nativeLabel: "മലയാളം", htmlLang: "ml", dir: "ltr" },
};

export const storeConfig = {
  /* ----------------------------------------------------------------------- *
   * Identity
   * ----------------------------------------------------------------------- */
  brand: {
    /** Customer-facing brand / store name. */
    name: { en: "RazorBillz", ml: "RazorBillz" },
    /** Registered / legal entity name (shown in policies, invoices). */
    legalName: { en: "RazorBillz", ml: "RazorBillz" },
    /** Short machine-friendly name (used for slugs, CSV prefixes, etc.). */
    shortName: "RazorBillz",
    /** One-line marketing tagline. */
    tagline: {
      en: "Your one-stop shop for the latest and greatest electronics.",
      ml: "ഏറ്റവും പുതിയതും മികച്ചതുമായ ഇലക്ട്രോണിക്സിനായുള്ള നിങ്ങളുടെ വൺ-സ്റ്റോപ്പ് ഷോപ്പ്.",
    },
    /** Short "about the store" paragraph. */
    about: {
      en: "RazorBillz is a comprehensive billing and commerce platform that simplifies invoicing, shopping and payments. We supply industrial-grade electronic components to engineers, makers, startups and institutions across India.",
      ml: "ഇൻവോയ്സിംഗ്, ഷോപ്പിംഗ്, പേയ്മെന്റ് എന്നിവ ലളിതമാക്കുന്ന സമഗ്രമായ ബില്ലിംഗ് & കൊമേഴ്സ് പ്ലാറ്റ്ഫോമാണ് RazorBillz. ഇന്ത്യയിലുടനീളമുള്ള എഞ്ചിനീയർമാർക്കും മേക്കർമാർക്കും സ്റ്റാർട്ടപ്പുകൾക്കും സ്ഥാപനങ്ങൾക്കും ഞങ്ങൾ ഇൻഡസ്ട്രിയൽ-ഗ്രേഡ് ഇലക്ട്രോണിക് കമ്പോണന്റുകൾ നൽകുന്നു.",
    },
  },

  /* ----------------------------------------------------------------------- *
   * Site / URLs / localisation defaults
   * ----------------------------------------------------------------------- */
  site: {
    url: "https://razorbillz.vercel.app",
    domain: "razorbillz.vercel.app",
    /** Currency used to render prices & invoices. */
    currency: "INR",
    currencySymbol: "₹",
    /** Intl / og:locale base. */
    locale: "en_IN",
    timezone: "Asia/Kolkata",
    defaultLanguage: DEFAULT_STORE_LOCALE,
    supportedLanguages: STORE_LOCALES,
  },

  /* ----------------------------------------------------------------------- *
   * Branding assets
   * Relative paths are served from the web root; `logo`/`ogImage` are the
   * absolute URLs used inside meta tags.
   * ----------------------------------------------------------------------- */
  assets: {
    logo: "/favicon_io/android-chrome-512x512.png",
    ogLogo32: "https://razorbills.vercel.app/favicon_io/favicon-32x32.png",
    ogImage:
      "https://razorbills.vercel.app/favicon_io/android-chrome-512x512.png",
    icon: "/favicon.ico",
    appleTouchIcon: "/favicon_io/apple-touch-icon.png",
    favicon32: "/favicon_io/favicon-32x32.png",
    favicon16: "/favicon_io/favicon-16x16.png",
    manifest: "/favicon_io/site.webmanifest",
    themeColor: "#0f172a",
  },

  /* ----------------------------------------------------------------------- *
   * Contact details
   * ----------------------------------------------------------------------- */
  contact: {
    email: {
      support: "support.razorbillz@gmail.com",
      care: "support.razorbillz@gmail.com",
      privacy: "support.razorbillz@gmail.com",
    },
    phone: {
      /** Primary display number. */
      primary: "+91 79942 62301",
      /** Support line (falls back to primary when equal). */
      support: "+91 79942 62301",
      /** WhatsApp number in international format (no spaces / symbols). */
      whatsapp: "917994262301",
    },
    /** Opening hours copy. */
    hours: {
      en: "Monday to Saturday, 10:00 AM – 6:00 PM (IST)",
      ml: "തിങ്കൾ മുതൽ ശനി വരെ, രാവിലെ 10:00 – വൈകുന്നേരം 6:00 (IST)",
    },
  },

  /* ----------------------------------------------------------------------- *
   * Address
   * Use empty strings for parts that are not applicable; they are skipped
   * automatically when an address is formatted.
   * ----------------------------------------------------------------------- */
  address: {
    // TODO: replace with the real registered office address.
    line1: { en: "RazorBillz", ml: "RazorBillz" },
    line2: { en: "", ml: "" },
    city: { en: "Malappuram", ml: "മലപ്പുറം" },
    state: { en: "Kerala", ml: "കേരളം" },
    postalCode: "", // TODO: e.g. "676505"
    country: { en: "India", ml: "ഇന്ത്യ" },
    countryCode: "IN",
    mapUrl: "https://maps.google.com/?q=Malappuram,Kerala,India",
  },

  /* ----------------------------------------------------------------------- *
   * Social profiles. Set a value to null/"" to hide it in the UI.
   * ----------------------------------------------------------------------- */
  social: {
    instagram: null, // TODO: e.g. "https://www.instagram.com/RazorBillz"
    youtube: null,
    facebook: null,
    x: null,
    website: "https://razorbillz.vercel.app",
    whatsapp: "https://wa.me/917994262301",
  },

  /* ----------------------------------------------------------------------- *
   * SEO / meta tags
   * ----------------------------------------------------------------------- */
  seo: {
    title: {
      en: "RazorBillz - Your One-Stop Billing & Commerce Solution",
      ml: "RazorBillz - നിങ്ങളുടെ വൺ-സ്റ്റോപ്പ് ബില്ലിംഗ് & കൊമേഴ്സ് പരിഹാരം",
    },
    description: {
      en: "RazorBillz is a comprehensive billing solution that simplifies your invoicing, shopping, and payment processes. Manage your bills efficiently with our user-friendly platform.",
      ml: "ഇൻവോയ്സിംഗ്, ഷോപ്പിംഗ്, പേയ്മെന്റ് പ്രക്രിയകൾ ലളിതമാക്കുന്ന സമഗ്ര ബില്ലിംഗ് പരിഹാരമാണ് RazorBillz. ഞങ്ങളുടെ ഉപയോക്തൃ-സൗഹൃദ പ്ലാറ്റ്ഫോം ഉപയോഗിച്ച് ബില്ലുകൾ കാര്യക്ഷമമായി കൈകാര്യം ചെയ്യുക.",
    },
    keywords: {
      en: "RazorBillz, electronics, electronic components, billing, invoicing, online shopping, kerala, india",
      ml: "RazorBillz, ഇലക്ട്രോണിക്സ്, ഇലക്ട്രോണിക് കമ്പോണന്റുകൾ, ബില്ലിംഗ്, ഇൻവോയ്സിംഗ്, ഓൺലൈൻ ഷോപ്പിംഗ്, കേരളം, ഇന്ത്യ",
    },
    ogType: "website",
    twitterCard: "summary_large_image",
    robots: "index, follow",
    googleSiteVerification: "veZy80f_V7aq-MaybBl9rqtELtiV6r8QxQ3X_ZGWurU",
  },

  /* ----------------------------------------------------------------------- *
   * Business / compliance
   * ----------------------------------------------------------------------- */
  business: {
    gstin: null, // TODO: e.g. "32ABCDE1234F1Z5"
    supportRegion: { en: "Kerala, India", ml: "കേരളം, ഇന്ത്യ" },
    freeShippingThreshold: 500,
    taxRate: 0.18,
  },
};

/* ===========================================================================
 * Helpers
 * ========================================================================= */

/** Normalise an arbitrary language tag (`ml-IN`, `en_US`, ...) to a supported one. */
export function normalizeStoreLocale(lang) {
  if (!lang || typeof lang !== "string") return DEFAULT_STORE_LOCALE;
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return STORE_LOCALES.includes(base) ? base : DEFAULT_STORE_LOCALE;
}

/**
 * Resolve a translatable value for a language.
 * Strings/arrays pass through; objects shaped `{ en, ml }` are indexed.
 */
export function getStoreText(value, lang = DEFAULT_STORE_LOCALE) {
  if (value === null || value === undefined) return value ?? "";
  if (typeof value === "string" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map((v) => getStoreText(v, lang));
  if (typeof value === "object") {
    const l = normalizeStoreLocale(lang);
    if (l in value) return value[l];
    if (Object.prototype.hasOwnProperty.call(value, "en")) return value.en;
    // Not a translation map — return as-is.
    return value;
  }
  return value;
}

/** True when a string looks like an http(s) URL. */
function isAbsoluteUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** Join URL segments without producing double slashes. */
function joinUrl(base, path) {
  if (!path) return base;
  if (isAbsoluteUrl(path)) return path;
  return `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

/**
 * Return the full store/brand object with every translatable field resolved
 * for `lang`. Safe to consume directly in components and API responses.
 */
export function resolveStore(lang = DEFAULT_STORE_LOCALE) {
  const l = normalizeStoreLocale(lang);
  const { brand, site, assets, contact, address, social, seo, business } =
    storeConfig;

  const resolvedAddress = {
    line1: getStoreText(address.line1, l),
    line2: getStoreText(address.line2, l),
    city: getStoreText(address.city, l),
    state: getStoreText(address.state, l),
    postalCode: address.postalCode,
    country: getStoreText(address.country, l),
    countryCode: address.countryCode,
    mapUrl: address.mapUrl,
  };

  const cityState = [resolvedAddress.city, resolvedAddress.state]
    .filter(Boolean)
    .join(", ");
  const cityStatePin = [cityState, resolvedAddress.postalCode]
    .filter(Boolean)
    .join(" ");
  const addressLines = [
    resolvedAddress.line1,
    resolvedAddress.line2,
    cityStatePin,
    resolvedAddress.country,
  ].filter(Boolean);
  const addressOneLine = addressLines.join(", ");

  const whatsappDigits = String(contact.phone.whatsapp || "").replace(
    /\D/g,
    "",
  );

  return {
    lang: l,
    language: STORE_LANGUAGES[l],

    // Identity
    name: getStoreText(brand.name, l),
    legalName: getStoreText(brand.legalName, l),
    shortName: brand.shortName,
    tagline: getStoreText(brand.tagline, l),
    about: getStoreText(brand.about, l),

    // Site
    url: site.url,
    domain: site.domain,
    canonical: `${site.url.replace(/\/+$/, "")}/`,
    currency: site.currency,
    currencySymbol: site.currencySymbol,
    locale: l === "ml" ? "ml_IN" : site.locale,
    timezone: site.timezone,
    defaultLanguage: site.defaultLanguage,
    supportedLanguages: site.supportedLanguages,

    // Assets
    assets,
    logo: assets.logo,
    logoUrl: joinUrl(site.url, assets.logo),
    ogImage: assets.ogImage,
    icon: assets.icon,
    themeColor: assets.themeColor,

    // Contact
    email: contact.email.support,
    emailSupport: contact.email.support,
    emailCare: contact.email.care,
    emailPrivacy: contact.email.privacy,
    emails: contact.email,
    phone: contact.phone.primary,
    phoneSupport: contact.phone.support,
    whatsapp: contact.phone.whatsapp,
    whatsappUrl: whatsappDigits ? `https://wa.me/${whatsappDigits}` : null,
    hours: getStoreText(contact.hours, l),

    // Address
    address: {
      ...resolvedAddress,
      cityState,
      cityStatePin,
      lines: addressLines,
      oneLine: addressOneLine,
    },

    // Social
    social,

    // SEO
    seo: {
      title: getStoreText(seo.title, l),
      description: getStoreText(seo.description, l),
      keywords: getStoreText(seo.keywords, l),
      ogType: seo.ogType,
      twitterCard: seo.twitterCard,
      robots: seo.robots,
      googleSiteVerification: seo.googleSiteVerification,
    },

    // Business
    business: {
      ...business,
      supportRegion: getStoreText(business.supportRegion, l),
    },
  };
}

/**
 * Build the nested translation resources injected into the client's i18next
 * instance under the `store` namespace, e.g. `t("store.emailSupport")`.
 */
export function getStoreI18nResources(lang = DEFAULT_STORE_LOCALE) {
  const s = resolveStore(lang);
  return {
    name: s.name,
    legalName: s.legalName,
    shortName: s.shortName,
    tagline: s.tagline,
    about: s.about,
    url: s.url,
    domain: s.domain,
    currency: s.currency,
    currencySymbol: s.currencySymbol,
    email: s.email,
    supportEmail: s.emailSupport,
    careEmail: s.emailCare,
    privacyEmail: s.emailPrivacy,
    phone: s.phone,
    supportPhone: s.phoneSupport,
    whatsapp: s.whatsapp,
    whatsappUrl: s.whatsappUrl || "",
    hours: s.hours,
    address: {
      line1: s.address.line1,
      line2: s.address.line2,
      city: s.address.city,
      state: s.address.state,
      postalCode: s.address.postalCode,
      country: s.address.country,
      cityState: s.address.cityState,
      cityStatePin: s.address.cityStatePin,
      oneLine: s.address.oneLine,
    },
    seo: {
      title: s.seo.title,
      description: s.seo.description,
      keywords: s.seo.keywords,
    },
  };
}

/** Flat, HTML-friendly map used by the Vite plugin to fill `index.html`. */
export function getStoreHtmlTokens(lang = DEFAULT_STORE_LOCALE) {
  const s = resolveStore(lang);
  return {
    "%STORE_NAME%": s.name,
    "%STORE_TITLE%": s.seo.title,
    "%STORE_DESCRIPTION%": s.seo.description,
    "%STORE_KEYWORDS%": s.seo.keywords,
    "%STORE_URL%": s.canonical,
    "%STORE_DOMAIN%": s.domain,
    "%STORE_OG_IMAGE%": s.ogImage,
    "%STORE_THEME_COLOR%": s.themeColor,
    "%STORE_FAVICON%": s.icon,
    "%STORE_APPLE_TOUCH_ICON%": s.assets.appleTouchIcon,
    "%STORE_FAVICON_32%": s.assets.favicon32,
    "%STORE_FAVICON_16%": s.assets.favicon16,
    "%STORE_MANIFEST%": s.assets.manifest,
    "%STORE_GOOGLE_VERIFICATION%": s.seo.googleSiteVerification,
    "%STORE_SUPPORT_EMAIL%": s.emailSupport,
    "%STORE_SUPPORT_PHONE%": s.phoneSupport,
  };
}

export default storeConfig;

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation.json";
import { getStoreI18nResources } from "@shared/store.config";

const SUPPORTED_LANGUAGES = ["en", "ml"];
const LANGUAGE_STORAGE_KEY = "i18nextLng";

/* i18next-browser-languagedetector weighs ~46 kB and was pulled into the
 * initial bundle purely to read a cached language. This is all we actually
 * need: localStorage -> cookie -> navigator, normalised to a supported code. */
function normalizeLanguage(value) {
  if (!value) return "";
  const base = String(value).split("-")[0].toLowerCase();
  return SUPPORTED_LANGUAGES.includes(base) ? base : "";
}

function detectLanguage() {
  const runtime =
    typeof window !== "undefined" ? window : undefined;

  try {
    const stored = normalizeLanguage(
      runtime?.localStorage?.getItem(LANGUAGE_STORAGE_KEY),
    );
    if (stored) return stored;
  } catch {
    /* storage can be blocked (private mode / cookies off) */
  }

  const candidates =
    typeof navigator !== "undefined"
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
      : [];
  for (const candidate of candidates) {
    const normalized = normalizeLanguage(candidate);
    if (normalized) return normalized;
  }

  return "en";
}

function cacheLanguage(language) {
  const normalized = normalizeLanguage(language) || "en";
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalized;
  }
}

// Store/brand strings are owned by `Server/shared/store.config.js` and merged
// into each locale under the `store` namespace (e.g. `t("store.emailSupport")`).
//
// The default (English) bundle ships in the main chunk. The much larger
// Malayalam bundle is code-split and only fetched when that language is
// selected, keeping the initial payload small. `i18nReady` resolves once the
// active language is fully loaded so the app never paints a half-translated
// frame (see src/main.jsx).
const englishBundle = { ...en, store: getStoreI18nResources("en") };

i18n.use(initReactI18next);

// Memoised so a detected `ml` at startup and a later runtime switch share one
// network request.
let malayalamLoad = null;
function ensureActiveLocale(language) {
  if (language !== "ml" || i18n.hasResourceBundle("ml", "translation")) {
    return Promise.resolve();
  }
  if (!malayalamLoad) {
    malayalamLoad = import("./locales/ml/translation.json")
      .then(({ default: ml }) => {
        i18n.addResourceBundle(
          "ml",
          "translation",
          { ...ml, store: getStoreI18nResources("ml") },
          true,
          true,
        );
        // Notify subscribers (react-i18next) that the bundle is now available.
        i18n.emit("languageChanged", "ml");
      })
      .catch((error) => {
        malayalamLoad = null; // allow a retry on the next language change
        console.error("Failed to load the Malayalam locale:", error);
      });
  }
  return malayalamLoad;
}

// Persist the choice and keep `<html lang>` in sync for a11y/SEO.
i18n.on("languageChanged", (language) => {
  cacheLanguage(language);
  ensureActiveLocale(language);
});

const initialLanguage = detectLanguage();
if (typeof document !== "undefined") {
  document.documentElement.lang = initialLanguage;
}

export const i18nReady = i18n
  .init({
    lng: initialLanguage,
    resources: { en: { translation: englishBundle } },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    react: {
      useSuspense: false,
    },
  })
  .then(() => ensureActiveLocale(i18n.language));

export default i18n;

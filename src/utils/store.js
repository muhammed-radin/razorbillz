/**
 * utils/store.js
 * ---------------------------------------------------------------------------
 * Client-side access to the shared store/brand config
 * (`Server/shared/store.config.js`). Everything brand-related in the UI should
 * read from here so there is exactly one place to update.
 *
 *   const store = useStoreInfo();       // localized for the active language
 *   store.name, store.emailSupport, store.address.oneLine, ...
 *
 * Prefer the i18n keys (`t("store.name")`, `t("store.seo.title")`, ...) inside
 * translated copy — those resources are generated from the same config in
 * `src/i18n/index.js`.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  STORE_LANGUAGES,
  STORE_LOCALES,
  DEFAULT_STORE_LOCALE,
  getStoreText,
  normalizeStoreLocale,
  resolveStore,
  storeConfig,
} from "@shared/store.config";

export {
  STORE_LANGUAGES,
  STORE_LOCALES,
  DEFAULT_STORE_LOCALE,
  getStoreText,
  normalizeStoreLocale,
  resolveStore,
  storeConfig,
};

/**
 * Hook returning the store/brand info resolved for the current UI language.
 * Re-computes only when the language changes.
 */
export function useStoreInfo() {
  const { i18n } = useTranslation();
  const lang = normalizeStoreLocale(
    i18n?.resolvedLanguage || i18n?.language || DEFAULT_STORE_LOCALE,
  );

  return useMemo(() => resolveStore(lang), [lang]);
}

export default storeConfig;

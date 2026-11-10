import express from "express";
import {
  STORE_LOCALES,
  normalizeStoreLocale,
  resolveStore,
  storeConfig,
} from "../shared/store.config.js";

/**
 * Public store/brand config endpoint.
 *
 *   GET /api/store            -> store info for the default language (en)
 *   GET /api/store?lang=ml    -> store info localized to Malayalam
 *   GET /api/store/:lang      -> same as the query-string variant
 *
 * The response is generated from `Server/shared/store.config.js`, the same
 * file the client imports, so brand/contact/SEO details never drift apart.
 */
const router = express.Router();

function respond(res, lang) {
  res.set("Cache-Control", "public, max-age=300");
  res.json({
    store: resolveStore(lang),
    languages: STORE_LOCALES,
  });
}

router.get("/", (req, res) => {
  respond(res, normalizeStoreLocale(req.query.lang));
});

router.get("/:lang", (req, res) => {
  respond(res, normalizeStoreLocale(req.params.lang));
});

// Expose the raw config (handy for tooling/admin) under an explicit sub-path.
router.get("/raw/config", (_req, res) => {
  res.json({ store: storeConfig });
});

export default router;

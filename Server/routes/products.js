import express from "express";
import { db } from "../utils/db.js";
import { productStatusCache } from "../utils/cache-utils/product-status.js";
import { FeedMold } from "../models/feed.js";
import { ProductModel, MinimalProduct } from "../models/schema/product.js";
import { productFeedCache } from "../utils/cache-utils/product-feed.js";
import { productMemoryCache } from "../utils/cache-utils/product-data.js";
import {
  passUserAuth,
  requireAuth,
  requireSession,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import { evt, Evts, ProductEvent } from "../utils/events.manage.js";

const router = express.Router();

/* GET */
router.get("/", requireSession, passUserAuth, async function (req, res, next) {
  const userId = req.user?.id;
  if (
    productMemoryCache.getLocalMemory(req.url) &&
    req.query.realtime !== "true"
  ) {
    evt.fire(
      Evts.PRODUCT_SEARCHED_FROM_CACHE,
      new ProductEvent({
        type: Evts.PRODUCT_SEARCHED_FROM_CACHE,
        product: null,
        response: { fromCache: true },
        isReq: true,
        reqPath: req.url,
        userId,
      }),
    );
    return res.json(productMemoryCache.getLocalMemory(req.url));
  }

  let limit = parseInt(req.query?.limit) || parseInt(req.body?.limit) || 40;
  let search = req.query?.search || req.body?.search || "";
  let category = req.query?.category || req.body?.category || "";
  let priceMin =
    parseFloat(req.query?.priceMin) || parseFloat(req.body?.priceMin) || 0;
  let priceMax =
    parseFloat(req.query?.priceMax) ||
    parseFloat(req.body?.priceMax) ||
    Number.MAX_VALUE;
  let keywords = req.query?.keywords || req.body?.keywords || "";
  let tags = req.query?.tags || req.body?.tags || "";
  let sortBy = req.query?.sortBy || req.body?.sortBy || "createdAt";
  let sortOrder = req.query?.sortOrder === "asc" ? 1 : -1;
  // Rating bounds apply ONLY when explicitly requested. The old code always
  // injected rating: {$gte: 0, $lte: 5}, which silently hides every product
  // without a rating field from all listings and searches.
  const ratingMinRaw = req.query?.ratingMin ?? req.body?.ratingMin;
  const ratingMaxRaw = req.query?.ratingMax ?? req.body?.ratingMax;
  let ratingMin = parseFloat(ratingMinRaw) || 0;
  let ratingMax =
    ratingMaxRaw !== undefined && ratingMaxRaw !== null && ratingMaxRaw !== ""
      ? parseFloat(ratingMaxRaw) || 5
      : 5;
  let inStock =
    req.query?.inStock == "true" || req.body?.inStock == "true" || false;

  let productStartIndex =
    parseInt(req.query?.startIndex) || parseInt(req.body?.startIndex) || 0;

  let page = parseInt(req.query?.page) || parseInt(req.body?.page) || 1;

  let minimize =
    req.query?.minimize === "true" || req.body?.minimize === "true" || false;

  if (page > 1) {
    productStartIndex = (page - 1) * limit;
  }

  let query = {};

  // Default: only show isActive products
  query.isActive = true;

  if (search) {
    // find in id, sku, brand, title, category, keywords, tags and description
    query.$or = [
      { id: { $regex: search, $options: "i" } },
      { sku: { $regex: search, $options: "i" } },
      { brand: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
      { keywords: { $regex: search, $options: "i" } },
      { tags: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (category) {
    query.category = { $regex: category, $options: "i" };
  }
  if (keywords) {
    query.keywords = { $regex: keywords, $options: "i" };
  }
  if (tags) {
    query.tags = { $regex: tags, $options: "i" };
  }
  if (inStock) {
    query.stock = { $gt: 0 };
  }
  query.price = { $gte: priceMin, $lte: priceMax };
  if (ratingMinRaw !== undefined || ratingMaxRaw !== undefined) {
    query.rating = { $gte: ratingMin, $lte: ratingMax };
  }

  // example: using full query to test URL
  // /api/products?search=electronics&category=electronics&priceMin=10&priceMax=100&keywords=wireless&tags=wireless,bluetooth&sortBy=price&sortOrder=asc&ratingMin=3&ratingMax=5&inStock=true

  const products = await db
    .collection("products")
    .find(query)
    .sort({ [sortBy]: sortOrder, createdAt: -1 })
    .limit(limit)
    .skip(productStartIndex);

  let findedProducts = await products.toArray();

  if (minimize) {
    findedProducts = findedProducts.map((product) => {
      const minimalProduct = new MinimalProduct(product);
      return minimalProduct;
    });
  }
  let totalCount = await db.collection("products").countDocuments(query);

  let responseData = {
    products: findedProducts,
    count: totalCount,
    page: page,
    limit: limit,
    totalPages: Math.ceil(totalCount / limit),
    next: page < Math.ceil(totalCount / limit) ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
    startIndex: productStartIndex,
    endIndex: productStartIndex + findedProducts.length - 1,
    sort: {
      by: sortBy,
      order: sortOrder,
    },
    fromCache: false,
  };

  evt.fire(
    Evts.PRODUCT_SEARCHED,
    new ProductEvent({
      type: Evts.PRODUCT_SEARCHED,
      product: null,
      response: {
        limit,
        search,
        category,
        priceMin,
        priceMax,
        keywords,
        tags,
        sortBy,
        sortOrder,
        ratingMin,
        ratingMax,
        inStock,
        productStartIndex,
        fromCache: false,
      },
      reqPath: req.url,
      isReq: true,
      userId,
    }),
  );

  productMemoryCache.setLocalMemory(
    req.url,
    { ...responseData, fromCache: true },
    60 * 2, // two minutes
  );

  res.json(responseData);
});

// TODO: update status with analytics
router.get("/status", async function (req, res) {
  // if (productStatusCache.get() !== null && req.query.realtime !== "true") {
  //   return res.json(productStatusCache.get());
  // }

  await productStatusCache.update(req.query.lowThreshold || 5);
  res.json(productStatusCache.get());
});

router.get("/feed", requireSession, async function (req, res) {
  if (productFeedCache.get() !== null && req.query.realtime !== "true") {
    return res.json(productFeedCache.get());
  }

  await productFeedCache.update();
  res.json(productFeedCache.get());
});

router.get("/:productid", requireSession, async function (req, res) {
  const productid = req.params.productid;
  const { title, price, tags, keywords, originalPrice, minimize } = req.query;
  if (!productid) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  const query = { id: productid };

  if (title) {
    query.title = { $regex: title, $options: "i" }; // Case-insensitive title match
  }

  if (price) {
    query.price = parseFloat(price); // Match exact price
  }

  if (originalPrice) {
    query.originalPrice = parseFloat(originalPrice); // Match exact price
  }

  if (tags) {
    query.tags = { $in: tags.split(",") }; // Match any of the tags
  }

  if (keywords) {
    query.keywords = { $in: keywords.split(",") }; // Match any of the keywords
  }

  const product = await ProductModel.findOne(query);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Expose the aggregate rating at the top level for storefront clients;
  // the authoritative counters live in `metrics`.
  const data =
    typeof product.toObject === "function" ? product.toObject() : product;
  const metrics = data.metrics ?? data.meterics ?? {};
  const payload = {
    ...data,
    rating: Number(metrics.rating ?? data.rating ?? 0),
    reviewCount: Number(metrics.reviewCount ?? data.reviewCount ?? 0),
    commentCount: Number(metrics.commentCount ?? data.commentCount ?? 0),
  };

  if (minimize === "true") {
    const minimalProduct = new MinimalProduct(payload);
    return res.json(minimalProduct);
  }
  res.json(payload);
});

router.post(
  "/new/:productId",
  requireAdmin,
  requirePermission({ products: ["create"] }),
  passUserAuth,
  async function (req, res) {
    const productId = req.params.productId;
    if (!req.user || !productId) {
      return res.status(400).json({ error: "User or Product ID is required" });
    }

    const { id: adminId, name: adminName } = req.user;

    const product = await db.collection("products").findOne({ id: productId });
    if (product) {
      return res
        .status(403)
        .json({ error: "Product aleready found in ID: " + productId });
    }

    const newProduct = req.body;
    console.log("<-- :New product data:", newProduct);
    if (!newProduct.owner)
      newProduct.owner = {
        id: adminId,
        name: adminName,
      };
    console.log(
      "Creating new product with ID:",
      productId,
      "by admin:",
      adminId,
    );
    console.log("--> :New product data:", newProduct);

    const created = await ProductModel.create(newProduct);
    evt.fire(
      Evts.PRODUCT_CREATED,
      new ProductEvent({
        type: Evts.PRODUCT_CREATED,
        product: created,
        response: null,
        isReq: true,
        reqPath: req.url,
        userId: adminId,
        actorId: adminId,
        productId: created.id,
      }),
    );
    res.json(created);
  },
);

router.put(
  "/:productid",
  requireAdmin,
  requirePermission({ products: ["update"] }),
  passUserAuth,
  async function (req, res) {
    const productid = req.params.productid;
    const product = req.body;
    const updated = await ProductModel.updateOne({ id: productid }, product);
    evt.fire(
      Evts.PRODUCT_UPDATED,
      new ProductEvent({
        type: Evts.PRODUCT_UPDATED,
        product: updated,
        response: null,
        isReq: true,
        reqPath: req.url,
        userId: req.user.id,
        actorId: req.user.id,
        productId: productid,
      }),
    );
    res.json(updated);
  },
);

router.delete(
  "/:productid",
  requireAdmin,
  requirePermission({ products: ["delete"] }),
  passUserAuth,
  async function (req, res) {
    const productid = req.params.productid;
    const deleted = await ProductModel.deleteOne({ id: productid });
    if ((deleted?.deletedCount ?? 0) > 0) {
      evt.fire(
        Evts.PRODUCT_DELETED,
        new ProductEvent({
          type: Evts.PRODUCT_DELETED,
          product: deleted,
          response: null,
          isReq: true,
          reqPath: req.url,
          userId: req.user.id,
          actorId: req.user.id,
          productId: productid,
        }),
      );
    }
    res.json(deleted);
  },
);

/// similar products
router.get("/similar/:id", requireSession, passUserAuth, async (req, res) => {
  try {
    const productId = req.params.id;

    // 1. Check Memory Cache
    if (
      productMemoryCache.getLocalMemory(req.url) &&
      req.query.realtime !== "true"
    ) {
      return res.json(productMemoryCache.getLocalMemory(req.url));
    }

    const limit = parseInt(req.query?.limit) || parseInt(req.body?.limit) || 5;

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    // Fetch target product from DB
    const targetProduct = await db
      .collection("products")
      .findOne({ id: productId });
    if (!targetProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    // 2. Query similar items using an aggregation pipeline with multi-stage fallbacks
    const [results] = await ProductModel.aggregate([
      {
        $facet: {
          // Strategy 1: Smart Similarity based on tags/keywords (Must match category)
          similar: [
            {
              $match: {
                _id: { $ne: targetProduct._id },
                id: { $ne: targetProduct.id },
                category: targetProduct.category,
              },
            },
            {
              $addFields: {
                matchedTagsCount: {
                  $size: {
                    $setIntersection: ["$tags", targetProduct.tags || []],
                  },
                },
                matchedKeywordsCount: {
                  $size: {
                    $setIntersection: [
                      "$keywords",
                      targetProduct.keywords || [],
                    ],
                  },
                },
                brandBonus: {
                  $cond: [{ $eq: ["$brand", targetProduct.brand] }, 2, 0],
                },
              },
            },
            {
              $addFields: {
                totalScore: {
                  $add: [
                    "$matchedTagsCount",
                    "$matchedKeywordsCount",
                    "$brandBonus",
                  ],
                },
              },
            },
            { $match: { totalScore: { $gt: 0 } } },
            { $sort: { totalScore: -1 } },
            { $limit: limit },
          ],

          // Strategy 2: Fallback to same Category or Brand (Ignoring tags/keywords)
          sameCategoryOrBrand: [
            {
              $match: {
                _id: { $ne: targetProduct._id },
                id: { $ne: targetProduct.id },
                $or: [
                  { category: targetProduct.category },
                  { brand: targetProduct.brand },
                ],
              },
            },
            { $sort: { createdAt: -1 } }, // Newest within the same context
            { $limit: limit },
          ],

          // Strategy 3: Hard Fallback to just the latest products globally
          latestGlobal: [
            {
              $match: {
                _id: { $ne: targetProduct._id },
                id: { $ne: targetProduct.id },
              },
            },
            { $sort: { createdAt: -1 } }, // Globally newest arrivals
            { $limit: limit },
          ],
        },
      },
    ]);

    // 3. Fallback Evaluation Loop
    let finalProducts = [];

    if (results?.similar && results.similar.length > 0) {
      finalProducts = results.similar;
    } else if (
      results?.sameCategoryOrBrand &&
      results.sameCategoryOrBrand.length > 0
    ) {
      finalProducts = results.sameCategoryOrBrand;
    } else {
      finalProducts = results?.latestGlobal || [];
    }

    // 4. Cache & Return Payload
    if (finalProducts && finalProducts.length > 0) {
      productMemoryCache.setLocalMemory(
        req.url,
        { products: finalProducts, fromCache: true },
        60 * 60 * 24, // One day in seconds
      );
    }

    evt.fire(
      Evts.PRODUCT_SEARCHED,
      new ProductEvent({
        type: Evts.PRODUCT_SEARCHED,
        product: null,
        response: { products: finalProducts, fromCache: false },
        isReq: true,
        reqPath: req.url,
        userId: req.user.id,
        actorId: req.user.id,
        productId,
      }),
    );

    return res.json({ result: finalProducts, fromCache: false });
  } catch (err) {
    console.error("Error in similar products aggregation:", err);
    evt.fire(
      Evts.ERROR,
      new ErrorEvent({
        type: Evts.ERROR,
        error: err,
        errorCode: err.code || 500,
        data: { route: "/similar/:id", message: err.message },
      }),
    );
    return res.status(500).json({ error: err.message });
  }
});

export default router;

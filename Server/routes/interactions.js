import express from "express";
import {
  passUserAuth,
  requireAuth,
  requireSession,
} from "../utils/middlewares/reqiuredAuth.js";
import { InteractionModel } from "../models/schema/interactions.js";
import {
  evt,
  Evts,
  ErrorEvent,
  ProductEvent,
} from "../utils/events.manage.js";
import {
  mergeInteractionOperation,
  searchInteraction,
  requestInteractionFlush,
  flushRatingBuffer,
} from "../utils/interactions.js";

const router = express.Router();

function reportError(error, data = {}) {
  console.error("[interactions]", error?.message || error);
  evt.fire(
    Evts.ERROR,
    new ErrorEvent({
      type: Evts.ERROR,
      error: error?.message || String(error),
      errorCode: error?.code || 500,
      data,
    }),
  );
}

function interactionOperation({ productId, userId, isGuest, set = {} }) {
  return {
    updateOne: {
      filter: { productId, userId },
      update: {
        $setOnInsert: {
          id: `${productId}_${userId}`,
          productId,
          userId,
          isGuest: Boolean(isGuest),
          createdAt: new Date(),
        },
        $set: {
          updatedAt: new Date(),
          ...set,
        },
      },
      upsert: true,
    },
  };
}

/* =========================================================
 * VIEWS
 * ========================================================= */
router.post(
  "/product/visit",
  passUserAuth,
  requireSession,
  async (req, res) => {
    try {
      const { productId } = req.body ?? {};
      const user = req.user;
      const userId = user?.id;
      const isAuthenticated = Boolean(user && !user.isAnonymous);

      if (!productId || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const previous = await searchInteraction(productId, userId);
      const alreadyViewed = previous?.hasViewed === true;

      if (!alreadyViewed) {
        mergeInteractionOperation(
          interactionOperation({
            productId,
            userId,
            isGuest: !isAuthenticated,
            set: { hasViewed: true },
          }),
        );
      }

      evt.fire(Evts.INTERACTION_RECORDED, {
        productId,
        userId,
        isGuest: !isAuthenticated,
        interactionType: "view",
        property: "hasViewed",
        timestamp: new Date(),
      });

      evt.fire(
        Evts.PRODUCT_VIEWED,
        new ProductEvent({
          type: Evts.PRODUCT_VIEWED,
          product: null,
          response: { productId, userId },
          isReq: true,
          reqPath: req.url,
          userId,
          productId,
          isGuest: !isAuthenticated,
        }),
      );

      return res.status(200).json({
        message: alreadyViewed
          ? "View already recorded. No action taken."
          : "View recorded successfully",
        unique: !alreadyViewed,
      });
    } catch (error) {
      reportError(error, { route: "/interactions/product/visit" });
      return res.status(500).json({ error: "Failed to record view" });
    }
  },
);

/* =========================================================
 * SHARES
 * ========================================================= */
router.post(
  "/product/share",
  passUserAuth,
  requireSession,
  async (req, res) => {
    try {
      const { productId } = req.body ?? {};
      const user = req.user;
      const userId = user?.id;
      const isAuthenticated = Boolean(user && !user.isAnonymous);

      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }
      if (!user?.id || !user?.email || !user?.name) {
        return res.status(400).json({
          error: "User information is required. At least guest user is required",
        });
      }

      const previous = await searchInteraction(productId, userId);
      if (previous?.hasShared === true) {
        return res.status(200).json({
          message: "Share already recorded. No action taken.",
        });
      }

      mergeInteractionOperation(
        interactionOperation({
          productId,
          userId,
          isGuest: !isAuthenticated,
          set: { hasShared: true, hasViewed: true },
        }),
      );

      evt.fire(Evts.INTERACTION_RECORDED, {
        productId,
        userId,
        isGuest: !isAuthenticated,
        interactionType: "share",
        property: "hasShared",
        timestamp: new Date(),
      });

      evt.fire(
        Evts.PRODUCT_SHARED,
        new ProductEvent({
          type: Evts.PRODUCT_SHARED,
          product: null,
          response: { productId, userId },
          isReq: true,
          reqPath: req.url,
          userId,
          productId,
          isGuest: !isAuthenticated,
        }),
      );

      return res.status(200).json({ message: "Share recorded successfully" });
    } catch (error) {
      reportError(error, { route: "/interactions/product/share" });
      return res.status(500).json({ error: "Failed to record share" });
    }
  },
);

/* =========================================================
 * RATINGS
 * ========================================================= */
router.post(
  "/product/rate",
  requireAuth,
  passUserAuth,
  async (req, res) => {
    try {
      let { productId, rating } = req.body ?? {};
      const user = req.user;
      const userId = user?.id;
      const isAuthenticated = Boolean(user && !user.isAnonymous);

      rating = Math.floor(Math.abs(parseInt(rating, 10)));

      if (!isAuthenticated) {
        return res.status(400).json({
          error:
            "User information is required. guest users cannot rate products. Please log in to rate.",
        });
      }
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          error: "Invalid rating. Please provide a rating between 1 and 5.",
        });
      }
      if (!productId || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const previous = await searchInteraction(productId, userId);
      const previousRating =
        typeof previous?.rating === "number" ? previous.rating : null;

      if (previousRating === rating) {
        return res.status(200).json({
          message: "Rating already recorded. No action taken.",
        });
      }

      mergeInteractionOperation(
        interactionOperation({
          productId,
          userId,
          isGuest: false,
          set: { rating, hasViewed: true },
        }),
      );

      evt.fire(Evts.INTERACTION_RECORDED, {
        productId,
        userId,
        isGuest: false,
        interactionType: "rate",
        property: "rating",
        timestamp: new Date(),
      });

      // A brand-new rating is a PRODUCT_RATED event; changing an
      // existing one is PRODUCT_RATING_UPDATED. Both update the star
      // distribution, only the former increments the rating counter.
      const isNewRating = previousRating === null;
      evt.fire(
        isNewRating ? Evts.PRODUCT_RATED : Evts.PRODUCT_RATING_UPDATED,
        new ProductEvent({
          type: isNewRating ? Evts.PRODUCT_RATED : Evts.PRODUCT_RATING_UPDATED,
          product: null,
          response: {
            productId,
            userId,
            rating,
            previousRating,
          },
          isReq: true,
          reqPath: req.url,
          userId,
          productId,
        }),
      );

      // Stars/reviewCount are user-visible immediately, so flush now.
      await flushRatingBuffer();

      return res.status(200).json({ message: "Rating recorded successfully" });
    } catch (error) {
      reportError(error, { route: "/interactions/product/rate" });
      return res.status(500).json({ error: "Failed to record rating" });
    }
  },
);

router.delete(
  "/product/rate",
  requireAuth,
  passUserAuth,
  async (req, res) => {
    try {
      const { productId } = req.body ?? {};
      const user = req.user;
      const userId = user?.id;
      const isAuthenticated = Boolean(user && !user.isAnonymous);

      if (!isAuthenticated) {
        return res.status(400).json({
          error:
            "User information is required. guest users cannot rate products. Please log in to rate.",
        });
      }
      if (!productId || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const previous = await searchInteraction(productId, userId);
      const previousRating =
        typeof previous?.rating === "number" ? previous.rating : null;

      if (previousRating === null) {
        return res.status(200).json({
          message: "No rating to remove.",
        });
      }

      mergeInteractionOperation(
        interactionOperation({
          productId,
          userId,
          isGuest: false,
          set: { rating: null, hasViewed: true },
        }),
      );

      evt.fire(Evts.INTERACTION_RECORDED, {
        productId,
        userId,
        isGuest: false,
        interactionType: "rate",
        property: "rating",
        timestamp: new Date(),
      });

      evt.fire(
        Evts.PRODUCT_UNRATED,
        new ProductEvent({
          type: Evts.PRODUCT_UNRATED,
          product: null,
          response: { productId, userId, previousRating },
          isReq: true,
          reqPath: req.url,
          userId,
          productId,
        }),
      );

      await flushRatingBuffer();

      return res.status(200).json({ message: "Rating deleted successfully" });
    } catch (error) {
      reportError(error, { route: "/interactions/product/rate" });
      return res.status(500).json({ error: "Failed to remove rating" });
    }
  },
);

/* =========================================================
 * READ
 * ========================================================= */
router.get("/p/:productId", requireAuth, passUserAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const user = req.user;

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }
    if (!user) {
      return res.status(400).json({ error: "User is required" });
    }

    // Merge buffered (not-yet-flushed) interactions with persisted data.
    const interaction =
      (await searchInteraction(productId, user.id)) ||
      (await InteractionModel.findOne({ productId, userId: user.id }).lean());

    if (!interaction) {
      return res.status(404).json({ error: "Interaction not found" });
    }

    return res.status(200).json(interaction);
  } catch (error) {
    reportError(error, { route: "/interactions/p/:productId" });
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* Keep a small hook so an admin/dev can force a flush without waiting. */
router.post("/flush", requireAuth, passUserAuth, async (_req, res) => {
  const result = await requestInteractionFlush({ immediate: true });
  res.json({ success: true, result });
});

export default router;

import express from "express";
import { db } from "../utils/db.js";
import {
  passUserAuth,
  requireAuth,
  requireSession,
} from "../utils/middlewares/reqiuredAuth.js";
import { CommentModel } from "../models/schema/comments.js";
import { evt, Evts, ErrorEvent, CommentEvent } from "../utils/events.manage.js";
import { globalMemory } from "../utils/cache-utils/global-cache.js";
import { productMemoryCache } from "../utils/cache-utils/product-data.js";
import { productFeedCache } from "../utils/cache-utils/product-feed.js";
import { productStatusCache } from "../utils/cache-utils/product-status.js";
import {
  encryptField,
  decryptField,
} from "../utils/crypto/index.js";

const router = express.Router();

/* =========================================================
 * Cache helpers
 * ---------------------------------------------------------
 * Comment lists are cached per user (because "my comments first"
 * depends on the viewer). Any create/update/delete must drop every
 * cached page for that product, otherwise counts go stale.
 * ========================================================= */

function invalidateCommentCaches(productId) {
  const id = String(productId || "");
  if (!id) return;

  const locals = globalMemory?.locals || {};
  for (const key of Object.keys(locals)) {
    if (key.includes(id)) delete locals[key];
  }

  try {
    productMemoryCache?.clearByPrefix?.("");
    productFeedCache?.expire?.();
    productStatusCache?.update?.().catch?.(() => {});
  } catch (error) {
    console.error("[comments] cache invalidation failed:", error?.message);
  }
}

function reportError(error, data = {}) {
  evt.fire(
    Evts.PRODUCT_COMMENT_ERROR,
    new ErrorEvent({
      type: Evts.PRODUCT_COMMENT_ERROR,
      error,
      errorCode: error?.errorCode || error?.code || 500,
      data,
    }),
  );
}

/* =========================================================
 * Incremental product comment counter
 * ---------------------------------------------------------
 * One atomic pipeline update per comment change. Never recounts the
 * whole collection (that was the old, expensive behaviour).
 * ========================================================= */

function commentCounterPipeline(delta) {
  return [
    {
      $set: {
        "metrics.commentCount": {
          $max: [
            0,
            {
              $add: [
                { $ifNull: ["$metrics.commentCount", 0] },
                delta,
              ],
            },
          ],
        },
      },
    },
  ];
}

async function bumpCommentCount(productId, delta) {
  if (!productId || !delta) return;

  try {
    await db
      .collection("products")
      .updateOne({ id: productId }, commentCounterPipeline(delta));
  } catch (error) {
    console.error("[comments] commentCount update failed:", error?.message);
  }
}

/* =========================================================
 * Reviewer PII vaulting (Tier A)
 * ---------------------------------------------------------
 * userName/userEmail/userAvatar are sealed at rest. Comments
 * are PUBLIC on display, so reads decrypt; the database itself
 * holds only ciphertext. (No index tokens: comment search is not
 * offered — add *_idx families here if a search UI appears.)
 * ========================================================= */

function sealCommentAuthorFields(fields = {}) {
  const set = {};
  if (fields.userName) {
    set.userName = encryptField(fields.userName, { context: "comment:userName" });
  }
  if (fields.userEmail) {
    set.userEmail = encryptField(fields.userEmail, { context: "comment:userEmail" });
  }
  if (fields.userAvatar) {
    set.userAvatar = encryptField(fields.userAvatar, { context: "comment:userAvatar" });
  }
  return set;
}

function decryptComment(comment) {
  if (!comment) return comment;
  return {
    ...comment,
    userName: decryptField(comment.userName),
    userEmail: decryptField(comment.userEmail),
    userAvatar: decryptField(comment.userAvatar),
  };
}

/* =========================================================
 * POST /comments — create or update the user's review
 * ========================================================= */

router.post("/", requireAuth, passUserAuth, async (req, res) => {
  const { productId, content: commentText, rating } = req.body ?? {};
  const { id: userId, email, name, image: avatar } = req.user;

  if (!productId || !commentText) {
    return res.status(400).json({
      error: "Product ID and comment text are required",
    });
  }

  try {
    const existing = await CommentModel.findOne({
      productId,
      userId,
    }).lean();

    const comment = await CommentModel.findOneAndUpdate(
      { productId, userId },
      {
        $set: {
          content: commentText,
          rating: Number(rating) || 0,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          productId,
          userId,
          ...sealCommentAuthorFields({ userName: name, userEmail: email, userAvatar: avatar ? avatar : "" }),
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean();

    invalidateCommentCaches(productId);

    if (existing) {
      // Upsert of an existing review: counts do not change.
      evt.fire(
        Evts.PRODUCT_COMMENT_UPDATED,
        new CommentEvent({
          comment: decryptComment(existing),
          type: Evts.PRODUCT_COMMENT_UPDATED,
        }),
      );
      return res.status(200).json(decryptComment(existing));
    }

    await bumpCommentCount(productId, 1);

    evt.fire(
      Evts.PRODUCT_COMMENTED,
      new CommentEvent({
        comment: decryptComment(comment),
        type: Evts.PRODUCT_COMMENTED,
      }),
    );

    return res.status(201).json(decryptComment(comment));
  } catch (error) {
    reportError(error, { productId, userId });
    console.error("Error creating comment:", error);
    return res.status(500).json({ error: "Failed to create comment" });
  }
});

/* =========================================================
 * GET /comments/:productId
 * ========================================================= */

router.get("/:productId", requireSession, passUserAuth, async (req, res) => {
  const productId = req.params.productId;

  // Authenticated user ID, or null for guests
  const userId = req.user?.id ?? null;

  // Cache must be user-specific because comment ordering depends on userId
  const cacheKey = `${req.url}:user:${userId ?? "guest"}`;

  if (
    globalMemory?.getLocalMemory(cacheKey) &&
    req.query?.realtime !== "true"
  ) {
    return res.json(globalMemory.getLocalMemory(cacheKey));
  }

  let results = {};
  let page = parseInt(req.query?.page) || parseInt(req.body?.page) || 1;
  let limit = parseInt(req.query?.limit) || parseInt(req.body?.limit) || 10;
  let sortBy = req.query?.sortBy || req.body?.sortBy || "createdAt";
  let sortOrder = req.query?.sortOrder === "asc" ? 1 : -1;
  let startIndex =
    parseInt(req.query?.startIndex) || parseInt(req.body?.startIndex) || 0;
  if (page > 1) {
    startIndex = (page - 1) * limit;
  }

  try {
    const totalCount = await CommentModel.countDocuments({ productId });
    const comments = await CommentModel.aggregate([
      { $match: { productId } },
      {
        $addFields: {
          isMine: userId
            ? {
                $cond: [{ $eq: ["$userId", userId] }, 1, 0],
              }
            : 0,
        },
      },
      {
        $sort: {
          isMine: -1,
          [sortBy]: sortOrder,
          createdAt: -1,
        },
      },
      { $skip: startIndex },
      { $limit: limit },
      { $project: { isMine: 0 } },
    ]);

    if (!comments || comments.length === 0) {
      return res.status(404).json({
        error: "No comments found for this product",
      });
    }

    const totalPages = Math.ceil(totalCount / limit);

    results = {
      comments: comments.map(decryptComment),
      page,
      limit,
      count: totalCount,
      totalPages,
      next: page < totalPages ? page + 1 : null,
      previous: page > 1 ? page - 1 : null,
      startIndex,
      endIndex: startIndex + comments.length - 1,

      sort: {
        by: sortBy,
        order: sortOrder,
      },

      fromCache: false,
    };

    // User-specific cache because ordering contains "my comments first"
    globalMemory?.setLocalMemory(
      cacheKey,
      {
        ...results,
        fromCache: true,
      },
      60 * 60 * 6,
    ); // Cache for 6 hours

    return res.json(results);
  } catch (error) {
    reportError(error, { productId, userId });
    console.error("Error fetching comments:", error);
    return res.status(500).json({ error: "Failed to fetch comments" });
  }
});

/* =========================================================
 * PUT /comments/:productId — edit the user's review
 * ========================================================= */

router.put("/:productId", requireAuth, passUserAuth, async (req, res) => {
  const productId = req.params.productId;
  const { content: commentText, rating } = req.body ?? {};
  const { id: userId } = req.user;

  if (!commentText) {
    return res.status(400).json({ error: "Comment text is required" });
  }

  try {
    const updatedComment = await CommentModel.findOneAndUpdate(
      { productId, userId },
      {
        $set: {
          content: commentText,
          rating: Number(rating) || 0,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    ).lean();

    if (!updatedComment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    invalidateCommentCaches(productId);

    evt.fire(
      Evts.PRODUCT_COMMENT_UPDATED,
      new CommentEvent({
        comment: decryptComment(updatedComment),
        type: Evts.PRODUCT_COMMENT_UPDATED,
      }),
    );

    return res.json(decryptComment(updatedComment));
  } catch (error) {
    reportError(error, { productId, userId });
    console.error("Error updating comment:", error);
    return res.status(500).json({ error: "Failed to update comment" });
  }
});

/* =========================================================
 * DELETE /comments/:productId — delete the user's review
 * ========================================================= */

router.delete("/:productId", requireAuth, passUserAuth, async (req, res) => {
  const productId = req.params.productId;
  const { id: userId } = req.user;

  try {
    const deletedComment = await CommentModel.findOneAndDelete({
      productId,
      userId,
    }).lean();

    if (!deletedComment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    invalidateCommentCaches(productId);
    await bumpCommentCount(productId, -1);

    evt.fire(
      Evts.PRODUCT_COMMENT_DELETED,
      new CommentEvent({
        comment: deletedComment,
        type: Evts.PRODUCT_COMMENT_DELETED,
      }),
    );

    return res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    reportError(error, { productId, userId });
    console.error("Error deleting comment:", error);
    return res.status(500).json({ error: "Failed to delete comment" });
  }
});

/* =========================================================
 * Events
 * ---------------------------------------------------------
 * Counts are updated inline (above) so they are instant. These
 * listeners only keep caches coherent if a comment event is fired
 * from another module.
 * ========================================================= */

evt.on(Evts.PRODUCT_COMMENTED, ({ comment } = {}) => {
  if (comment?.productId) invalidateCommentCaches(comment.productId);
});

evt.on(Evts.PRODUCT_COMMENT_UPDATED, ({ comment } = {}) => {
  if (comment?.productId) invalidateCommentCaches(comment.productId);
});

evt.on(Evts.PRODUCT_COMMENT_DELETED, ({ comment } = {}) => {
  if (comment?.productId) invalidateCommentCaches(comment.productId);
});

// FEATURE: TODO: comment interaction such as like, replay

export default router;

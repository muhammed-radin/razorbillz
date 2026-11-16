import express from "express";
import { db } from "../utils/db.js";
import {
  requireAuth,
  requireSession,
} from "../utils/middlewares/reqiuredAuth.js";
import { CommentModel } from "../models/schema/comments.js";
import { CounterModel } from "../models/schema/counters.js";
import { evt, Evts, ErrorEvent, CommentEvent } from "../utils/events.manage.js";
import {
  clearCommentLikeDelta,
  getPendingCommentLikeDelta,
  queueCommentLikeDelta,
} from "../utils/commentLikes.js";
import { globalMemory } from "../utils/cache-utils/global-cache.js";
import {
  commentListCacheKey,
  invalidateCommentCaches,
} from "../utils/cacheInvalidation.js";
import {
  encryptField,
  decryptField,
} from "../utils/crypto/index.js";

const router = express.Router();

/* =========================================================
 * Cache keys
 * ---------------------------------------------------------
 * Comment lists are cached per user (because "my comments first"
 * depends on the viewer). Deleting the product's namespace is handled
 * centrally by `cacheInvalidation.js` on comment events, so every
 * create/update/delete/like drops all pages for that product.
 * ========================================================= */

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
    /* Explicit AAD contexts — the fields are sealed with
     * `comment:<field>` (see sealCommentAuthorFields), and those
     * contexts are not in decryptField's fallback list. */
    userName: decryptField(comment.userName, { context: "comment:userName" }),
    userEmail: decryptField(comment.userEmail, { context: "comment:userEmail" }),
    userAvatar: decryptField(comment.userAvatar, { context: "comment:userAvatar" }),
  };
}

/* =========================================================
 * POST /comments — create or update the user's review
 * ========================================================= */

router.post("/", requireAuth, async (req, res) => {
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
 * POST /comments/:commentId/like — toggle the viewer's like
 * ---------------------------------------------------------
 * The `counters` row is the source of truth for WHO liked WHAT
 * (unique refId+userId). The aggregate `comments.likes` count is
 * buffered through utils/commentLikes.js so bursts of toggles do
 * not translate into one document write per click.
 * ========================================================= */

async function setLikeState({ commentId, userId, liked }) {
  const filter = { refId: commentId, userId, type: "comment_like" };
  const existing = await CounterModel.findOne(filter).lean();

  if (!existing) {
    if (!liked) return false;
    try {
      await CounterModel.create({
        _id: `${commentId}_${userId}`,
        refId: commentId,
        userId,
        type: "comment_like",
        active: true,
      });
      return true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const raced = await CounterModel.updateOne(
        { ...filter, active: false },
        { $set: { active: true, updatedAt: new Date() } },
      );
      return raced.modifiedCount > 0;
    }
  }

  if (Boolean(existing.active) === liked) return false;

  const changed = await CounterModel.updateOne(
    { _id: existing._id, active: existing.active },
    { $set: { active: liked, updatedAt: new Date() } },
  );
  return changed.modifiedCount > 0;
}

router.post("/:commentId/like", requireAuth, async (req, res) => {
  const commentId = String(req.params.commentId || "");
  const userId = req.user?.id;

  if (!commentId || !userId) {
    return res.status(400).json({ error: "Comment ID is required" });
  }

  if (!/^[a-f0-9]{24}$/i.test(commentId)) {
    return res.status(400).json({ error: "Invalid comment ID" });
  }

  try {
    const comment = await CommentModel.findById(commentId).lean();
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const existing = await CounterModel.findOne({
      refId: commentId,
      userId,
      type: "comment_like",
    }).lean();
    const liked = !existing?.active;

    const changed = await setLikeState({ commentId, userId, liked });
    if (changed) {
      queueCommentLikeDelta(commentId, liked ? 1 : -1);
    }

    /* Re-read the baseline so deltas flushed between the first read
     * and now are not lost; pending (unflushed) deltas are added on
     * top instead of recounting the whole Counter collection. */
    const baseline =
      (await CommentModel.findById(commentId, { likes: 1 }).lean())?.likes ??
      comment.likes ??
      0;
    const likes = Math.max(
      0,
      Number(baseline || 0) + getPendingCommentLikeDelta(commentId),
    );

    if (changed) {
      invalidateCommentCaches(comment.productId);
      evt.fire(
        Evts.PRODUCT_COMMENT_LIKED,
        new CommentEvent({
          type: Evts.PRODUCT_COMMENT_LIKED,
          comment: {
            id: commentId,
            productId: comment.productId,
            userId,
            likes,
            liked,
          },
        }),
      );
    }

    return res.json({ commentId, liked, likes, changed });
  } catch (error) {
    reportError(error, { commentId, userId });
    console.error("Error toggling comment like:", error);
    return res.status(500).json({ error: "Failed to update comment like" });
  }
});

/* =========================================================
 * GET /comments/:productId
 * ========================================================= */

router.get("/:productId", requireSession, async (req, res) => {
  const productId = req.params.productId;

  // Authenticated user ID, or null for guests
  const userId = req.user?.id ?? null;

  // Cache must be user-specific because comment ordering depends on userId
  const cacheKey = commentListCacheKey(productId, userId, req.url);

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

    /* One counter query for the whole page: viewer-specific liked
     * state without an N+1 lookup per comment. Buffered deltas are
     * added so the count is current even before the next flush. */
    const commentIds = comments.map((comment) => String(comment._id));
    let likedIds = new Set();
    if (userId && commentIds.length) {
      const likes = await CounterModel.find(
        {
          refId: { $in: commentIds },
          userId,
          type: "comment_like",
          active: true,
        },
        { refId: 1, _id: 0 },
      ).lean();
      likedIds = new Set(likes.map((row) => String(row.refId)));
    }

    results = {
      comments: comments.map((comment) => {
        const id = String(comment._id);
        return {
          ...decryptComment(comment),
          likes: Math.max(
            0,
            Number(comment.likes || 0) + getPendingCommentLikeDelta(id),
          ),
          liked: likedIds.has(id),
        };
      }),
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

router.put("/:productId", requireAuth, async (req, res) => {
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

router.delete("/:productId", requireAuth, async (req, res) => {
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
    clearCommentLikeDelta(deletedComment._id);
    await CounterModel.deleteMany({ refId: String(deletedComment._id) });

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

// FEATURE: TODO: comment interaction such as like, replay

export default router;

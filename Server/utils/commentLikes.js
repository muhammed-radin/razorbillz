import { CommentModel } from "../models/schema/comments.js";

/* =========================================================
 * Buffered comment-like counter.
 * ---------------------------------------------------------
 * A like toggle writes the authoritative per-user row in the
 * `counters` collection immediately (unique refId+userId prevents
 * duplicate likes). The aggregate `comments.likes` counter is
 * applied in small batches instead of one write per click, which
 * keeps rapid like/unlike traffic cheap.
 *
 * Each batch uses an atomic pipeline update so concurrent flushes
 * cannot lose increments and likes never drop below zero.
 * ========================================================= */

const FLUSH_INTERVAL_MS = 2_000;

/** commentId -> pending delta (may be negative) */
const pending = new Map();
let flushTimer = null;
let inFlight = null;

function ensureTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushCommentLikeDeltas().catch((error) => {
      console.error("[comment-likes] flush failed:", error?.message);
    });
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

function stopTimerIfIdle() {
  if (pending.size === 0 && flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function queueCommentLikeDelta(commentId, delta) {
  const id = String(commentId || "");
  const amount = Number(delta);
  if (!id || !Number.isFinite(amount) || amount === 0) return;

  pending.set(id, (pending.get(id) || 0) + amount);
  ensureTimer();
}

export function getPendingCommentLikeDelta(commentId) {
  return pending.get(String(commentId || "")) || 0;
}

export function clearCommentLikeDelta(commentId) {
  pending.delete(String(commentId || ""));
  stopTimerIfIdle();
}

async function flushPending(entries) {
  if (!entries.length) return;

  const operations = entries.map(([commentId, delta]) => ({
    updateOne: {
      filter: { _id: commentId },
      update: [
        {
          $set: {
            likes: {
              $max: [
                0,
                { $add: [{ $ifNull: ["$likes", 0] }, delta] },
              ],
            },
          },
        },
      ],
    },
  }));

  try {
    await CommentModel.bulkWrite(operations, { ordered: false });
  } catch (error) {
    /* Re-queue so a transient DB hiccup does not lose likes. */
    for (const [commentId, delta] of entries) queueCommentLikeDelta(commentId, delta);
    throw error;
  }
}

export async function flushCommentLikeDeltas() {
  if (inFlight) return inFlight;
  if (pending.size === 0) return;

  const entries = [...pending.entries()];
  pending.clear();

  inFlight = (async () => {
    try {
      await flushPending(entries);
    } finally {
      inFlight = null;
      stopTimerIfIdle();
    }
  })();

  return inFlight;
}

export default {
  queueCommentLikeDelta,
  getPendingCommentLikeDelta,
  clearCommentLikeDelta,
  flushCommentLikeDeltas,
};

import { db, checkCurrentConnection } from "./db.js";
import { evt, Evts } from "./events.manage.js";

/* =========================================================
 * Buffered user statistics
 * ---------------------------------------------------------
 * lastLogin / currentlyLoggedIn / totalOrders / totalSpent are
 * "eventually consistent" presentation fields. They are written in
 * batches (one bulkWrite per flush) instead of on every request/event.
 * ========================================================= */

const MAX_PENDING = 5000;
const DEDUPE_TTL_MS = 60 * 60 * 1000;

let pending = new Map();
let inFlight = null;
const processedOrders = new Map();

function pruneDedupe() {
  const cutoff = Date.now() - DEDUPE_TTL_MS;
  for (const [orderId, at] of processedOrders.entries()) {
    if (at < cutoff) processedOrders.delete(orderId);
  }
}

function markOrderOnce(orderId) {
  if (!orderId) return true;
  pruneDedupe();
  if (processedOrders.has(orderId)) return false;
  processedOrders.set(orderId, Date.now());
  return true;
}

function queue(userId, patch = {}) {
  if (!userId) return;

  const current = pending.get(userId) || {};
  const next = { ...current };

  if (patch.lastLogin) {
    if (!next.lastLogin || patch.lastLogin > next.lastLogin) {
      next.lastLogin = patch.lastLogin;
    }
  }
  if (typeof patch.currentlyLoggedIn === "boolean") {
    next.currentlyLoggedIn = patch.currentlyLoggedIn;
  }
  if (Number.isFinite(patch.totalOrders) && patch.totalOrders !== 0) {
    next.totalOrders = (next.totalOrders || 0) + patch.totalOrders;
  }
  if (Number.isFinite(patch.totalSpent) && patch.totalSpent !== 0) {
    next.totalSpent = (next.totalSpent || 0) + patch.totalSpent;
  }

  pending.set(userId, next);

  if (pending.size >= MAX_PENDING) {
    flushUserStats().catch(() => {});
  }
}

function eventUserId(event) {
  return (
    event?.userId ||
    event?.user?.id ||
    event?.session?.userId ||
    event?.session?.user?.id ||
    event?.order?.userId ||
    event?.content?.userId ||
    null
  );
}

evt.on(Evts.USER_LOGGED_IN, (event) => {
  const userId = eventUserId(event);
  if (!userId || event?.isGuest) return;
  queue(userId, {
    lastLogin: new Date(event?.timestamp || Date.now()),
    currentlyLoggedIn: true,
  });
});

evt.on(Evts.USER_LOGGED_OUT, (event) => {
  const userId = eventUserId(event);
  if (!userId || event?.isGuest) return;
  queue(userId, { currentlyLoggedIn: false });
});

evt.on(Evts.ORDER_PLACED, (event) => {
  const order = event?.order || event?.content?.order || event;
  const userId = eventUserId(event) || order?.userId;
  if (!userId || !order?.id) return;
  if (!markOrderOnce(order.id)) return;

  queue(userId, { totalOrders: 1 });
});

/* Spend is only counted when money is actually captured, so the same
 * rule as analytics revenue applies: ORDER_PAID for prepaid orders and
 * COD_COLLECTED for cash-on-delivery. ORDER_PLACED never adds spend. */
evt.on(Evts.ORDER_PAID, (event) => {
  const order = event?.order || event?.content?.order || event;
  const userId = eventUserId(event) || order?.userId;
  const orderId = event?.orderId || order?.id || event?.content?.orderId;
  if (!userId || !orderId) return;
  if (!markOrderOnce(`spend:${orderId}`)) return;

  const amount = Number(
    event?.amount ??
      event?.content?.amount ??
      order?.payment?.amountPaid ??
      order?.totalAmount ??
      0,
  );
  if (Number.isFinite(amount) && amount > 0) {
    queue(userId, { totalSpent: amount });
  }
});

evt.on(Evts.COD_COLLECTED, (event) => {
  const userId = eventUserId(event);
  const orderId = event?.orderId || event?.order?.id || event?.content?.orderId;
  if (!userId || !orderId) return;
  if (!markOrderOnce(`cod:${orderId}`)) return;

  const amount = Number(
    event?.amount ??
      event?.content?.amount ??
      event?.order?.payment?.amountPaid ??
      0,
  );
  if (Number.isFinite(amount) && amount > 0) {
    queue(userId, { totalSpent: amount });
  }
});

evt.on(Evts.ORDER_REFUNDED, (event) => {
  const userId = eventUserId(event);
  const orderId = event?.orderId || event?.order?.id || event?.content?.orderId;
  if (!userId || !orderId) return;

  // Every completed refund is a distinct amount (partial refunds can be
  // requested repeatedly), so this event must not be deduped by order id
  // the way ORDER_PAID/COD_COLLECTED are.
  const amount = Math.abs(
    Number(event?.amount ?? event?.content?.amount ?? 0),
  );
  if (Number.isFinite(amount) && amount > 0) {
    queue(userId, { totalSpent: -amount });
  }
});

function toBulkOperation(userId, stats) {
  const set = {};
  const inc = {};

  if (stats.lastLogin) set.lastLogin = stats.lastLogin;
  if (typeof stats.currentlyLoggedIn === "boolean") {
    set.currentlyLoggedIn = stats.currentlyLoggedIn;
  }
  if (stats.totalOrders) inc.totalOrders = stats.totalOrders;
  if (stats.totalSpent) inc.totalSpent = stats.totalSpent;

  if (Object.keys(set).length === 0 && Object.keys(inc).length === 0) {
    return null;
  }

  set.updatedAt = new Date();
  const update = { $set: set };
  if (Object.keys(inc).length > 0) update.$inc = inc;

  return {
    updateOne: {
      filter: { id: userId },
      update,
      upsert: false,
    },
  };
}

export async function flushUserStats() {
  if (!checkCurrentConnection() || pending.size === 0) {
    return { skipped: true, count: 0 };
  }

  if (inFlight) return inFlight;

  const snapshot = pending;
  pending = new Map();

  const operations = [];
  for (const [userId, stats] of snapshot.entries()) {
    const op = toBulkOperation(userId, stats);
    if (op) operations.push(op);
  }

  if (operations.length === 0) {
    return { count: 0 };
  }

  inFlight = db
    .collection("users")
    .bulkWrite(operations, { ordered: false })
    .then((result) => ({
      count: operations.length,
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0,
    }))
    .catch((error) => {
      // Never lose counters: merge the snapshot back for the next flush.
      for (const [userId, stats] of snapshot.entries()) {
        const current = pending.get(userId) || {};
        pending.set(userId, {
          lastLogin:
            current.lastLogin && stats.lastLogin
              ? new Date(
                  Math.max(current.lastLogin.getTime(), stats.lastLogin.getTime()),
                )
              : (current.lastLogin || stats.lastLogin),
          currentlyLoggedIn:
            typeof current.currentlyLoggedIn === "boolean"
              ? current.currentlyLoggedIn
              : stats.currentlyLoggedIn,
          totalOrders: (current.totalOrders || 0) + (stats.totalOrders || 0),
          totalSpent: (current.totalSpent || 0) + (stats.totalSpent || 0),
        });
      }
      console.error("[user-stats] flush failed:", error?.message);
      return { count: 0, error: true };
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export async function defineUserStatsJobs(agenda) {
  agenda.define("user-stats:flush", async () => flushUserStats());
}

export async function scheduleUserStatsJobs(agenda) {
  await agenda.every("2 minutes", "user-stats:flush");
}

export function getUserStatsDebugState() {
  return {
    pending: Object.fromEntries(pending),
    processedOrders: processedOrders.size,
  };
}

export default {
  flushUserStats,
  defineUserStatsJobs,
  scheduleUserStatsJobs,
  getUserStatsDebugState,
};

import { UAParser } from "ua-parser-js";
import {
  evt,
  Evts,
  isMajorEvent,
  eventSector,
} from "./events.manage.js";
import { ClassicEvent } from "../shared/models/event.js";
import { checkCurrentConnection } from "./db.js";
import {
  AnalyticEventModel,
  DailyAnalyticsModel,
  EventsRecordModel,
  SiteAnalyticsModel,
} from "../models/schema/analytics.js";
import { calculateAnalyticsFrom } from "./calc_analytics.js";

/* =========================================================
 * Event-driven analytics engine
 * ---------------------------------------------------------
 * Design goals (free-tier friendly):
 *  - business requests only append to in-memory buffers
 *  - agenda flushes them in batches with insertMany + $inc
 *  - daily/site counters are INCREMENTAL, never recalculated per event
 *  - a periodic reconciliation repairs drift from lost batches
 * ========================================================= */

const MAX_BUFFER_SIZE = 2000;
const MAX_DEBUG_EVENTS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

/* Every event type that contributes to analytics. Comment events are
 * included even though they are "minor" so review counters stay live. */
const ANALYTICS_EVENT_TYPES = new Set([
  Evts.ERROR,
  Evts.SITE_VIEWED,
  Evts.USER_LOGGED_IN,
  Evts.USER_LOGGED_OUT,
  Evts.USER_REGISTERED,
  Evts.USER_DELETED,
  Evts.USER_PASSWORD_CHANGED,
  Evts.PRODUCT_CREATED,
  Evts.PRODUCT_UPDATED,
  Evts.PRODUCT_DELETED,
  Evts.PRODUCT_SEARCHED,
  Evts.PRODUCT_SEARCHED_FROM_CACHE,
  Evts.PRODUCT_VIEWED,
  Evts.PRODUCT_RATED,
  Evts.PRODUCT_UNRATED,
  Evts.PRODUCT_SHARED,
  Evts.PRODUCT_WISHLISTED,
  Evts.PRODUCT_CARTED,
  Evts.PRODUCT_COMMENTED,
  Evts.PRODUCT_COMMENT_UPDATED,
  Evts.PRODUCT_COMMENT_DELETED,
  Evts.PRODUCT_COMMENT_ERROR,
  Evts.WISHLIST_ERROR,
  Evts.PRODUCT_LOW_STOCK,
  Evts.PRODUCT_OUT_OF_STOCK,
  Evts.WISHLIST_REMOVED,
  Evts.CART_ITEM_ADDED,
  Evts.CART_ITEM_REMOVED,
  Evts.CART_CLEARED,
  Evts.CART_ERROR,
  Evts.ORDER_PLACED,
  Evts.ORDER_PAID,
  Evts.ORDER_REFUNDED,
  Evts.ORDER_CANCELLED,
  Evts.ORDER_COMPLETED,
  Evts.ORDER_RETURN_REQUESTED,
  Evts.ORDER_CREATE_FAILED,
  Evts.PAYMENT_SUCCEEDED,
  Evts.PAYMENT_FAILED,
  Evts.PAYMENT_CANCELLED,
  Evts.COD_COLLECTED,
  Evts.COD_COLLECTION_FAILED,
  Evts.SHIPMENT_CREATE_FAILED,
  Evts.SEARCH_SUBMITTED,
]);

const ACTIVITY_EVENT_TYPES = new Set([
  ...ANALYTICS_EVENT_TYPES,
  Evts.USER_PROFILE_UPDATED,
  Evts.USER_LOGIN_FAILED,
  Evts.ORDER_CREATE_ATTEMPT,
  Evts.ORDER_STATUS_CHANGED,
  Evts.PRODUCT_RATING_UPDATED,
  Evts.PAYMENT_INITIATED,
  Evts.PAYMENT_VERIFICATION_FAILED,
  Evts.PAYMENT_WEBHOOK_VERIFIED,
]);

let activityBuffer = [];
let analyticBuffer = [];
let counterBuffer = new Map(); // dayKey -> { daily: {}, site: {} }
const uniqueViewers = new Map(); // dayKey -> { users: Set, guests: Set }
let debugEvents = [];

let flushInFlight = null;
let flushQueued = false;

/* =========================================================
 * Helpers
 * ========================================================= */

function dayKeyOf(timestamp) {
  const date = new Date(timestamp || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dayStart(dayKey) {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function inc(target, path, amount = 1) {
  if (!amount) return;
  target[path] = (target[path] || 0) + amount;
}

function ensureCounterBucket(dayKey) {
  if (!counterBuffer.has(dayKey)) {
    counterBuffer.set(dayKey, { daily: {}, site: {} });
  }
  return counterBuffer.get(dayKey);
}

function ensureViewerSet(dayKey) {
  if (!uniqueViewers.has(dayKey)) {
    uniqueViewers.set(dayKey, { users: new Set(), guests: new Set() });
  }
  return uniqueViewers.get(dayKey);
}

function mergeCounterMaps(target, source) {
  for (const [path, amount] of Object.entries(source || {})) {
    target[path] = (target[path] || 0) + amount;
  }
}

function getDeviceType(userAgentString) {
  if (!userAgentString) return "other";
  const parser = new UAParser(userAgentString);
  const device = parser.getDevice();
  if (device.type === "mobile" || device.type === "tablet") return device.type;
  const result = parser.getResult();
  if (!device.type && (result.browser.name || result.os.name)) return "desktop";
  return "other";
}

function parseUserAgent(value) {
  const parser = new UAParser(value || "");
  const result = parser.getResult();
  return {
    browser: normalizeBrowser(result.browser.name),
    browserName: result.browser.name || null,
    browserVersion: result.browser.version || null,
    os: (result.os.name || "").toLowerCase() || null,
    device: result.device.model || null,
    deviceType: deviceTypeOf(value),
    screen: getDeviceType(value),
  };
}

function deviceTypeOf(value) {
  if (!value) return "other";
  const parser = new UAParser(value);
  const type = parser.getDevice().type;
  return type === "mobile" || type === "tablet" ? type : "other";
}

function normalizeBrowser(browser) {
  const value = String(browser || "").toLowerCase();
  if (value.includes("edg")) return "edge";
  if (value.includes("chrome")) return "chrome";
  if (value.includes("firefox")) return "firefox";
  if (value.includes("safari")) return "safari";
  return "other";
}

function titleFromType(type) {
  return String(type || "event")
    .replace(/^product_/, "Product ")
    .replace(/^user_/, "User ")
    .replace(/^order_/, "Order ")
    .replace(/^payment_/, "Payment ")
    .replace(/^cart_/, "Cart ")
    .replace(/^wishlist_/, "Wishlist ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/* Turn a plain `evt.fire(name, payload)` into a ClassicEvent so every
 * event has the same shape (type, timestamp, sector, error, user...). */
function normalizeEvent(name, data, timestamp) {
  const raw = Array.isArray(data) ? data[0] : data;

  if (raw && typeof raw === "object" && raw.type) {
    if (!raw.timestamp) raw.timestamp = timestamp || Date.now();
    return raw;
  }

  const payload = raw && typeof raw === "object" ? raw : {};
  const created = new ClassicEvent({
    type: name,
    isMajor: isMajorEvent(name),
    sector: eventSector(name),
    content: payload,
    userId:
      payload.userId ??
      payload.user?.id ??
      payload.session?.userId ??
      payload.session?.user?.id ??
      null,
    actorId: payload.actorId ?? payload.userId ?? null,
    productId:
      payload.productId ??
      payload.product?.id ??
      payload.response?.productId ??
      null,
    orderId: payload.orderId ?? payload.order?.id ?? null,
    isGuest:
      payload.isGuest ??
      payload.session?.isAnonymous ??
      payload.session?.user?.isAnonymous ??
      false,
    userAgent:
      payload.userAgent ??
      payload.session?.userAgent ??
      payload.headers?.["user-agent"] ??
      null,
    error: payload.error ?? payload.reason ?? null,
    errorCode: payload.errorCode ?? payload.code ?? null,
    isError: isErrorType(name) || payload.isError === true,
  });
  created.timestamp = timestamp || Date.now();
  return created;
}

function isErrorType(type) {
  return (
    type === Evts.ERROR ||
    type === Evts.PRODUCT_COMMENT_ERROR ||
    type === Evts.CART_ERROR ||
    type === Evts.WISHLIST_ERROR ||
    type === Evts.ORDER_CREATE_FAILED ||
    type === Evts.SHIPMENT_CREATE_FAILED ||
    type === Evts.COD_COLLECTION_FAILED
  );
}

function eventUserId(event) {
  return (
    event.userId ||
    event.user?.id ||
    event.response?.userId ||
    event.session?.userId ||
    event.session?.user?.id ||
    null
  );
}

function eventSessionId(event) {
  return event.session?.id || event.sessionId || null;
}

function eventUserAgent(event) {
  return (
    event.userAgent ||
    event.session?.userAgent ||
    event.content?.userAgent ||
    null
  );
}

function eventProductId(event) {
  return (
    event.productId ||
    event.product?.id ||
    event.comment?.productId ||
    event.response?.productId ||
    event.order?.productId ||
    null
  );
}

function eventOrderId(event) {
  return event.orderId || event.order?.id || null;
}

function orderRevenue(type, event) {
  const order = event.order || event.content?.order || event;
  // Revenue is only counted once, when money is actually captured.
  // ORDER_PLACED is the order-count event; prepaid orders also fire
  // ORDER_PAID when the payment is verified.
  if (type === Evts.ORDER_PAID) {
    return Number(
      order?.payment?.amountPaid ??
        event.content?.amount ??
        event.amount ??
        order?.totalAmount ??
        event.content?.totalAmount ??
        0,
    );
  }
  if (type === Evts.COD_COLLECTED) {
    return Number(
      event.content?.amount ??
        event.amount ??
        event.payment?.amountPaid ??
        order?.payment?.amountPaid ??
        0,
    );
  }
  if (type === Evts.ORDER_REFUNDED) {
    return -Math.abs(Number(event.content?.amount ?? event.amount ?? 0));
  }
  return 0;
}

/* =========================================================
 * Record builders
 * ========================================================= */

function buildActivityRecord(event, type) {
  const userId = eventUserId(event);
  const productId = eventProductId(event);
  const orderId = eventOrderId(event);
  const search =
    event.response?.search ?? event.search?.query ?? event.content?.search ?? null;

  return {
    type,
    timestamp: new Date(event.timestamp || Date.now()),
    title: event.title || titleFromType(type),
    message:
      event.message ||
      (search
        ? `Search: "${String(search).slice(0, 200)}"`
        : `${titleFromType(type)} recorded`),
    userId,
    sessionId: eventSessionId(event),
    sector: event.sector || eventSector(type),
    path: event.reqPath || null,
    eventId: event.id,
    productId,
    orderId,
    isError: Boolean(event.isError || isErrorType(type)),
    isGuest: Boolean(event.isGuest),
    isMajor: Boolean(event.isMajor || isMajorEvent(type)),
    refId: orderId || productId || userId || null,
    actor: event.order?.actor || false,
    actorId: event.order?.actorId || event.actorId || null,
    metadata: {
      isAnalytics: ANALYTICS_EVENT_TYPES.has(type),
      provider: event.provider || null,
    },
    error: event.error ? String(event.error).slice(0, 1000) : null,
    errorCode: Number.isFinite(Number(event.errorCode))
      ? Number(event.errorCode)
      : null,
  };
}

function buildAnalyticRecord(event, type) {
  const parser = parseUserAgent(eventUserAgent(event));
  const search =
    event.response?.search ?? event.search?.query ?? event.content?.search ?? null;
  const revenue = orderRevenue(type, event);

  return {
    type,
    timestamp: new Date(event.timestamp || Date.now()),
    userId: eventUserId(event),
    sessionId: eventSessionId(event),
    eventId: event.id,
    path: event.reqPath || null,
    productId: eventProductId(event),
    orderId: eventOrderId(event),
    search: search ? { query: String(search).slice(0, 300) } : undefined,
    order: {
      actor: event.order?.actor || null,
      actorId: event.order?.actorId || event.actorId || null,
      revenue,
    },
    browser: parser.browser,
    device: parser.screen,
    os: parser.os,
    sector: event.sector || eventSector(type),
    userAgent: eventUserAgent(event),
    isGuest: Boolean(event.isGuest),
    isError: Boolean(event.isError || isErrorType(type)),
    metadata: {
      isAnalytics: true,
      provider: event.provider || null,
    },
  };
}

/* =========================================================
 * Incremental counters
 * ========================================================= */

function applyEventCounters(event, type) {
  const timestamp = event.timestamp || Date.now();
  const dayKey = dayKeyOf(timestamp);
  const bucket = ensureCounterBucket(dayKey);
  const { daily, site } = bucket;

  inc(daily, "events.total");
  inc(site, "events.total");

  const hasError = Boolean(event.isError || isErrorType(type));
  if (hasError) {
    inc(daily, "events.errors");
    inc(site, "events.errors");
  }

  if (type === Evts.USER_LOGGED_IN) {
    inc(daily, "events.sessions");
    inc(site, "events.sessions");
    // Anonymous/guest sessions are traffic, not logged-in users.
    if (!event.isGuest) {
      inc(daily, "users.loggedInUsers");
      inc(site, "users.loggedInUsers");
    }
  }

  if (type === Evts.USER_REGISTERED) {
    inc(daily, "users.signedUpUsers");
    inc(site, "users.signedUpUsers");
    inc(site, "users.totalUsers");
  }

  if (type === Evts.USER_DELETED) {
    inc(daily, "users.deletedUsers");
    inc(site, "users.deletedUsers");
    inc(site, "users.totalUsers", -1);
  }

  if (type === Evts.USER_PASSWORD_CHANGED) {
    inc(daily, "users.passwordChanged");
    inc(site, "users.passwordChanged");
  }

  if (type === Evts.SITE_VIEWED) {
    const parser = parseUserAgent(eventUserAgent(event));
    inc(daily, "traffic.allViews");
    inc(site, "traffic.allViews");
    inc(daily, `traffic.devices.${parser.screen}`);
    inc(site, `traffic.devices.${parser.screen}`);
    inc(daily, `traffic.sources.${parser.browser}`);
    inc(site, `traffic.sources.${parser.browser}`);

    const viewers = ensureViewerSet(dayKey);
    const userId = eventUserId(event);
    const guest = Boolean(event.isGuest);
    const key = userId || eventSessionId(event);
    if (key) {
      const set = guest ? viewers.guests : viewers.users;
      if (!set.has(key)) {
        set.add(key);
        const field = guest ? "traffic.uniqueGuests" : "traffic.uniqueUsers";
        inc(daily, field);
        inc(site, field);
        inc(daily, "traffic.debouncedViews");
        inc(site, "traffic.debouncedViews");
      }
    }
  }

  if (type === Evts.PRODUCT_SEARCHED) {
    inc(daily, "products.searches");
    inc(site, "products.searches");
  }

  if (type === Evts.PRODUCT_VIEWED) {
    inc(daily, "products.views");
    inc(site, "products.views");
  }

  if (type === Evts.PRODUCT_LOW_STOCK) {
    inc(daily, "products.lowStock");
    inc(site, "products.lowStock");
  }

  if (type === Evts.PRODUCT_OUT_OF_STOCK) {
    inc(daily, "products.outOfStock");
    inc(site, "products.outOfStock");
  }

  if (type === Evts.PRODUCT_CREATED) {
    inc(daily, "products.totalProducts");
    inc(site, "products.totalProducts");
  }

  if (type === Evts.PRODUCT_DELETED) {
    inc(daily, "products.totalProducts", -1);
    inc(site, "products.totalProducts", -1);
  }

  if (type === Evts.PRODUCT_RATED) {
    inc(daily, "engagement.ratings");
    inc(site, "engagement.ratings");
  }

  if (type === Evts.PRODUCT_UNRATED) {
    inc(daily, "engagement.ratings", -1);
    inc(site, "engagement.ratings", -1);
  }

  if (type === Evts.PRODUCT_SHARED) {
    inc(daily, "engagement.shares");
    inc(site, "engagement.shares");
  }

  if (type === Evts.PRODUCT_WISHLISTED) {
    inc(daily, "engagement.wishlists");
    inc(site, "engagement.wishlists");
  }

  if (type === Evts.WISHLIST_REMOVED) {
    inc(daily, "engagement.wishlists", -1);
    inc(site, "engagement.wishlists", -1);
  }

  if (type === Evts.PRODUCT_COMMENTED) {
    inc(daily, "engagement.comments");
    inc(site, "engagement.comments");
    inc(daily, "reviews.total");
    inc(site, "reviews.total");
  }

  if (type === Evts.PRODUCT_COMMENT_DELETED) {
    inc(daily, "engagement.comments", -1);
    inc(site, "engagement.comments", -1);
    inc(daily, "reviews.total", -1);
    inc(site, "reviews.total", -1);
  }

  if (type === Evts.ORDER_PLACED) {
    inc(daily, "orders.total");
    inc(site, "orders.totalOrders");
  }

  if (type === Evts.ORDER_COMPLETED) {
    inc(daily, "orders.delivered");
    inc(site, "orders.delivered");
  }

  if (type === Evts.ORDER_CANCELLED) {
    inc(daily, "orders.cancelled");
    inc(site, "orders.cancelled");
  }

  if (type === Evts.ORDER_RETURN_REQUESTED) {
    inc(daily, "orders.returned");
    inc(site, "orders.returned");
  }

  const revenue = orderRevenue(type, event);
  if (revenue) {
    inc(daily, "orders.revenue", revenue);
    inc(site, "orders.revenue", revenue);
  }
}

/* =========================================================
 * Listener
 * ========================================================= */

evt.onListen(function ({ event: name, data, timestamp }) {
  if (!name || name === "request" || name === Evts.EVENT_RECORDED) return;

  const event = normalizeEvent(name, data, timestamp);
  const type = event.type || name;

  if (type === Evts.EVENT_RECORDED) return;

  debugEvents.push({
    event: type,
    timestamp: event.timestamp || timestamp,
    sector: event.sector || eventSector(type),
    isMajor: Boolean(event.isMajor || isMajorEvent(type)),
  });
  if (debugEvents.length > MAX_DEBUG_EVENTS) {
    debugEvents = debugEvents.slice(-MAX_DEBUG_EVENTS);
  }

  const analytics = ANALYTICS_EVENT_TYPES.has(type);
  const activity = event.isMajor || isMajorEvent(type) || ACTIVITY_EVENT_TYPES.has(type);

  if (activity) {
    activityBuffer.push(buildActivityRecord(event, type));
  }

  if (analytics) {
    analyticBuffer.push(buildAnalyticRecord(event, type));
    applyEventCounters(event, type);
  }

  // Never let an unbounded buffer grow if agenda is unavailable.
  if (
    activityBuffer.length >= MAX_BUFFER_SIZE ||
    analyticBuffer.length >= MAX_BUFFER_SIZE
  ) {
    requestAnalyticsFlush().catch(() => {});
  }
});

/* =========================================================
 * Flush
 * ========================================================= */

function restoreCounters(counters) {
  for (const [dayKey, value] of counters.entries()) {
    const bucket = ensureCounterBucket(dayKey);
    mergeCounterMaps(bucket.daily, value.daily);
    mergeCounterMaps(bucket.site, value.site);
  }
}

async function writeCounters(counters) {
  const updatedAt = new Date();

  for (const [dayKey, value] of counters.entries()) {
    const { daily, site } = value;

    if (Object.keys(daily).length > 0) {
      await DailyAnalyticsModel.updateOne(
        { _id: dayKey },
        {
          $inc: daily,
          $set: { date: dayStart(dayKey), updatedAt },
          $setOnInsert: { createdAt: updatedAt },
        },
        { upsert: true },
      );
    }

    if (Object.keys(site).length > 0) {
      await SiteAnalyticsModel.updateOne(
        { _id: "global_counters" },
        {
          $inc: site,
          $set: { updatedAt },
          $setOnInsert: { createdAt: updatedAt },
        },
        { upsert: true },
      );
    }
  }
}

export async function flushAnalytics() {
  if (!checkCurrentConnection()) {
    return { skipped: true, reason: "database-not-ready" };
  }

  if (flushInFlight) {
    flushQueued = true;
    return flushInFlight;
  }

  flushInFlight = (async () => {
    let result = { activities: 0, analytics: 0, counters: 0, queued: false };

    do {
      flushQueued = false;

      const activities = activityBuffer;
      const analytics = analyticBuffer;
      const counters = counterBuffer;

      activityBuffer = [];
      analyticBuffer = [];
      counterBuffer = new Map();

      try {
        if (activities.length > 0) {
          await EventsRecordModel.insertMany(activities, { ordered: false });
          result.activities += activities.length;
        }
      } catch (error) {
        console.error("[analytics] activity flush failed:", error?.message);
        activityBuffer = activities.concat(activityBuffer);
      }

      try {
        if (analytics.length > 0) {
          await AnalyticEventModel.insertMany(analytics, { ordered: false });
          result.analytics += analytics.length;
        }
      } catch (error) {
        console.error("[analytics] event flush failed:", error?.message);
        analyticBuffer = analytics.concat(analyticBuffer);
      }

      try {
        if (counters.size > 0) {
          await writeCounters(counters);
          result.counters += counters.size;

          // Unique-viewer sets are only safe to drop after counters landed.
          const today = dayKeyOf(Date.now());
          for (const dayKey of uniqueViewers.keys()) {
            if (dayKey < today) uniqueViewers.delete(dayKey);
          }
        }
      } catch (error) {
        console.error("[analytics] counter flush failed:", error?.message);
        restoreCounters(counters);
      }

      result.queued = flushQueued;
    } while (flushQueued);

    return result;
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}

export function requestAnalyticsFlush() {
  return flushAnalytics().catch((error) => {
    console.error("[analytics] flush request failed:", error?.message);
    return null;
  });
}

/* =========================================================
 * Reconciliation (repairs drift, never used per event)
 * ========================================================= */

async function aggregateDay(dayKey) {
  const start = dayStart(dayKey);
  const end = new Date(start.getTime() + DAY_MS);
  const match = { timestamp: { $gte: start, $lt: end } };

  const [row] = await AnalyticEventModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        errors: { $sum: { $cond: ["$isError", 1, 0] } },
        sessions: {
          $sum: { $cond: [{ $eq: ["$type", Evts.USER_LOGGED_IN] }, 1, 0] },
        },
        allViews: {
          $sum: { $cond: [{ $eq: ["$type", Evts.SITE_VIEWED] }, 1, 0] },
        },
        desktop: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.SITE_VIEWED] },
                  { $eq: ["$device", "desktop"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        mobile: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.SITE_VIEWED] },
                  { $eq: ["$device", "mobile"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        tablet: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.SITE_VIEWED] },
                  { $eq: ["$device", "tablet"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        chrome: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.SITE_VIEWED] },
                  { $eq: ["$browser", "chrome"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        firefox: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.SITE_VIEWED] },
                  { $eq: ["$browser", "firefox"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        safari: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.SITE_VIEWED] },
                  { $eq: ["$browser", "safari"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        edge: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.SITE_VIEWED] },
                  { $eq: ["$browser", "edge"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        otherBrowsers: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.SITE_VIEWED] },
                  { $eq: ["$browser", "other"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        loggedInUsers: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", Evts.USER_LOGGED_IN] },
                  { $eq: ["$isGuest", false] },
                ],
              },
              1,
              0,
            ],
          },
        },
        signedUpUsers: {
          $sum: { $cond: [{ $eq: ["$type", Evts.USER_REGISTERED] }, 1, 0] },
        },
        deletedUsers: {
          $sum: { $cond: [{ $eq: ["$type", Evts.USER_DELETED] }, 1, 0] },
        },
        passwordChanged: {
          $sum: {
            $cond: [{ $eq: ["$type", Evts.USER_PASSWORD_CHANGED] }, 1, 0],
          },
        },
        views: {
          $sum: { $cond: [{ $eq: ["$type", Evts.PRODUCT_VIEWED] }, 1, 0] },
        },
        searches: {
          $sum: { $cond: [{ $eq: ["$type", Evts.PRODUCT_SEARCHED] }, 1, 0] },
        },
        lowStock: {
          $sum: { $cond: [{ $eq: ["$type", Evts.PRODUCT_LOW_STOCK] }, 1, 0] },
        },
        outOfStock: {
          $sum: {
            $cond: [{ $eq: ["$type", Evts.PRODUCT_OUT_OF_STOCK] }, 1, 0],
          },
        },
        totalProducts: {
          $sum: {
            $cond: [
              { $eq: ["$type", Evts.PRODUCT_CREATED] },
              1,
              {
                $cond: [{ $eq: ["$type", Evts.PRODUCT_DELETED] }, -1, 0],
              },
            ],
          },
        },
        ratings: {
          $sum: {
            $cond: [
              { $eq: ["$type", Evts.PRODUCT_RATED] },
              1,
              {
                $cond: [{ $eq: ["$type", Evts.PRODUCT_UNRATED] }, -1, 0],
              },
            ],
          },
        },
        shares: {
          $sum: { $cond: [{ $eq: ["$type", Evts.PRODUCT_SHARED] }, 1, 0] },
        },
        wishlists: {
          $sum: {
            $cond: [
              { $eq: ["$type", Evts.PRODUCT_WISHLISTED] },
              1,
              {
                $cond: [{ $eq: ["$type", Evts.WISHLIST_REMOVED] }, -1, 0],
              },
            ],
          },
        },
        comments: {
          $sum: {
            $cond: [
              { $eq: ["$type", Evts.PRODUCT_COMMENTED] },
              1,
              {
                $cond: [
                  { $eq: ["$type", Evts.PRODUCT_COMMENT_DELETED] },
                  -1,
                  0,
                ],
              },
            ],
          },
        },
        ordersTotal: {
          $sum: { $cond: [{ $eq: ["$type", Evts.ORDER_PLACED] }, 1, 0] },
        },
        revenue: { $sum: "$order.revenue" },
        cancelled: {
          $sum: { $cond: [{ $eq: ["$type", Evts.ORDER_CANCELLED] }, 1, 0] },
        },
        delivered: {
          $sum: { $cond: [{ $eq: ["$type", Evts.ORDER_COMPLETED] }, 1, 0] },
        },
        returned: {
          $sum: {
            $cond: [{ $eq: ["$type", Evts.ORDER_RETURN_REQUESTED] }, 1, 0],
          },
        },
        reviews: {
          $sum: {
            $cond: [
              { $eq: ["$type", Evts.PRODUCT_COMMENTED] },
              1,
              {
                $cond: [
                  { $eq: ["$type", Evts.PRODUCT_COMMENT_DELETED] },
                  -1,
                  0,
                ],
              },
            ],
          },
        },
      },
    },
  ]);

  const viewUsers = await AnalyticEventModel.distinct("userId", {
    ...match,
    type: Evts.SITE_VIEWED,
    userId: { $ne: null },
    isGuest: false,
  });
  const viewGuests = await AnalyticEventModel.distinct("userId", {
    ...match,
    type: Evts.SITE_VIEWED,
    userId: { $ne: null },
    isGuest: true,
  });

  const data = row || {};
  return {
    events: {
      total: data.total || 0,
      errors: data.errors || 0,
      sessions: data.sessions || 0,
    },
    traffic: {
      allViews: data.allViews || 0,
      debouncedViews: viewUsers.length + viewGuests.length,
      uniqueUsers: viewUsers.length,
      uniqueGuests: viewGuests.length,
      devices: {
        desktop: data.desktop || 0,
        mobile: data.mobile || 0,
        tablet: data.tablet || 0,
        other: Math.max(
          0,
          (data.allViews || 0) -
            (data.desktop || 0) -
            (data.mobile || 0) -
            (data.tablet || 0),
        ),
      },
      sources: {
        chrome: data.chrome || 0,
        firefox: data.firefox || 0,
        safari: data.safari || 0,
        edge: data.edge || 0,
        other: data.otherBrowsers || 0,
      },
    },
    users: {
      loggedInUsers: data.loggedInUsers || 0,
      signedUpUsers: data.signedUpUsers || 0,
      deletedUsers: data.deletedUsers || 0,
      passwordChanged: data.passwordChanged || 0,
    },
    products: {
      views: data.views || 0,
      searches: data.searches || 0,
      lowStock: data.lowStock || 0,
      outOfStock: data.outOfStock || 0,
      totalProducts: data.totalProducts || 0,
    },
    engagement: {
      ratings: data.ratings || 0,
      shares: data.shares || 0,
      wishlists: data.wishlists || 0,
      comments: data.comments || 0,
    },
    orders: {
      total: data.ordersTotal || 0,
      revenue: data.revenue || 0,
      cancelled: data.cancelled || 0,
      delivered: data.delivered || 0,
      returned: data.returned || 0,
    },
    reviews: {
      total: data.reviews || 0,
    },
  };
}

export async function reconcileDay(dayKey = dayKeyOf(Date.now())) {
  if (!checkCurrentConnection()) return null;

  const data = await aggregateDay(dayKey);
  const updatedAt = new Date();

  await DailyAnalyticsModel.updateOne(
    { _id: dayKey },
    {
      $set: {
        ...data,
        date: dayStart(dayKey),
        updatedAt,
      },
      $setOnInsert: { createdAt: updatedAt },
    },
    { upsert: true },
  );

  return data;
}

export async function reconcileRecentDays(days = 2) {
  const results = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dayKeyOf(today.getTime() - offset * DAY_MS);
    try {
      results.push(await reconcileDay(key));
    } catch (error) {
      console.error(`[analytics] reconcile ${key} failed:`, error?.message);
    }
  }
  return results;
}

export async function reconcileSite() {
  if (!checkCurrentConnection()) return null;

  const days = await DailyAnalyticsModel.find({}).lean();
  const calculated = calculateAnalyticsFrom(days);

  let activeUsers = 0;
  try {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const ids = await AnalyticEventModel.distinct("userId", {
      timestamp: { $gte: since },
      userId: { $ne: null },
      isGuest: false,
    });
    activeUsers = ids.length;
  } catch (error) {
    console.error("[analytics] active users failed:", error?.message);
  }

  const updatedAt = new Date();
  await SiteAnalyticsModel.updateOne(
    { _id: "global_counters" },
    {
      $set: {
        ...calculated,
        activeUsers,
        updatedAt,
      },
      $setOnInsert: { createdAt: updatedAt },
    },
    { upsert: true },
  );

  return { ...calculated, activeUsers };
}

/* =========================================================
 * Agenda jobs
 * ========================================================= */

const JOB_NAMES = {
  flush: "analytics:flush",
  reconcileDay: "analytics:reconcile-day",
  reconcileSite: "analytics:reconcile-site",
};

export async function defineAnalyticsJobs(agenda) {
  agenda.define(JOB_NAMES.flush, async () => {
    const result = await flushAnalytics();
    return result;
  });

  agenda.define(JOB_NAMES.reconcileDay, async () => {
    return reconcileRecentDays(2);
  });

  agenda.define(JOB_NAMES.reconcileSite, async () => {
    return reconcileSite();
  });
}

export async function scheduleAnalyticsJobs(agenda) {
  await agenda.every("2 minutes", JOB_NAMES.flush);
  await agenda.every("2 hours", JOB_NAMES.reconcileDay);
  await agenda.every("6 hours", JOB_NAMES.reconcileSite);
}

export function getAnalyticsDebugState() {
  return {
    pending: {
      activities: activityBuffer.length,
      analytics: analyticBuffer.length,
      counterDays: counterBuffer.size,
    },
    counters: Object.fromEntries(
      [...counterBuffer.entries()].map(([dayKey, value]) => [
        dayKey,
        { daily: { ...value.daily }, site: { ...value.site } },
      ]),
    ),
    uniqueViewers: Object.fromEntries(
      [...uniqueViewers.entries()].map(([dayKey, sets]) => [
        dayKey,
        { users: sets.users.size, guests: sets.guests.size },
      ]),
    ),
    debugEvents,
  };
}

export const analyticsInternals = {
  ANALYTICS_EVENT_TYPES,
  activityBuffer: () => activityBuffer,
  analyticBuffer: () => analyticBuffer,
  counterBuffer: () => counterBuffer,
  isErrorType,
  dayKeyOf,
};

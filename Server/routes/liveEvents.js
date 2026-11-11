import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import { owner } from "../utils/permissions.js";
import { EventsRecordModel } from "../models/schema/analytics.js";
import {
  getLiveSnapshot,
  hasStreamCapacity,
  registerStreamClient,
  sanitizePathValue,
  sanitizeText,
  unregisterStreamClient,
  writeSseEvent,
} from "../utils/liveEvents.js";

const router = express.Router();

/* Defence in depth: the permission map below already only succeeds for
 * the owner role, but an explicit role check keeps this surface from
 * silently widening if the role statements ever change. */
function requireOwnerRole(req, res, next) {
  if (req.user?.role !== "owner") {
    return res.status(403).json({
      error: "Forbidden: the live events view is restricted to the owner.",
    });
  }
  return next();
}

const ownerOnly = [
  requireAuth,
  passUserAuth,
  requireAdmin,
  requirePermission({ ...owner.statements }),
  requireOwnerRole,
];

const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  // Runs after the owner gate, so `req.user.id` is available and each
  // account gets its own bucket. The IP fallback is IPv6-safe.
  keyGenerator: (req) =>
    req.user?.id ??
    ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "unknown"),
  message: {
    error: "Too many live stream connection attempts. Please wait a minute.",
  },
});

const SAFE_EVENT_FIELDS = {
  _id: 1,
  type: 1,
  timestamp: 1,
  eventId: 1,
  sector: 1,
  productId: 1,
  fromAdmin: 1,
  isMajor: 1,
  path: 1,
  isGuest: 1,
  isError: 1,
  errorCode: 1,
  refId: 1,
  title: 1,
  message: 1,
  error: 1,
};

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function parseBoolean(value) {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function presentPastEvent(event) {
  return {
    id: String(event._id ?? event.eventId ?? ""),
    eventId: sanitizeText(event.eventId, 120),
    type: sanitizeText(event.type, 100),
    timestamp: event.timestamp
      ? new Date(event.timestamp).toISOString()
      : null,
    sector: sanitizeText(event.sector, 40),
    isMajor: Boolean(event.isMajor),
    isError: Boolean(event.isError),
    fromAdmin: Boolean(event.fromAdmin),
    isGuest: Boolean(event.isGuest),
    path: sanitizePathValue(event.path),
    productId: sanitizeText(event.productId, 64),
    refId: sanitizeText(event.refId, 64),
    title: sanitizeText(event.title, 160),
    message: sanitizeText(event.message ?? event.error, 400),
    errorCode:
      event.errorCode === null || event.errorCode === undefined
        ? null
        : Number.isFinite(Number(event.errorCode))
          ? Number(event.errorCode)
          : null,
  };
}

function buildPastQuery(req) {
  const query = {};

  const type = sanitizeText(req.query.type, 100);
  if (type) query.type = type;

  const sector = sanitizeText(req.query.sector, 40);
  if (sector) query.sector = sector;

  const major = parseBoolean(req.query.major);
  if (major !== undefined) query.isMajor = major;

  const errors = parseBoolean(req.query.errors);
  if (errors !== undefined) query.isError = errors;

  const fromAdmin = parseBoolean(req.query.fromAdmin);
  if (fromAdmin !== undefined) query.fromAdmin = fromAdmin;

  const from = safeDate(req.query.from);
  const to = safeDate(req.query.to);
  if (from || to) {
    query.timestamp = {};
    if (from) query.timestamp.$gte = from;
    if (to) query.timestamp.$lte = to;
  }

  const search = sanitizeText(req.query.search, 80);
  if (search) {
    const pattern = escapeRegex(search);
    query.$or = [
      { type: { $regex: pattern, $options: "i" } },
      { title: { $regex: pattern, $options: "i" } },
      { message: { $regex: pattern, $options: "i" } },
      { error: { $regex: pattern, $options: "i" } },
    ];
  }

  return query;
}

/* =========================================================
 * Current in-memory view (dashboard + initial stream payload)
 * ========================================================= */
router.get(
  "/snapshot",
  ...ownerOnly,
  (req, res) => {
    const limit = clampInt(req.query.limit, 50, 0, 200);
    const windowMinutes = clampInt(req.query.window, 60, 1, 120);

    res.set("Cache-Control", "no-store");
    res.json(getLiveSnapshot({ limit, windowMinutes }));
  },
);

/* =========================================================
 * Persisted (past) activity records
 * ========================================================= */
router.get(
  "/past",
  ...ownerOnly,
  async (req, res) => {
    const limit = clampInt(req.query.limit, 50, 1, 200);
    const skip = clampInt(req.query.skip, 0, 0, 100_000);
    const query = buildPastQuery(req);

    try {
      const [events, total] = await Promise.all([
        EventsRecordModel.find(query, SAFE_EVENT_FIELDS)
          .sort({ timestamp: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .maxTimeMS(3_000)
          .lean(),
        EventsRecordModel.countDocuments(query).maxTimeMS(3_000),
      ]);

      res.set("Cache-Control", "no-store");
      res.json({
        events: events.map(presentPastEvent),
        total,
        limit,
        skip,
        hasMore: skip + events.length < total,
        nextSkip: skip + events.length,
      });
    } catch (error) {
      console.error("[live-events] past query failed:", error?.message);
      res.status(500).json({ error: "Failed to load past events." });
    }
  },
);

/* =========================================================
 * Aggregated past activity (charts on the history tab)
 * ========================================================= */
router.get(
  "/past/summary",
  ...ownerOnly,
  async (req, res) => {
    const days = clampInt(req.query.days, 14, 1, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const [result] = await EventsRecordModel.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
          $facet: {
            byDay: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$timestamp",
                      timezone: "UTC",
                    },
                  },
                  total: { $sum: 1 },
                  errors: { $sum: { $cond: ["$isError", 1, 0] } },
                  major: { $sum: { $cond: ["$isMajor", 1, 0] } },
                },
              },
              { $sort: { _id: 1 } },
            ],
            bySector: [
              { $group: { _id: "$sector", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 20 },
            ],
            byType: [
              { $group: { _id: "$type", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 20 },
            ],
            total: [{ $count: "count" }],
          },
        },
      ]).option({ maxTimeMS: 5_000 });

      res.set("Cache-Control", "no-store");
      res.json({
        days,
        since: since.toISOString(),
        total: result?.total?.[0]?.count ?? 0,
        series: (result?.byDay ?? []).map((row) => ({
          day: row._id,
          total: row.total,
          errors: row.errors,
          major: row.major,
        })),
        bySector: (result?.bySector ?? []).map((row) => ({
          sector: row._id || "global",
          count: row.count,
        })),
        byType: (result?.byType ?? []).map((row) => ({
          type: row._id || "unknown",
          count: row.count,
        })),
      });
    } catch (error) {
      console.error("[live-events] past summary failed:", error?.message);
      res.status(500).json({ error: "Failed to load past event summary." });
    }
  },
);

/* =========================================================
 * Live stream (SSE)
 * ========================================================= */
router.get(
  "/stream",
  ...ownerOnly,
  streamLimiter,
  (req, res) => {
    const capacity = hasStreamCapacity(req.user?.id);
    if (!capacity.ok) {
      return res.status(429).json({ error: capacity.reason });
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.flushHeaders?.();

    try {
      req.socket?.setTimeout?.(0);
      req.socket?.setNoDelay?.(true);
    } catch {
      // Socket tuning is best-effort.
    }

    res.write("retry: 3000\n\n");

    const client = registerStreamClient(res, req.user?.id);
    writeSseEvent(
      res,
      "snapshot",
      getLiveSnapshot({ limit: 100, windowMinutes: 60 }),
    );

    const cleanup = () => unregisterStreamClient(client);
    req.once("close", cleanup);
    res.once("close", cleanup);
    res.once("error", cleanup);

    // The peer may have vanished between flushHeaders() and the listener
    // registration above; don't leave a dead client in the registry.
    if (req.destroyed || res.destroyed) cleanup();

    return undefined;
  },
);

export default router;

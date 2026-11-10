import express from "express";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import {
  DailyAnalyticsModel,
  EventsRecordModel,
  SiteAnalyticsModel,
} from "../models/schema/analytics.js";
import { calculateAnalyticsFrom } from "../utils/calc_analytics.js";

const router = express.Router();

/* Strip keys starting with $ (operators) recursively so a
 * client-supplied filter can only match literal fields. */
function sanitizeFilter(value) {
  if (Array.isArray(value)) return value.map(sanitizeFilter);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("$")) continue;
      out[k] = sanitizeFilter(v);
    }
    return out;
  }
  return value;
}

router.get(
  "/",
  requireAuth,
  passUserAuth,
  requireAdmin,
  requirePermission({
    analytics: ["view", "export"], // allow export for admins with analytics view permission
  }),
  async (req, res) => {
    try {
      const analytics = await SiteAnalyticsModel.findOne({
        _id: "global_counters",
      });
      if (!analytics) {
        // Empty database (fresh Atlas cluster, events not yet flushed):
        // return an honest empty shape so dashboards render empty states
        // instead of failing the whole page on 404.
        return res.json({
          id: "global_counters",
          traffic: {
            allViews: 0,
            debouncedViews: 0,
            uniqueGuests: 0,
            uniqueUsers: 0,
            devices: {},
            sources: {},
          },
          empty: true,
        });
      }

      res.json(analytics || {});
    } catch (error) {
      console.error("Error fetching user analytics:", error);
      res.status(500).json({ error: "Failed to fetch user analytics" });
    }
  },
);

router.get(
  "/events/",
  requireAuth,
  passUserAuth,
  requireAdmin,
  requirePermission({
    analytics: ["view", "export"],
    reports: ["view", "export"],
  }),
  async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    // Allowlisted sort only — never pass raw query objects to the driver.
    const sortField = ["happenedAt", "createdAt", "timestamp"].includes(
      req.query.sortBy,
    )
      ? req.query.sortBy
      : "happenedAt";
    const sortDir = req.query.order === "asc" ? 1 : -1;
    const sort = { [sortField]: sortDir };

    let query = {};
    if (req.query.filter) {
      try {
        const parsed = JSON.parse(req.query.filter);
        // Strip query operators to block NoSQL operator injection.
        query = sanitizeFilter(parsed);
      } catch {
        return res.status(400).json({ error: "Invalid filter JSON" });
      }
    }

    try {
      const events = await EventsRecordModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .lean();
      res.json(events || []);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  },
);

router.get(
  "/report",
  requireAuth,
  passUserAuth,
  requireAdmin,
  requirePermission({
    analytics: ["view", "export"],
    reports: ["view", "export"],
  }),
  async (req, res) => {
    const start = req.query.start ? new Date(req.query.start) : null;
    const end = req.query.end ? new Date(req.query.end) : null;

    // Daily documents are keyed by "YYYY-MM-DD", so a date range is a
    // simple _id range (no full collection scan).
    const query = {};
    if (start && !Number.isNaN(start.getTime())) {
      query._id = {
        ...(query._id ?? {}),
        $gte: start.toISOString().slice(0, 10),
      };
    }
    if (end && !Number.isNaN(end.getTime())) {
      query._id = {
        ...(query._id ?? {}),
        $lte: end.toISOString().slice(0, 10),
      };
    }

    try {
      const events = await DailyAnalyticsModel.find(query).lean();
      res.json(calculateAnalyticsFrom(events));
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  },
);

// NOTE: /:dayid must be registered AFTER static routes (/events, /report),
// otherwise "events"/"report" are captured as dayid and those routes 404.
/* =========================================================
 * GET /analytics/orders-summary?start=&end=&granularity=day|week|month
 * Real database-backed commerce metrics.
 * Definitions (explicit):
 * - revenue = Σ totalAmount where payment.status=paid (verified only).
 *   Unpaid COD orders are NEVER counted as revenue.
 * - codPending = Σ totalAmount where method=cod AND codStatus=pending_collection
 * - codCollected = Σ amountPaid where method=cod AND codStatus=collected
 * - aov = revenue / paidOrders (null when 0)
 * - byStatus / byPaymentMethod: counts over orders in range
 * - shipments: counts by fulfillment.status + delivered/cancelled/RTO
 *   inferred from order/fulfillment status.
 * Dates filtered on createdAt (UTC); end is exclusive (+1 day).
 * ========================================================= */
router.get(
  "/orders-summary",
  requireAuth,
  passUserAuth,
  requireAdmin,
  requirePermission({
    analytics: ["view", "export"],
    reports: ["view", "export"],
  }),
  async (req, res) => {
    try {
      const { OrderModel } = await import("../models/schema/order.js");
      const start = req.query.start ? new Date(req.query.start) : null;
      const end = req.query.end ? new Date(req.query.end) : null;
      const granularity = ["day", "week", "month"].includes(
        req.query.granularity,
      )
        ? req.query.granularity
        : "day";
      const match = {};
      if (start && !Number.isNaN(start.getTime()))
        match.createdAt = { $gte: start };
      if (end && !Number.isNaN(end.getTime())) {
        match.createdAt = { ...(match.createdAt ?? {}), $lt: end };
      }
      // $dateToString works on MongoDB 4.0+ (unlike $dateTrunc which
      // needs 5.0). The bucket keys are ISO strings that sort correctly.
      const dateTrunc =
        granularity === "month"
          ? {
              $dateToString: {
                date: "$createdAt",
                format: "%Y-%m",
                timezone: "UTC",
              },
            }
          : granularity === "week"
            ? {
                $dateToString: {
                  date: "$createdAt",
                  format: "%G-W%V",
                  timezone: "UTC",
                },
              }
            : {
                $dateToString: {
                  date: "$createdAt",
                  format: "%Y-%m-%d",
                  timezone: "UTC",
                },
              };

      const [
        totals,
        byStatus,
        byPayment,
        revenueAgg,
        codAgg,
        series,
        shipments,
      ] = await Promise.all([
        OrderModel.aggregate([
          { $match: match },
          { $group: { _id: null, count: { $sum: 1 } } },
        ]),
        OrderModel.aggregate([
          { $match: match },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        OrderModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: {
                method: "$payment.method",
                status: "$payment.status",
              },
              count: { $sum: 1 },
            },
          },
        ]),
        OrderModel.aggregate([
          { $match: { ...match, "payment.status": "paid" } },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$totalAmount" },
              paidOrders: { $sum: 1 },
            },
          },
        ]),
        OrderModel.aggregate([
          { $match: { ...match, "payment.method": "cod" } },
          {
            $group: {
              _id: "$payment.codStatus",
              count: { $sum: 1 },
              amount: { $sum: "$totalAmount" },
              collected: { $sum: "$payment.amountPaid" },
            },
          },
        ]),
        OrderModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: dateTrunc,
              orders: { $sum: 1 },
              revenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$payment.status", "paid"] },
                    "$totalAmount",
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        OrderModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: "$fulfillment.status",
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const revenue = revenueAgg[0]?.revenue ?? 0;
      const paidOrders = revenueAgg[0]?.paidOrders ?? 0;
      const codByStatus = Object.fromEntries(
        (codAgg ?? []).map((r) => [r._id ?? "unknown", r]),
      );
      res.json({
        range: { start: start ?? null, end: end ?? null, granularity },
        totals: { orders: totals[0]?.count ?? 0 },
        byStatus: Object.fromEntries(
          (byStatus ?? []).map((r) => [r._id, r.count]),
        ),
        byPaymentMethod: (byPayment ?? []).map((r) => ({
          method: r._id?.method,
          status: r._id?.status,
          count: r.count,
        })),
        payments: {
          paidOrders,
          revenue,
          aov: paidOrders ? Number((revenue / paidOrders).toFixed(2)) : null,
        },
        cod: {
          pendingCollection: codByStatus.pending_collection?.amount ?? 0,
          pendingCount: codByStatus.pending_collection?.count ?? 0,
          collected: codByStatus.collected?.collected ?? 0,
          collectedCount: codByStatus.collected?.count ?? 0,
        },
        shipments: Object.fromEntries(
          (shipments ?? []).map((r) => [r._id ?? "unknown", r.count]),
        ),
        series: (series ?? []).map((r) => ({
          bucket: r._id,
          orders: r.orders,
          revenue: r.revenue,
        })),
        definitions: {
          revenue: "sum(totalAmount) where payment.status=paid",
          codPending:
            "sum(totalAmount) where method=cod and codStatus=pending_collection",
          codCollected:
            "sum(amountPaid) where method=cod and codStatus=collected",
        },
      });
    } catch (error) {
      console.error("Error building orders summary:", error);
      res.status(500).json({ error: "Failed to build orders summary" });
    }
  },
);

router.get(
  "/:dayid",
  requireAuth,
  passUserAuth,
  requireAdmin,
  requirePermission({
    analytics: ["view", "export"],
    reports: ["view", "export"],
  }),
  async (req, res) => {
    try {
      const analytics = await DailyAnalyticsModel.findOne({
        _id: req.params.dayid,
      });
      if (!analytics) {
        return res.status(404).json({ error: "Analytics not found" });
      }

      res.json(analytics || {});
    } catch (error) {
      console.error("Error fetching user analytics:", error);
      res.status(500).json({ error: "Failed to fetch user analytics" });
    }
  },
);

export default router;

import express from "express";
import { getAnalyticsDebugState } from "../utils/analytics.js";
import { flushAllBuffers } from "../utils/jobs.js";
import { getInteractionDebugState } from "../utils/interactions.js";
import { getUserStatsDebugState } from "../utils/user-stats.js";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import { owner } from "../utils/permissions.js";

const router = express.Router();

/* Owner-only diagnostics: shows buffered events without exposing user
 * payloads. Useful while tuning the analytics pipeline. */
router.get(
  "/",
  requireAuth,
  passUserAuth,
  requireAdmin,
  requirePermission({ ...owner.statements }),
  async (_req, res) => {
    res.json({
      analytics: getAnalyticsDebugState(),
      interactions: getInteractionDebugState(),
      userStats: getUserStatsDebugState(),
    });
  },
);

router.post(
  "/flush",
  requireAuth,
  passUserAuth,
  requireAdmin,
  requirePermission({ ...owner.statements }),
  async (_req, res) => {
    const results = await flushAllBuffers();
    res.json({
      success: true,
      results: results.map((result) =>
        result.status === "fulfilled"
          ? { ok: true, value: result.value }
          : { ok: false, error: result.reason?.message || String(result.reason) },
      ),
    });
  },
);

export default router;

import { getAgenda } from "./agenda.js";
import {
  defineAnalyticsJobs,
  scheduleAnalyticsJobs,
  flushAnalytics,
} from "./analytics.js";
import {
  defineInteractionJobs,
  scheduleInteractionJobs,
  flushInteractionBuffers,
} from "./interactions.js";
import {
  defineUserStatsJobs,
  scheduleUserStatsJobs,
  flushUserStats,
} from "./user-stats.js";

/* Job names used by earlier versions. They carried serialized buffer
 * snapshots in their job data, which never contained real events. */
const LEGACY_JOB_NAMES = [
  "flush-records",
  "calculate-today-analytics-flush-records",
  "calculate-analytics-site",
  "flush-interactions",
  "flush-and-calculate-product-rating",
  "flush-buffer",
];

const OWN_JOB_NAMES = [
  "analytics:flush",
  "analytics:reconcile-day",
  "analytics:reconcile-site",
  "interactions:flush",
  "user-stats:flush",
];

let initPromise = null;
let initialized = false;

async function cancelJobs(agenda, names) {
  try {
    await agenda.cancel({ name: { $in: names } });
  } catch (error) {
    console.error("[jobs] failed to cancel stale jobs:", error?.message);
  }
}

export function initJobs() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { agenda } = await getAgenda();

    // Remove snapshots scheduled by older versions, then remove our own
    // single jobs so a restart never creates duplicate schedules.
    await cancelJobs(agenda, LEGACY_JOB_NAMES);
    await cancelJobs(agenda, OWN_JOB_NAMES);

    await defineAnalyticsJobs(agenda);
    await defineInteractionJobs(agenda);
    await defineUserStatsJobs(agenda);

    await scheduleAnalyticsJobs(agenda);
    await scheduleInteractionJobs(agenda);
    await scheduleUserStatsJobs(agenda);

    if (!agenda._processInterval) {
      await agenda.start();
    }

    initialized = true;
    console.log("[jobs] agenda workers registered");
    return agenda;
  })().catch((error) => {
    initPromise = null;
    console.error("[jobs] worker initialization failed:", error?.message);
  });

  return initPromise;
}

export async function flushAllBuffers() {
  const results = await Promise.allSettled([
    flushAnalytics(),
    flushInteractionBuffers(),
    flushUserStats(),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[jobs] buffer flush failed:", result.reason?.message);
    }
  }

  return results;
}

export function jobsReady() {
  return initialized;
}

export default { initJobs, flushAllBuffers, jobsReady };

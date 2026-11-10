import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* =========================================================
 * Deterministic environment loading.
 *
 * Root cause fix: `import "dotenv/config"` resolves `.env` from
 * process.cwd(). Starting the backend from the repo root silently
 * loaded the FRONTEND .env (no Razorpay/Shipmozo keys) and every
 * payment fell back to stubs. This loader always prefers the .env
 * sitting next to the Server code, then falls back to CWD.
 * Existing process env (real deployments) always wins — dotenv
 * never overrides variables that are already set.
 * ========================================================= */

const here = path.dirname(fileURLToPath(import.meta.url)); // Server/utils
const serverDir = path.resolve(here, "..");

const loaded = [];
for (const p of [
  path.join(serverDir, ".env"),
  path.join(process.cwd(), ".env"),
]) {
  try {
    const r = dotenv.config({ path: p });
    if (!r.error) loaded.push(p);
  } catch {
    // ignore unreadable paths
  }
}

export function getEnv(name, fallback = "") {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export function hasEnv(name) {
  return Boolean(process.env[name]);
}

/** Safe presence report — names + booleans only, never values. */
export function configPresence() {
  return {
    envFilesLoaded: loaded,
    razorpay: {
      RAZORPAY_KEY_ID: hasEnv("RAZORPAY_KEY_ID"),
      RAZORPAY_KEY_SECRET: hasEnv("RAZORPAY_KEY_SECRET"),
      RAZORPAY_WEBHOOK_SECRET: hasEnv("RAZORPAY_WEBHOOK_SECRET"),
    },
    shipmozo: {
      SHIPMOZO_PUBLIC_KEY: hasEnv("SHIPMOZO_PUBLIC_KEY"),
      SHIPMOZO_PRIVATE_KEY: hasEnv("SHIPMOZO_PRIVATE_KEY"),
      SHIPMOZO_ALLOW_LIVE: process.env.SHIPMOZO_ALLOW_LIVE === "true",
      SHIPMOZO_WAREHOUSE_ID: hasEnv("SHIPMOZO_WAREHOUSE_ID"),
    },
    database: { MONGODB_URI: hasEnv("MONGODB_URI") },
    auth: {
      BETTER_AUTH_SECRET: hasEnv("BETTER_AUTH_SECRET"),
      FRONTEND_URL: getEnv("FRONTEND_URL", "(unset)"),
    },
  };
}

/** Fail-closed startup validation. Logs actionable guidance,
 * never secret values. */
export function validateStartupConfig() {
  const p = configPresence();
  // eslint-disable-next-line no-console
  console.log(
    `[config] env files loaded: ${p.envFilesLoaded.join(", ") || "(none)"}`,
  );
  if (!p.razorpay.RAZORPAY_KEY_ID || !p.razorpay.RAZORPAY_KEY_SECRET) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET missing — online payments DISABLED (COD only). " +
        "Set them in Server/.env and RESTART the backend (env changes need a restart). " +
        "If you started the server from the repo root, prefer `npm run dev` inside Server/.",
    );
  } else {
    // eslint-disable-next-line no-console
    const kid = process.env.RAZORPAY_KEY_ID ?? "";
    const mode = kid.startsWith("rzp_live_")
      ? "live"
      : kid.startsWith("rzp_test_")
        ? "test"
        : "unknown";
    console.log(
      `[config] Razorpay keys present (mode: ${mode}) — online payments enabled.`,
    );
    if (mode === "live" && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[config] LIVE Razorpay keys in non-production are BLOCKED — payment creation refuses them. Use rzp_test_* keys.",
      );
    }
  }
  if (!p.shipmozo.SHIPMOZO_PUBLIC_KEY || !p.shipmozo.SHIPMOZO_PRIVATE_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] SHIPMOZO keys missing — courier calls return safe stubs, no shipments created.",
    );
  }
  if (!p.database.MONGODB_URI) {
    // eslint-disable-next-line no-console
    console.warn("[config] MONGODB_URI missing — database unavailable.");
  } else {
    // eslint-disable-next-line no-console
    console.log("[config] MONGODB_URI present — database enabled.");
    console.log(`[config] MONGODB_URI host: ${process.env.MONGODB_URI}`);
  }
  return p;
}

export default { getEnv, hasEnv, configPresence, validateStartupConfig };

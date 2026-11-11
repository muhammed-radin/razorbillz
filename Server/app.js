import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import "./utils/env.js"; // deterministic .env loading (Server/.env first)
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import indexRouter from "./routes/index.js";

import {
  db,
  connectToDatabase,
  checkDatabaseConnection,
  startDB,
} from "./utils/db.js";
import createAuth from "./utils/auth.js";

import mongoErrorHandler from "./utils/middlewares/mongoErrorHandler.js";
import { validateStartupConfig } from "./utils/env.js";
import {
  requestId,
  apiNotFound,
  errorHandler,
} from "./utils/middlewares/errorHandler.js";
import { evt } from "./utils/events.manage.js";
import { telemetryRequestMiddleware } from "./utils/liveEvents.js";
import tallyDebug from "./utils/debug.js";
import { initJobs } from "./utils/jobs.js";
import { storeConfig } from "./shared/store.config.js";

validateStartupConfig();

// 1. Define global relaxed limiter for standard data routes.
// Max values are env-configurable for load-test environments;
// production defaults stay conservative.
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 200, // Limit each IP to 200 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Fall back to the socket address when req.ip is undefined (direct
  // connections with trust-proxy set) so buckets stay per-client.
  // NOTE: the ipKeyGenerator(..) call must stay inline here — v8 validates
  // the function source for IPv6-safe handling.
  keyGenerator: (req) =>
    ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "unknown"),
  message: {
    error: "Too many requests from this IP, please try again after 15 minutes.",
  },
});

// 2. Define strict limiter for authentication routes.
// Read-only session checks are skipped here (they fall under the global
// limiter) so normal navigation cannot burn the credential budget and
// lock users out of login for 15 minutes.
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 60, // Strict limit: max 60 auth attempts per IP per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  // NOTE: the ipKeyGenerator(..) call must stay inline here (see above).
  keyGenerator: (req) =>
    ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "unknown"),
  skip: (req) =>
    req.path.includes("get-session") || req.path.includes("list-sessions"),
  message: { error: "Too many login/signup attempts. Please try again later." },
});

async function initAuth(req, res, next) {
  if (!db) {
    await connectToDatabase();
  }
  return toNodeHandler(createAuth(db))(req, res, next);
}

const app = express();
app.set("trust proxy", 1);

/* Minimal security headers (no extra dependency). */
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

// ------------- Record all events & requests for debugging --------------
const DEBUG = process.env.DEBUG === "true" || true; // Always true for now, but can be toggled via env
if (DEBUG === true) {
  app.use((req, _res, next) => {
    evt.fire("request", {
      method: req.method,
      path: req.path,
    });
    next();
  });

  app.use("/tally", async (req, res) => {
    res.json(tallyDebug(true));
  });
}

app.use(startDB);
app.use("/api/auth/*splat", authLimiter);
app.all("/api/auth/*splat", checkDatabaseConnection, initAuth);

app.use(globalApiLimiter);
app.use(logger("dev"));
app.use(requestId);
app.use(telemetryRequestMiddleware);
// Preserve raw body for HMAC webhook verification (Razorpay/Shipmozo).
// Handlers read req.rawBody when present, falling back to parsed JSON.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
);
app.use(mongoErrorHandler); // Global MongoDB error handler
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

if (
  process.argv[1] &&
  (process.argv[1].endsWith("/app.js") || process.argv[1].endsWith("\\app.js"))
) {
  app.listen(process.env.PORT, () => {
    console.log(
      `${storeConfig.brand.shortName} server is running on http://localhost:${process.env.PORT}`,
    );
  });
}

// start api after db connection is established
app.use("/api", checkDatabaseConnection, indexRouter);

/* Register buffered-write workers once (agenda waits for Mongo). */
initJobs().catch((error) => {
  console.error("[jobs] failed to start:", error?.message);
});

// Unknown API routes -> JSON 404, then central error handler (last).
app.use("/api", apiNotFound);
app.use(errorHandler);

export default app;

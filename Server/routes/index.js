import express from "express";
import productsRouter from "./products.js";
import usersRouter from "./users.js";
import categoriesRouter from "./categories.js";
import { requireAuth } from "../utils/middlewares/reqiuredAuth.js";
import interactionsRouter from "./interactions.js";
import wishlistsRouter from "./whishlists.js";
import cartRouter from "./carts.js";
import AddressRouter from "./address.js";
import OrderRouter from "./orders.js";
import commentsRouter from "./comments.js";
import jobsRouter from "./jobs.js";
import paymentsRouter from "./payments.js";
import shipmentsRouter from "./shipments.js";
import supportRouter from "./support.js";
import e2eeRouter from "./e2ee.js";
import { devMiddleware } from "../utils/middlewares/dev.js";
import { evt } from "../utils/events.manage.js";
import logsRouter from "./logs.js";
import analyticsRouter from "./analytics.js";
import liveEventsRouter from "./liveEvents.js";
import storeRouter from "./store.js";
import sendEmail from "../utils/mailer.js";
import { generateHashLink, origin } from "../shared/utils/route-util.js";

const router = express.Router();

/* Store / brand config (public) */
router.use("/store", storeRouter);

/* Product routes */
router.use("/products", productsRouter);

/* User routes */
router.use("/users", usersRouter);

/* Category routes */
router.use("/categories", categoriesRouter);

/* Interaction routes */
router.use("/interactions", interactionsRouter);

/* Wishlist routes */
router.use("/wishlists", wishlistsRouter);

/* Cart routes */
router.use("/cart", cartRouter);

/* Address routes */
router.use("/address", requireAuth, AddressRouter);

/* Order routes */
router.use("/orders", requireAuth, OrderRouter);

/* Payment routes: /payments/* public webhook handled inside router.
 * NOTE: Razorpay webhook HMAC requires the RAW body. app.js preserves
 * req.rawBody via express.json({verify}) — see app.js. */
router.use("/payments", paymentsRouter);

/* Shipment routes (courier ops; customer track scoped per order) */
router.use("/shipments", shipmentsRouter);

/* Customer care tickets (auth + ownership enforced per route) */
router.use("/support", supportRouter);

/* E2EE keybags + client-encrypted vault (Tier B) */
router.use("/e2ee", e2eeRouter);

/* Comment routes */
router.use("/comments", requireAuth, commentsRouter);

/* Agenda Development Routes */
router.use("/jobs", devMiddleware, jobsRouter);

/* Log routes */
router.use("/logs", requireAuth, logsRouter);

/* Analytics routes */
router.use("/analytics", requireAuth, analyticsRouter);

/* Owner-only live telemetry (JSON snapshots + server-sent events). The
 * router enforces its own auth/permission chain so every path — including
 * the long-lived stream — is gated by the same owner check. */
router.use("/live-events", liveEventsRouter);

/* Redirect to front-end */
router.get("/redirect-app/verify-email", (req, res) => {
  res.redirect(
    origin(process.env.FRONTEND_URL || "http://localhost:5173")
      .query({ action: "verify-email", status: "success" }, null, true)
      .hashPathURL(),
  );
});
export default router;

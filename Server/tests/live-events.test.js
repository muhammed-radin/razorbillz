import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { evt, Evts } from "../utils/events.manage.js";
import {
  getLiveSnapshot,
  normalizeApiPath,
  sanitizePathValue,
  sanitizeText,
  telemetryRequestMiddleware,
} from "../utils/liveEvents.js";

test("sanitizeText redacts emails, secrets and card-length numbers", () => {
  const output = sanitizeText(
    "mail buyer@example.com token=abcdefghijklmnop password: hunter2 card 4111 1111 1111 1111",
  );

  assert.match(output, /\[email\]/);
  assert.match(output, /\[redacted\]/);
  assert.match(output, /\[number\]/);
  assert.doesNotMatch(output, /buyer@example\.com/);
  assert.doesNotMatch(output, /4111\s?1111/);
  assert.doesNotMatch(output, /hunter2/);
});

test("sanitizeText drops query strings and long identifiers in paths", () => {
  assert.equal(
    sanitizePathValue("/api/orders/507f1f77bcf86cd799439011?token=abc"),
    "/api/orders/:id",
  );
  assert.equal(sanitizePathValue("api/users/42/profile"), "/api/users/:id/profile");
  assert.equal(
    sanitizePathValue("/api/verify/abcdefghijklmnopqrstuvwxyz0123456789"),
    "/api/verify/:token",
  );
});

test("normalizeApiPath prefers the matched route over raw ids", () => {
  const req = {
    baseUrl: "/api/orders",
    route: { path: "/:orderId" },
    originalUrl: "/api/orders/507f1f77bcf86cd799439011?debug=1",
  };

  assert.equal(normalizeApiPath(req), "/api/orders/:orderId");
});

test("snapshot exposes scrubbed application events", () => {
  const message = "payment failed for buyer@example.com token=supersecretvalue";
  evt.fire(Evts.ERROR, {
    type: Evts.ERROR,
    sector: "payment",
    isError: true,
    isMajor: true,
    message,
  });

  const snapshot = getLiveSnapshot({ limit: 5, windowMinutes: 5 });
  const event = snapshot.events.recent[0];

  assert.ok(snapshot.events.total >= 1);
  assert.ok(snapshot.events.errors >= 1);
  assert.equal(event.type, "error");
  assert.match(event.message, /\[email\]/);
  assert.doesNotMatch(event.message, /buyer@example\.com/);
  assert.doesNotMatch(event.message, /supersecretvalue/);
  assert.equal(snapshot.series.length, 5);
});

test("snapshot clamps the requested limit and window", () => {
  const snapshot = getLiveSnapshot({ limit: 9999, windowMinutes: 9999 });

  assert.equal(snapshot.series.length, 120);
  assert.ok(snapshot.events.recent.length <= 300);
});

test("request middleware tally only counts the completed request once", async () => {
  const before = getLiveSnapshot({ limit: 0 });

  const req = new EventEmitter();
  req.method = "GET";
  req.baseUrl = "/api/products";
  req.route = { path: "/:id" };
  req.originalUrl = "/api/products/507f1f77bcf86cd799439011";
  req.path = "/api/products/507f1f77bcf86cd799439011";

  const res = new EventEmitter();
  res.statusCode = 200;
  res.writableEnded = true;
  res.destroyed = false;

  let calledNext = false;
  telemetryRequestMiddleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);

  res.emit("finish");
  res.emit("close");

  const after = getLiveSnapshot({ limit: 0 });
  assert.equal(after.requests.total, before.requests.total + 1);

  const route = after.requests.topRoutes.find(
    (item) => item.path === "/api/products/:id",
  );
  assert.ok(route);
  assert.equal(route.method, "GET");
});

test("request middleware ignores the long-lived SSE stream", () => {
  const before = getLiveSnapshot({ limit: 0 });

  const req = new EventEmitter();
  req.method = "GET";
  req.path = "/api/live-events/stream";
  req.originalUrl = "/api/live-events/stream";

  const res = new EventEmitter();
  res.statusCode = 200;
  res.writableEnded = false;
  res.destroyed = false;

  telemetryRequestMiddleware(req, res, () => {});
  res.emit("close");

  const after = getLiveSnapshot({ limit: 0 });
  assert.equal(after.requests.total, before.requests.total);
});

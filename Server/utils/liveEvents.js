import { evt, eventSector, isMajorEvent } from "./events.manage.js";

/* =========================================================
 * Owner-only live telemetry
 * ---------------------------------------------------------
 * Keeps a bounded, in-memory view of what the server is doing:
 *   - application events (via the global event emitter)
 *   - API requests (method/path/status/latency)
 *   - MongoDB CRUD commands (via driver command monitoring)
 *
 * Nothing sensitive is retained: no request bodies, query strings,
 * headers, cookies, raw IPs, emails, or event payload contents. The
 * only consumer is the owner-only SSE/JSON admin surface.
 * ========================================================= */

const MINUTE_MS = 60_000;
const RETENTION_MINUTES = 120;
const DEFAULT_WINDOW_MINUTES = 60;
const MAX_RECENT = 300;
const MAX_ROUTE_KEYS = 400;
const MAX_COLLECTION_KEYS = 200;

const MAX_STREAM_CLIENTS = 25;
const MAX_STREAM_CLIENTS_PER_USER = 3;
const STREAM_FLUSH_MS = 2_000;
const STREAM_HEARTBEAT_MS = 15_000;
const MAX_BUFFERED_BYTES = 1_000_000;

const DB_OPERATIONS = ["create", "read", "update", "delete"];
const DB_COMMAND_OPERATIONS = {
  insert: "create",
  find: "read",
  aggregate: "read",
  count: "read",
  distinct: "read",
  update: "update",
  findAndModify: "update",
  replace: "update",
  delete: "delete",
};

const startedAt = Date.now();

let eventTotal = 0;
let eventErrors = 0;
let eventMajor = 0;
const eventTypeTally = new Map();
const eventSectorTally = new Map();

let requestTotal = 0;
let requestErrors = 0;
let requestTotalMs = 0;
const requestMethodTally = new Map();
const requestStatusTally = new Map();
const requestRouteTally = new Map();

let dbTotal = 0;
const dbOperationTally = new Map();
const dbCollectionTally = new Map();

const minuteBuckets = new Map();
const recentEvents = [];
const recentRequests = [];
const recentDbOperations = [];

const streamClients = new Set();
const pending = { events: [], requests: [], db: [] };

let flushTimer = null;
let heartbeatTimer = null;

let eventSeq = 0;
let requestSeq = 0;
let dbSeq = 0;

/* =========================================================
 * Small helpers
 * ========================================================= */

function bump(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function pushBounded(list, item, max) {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function iso(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

export function sanitizeText(value, max = 400) {
  if (value === null || value === undefined) return null;

  let text;
  try {
    text =
      typeof value === "string"
        ? value
        : typeof value?.message === "string"
          ? value.message
          : String(value);
  } catch {
    return null;
  }

  text = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "mongodb://[redacted]")
    .replace(
      /\b(?:bearer|token|password|secret|api[_-]?key)\s*[:=]\s*\S+/gi,
      "[redacted]",
    )
    .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[number]")
    .slice(0, max);

  return text.trim() || null;
}

export function sanitizePathValue(value, max = 240) {
  if (typeof value !== "string" || !value) return null;

  let path = value.split("?")[0].split("#")[0].trim();
  if (!path.startsWith("/")) path = `/${path}`;

  path = path
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      ":id",
    )
    .replace(/[0-9a-f]{24}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/[A-Za-z0-9_-]{32,}/g, ":token")
    .slice(0, max);

  return path;
}

function sanitizeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  if (!id) return null;
  return id.slice(0, 64);
}

/* =========================================================
 * Minute buckets (used for live graphs)
 * ========================================================= */

function emptyBucket(key) {
  return {
    key,
    requests: { total: 0, errors: 0, totalMs: 0 },
    events: { total: 0, errors: 0, major: 0 },
    db: { total: 0, create: 0, read: 0, update: 0, delete: 0 },
  };
}

function pruneBuckets(currentKey) {
  if (minuteBuckets.size <= RETENTION_MINUTES + 5) return;
  const cutoff = currentKey - RETENTION_MINUTES * MINUTE_MS;
  for (const key of minuteBuckets.keys()) {
    if (key < cutoff) minuteBuckets.delete(key);
  }
}

function getMinuteBucket(timestamp = Date.now()) {
  const key = Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
  let bucket = minuteBuckets.get(key);

  if (!bucket) {
    bucket = emptyBucket(key);
    minuteBuckets.set(key, bucket);
    pruneBuckets(key);
  }

  return bucket;
}

function buildSeries(windowMinutes) {
  const minutes = clamp(windowMinutes, 1, RETENTION_MINUTES);
  const current = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
  const first = current - (minutes - 1) * MINUTE_MS;
  const series = [];

  for (let key = first; key <= current; key += MINUTE_MS) {
    const bucket = minuteBuckets.get(key);
    const requests = bucket?.requests ?? emptyBucket(key).requests;
    const events = bucket?.events ?? emptyBucket(key).events;
    const db = bucket?.db ?? emptyBucket(key).db;

    series.push({
      minute: iso(key),
      requests: requests.total,
      requestErrors: requests.errors,
      requestAvgMs: requests.total
        ? round(requests.totalMs / requests.total, 1)
        : 0,
      events: events.total,
      eventErrors: events.errors,
      majorEvents: events.major,
      db: db.total,
      dbCreate: db.create,
      dbRead: db.read,
      dbUpdate: db.update,
      dbDelete: db.delete,
    });
  }

  return series;
}

/* =========================================================
 * Application events
 * ========================================================= */

function recordEvent(eventInfo) {
  const name = eventInfo?.event;
  if (!name || name === "request" || name === "event_recorded") return;

  const raw = Array.isArray(eventInfo.data) ? eventInfo.data[0] : null;
  const payload = raw && typeof raw === "object" ? raw : {};
  const type = typeof payload.type === "string" ? payload.type : String(name);
  if (!type || type === "request" || type === "event_recorded") return;

  const rawTimestamp =
    payload.timestamp ?? eventInfo.timestamp ?? Date.now();
  const moment = new Date(rawTimestamp);
  const timestamp = Number.isNaN(moment.getTime())
    ? Date.now()
    : moment.getTime();

  const sector = payload.sector || eventSector(type);
  const isMajor = Boolean(payload.isMajor || isMajorEvent(type));
  const isError = Boolean(
    payload.isError ||
      type === "error" ||
      String(type).endsWith("_error"),
  );

  const entry = {
    id: `evt_${++eventSeq}`,
    timestamp: iso(timestamp),
    type: sanitizeText(type, 100),
    sector: sanitizeText(sector, 40),
    isMajor,
    isError,
    title: sanitizeText(payload.title, 160),
    message: sanitizeText(payload.message ?? payload.error, 400),
    path: sanitizePathValue(payload.reqPath ?? payload.path),
    actor: payload.isGuest ? "guest" : payload.userId ? "user" : "system",
    orderId: sanitizeId(payload.orderId),
    productId: sanitizeId(payload.productId ?? payload.refId),
    errorCode:
      payload.errorCode === null ||
      payload.errorCode === undefined ||
      payload.errorCode === ""
        ? null
        : Number.isFinite(Number(payload.errorCode))
          ? Number(payload.errorCode)
          : null,
  };

  eventTotal += 1;
  if (isError) eventErrors += 1;
  if (isMajor) eventMajor += 1;
  bump(eventTypeTally, entry.type);
  bump(eventSectorTally, entry.sector || "global");

  const bucket = getMinuteBucket(timestamp);
  bucket.events.total += 1;
  if (isError) bucket.events.errors += 1;
  if (isMajor) bucket.events.major += 1;

  pushBounded(recentEvents, entry, MAX_RECENT);
  if (streamClients.size) pending.events.push(entry);
}

/* =========================================================
 * API requests
 * ========================================================= */

function recordRequest({ method, path, status, durationMs }) {
  const safeMethod = String(method || "GET").slice(0, 10).toUpperCase();
  const safePath = sanitizePathValue(path) || "/";
  const code = clamp(status, 100, 599);
  const elapsed = clamp(durationMs, 0, 10 * 60 * 1000);
  const timestamp = Date.now();
  const isError = code >= 500;
  const key = `${safeMethod} ${safePath}`;

  requestTotal += 1;
  requestTotalMs += elapsed;
  if (isError) requestErrors += 1;

  bump(requestMethodTally, safeMethod);
  bump(requestStatusTally, String(code));

  let route = requestRouteTally.get(key);
  if (!route) {
    if (requestRouteTally.size >= MAX_ROUTE_KEYS) {
      route = requestRouteTally.get(
        `${safeMethod} (other)`,
      );
      if (!route) {
        route = {
          method: safeMethod,
          path: "(other)",
          count: 0,
          errors: 0,
          totalMs: 0,
          maxMs: 0,
          lastAt: timestamp,
        };
        requestRouteTally.set(`${safeMethod} (other)`, route);
      }
    } else {
      route = {
        method: safeMethod,
        path: safePath,
        count: 0,
        errors: 0,
        totalMs: 0,
        maxMs: 0,
        lastAt: timestamp,
      };
      requestRouteTally.set(key, route);
    }
  }

  route.count += 1;
  route.totalMs += elapsed;
  route.maxMs = Math.max(route.maxMs, elapsed);
  route.lastAt = timestamp;
  if (isError) route.errors += 1;

  const bucket = getMinuteBucket(timestamp);
  bucket.requests.total += 1;
  bucket.requests.totalMs += elapsed;
  if (isError) bucket.requests.errors += 1;

  const entry = {
    id: `req_${++requestSeq}`,
    timestamp: iso(timestamp),
    method: safeMethod,
    path: safePath,
    status: code,
    durationMs: round(elapsed, 1),
    level: isError ? "error" : code >= 400 ? "warn" : "ok",
  };

  pushBounded(recentRequests, entry, MAX_RECENT);
  if (streamClients.size) pending.requests.push(entry);
}

/* =========================================================
 * MongoDB CRUD commands
 * ========================================================= */

function commandCollection(commandName, command) {
  if (!command || typeof command !== "object") return null;

  const value = command[commandName];
  if (typeof value === "string") return value;

  if (commandName === "getMore" && typeof command.collection === "string") {
    return command.collection;
  }

  return null;
}

function recordDbOperation(operation, collection) {
  if (!DB_OPERATIONS.includes(operation)) return;
  if (typeof collection !== "string" || !collection) return;
  if (collection.startsWith("system.")) return;

  const safeCollection = collection.slice(0, 80);
  const timestamp = Date.now();

  dbTotal += 1;
  bump(dbOperationTally, operation);

  let tally = dbCollectionTally.get(safeCollection);
  if (!tally) {
    if (dbCollectionTally.size >= MAX_COLLECTION_KEYS) return;
    tally = {
      collection: safeCollection,
      create: 0,
      read: 0,
      update: 0,
      delete: 0,
      total: 0,
      lastAt: timestamp,
    };
    dbCollectionTally.set(safeCollection, tally);
  }

  tally[operation] += 1;
  tally.total += 1;
  tally.lastAt = timestamp;

  const bucket = getMinuteBucket(timestamp);
  bucket.db.total += 1;
  bucket.db[operation] += 1;

  const entry = {
    id: `db_${++dbSeq}`,
    timestamp: iso(timestamp),
    operation,
    collection: safeCollection,
  };

  pushBounded(recentDbOperations, entry, MAX_RECENT);
  if (streamClients.size) pending.db.push(entry);
}

/* =========================================================
 * Snapshot
 * ========================================================= */

function objectFromMap(map) {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => b[1] - a[1]),
  );
}

function topRoutes(limit = 12) {
  return [...requestRouteTally.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((route) => ({
      method: route.method,
      path: route.path,
      count: route.count,
      errors: route.errors,
      avgMs: route.count ? round(route.totalMs / route.count, 1) : 0,
      maxMs: round(route.maxMs, 1),
      lastAt: iso(route.lastAt),
    }));
}

function collectionBreakdown() {
  return [...dbCollectionTally.values()]
    .sort((a, b) => b.total - a.total)
    .map((row) => ({ ...row, lastAt: iso(row.lastAt) }));
}

export function getLiveSnapshot({
  limit = 50,
  windowMinutes = DEFAULT_WINDOW_MINUTES,
} = {}) {
  const recentLimit = clamp(limit, 0, MAX_RECENT);
  const byOperation = Object.fromEntries(
    DB_OPERATIONS.map((operation) => [
      operation,
      dbOperationTally.get(operation) || 0,
    ]),
  );

  return {
    generatedAt: iso(Date.now()),
    startedAt: iso(startedAt),
    uptimeMs: Date.now() - startedAt,
    windowMinutes: clamp(windowMinutes, 1, RETENTION_MINUTES),
    series: buildSeries(windowMinutes),
    events: {
      total: eventTotal,
      errors: eventErrors,
      major: eventMajor,
      byType: objectFromMap(eventTypeTally),
      bySector: objectFromMap(eventSectorTally),
      recent:
        recentLimit > 0 ? recentEvents.slice(-recentLimit).reverse() : [],
    },
    requests: {
      total: requestTotal,
      errors: requestErrors,
      errorRate: requestTotal
        ? round((requestErrors / requestTotal) * 100, 2)
        : 0,
      avgMs: requestTotal ? round(requestTotalMs / requestTotal, 1) : 0,
      byMethod: objectFromMap(requestMethodTally),
      byStatus: objectFromMap(requestStatusTally),
      topRoutes: topRoutes(),
      recent:
        recentLimit > 0 ? recentRequests.slice(-recentLimit).reverse() : [],
    },
    db: {
      total: dbTotal,
      byOperation,
      byCollection: collectionBreakdown(),
      recent:
        recentLimit > 0
          ? recentDbOperations.slice(-recentLimit).reverse()
          : [],
    },
    stream: {
      clients: streamClients.size,
      maxClients: MAX_STREAM_CLIENTS,
    },
  };
}

/* =========================================================
 * SSE stream management
 * ========================================================= */

export function hasStreamCapacity(userId) {
  if (streamClients.size >= MAX_STREAM_CLIENTS) {
    return {
      ok: false,
      reason: "The server has reached its live stream connection limit.",
    };
  }

  let mine = 0;
  for (const client of streamClients) {
    if (client.userId === userId) mine += 1;
  }

  if (mine >= MAX_STREAM_CLIENTS_PER_USER) {
    return {
      ok: false,
      reason: "Too many live streams are open for this account.",
    };
  }

  return { ok: true };
}

export function writeSseEvent(res, event, data, id = null) {
  if (!res || res.writableEnded || res.destroyed) return false;

  let frame = "";
  if (id !== null && id !== undefined) frame += `id: ${id}\n`;
  if (event) frame += `event: ${event}\n`;
  frame += `data: ${JSON.stringify(data)}\n\n`;

  try {
    res.write(frame);
    return true;
  } catch {
    return false;
  }
}

function broadcast(event, data) {
  for (const client of [...streamClients]) {
    const { res } = client;

    if (!res || res.writableEnded || res.destroyed) {
      unregisterStreamClient(client);
      continue;
    }

    if (res.writableLength > MAX_BUFFERED_BYTES) {
      client.dropped += 1;
      continue;
    }

    writeSseEvent(res, event, data);
  }
}

function flushStream() {
  if (!streamClients.size) {
    pending.events.length = 0;
    pending.requests.length = 0;
    pending.db.length = 0;
    stopStreamTimers();
    return;
  }

  const events = pending.events.splice(0, pending.events.length);
  const requests = pending.requests.splice(0, pending.requests.length);
  const db = pending.db.splice(0, pending.db.length);

  if (events.length) broadcast("events", events);
  if (requests.length) broadcast("requests", requests);
  if (db.length) broadcast("db", db);

  broadcast("metrics", getLiveSnapshot({ limit: 0 }));
}

function heartbeatStream() {
  if (!streamClients.size) {
    stopStreamTimers();
    return;
  }

  const frame = `: ping ${Date.now()}\n\n`;
  for (const client of [...streamClients]) {
    const { res } = client;
    if (!res || res.writableEnded || res.destroyed) {
      unregisterStreamClient(client);
      continue;
    }
    try {
      res.write(frame);
    } catch {
      unregisterStreamClient(client);
    }
  }
}

function ensureStreamTimers() {
  if (!flushTimer) {
    flushTimer = setInterval(flushStream, STREAM_FLUSH_MS);
    flushTimer.unref?.();
  }
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(heartbeatStream, STREAM_HEARTBEAT_MS);
    heartbeatTimer.unref?.();
  }
}

function stopStreamTimers() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function registerStreamClient(res, userId) {
  const client = {
    res,
    userId: String(userId || "unknown"),
    connectedAt: Date.now(),
    dropped: 0,
  };

  streamClients.add(client);
  ensureStreamTimers();
  return client;
}

export function unregisterStreamClient(client) {
  if (!client || !streamClients.delete(client)) return;

  try {
    if (client.res && !client.res.writableEnded && !client.res.destroyed) {
      client.res.end();
    }
  } catch {
    // Client is already gone.
  }

  if (!streamClients.size) {
    pending.events.length = 0;
    pending.requests.length = 0;
    pending.db.length = 0;
    stopStreamTimers();
  }
}

/* =========================================================
 * Express / Mongo instrumentation
 * ========================================================= */

function requestRoutePath(req) {
  try {
    const base = req.baseUrl || "";
    const route = req.route?.path;
    if (typeof route === "string") return `${base}${route}`;
    if (Array.isArray(route) && route.length > 0) {
      return `${base}${route[0]}`;
    }
  } catch {
    // Fall through to the raw URL.
  }

  return req.originalUrl || req.url || "/";
}

export function normalizeApiPath(req) {
  const raw = requestRoutePath(req);
  return sanitizePathValue(raw) || "/";
}

export function telemetryRequestMiddleware(req, res, next) {
  // A stream stays open for minutes; recording it as one request would
  // wreck latency aggregates, and it has its own connection counters.
  if (req.path?.startsWith("/api/live-events/stream")) {
    return next();
  }

  const started = process.hrtime.bigint();
  let settled = false;

  const finalize = (aborted) => {
    if (settled) return;
    settled = true;

    const elapsedMs =
      Number(process.hrtime.bigint() - started) / 1_000_000;

    recordRequest({
      method: req.method,
      path: normalizeApiPath(req),
      status: aborted && !res.writableEnded ? 499 : res.statusCode,
      durationMs: elapsedMs,
    });
  };

  res.once("finish", () => finalize(false));
  res.once("close", () => finalize(true));

  return next();
}

const monitoredClients = new WeakSet();

export function attachDatabaseMonitoring(connection) {
  let client;
  try {
    client = connection?.getClient?.();
  } catch {
    return;
  }

  if (!client || monitoredClients.has(client)) return;
  monitoredClients.add(client);

  client.on("commandStarted", (event) => {
    try {
      const operation = DB_COMMAND_OPERATIONS[event?.commandName];
      if (!operation) return;

      const collection = commandCollection(
        event.commandName,
        event.command,
      );
      if (!collection) return;

      recordDbOperation(operation, collection);
    } catch {
      // Telemetry must never break a database command.
    }
  });
}

/* Register the application event tap exactly once. */
evt.onListen(recordEvent);

export default getLiveSnapshot;

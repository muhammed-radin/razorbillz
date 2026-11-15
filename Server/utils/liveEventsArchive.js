import { appendFile, mkdir, open, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openJson, sealJson } from "./crypto/index.js";

/* =========================================================
 * Encrypted 24-hour telemetry archive
 * ---------------------------------------------------------
 * Every event (minor + major), API request and MongoDB CRUD
 * command is buffered, then appended to an AES-256-GCM sealed
 * NDJSON file per UTC day under Server/secrets/live-events/.
 *
 * - Encryption uses the existing master-key envelope (sealJson),
 *   so the files are unreadable without Server/secrets/master-keys.json.
 * - Files are chmod 0600 and the directory 0700.
 * - Flush cadence is 15s (or immediately when the buffer is large),
 *   which keeps disk I/O off the request path.
 * - Retention is 24h at read time; files older than ~48h are pruned.
 * ========================================================= */

const here = path.dirname(fileURLToPath(import.meta.url));
export const ARCHIVE_DIR = path.resolve(here, "..", "secrets", "live-events");
const FILE_PREFIX = "live-events-";
const FILE_SUFFIX = ".jsonl.enc";
const ARCHIVE_CONTEXT = "live-events:archive";

const RETENTION_MS = 24 * 60 * 60 * 1000;
const FILE_RETENTION_MS = 48 * 60 * 60 * 1000;
const FLUSH_MS = 15_000;
const MAX_BUFFER_ITEMS = 5_000;
const READ_CACHE_MS = 5_000;
/* One day of telemetry can be large. Reads only need the newest slice;
 * capping per file keeps the owner endpoint fast and memory-bounded. */
const MAX_READ_BYTES_PER_FILE = 16 * 1024 * 1024;

const KINDS = ["events", "requests", "db"];

let buffer = [];
let inFlightEntries = [];
let flushTimer = null;
let flushPromise = null;
let loadCache = { at: 0, entries: null };

function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function filePathFor(day) {
  return path.join(ARCHIVE_DIR, `${FILE_PREFIX}${day}${FILE_SUFFIX}`);
}

function entryTimestamp(item) {
  const parsed = Date.parse(item?.timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function ensureTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushArchive().catch((error) => {
      console.error("[live-events-archive] flush failed:", error?.message);
    });
  }, FLUSH_MS);
  flushTimer.unref?.();
}

function stopTimerIfIdle() {
  if (!buffer.length && !inFlightEntries.length && flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/** Queue one already-sanitised telemetry record for the archive. */
export function archiveTelemetry(kind, item) {
  if (!KINDS.includes(kind) || !item) return;

  buffer.push({ kind, ts: entryTimestamp(item), item });
  if (buffer.length >= MAX_BUFFER_ITEMS) {
    flushArchive().catch((error) => {
      console.error("[live-events-archive] flush failed:", error?.message);
    });
  } else {
    ensureTimer();
  }
}

async function appendGroup(day, kind, items) {
  const payload = sealJson(
    {
      kind,
      day,
      flushedAt: new Date().toISOString(),
      items,
    },
    { context: ARCHIVE_CONTEXT },
  );

  await mkdir(ARCHIVE_DIR, { recursive: true, mode: 0o700 });
  await appendFile(filePathFor(day), `${payload}\n`, { mode: 0o600 });
}

async function writeEntries(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const day = dayKey(entry.ts);
    const key = `${day}|${entry.kind}`;
    let group = groups.get(key);
    if (!group) {
      group = { day, kind: entry.kind, items: [] };
      groups.set(key, group);
    }
    group.items.push(entry.item);
  }

  for (const group of groups.values()) {
    try {
      await appendGroup(group.day, group.kind, group.items);
    } catch (error) {
      console.error(
        `[live-events-archive] could not append ${group.kind} for ${group.day}:`,
        error?.message,
      );
      /* Keep unwritten records in memory for the next attempt. */
      buffer.unshift(
        ...group.items.map((item) => ({
          kind: group.kind,
          ts: entryTimestamp(item),
          item,
        })),
      );
    }
  }

  if (buffer.length > MAX_BUFFER_ITEMS * 2) {
    buffer = buffer.slice(-MAX_BUFFER_ITEMS * 2);
  }
}

/** Flush buffered telemetry to the encrypted files. */
export async function flushArchive() {
  if (flushPromise) return flushPromise;
  if (!buffer.length) return;

  const entries = buffer;
  buffer = [];
  inFlightEntries = entries;

  flushPromise = (async () => {
    try {
      await writeEntries(entries);
      loadCache = { at: 0, entries: null };
      await pruneOldFiles();
    } finally {
      inFlightEntries = [];
      flushPromise = null;
      stopTimerIfIdle();
    }
  })();

  return flushPromise;
}

async function listArchiveFiles() {
  let names = [];
  try {
    names = await readdir(ARCHIVE_DIR);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return names
    .filter(
      (name) => name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX),
    )
    .sort()
    .map((name) => path.join(ARCHIVE_DIR, name));
}

/* Read only the newest `maxBytes` of a file. Sealed batches are one
 * JSON object per line, so a partial first line (when the window starts
 * mid-line) is discarded. */
async function readFileTail(file, maxBytes) {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    if (!size) return "";
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);

    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstNewline = text.indexOf("\n");
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
    }
    return text;
  } finally {
    await handle.close();
  }
}

async function pruneOldFiles() {
  const cutoff = Date.now() - FILE_RETENTION_MS;
  const files = await listArchiveFiles();

  for (const file of files) {
    const name = path.basename(file);
    const day = name.slice(FILE_PREFIX.length, name.length - FILE_SUFFIX.length);
    const timestamp = Date.parse(`${day}T00:00:00.000Z`);
    if (Number.isFinite(timestamp) && timestamp < cutoff) {
      try {
        await unlink(file);
      } catch {
        // Best effort; the read path already filters by age.
      }
    }
  }
}

function dedupeKey(kind, item) {
  return `${kind}:${item?.id ?? ""}:${item?.timestamp ?? ""}`;
}

function collectItems(target, seen, kind, items) {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const key = dedupeKey(kind, item);
    if (seen.has(key)) continue;
    seen.add(key);
    target[kind].push(item);
  }
}

async function loadArchiveEntries() {
  if (
    loadCache.entries &&
    Date.now() - loadCache.at < READ_CACHE_MS
  ) {
    return loadCache.entries;
  }

  const result = { events: [], requests: [], db: [] };
  const seen = new Set();
  const files = await listArchiveFiles();

  for (const file of files) {
    let raw = "";
    try {
      raw = await readFileTail(file, MAX_READ_BYTES_PER_FILE);
    } catch {
      continue;
    }

    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let batch;
      try {
        batch = openJson(line, { context: ARCHIVE_CONTEXT });
      } catch {
        continue; // key rotation / partial line — skip, never crash
      }
      if (!batch || !KINDS.includes(batch.kind)) continue;
      collectItems(result, seen, batch.kind, batch.items);
    }
  }

  /* Include records that have not been flushed yet. */
  collectItems(
    result,
    seen,
    "events",
    inFlightEntries
      .filter((entry) => entry.kind === "events")
      .map((entry) => entry.item),
  );
  collectItems(
    result,
    seen,
    "requests",
    inFlightEntries
      .filter((entry) => entry.kind === "requests")
      .map((entry) => entry.item),
  );
  collectItems(
    result,
    seen,
    "db",
    inFlightEntries
      .filter((entry) => entry.kind === "db")
      .map((entry) => entry.item),
  );
  collectItems(
    result,
    seen,
    "events",
    buffer.filter((entry) => entry.kind === "events").map((entry) => entry.item),
  );
  collectItems(
    result,
    seen,
    "requests",
    buffer
      .filter((entry) => entry.kind === "requests")
      .map((entry) => entry.item),
  );
  collectItems(
    result,
    seen,
    "db",
    buffer.filter((entry) => entry.kind === "db").map((entry) => entry.item),
  );

  loadCache = { at: Date.now(), entries: result };
  return result;
}

/**
 * Read the last 24h archive (newest first). Limits are per kind.
 */
export async function readRecentArchive({
  sinceMs = Date.now() - RETENTION_MS,
  limits = { events: 2_000, requests: 1_000, db: 1_000 },
} = {}) {
  const entries = await loadArchiveEntries();
  const now = Date.now();

  const pick = (kind) =>
    entries[kind]
      .filter((item) => {
        const ts = Date.parse(item?.timestamp);
        return (
          (!Number.isFinite(ts) || ts >= sinceMs) &&
          (!Number.isFinite(ts) || ts <= now)
        );
      })
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, limits[kind] ?? 1_000);

  return {
    since: new Date(sinceMs).toISOString(),
    generatedAt: new Date(now).toISOString(),
    events: pick("events"),
    requests: pick("requests"),
    db: pick("db"),
  };
}

export default { archiveTelemetry, flushArchive, readRecentArchive };

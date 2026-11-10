import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* =========================================================
 * Master key management (Tier A envelope encryption).
 *
 * Root keys live OUTSIDE the database, in:
 *   Server/secrets/master-keys.json        (file, chmod 0600 — generate with
 *                                           `npm run keys:generate`)
 * or an env JSON string:
 *   ENCRYPTION_KEYS_JSON='{"keys":[…]}'    (containers, where a mounted
 *                                           file is awkward — same format).
 *
 * File format (NEVER commit this file):
 * {
 *   "version": 1,
 *   "keys": [
 *     { "id": "k1", "algorithm": "AES-256-GCM",
 *       "key": "<32 random bytes, base64url>", "createdAt": "ISO-8601" }
 *   ]
 * }
 *
 * - The LAST entry is the ACTIVE key: all new seals/wraps use it.
 * - Earlier entries remain loadable for opening old values
 *   (rotation = append a new key; migration re-seals old rows).
 * - Blind-index subkeys are derived from each master key (HMAC
 *   derivation), so the index key never exists verbatim on disk.
 * ========================================================= */

const here = path.dirname(fileURLToPath(import.meta.url));
const SECRETS_DIR = path.resolve(here, "..", "..", "secrets");
const KEYS_FILE = path.join(SECRETS_DIR, "master-keys.json");

function b64urlToBuffer(s) {
  return Buffer.from(s, "base64url");
}

/* State is warmed once at module load (top-level await, ESM) so the
 * hot write paths can stay synchronous. */
function loadKeys() {
  let raw = null;
  let source = null;

  if (process.env.ENCRYPTION_KEYS_JSON) {
    raw = process.env.ENCRYPTION_KEYS_JSON;
    source = "env:ENCRYPTION_KEYS_JSON";
  } else {
    try {
      raw = readFileSync(KEYS_FILE, "utf8");
      source = `file:${KEYS_FILE}`;
    } catch (err) {
      return {
        keys: [],
        activeId: null,
        source: `file:${KEYS_FILE}`,
        error: `master keys unreadable (${err?.code ?? err?.message}); writes fail closed — generate with: npm run keys:generate`,
      };
    }
  }

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.keys) ? parsed.keys : [];
    const keys = list
      .filter((k) => k?.id && k?.key)
      .map((k) => {
        const buffer = b64urlToBuffer(k.key);
        if (buffer.length !== 32) {
          throw new Error(
            `master key "${k.id}" is ${buffer.length} bytes, expected 32`,
          );
        }
        return { id: k.id, buffer, createdAt: k.createdAt ?? null };
      });
    if (keys.length === 0) throw new Error("no usable master keys");
    return {
      keys,
      activeId: keys[keys.length - 1].id,
      source,
      error: null,
    };
  } catch (err) {
    return {
      keys: [],
      activeId: null,
      source,
      error: `invalid master keys config: ${err?.message}`,
    };
  }
}

export const keyState = loadKeys();

export function getStateSync() {
  return keyState;
}

/* All known envelope keys, oldest -> newest (synchronous view). */
export function getEnvelopeKeysSync() {
  return keyState.keys;
}

/* The active sealing/wrapping key, or null when unconfigured. */
export function getActiveEnvelopeKeySync() {
  return keyState.keys[keyState.keys.length - 1] ?? null;
}

/* Fail-closed check for write paths. */
export function requireActiveEnvelopeKey() {
  const key = getActiveEnvelopeKeySync();
  if (!key) {
    throw new Error(
      keyState.error ?? "no active master key configured",
    );
  }
  return key;
}

/* Deterministic blind-index subkey for a given master key + purpose.
 * Derived (not stored) so the on-disk file holds only root keys. */
export function deriveBlindIndexKey(masterKeyBuffer, keyId, purpose) {
  return createHmac("sha256", masterKeyBuffer)
    .update(`razorbills:blind-index:v1:${keyId}:${purpose ?? ""}`)
    .digest();
}

/* Blind-index key for the ACTIVE master key. */
export function getActiveBlindIndexKeySync(purpose) {
  const key = getActiveEnvelopeKeySync();
  if (!key) return null;
  return deriveBlindIndexKey(key.buffer, key.id, purpose);
}

export function keysStatus() {
  return {
    source: keyState.source,
    activeId: keyState.activeId,
    keyCount: keyState.keys.length,
    keyIds: keyState.keys.map((k) => k.id),
    error: keyState.error,
    ok: keyState.keys.length > 0,
  };
}

export default {
  keyState,
  getStateSync,
  getEnvelopeKeysSync,
  getActiveEnvelopeKeySync,
  requireActiveEnvelopeKey,
  deriveBlindIndexKey,
  getActiveBlindIndexKeySync,
  keysStatus,
};

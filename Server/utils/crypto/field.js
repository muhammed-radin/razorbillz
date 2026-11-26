import CryptoJS from "crypto-js";
import { isSealed, openString, sealJson, sealString } from "./aead.js";
import {
  ADDRESS_INDEX_SPEC,
  USER_INDEX_SPEC,
  blindIndex,
  gramTokens,
  indexPII,
  prefixTokens,
  wordPrefixTokens,
} from "./blindIndex.js";

/* =========================================================
 * PII field helpers, shared by every route that stores
 * user-controlled sensitive data.
 *
 * Cipher formats understood on READ (dispatched transparently):
 *   ze1.…      envelope AES-256-GCM (active)  -> openString()
 *   U2FsdGVkX1 legacy CryptoJS AES            -> read-only compat with
 *               (env CRYPTED / CRYPTED_STRICT) previously stored rows. Old
 *               values decrypt fine; they re-seal to ze1 on next write or
 *               in bulk via scripts/migrate-encryption.js.
 *   other      plaintext passthrough (pre-encryption rows, ids, enums)
 *
 * On WRITE: always seal to the new format + attach blind indexes via
 * the optional `?search=` suffix key `<field>_idx` (see indexPII).
 * ========================================================= */

const LEGACY_PREFIX = "U2FsdGVkX1";
/* An older client write path occasionally dropped the leading "U" from
 * the CryptoJS/OpenSSL prefix ("U2FsdGVkX1…" → "2FsdGVkX1…"). The rest of
 * the payload is still a perfectly valid legacy ciphertext. */
const LEGACY_PREFIX_BODY = "2FsdGVkX1";

/** Restore the leading "U" when it was lost; plain text passes through. */
function normalizeLegacyCiphertext(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith(LEGACY_PREFIX)) return value;
  return value.startsWith(LEGACY_PREFIX_BODY) ? `U${value}` : value;
}

export function isSealedEnvelope(value) {
  return isSealed(value);
}

export function isLegacyEncrypted(value) {
  return (
    typeof value === "string" &&
    normalizeLegacyCiphertext(value).startsWith(LEGACY_PREFIX)
  );
}

export function isEncrypted(value) {
  return isSealedEnvelope(value) || isLegacyEncrypted(value);
}

/* Back-compat alias matching the old crypt.js signature. */
export function validateEncrypted(value) {
  return isEncrypted(value);
}

/* ---------------- WRITE ---------------- */

export function encryptField(value, { context = "" } = {}) {
  if (value === null || value === undefined || value === "") return value;
  if (isSealedEnvelope(value)) return value; // idempotent (no double-wrap)
  return sealString(value, { context });
}

export function encryptStrict(value, opts = {}) {
  return encryptField(value, opts);
}

/* Always-encrypt alias (legacy crypt.js exported `encrypt`). */
export const encrypt = encryptField;

/* Non-strict aliases kept for import-shape parity with crypt.js. */
export function encryptPlain(value, opts = {}) {
  return encryptField(value, opts);
}

/* ---------------- READ ---------------- */

function openLegacyWithKey(value, passphrase) {
  if (!passphrase) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(value, passphrase);
    const text = bytes.toString(CryptoJS.enc.Utf8);
    /* Wrong passphrases usually throw on toString(), but can also yield
     * replacement characters — never treat that as a successful open. */
    if (!text || text.includes("\uFFFD")) return null;
    return text;
  } catch {
    return null;
  }
}

function openLegacy(value, strict = false) {
  const ciphertext = normalizeLegacyCiphertext(value);
  /* Some rows were written with the other key (e.g. an address encrypted
   * with CRYPTED_STRICT). Try the requested key first, then its sibling. */
  const passphrases = strict
    ? [process.env.CRYPTED_STRICT, process.env.CRYPTED]
    : [process.env.CRYPTED, process.env.CRYPTED_STRICT];
  for (const passphrase of passphrases) {
    const opened = openLegacyWithKey(ciphertext, passphrase);
    if (opened) return opened;
  }
  return null;
}

/* Context fallbacks: vaulted fields may arrive sealed under any of
 * the contexts used across writers (legacy no-context route seals,
 * the per-field contexts used by buildMirrorUserFields, the email
 * vault). Authenticated decryption is context-sensitive, so when the
 * caller's context does not match, the well-known ones are tried in
 * order before giving up (and returning the original ciphertext). */
const CONTEXT_FALLBACKS = [
  "",
  "email:email",
  "user:name",
  "user:phoneNumber",
  "user:image",
  "user:email",
];

/* Older browser saves JSON.stringify'd address fields before encrypting,
 * so a successfully opened value can still be a quoted JSON string. */
function unquoteJsonString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (
    trimmed.length < 2 ||
    !trimmed.startsWith('"') ||
    !trimmed.endsWith('"')
  ) {
    return value;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

/* One decryption pass: legacy CryptoJS or one ze1 envelope. */
function decryptLayer(value, { strict = false, context = "" } = {}) {
  if (typeof value !== "string" || value === "") return value;
  if (isLegacyEncrypted(value)) {
    return openLegacy(value, strict) ?? value;
  }
  if (!isSealedEnvelope(value)) return value;

  const candidates = context
    ? [context, ...CONTEXT_FALLBACKS.filter((c) => c !== context)]
    : CONTEXT_FALLBACKS;
  for (const ctx of candidates) {
    try {
      return openString(value, { context: ctx });
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (msg.includes("unknown key id") || msg.includes("malformed")) {
        console.warn(
          "[crypto] decrypt failed (missing/malformed envelope key):",
          msg,
        );
        return value; // unrecoverable — context retrying won't help
      }
      /* AAD/context mismatch → try the next known context */
    }
  }
  console.warn(
    "[crypto] decrypt failed (tampered, context-mismatched or key-mismatched envelope)",
  );
  return value;
}

/* Decrypt a single PII field. Never throws for unknown formats —
 * unknown/plaintext/non-strings pass through (drop-in compat with the
 * old decryptField). For tampered ze1 envelopes the ORIGINAL ciphertext
 * is returned and a warning is logged (surface to ops via logs route).
 * `strict` mirrors the legacy crypt.js boolean (legacy key selection).
 *
 * Rows written before `unwrapLegacyIfPossible` can be DOUBLE-wrapped
 * (ze1 around a legacy U2Fsd… string), and a legacy write path dropped
 * the leading "U". Layers are peeled here (bounded) so reads always end
 * at plaintext; JSON-quoted scalars are unquoted between passes. */
const MAX_DECRYPT_LAYERS = 3;

export function decryptField(value, { strict = false, context = "" } = {}) {
  let current = value;
  for (let i = 0; i < MAX_DECRYPT_LAYERS; i += 1) {
    if (typeof current !== "string" || current === "") break;
    const next = unquoteJsonString(
      decryptLayer(current, { strict, context }),
    );
    if (next === current) break; // not encrypted / key unavailable
    current = next;
    if (!isSealedEnvelope(current) && !isLegacyEncrypted(current)) break;
  }
  return current;
}

/* Back-compat: positional `strict` like crypt.js */
export function decrypt(value, strict = false, context = "") {
  return decryptField(value, { strict, context });
}

export function decryptStrict(value) {
  return decryptField(value, { strict: true });
}

/* ----------------------------------------------------------------------------
 * Addresses (embedded docs under users.addressBook / users.address,
 * and order snapshots via sealAddressObject / openAddressObject).
 *
 * Layout kept BACK-COMPATIBLE: same fields, each value sealed, plus a
 * derived `_idx` subdoc (blind indexes) SERVED TO THE DB ONLY — never
 * returned off the server (strip with stripSearchIndexes()).
 * -------------------------------------------------------------------------- */

const ADDRESS_META_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "isActive",
  "type",
  "isDefault",
  "userId",
]);

function sealAddress(address, { context = "address" } = {}) {
  if (!address || typeof address !== "object") return address;
  const sealed = {};
  const idxValues = {};
  for (const [key, value] of Object.entries(address)) {
    if (ADDRESS_META_FIELDS.has(key)) {
      sealed[key] = value;
      continue;
    }
    sealed[key] = encryptField(unwrapLegacyIfPossible(value), {
      context: `${context}:${key}`,
    });
    if (typeof value === "string" && ADDRESS_INDEX_SPEC[key]) {
      idxValues[key] = value;
    }
  }
  sealed._idx = indexPII(idxValues, ADDRESS_INDEX_SPEC);
  return sealed;
}

function openAddress(address, context = "address") {
  if (!address || typeof address !== "object") return address;
  const opened = {};
  for (const [key, value] of Object.entries(address)) {
    if (key === "_idx" || key === "searchIdx") continue; // never leak index tokens
    if (ADDRESS_META_FIELDS.has(key)) {
      opened[key] = value;
      continue;
    }
    opened[key] = decryptField(value, { context: `${context}:${key}` });
  }
  return opened;
}

export function encryptAddress(address) {
  return sealAddress(address);
}
export function decryptAddress(address) {
  return openAddress(address);
}

export function encryptAddressBook(list = []) {
  return Array.isArray(list) ? list.map(encryptAddress) : list;
}
export function decryptAddressBook(list = []) {
  return Array.isArray(list) ? list.map(decryptAddress) : list;
}

/* Order snapshot object (OrderAddressSchema): flattened fields, each
 * sealed with the per-field AAD context `order:<field>`. Reads go
 * through openAddressObject; courier/ops building a payload opens
 * transiently (see routes/shipments.js). Order-wide ops search keys on
 * fulfillment.deliveryPincode (kept plaintext, low sensitivity). */

/* Guard against ciphertext-in-ciphertext: a client with a broken/
 * missing legacy key (VITE_CRYPTED) can send a still-encrypted
 * `U2FsdGVkX1…` value inside an address object. Sealing that verbatim
 * would double-wrap it into an envelope that can never be opened into
 * plaintext. Instead, open the legacy layer first (server env keys)
 * and seal the plaintext; values that fail to open are sealed as-is
 * (best effort) and will read back through the legacy branch. */
function unwrapLegacyIfPossible(value) {
  if (typeof value !== "string" || !isLegacyEncrypted(value)) return value;
  const opened = decryptField(value, { strict: false });
  return typeof opened === "string" && opened && opened !== value ? opened : value;
}

export function sealAddressObject(address) {
  if (!address || typeof address !== "object") return address;
  const sealed = {};
  for (const [key, value] of Object.entries(address)) {
    if (typeof value !== "string") {
      sealed[key] = value; // ignore nested/non-string junk (strict schema would strip it)
      continue;
    }
    sealed[key] = encryptField(unwrapLegacyIfPossible(value), {
      context: `order:${key}`,
    });
  }
  return sealed;
}

export function openAddressObject(address) {
  if (!address || typeof address !== "object") return address;
  const opened = {};
  for (const [key, value] of Object.entries(address)) {
    if (key === "searchIdx" || key === "_idx") continue;
    opened[key] = decryptField(value, { context: `order:${key}` });
  }
  return opened;
}

/* Strip blind-index subdocs from a document tree before returning to
 * clients (defense in depth: tokens are server-internal). */
export function stripSearchIndexes(doc) {
  if (Array.isArray(doc)) return doc.map(stripSearchIndexes);
  if (doc && typeof doc === "object") {
    const cleaned = {};
    for (const [key, value] of Object.entries(doc)) {
      if (key === "_idx" || key === "searchIdx") continue;
      cleaned[key] = stripSearchIndexes(value);
    }
    return cleaned;
  }
  return doc;
}

/* Blind indexes for user-level PII fields — ADVANCED set:
 * { <field>_idx: eqToken, <field>_prefix: [...], <field>_grams: [...] }
 * Used by the users mirror collection and the Better Auth adapter
 * (email vaulting). The eq token lives under `<field>_idx` (same key
 * the exact-search translation rewires to); the arrays enable prefix
 * (membership) and substring (`grams $all`) search via MongoDB
 * without plaintext. */
export function advancedPIIIdx(values, spec = USER_INDEX_SPEC) {
  const out = {};
  for (const [field, purpose] of Object.entries(spec)) {
    const value = values?.[field];
    if (value === undefined || value === null || value === "") continue;
    try {
      out[`${field}_idx`] = blindIndex(value, purpose);
      const prefix = [
        ...new Set([
          ...prefixTokens(value, purpose),
          ...wordPrefixTokens(value, purpose),
        ]),
      ];
      if (prefix.length) out[`${field}_prefix`] = prefix;
      const grams = gramTokens(value, purpose);
      if (grams.length) out[`${field}_grams`] = grams;
    } catch (err) {
      console.warn("[crypto] advanced index build failed:", err?.message);
      try {
        out[`${field}_idx`] = blindIndex(value, purpose);
      } catch {
        /* skip field entirely when keys are unavailable */
      }
    }
  }
  return out;
}

/* Blind indexes for user-level PII fields (exact only). */
export function userSearchIdx(values) {
  return indexPII(values, USER_INDEX_SPEC);
}

/* Convenience: re-seal a whole legacy plaintext object into sealed
 * strings keyed the same way (used by the migration script). */
export function sealObjectFields(obj, fieldContexts = {}) {
  const out = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (typeof value === "string" && !isEncrypted(value)) {
      out[key] = encryptField(value, {
        context: fieldContexts[key] ?? key,
      });
    } else {
      out[key] = value;
    }
  }
  return out;
}

export default {
  isSealedEnvelope,
  isLegacyEncrypted,
  isEncrypted,
  validateEncrypted,
  encryptField,
  encryptStrict,
  encrypt,
  encryptPlain,
  decryptField,
  decrypt,
  decryptStrict,
  encryptAddress,
  decryptAddress,
  encryptAddressBook,
  decryptAddressBook,
  sealAddressObject,
  openAddressObject,
  stripSearchIndexes,
  userSearchIdx,
  sealObjectFields,
};

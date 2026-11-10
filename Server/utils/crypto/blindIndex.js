import { createHmac } from "node:crypto";
import { getActiveBlindIndexKeySync } from "./keys.js";

/* =========================================================
 * Searchable encryption via BLIND INDEXES.
 *
 * MongoDB Queryable Encryption is unavailable on the Firebase
 * Enterprise MongoDB API, so encrypted fields get a companion index:
 *
 *     blindIndex(value, purpose) = trunc64(HMAC(indexKey, normalize(value)))
 *
 * Properties:
 * - Deterministic: the same plaintext always produces the same token
 *   -> the server can `find({ "email_idx": token })` WITHOUT ever
 *   seeing (or being able to reverse) the plaintext.
 * - Keyed with an HMAC subkey derived from the master key: the index
 *   is not a plain hash — offline brute force vs weak values is
 *   resisted by the secret key (this is the standard "blind index"
 *   construction, cf. Paragonie's cryptography guidance).
 * - Normalization (case/diacritic/punctuation folding) collapses
 *   trivial variants (e.g. "Rahif M.", "rahif M", "Rahïf M.") onto the
 *   same token so searches hit spelled-slightly-differently entries.
 * - EQUALITY + advanced search are supported (PREFIX anchored tokens
 *   and 3-gram SUBSTRING matching — see the ADVANCED SEARCH block
 *   below). Every encrypted field gets an index by default (field.js).
 * - Rotation: indexes use the ACTIVE master key. After appending a
 *   new key, rebuild indexes (see scripts/migrate-encryption.js
 *   --reindex) so both writes and searches use the same subkey.
 * ---------------------------------------------------------
 * LEAKAGE NOTE (inherent to any searchable-encryption scheme): for
 * low-entropy fields (phone numbers, pincodes, check-digit emails)
 * an attacker with BOTH the DB and the master key could rebuild the
 * dictionary; without the master key the tokens are opaque. Compare
 * tokens only inside the server, never log them alongside plaintext.
 * ========================================================= */

export const INDEX_BITS = 64; // collision-safe at store scale
const HEX_TRUNC_LENGTH = INDEX_BITS / 4; // 16 hex chars

/* =========================================================
 * ADVANCED SEARCH — PREFIX + SUBSTRING on ciphertext.
 *
 * Beyond plain equality (token = HMAC("purpose:normalized")), an
 * indexed field can carry two more token families, all keyed by
 * the same derived blind-index subkey:
 *
 * 1. PREFIX tokens (anchored at position 0, marker "p"):
 *      p_i = HMAC("purpose:p:" + value[0..i])   for i = 1..PREFIX_MAX
 *    A search string s matches iff s (normalized) is one of the
 *    stored prefixes. Exact, zero false positives.
 *
 * 2. TRIGRAM tokens (3-grams, marker "g"):
 *      g_j = HMAC("purpose:g:" + value[j..j+3])
 *    A query of length >= 3 is decomposed into its trigrams and
 *    matched with MongoDB `$all` against the stored array. Complete
 *    (no false negatives): every true substring occurrence emits
 *    its trigrams. Scattered-gram FALSE POSITIVES are possible
 *    ("abc…def" can match a query "abcdef") — Tier A routes
 *    post-filter by decrypting candidates; Tier B vault clients
 *    filter locally after decryption. GRAM_MAX_TOKENS bounds the
 *    indexed window for long values.
 *
 * Cost per indexed field ≈ min(len, PREFIX_MAX) + min(grams,
 * GRAM_MAX_TOKENS) (+1 eq) tokens @ 16 hex chars each.
 * ========================================================= */

export const PREFIX_MARKER = "p";
export const GRAM_MARKER = "g";
export const GRAM_SIZE = 3;
export const PREFIX_MAX = 16; // max prefix depth indexed per value
export const GRAM_MAX_TOKENS = 64; // indexed window = cap + GRAM_SIZE - 1 chars

function truncatedHexHmac(key, domain, hexLength = HEX_TRUNC_LENGTH) {
  return createHmac("sha256", key).update(domain).digest("hex").slice(0, hexLength);
}

/* Exact-match token (same construction as blindIndex()). */
export function eqToken(value, purpose) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeByPurpose(purpose)(value);
  if (!normalized) return null;
  const key = getActiveBlindIndexKeySync(purpose);
  if (!key) throw new Error("blind index unavailable: no active master key");
  return truncatedHexHmac(key, `${purpose}:${normalized}`);
}

/* Prefix tokens (anchored at position 0), shortest first. */
export function prefixTokens(value, purpose, maxLen = PREFIX_MAX) {
  if (value === null || value === undefined || value === "") return [];
  const n = normalizeByPurpose(purpose)(value);
  if (!n) return [];
  const key = getActiveBlindIndexKeySync(purpose);
  if (!key) throw new Error("blind index unavailable: no active master key");
  const out = [];
  for (let i = 1; i <= Math.min(n.length, maxLen); i += 1) {
    out.push(truncatedHexHmac(key, `${purpose}:${PREFIX_MARKER}:${n.slice(0, i)}`));
  }
  return out;
}

/* All 3-grams of a value, capped for very long values. */
export function gramTokens(
  value,
  purpose,
  { size = GRAM_SIZE, cap = GRAM_MAX_TOKENS } = {},
) {
  if (value === null || value === undefined || value === "") return [];
  const n = normalizeByPurpose(purpose)(value);
  if (!n) return [];
  const key = getActiveBlindIndexKeySync(purpose);
  if (!key) throw new Error("blind index unavailable: no active master key");
  if (n.length < size) return [truncatedHexHmac(key, `${purpose}:${GRAM_MARKER}:${n}`)];
  const out = [];
  for (let i = 0; i <= n.length - size; i += 1) {
    out.push(truncatedHexHmac(key, `${purpose}:${GRAM_MARKER}:${n.slice(i, i + size)}`));
  }
  return out.length > cap ? out.slice(0, cap) : out;
}

/* Everything a SEARCH side needs for a query string:
 *   { eq, prefix, grams }
 * - eq: exact token (matches the plain blind index field)
 * - prefix: the token the value's own prefix family would hold IF
 *   the query is its prefix (length <= PREFIX_MAX); null otherwise
 * - grams: all query trigrams (match with $all when len >= 3)
 *
 * SUBSTRING MINIMUM — server-enforced: queries shorter than
 * GRAM_SIZE produce NO gram tokens, so every consumer (users search,
 * support subject search, Tier B vault clients) silently degrades to
 * exact + anchored-prefix semantics. Rationale: a 2-char gram token
 * would never match a stored 3-char gram anyway (dead branch), and
 * indexing 2-char substrings on the WRITE side would make the blind
 * index brute-forceable (~62² per token) — rejected for security. */
export function searchTokens(value, purpose) {
  if (value === null || value === undefined || value === "") return null;
  const n = normalizeByPurpose(purpose)(value);
  const eq = eqToken(value, purpose);
  if (!eq) return null;
  const key = getActiveBlindIndexKeySync(purpose);
  if (!key) throw new Error("blind index unavailable: no active master key");
  const prefix =
    n.length >= 1 && n.length <= PREFIX_MAX
      ? truncatedHexHmac(key, `${purpose}:${PREFIX_MARKER}:${n}`)
      : null;
  const grams = n.length >= GRAM_SIZE ? gramTokens(value, purpose) : [];
  return { eq, prefix, grams };
}

/* Canonical normalizers (keyed by "purpose", i.e. field meaning). */

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\u0d00-\u0d7f]+/g, " ") // keep latin+digits+Malayalam
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/* Digits only; fold common Indian formats (+91 / 91 / 0112…). */
export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

export function normalizePincode(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function normalizeByPurpose(purpose) {
  switch (purpose) {
    case "email":
      return normalizeEmail;
    case "phone":
    case "phoneNumber":
      return normalizePhone;
    case "postalCode":
    case "pincode":
      return normalizePincode;
    default:
      return normalizeText;
  }
}

/* One deterministic blind-index token for a (value, purpose) pair.
 * Throws when no master key is configured (fail closed on write). */
export function blindIndex(value, purpose, { bits = INDEX_BITS } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const key = getActiveBlindIndexKeySync(purpose);
  if (!key) {
    throw new Error("blind index unavailable: no active master key");
  }
  const normalized = normalizeByPurpose(purpose)(value);
  if (!normalized) return null;
  const digest = createHmac("sha256", key)
    .update(`${purpose}:${normalized}`)
    .digest("hex");
  return digest.slice(0, Math.ceil(bits / 4));
}

/* Build many tokens at once from a PII-ish object.
 *   indexPII({ name, email, phone }) -> { name: "…", email: "…", phone: "…" }
 * Purposes map onto canonical normalizers (phone/email fold formats). */
export function indexPII(values, spec = {}) {
  const out = {};
  for (const [field, purpose] of Object.entries(spec)) {
    const value = values?.[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object") continue; // objects are indexed by sealJson caller
    const token = blindIndex(typeof value === "string" ? value : String(value), purpose ?? field);
    if (token) out[field] = token;
  }
  return out;
}

/* Address-ish spec: name (text), phone, email, postalCode. */
export const ADDRESS_INDEX_SPEC = {
  name: "name",
  phoneNumber: "phone",
  email: "email",
  postalCode: "postalCode",
  city: "name",
  street: "name",
};

export const USER_INDEX_SPEC = {
  name: "name",
  email: "email",
  phoneNumber: "phone",
};

export default {
  INDEX_BITS,
  PREFIX_MAX,
  GRAM_SIZE,
  GRAM_MAX_TOKENS,
  normalizeText,
  normalizeEmail,
  normalizePhone,
  normalizePincode,
  blindIndex,
  eqToken,
  prefixTokens,
  gramTokens,
  searchTokens,
  indexPII,
  ADDRESS_INDEX_SPEC,
  USER_INDEX_SPEC,
};

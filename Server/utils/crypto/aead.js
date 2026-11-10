import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  getEnvelopeKeysSync,
  requireActiveEnvelopeKey,
} from "./keys.js";

/* =========================================================
 * AES-256-GCM field-level AUTHENTICATED envelope encryption.
 *
 * Replaces the legacy CryptoJS AES (unauthenticated CBC-with-KDF)
 * used by `utils/crypt.js`. Every sealed value is self-contained:
 *
 *   ze1.<keyId>.<b64u wrapIv>.<b64u wrappedDek>.<b64u wrapTag>.
 *     <b64u dataIv>.<b64u dataTag>.<b64u ciphertext>
 *
 * - A fresh 32-byte Data Encryption Key (DEK) is generated per value.
 * - The DEK is wrapped with the active MASTER key (also AES-256-GCM),
 *   itself authenticated by wrapTag; the payload is authenticated by
 *   dataTag + optional AAD context (e.g. "user:phoneNumber"), which
 *   makes tampering and cross-field value swapping detectable.
 * - Rotating the master key never requires rewriting old rows: their
 *   wrapped DEKs still unwrap with the retired key (append a new key;
 *   migration re-seals values opportunistically).
 *
 * THIS IS DATA-AT-REST PROTECTION (database staff, backups, dumps).
 * It complements — never replaces — TLS in transit. For data the
 * server must never be able to read at all, see Tier B
 * (utils/crypto/e2ee.js + the client SDK in shared/e2ee).
 * ========================================================= */

export const ENVELOPE_PREFIX = "ze1.";
const AAD_ROOT = "ze1-dek:v1";
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM standard nonce
const ENVELOPE_PARTS = 8; // ze1,keyId,wrapIv,wrappedDek,wrapTag,dataIv,dataTag,ct

function b64u(buf) {
  return Buffer.from(buf).toString("base64url");
}

function toBuf(value, encoding) {
  try {
    return Buffer.from(value, encoding);
  } catch {
    return null;
  }
}

export function isSealed(value) {
  return (
    typeof value === "string" &&
    value.startsWith(ENVELOPE_PREFIX) &&
    value.split(".").length === ENVELOPE_PARTS
  );
}

/* Seal a UTF-8 string into a `ze1.…` envelope. Throws when no master
 * key is configured (fail closed on write). */
export function sealString(value, { context = "" } = {}) {
  if (value === null || value === undefined || value === "") return value;
  if (typeof value !== "string") value = String(value);

  const masterKey = requireActiveEnvelopeKey();

  // Wrap a fresh per-value DEK under the master key.
  const dek = randomBytes(KEY_LENGTH);
  const wrapIv = randomBytes(IV_LENGTH);
  const wrapCipher = createCipheriv(
    "aes-256-gcm",
    masterKey.buffer,
    wrapIv,
    { authTagLength: 16 },
  );
  wrapCipher.setAAD(Buffer.from(AAD_ROOT));
  const wrappedDek = Buffer.concat([
    wrapCipher.update(dek),
    wrapCipher.final(),
  ]);
  const wrapTag = wrapCipher.getAuthTag();

  // Encrypt the payload with the DEK, bound to its purpose via AAD.
  const dataIv = randomBytes(IV_LENGTH);
  const aad = Buffer.from(context ? `${AAD_ROOT}|${context}` : AAD_ROOT);
  const cipher = createCipheriv("aes-256-gcm", dek, dataIv, {
    authTagLength: 16,
  });
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const dataTag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX.slice(0, -1),
    masterKey.id,
    b64u(wrapIv),
    b64u(wrappedDek),
    b64u(wrapTag),
    b64u(dataIv),
    b64u(dataTag),
    b64u(ct),
  ].join(".");
}

/* Open a sealed envelope. Throws on tamper or unknown key id.
 * null/undefined/"" pass through untouched. */
export function openString(sealed, { context = "" } = {}) {
  if (sealed === null || sealed === undefined || sealed === "") return sealed;
  if (!isSealed(sealed)) {
    throw new Error("value is not a sealed envelope");
  }
  const [, keyId, wrapIvB, wrappedDekB, wrapTagB, dataIvB, dataTagB, ctB] =
    sealed.split(".");

  const masterKey = getEnvelopeKeysSync().find((k) => k.id === keyId);
  if (!masterKey) {
    throw new Error(`unknown key id "${keyId}" (missing after rotation?)`);
  }

  const wrapIv = toBuf(wrapIvB, "base64url");
  const wrappedDek = toBuf(wrappedDekB, "base64url");
  const wrapTag = toBuf(wrapTagB, "base64url");
  const dataIv = toBuf(dataIvB, "base64url");
  const dataTag = toBuf(dataTagB, "base64url");
  const ct = toBuf(ctB, "base64url");
  if (!wrapIv || !wrappedDek || !wrapTag || !dataIv || !dataTag || !ct) {
    throw new Error("sealed envelope is malformed");
  }

  // Unwrap the per-value DEK (authenticated by wrapTag).
  const unwrap = createDecipheriv(
    "aes-256-gcm",
    masterKey.buffer,
    wrapIv,
    { authTagLength: 16 },
  );
  unwrap.setAAD(Buffer.from(AAD_ROOT));
  unwrap.setAuthTag(wrapTag);
  const dek = Buffer.concat([unwrap.update(wrappedDek), unwrap.final()]);

  // Open the payload (authenticated by dataTag + AAD).
  const aad = Buffer.from(context ? `${AAD_ROOT}|${context}` : AAD_ROOT);
  const decipher = createDecipheriv("aes-256-gcm", dek, dataIv, {
    authTagLength: 16,
  });
  decipher.setAAD(aad);
  decipher.setAuthTag(dataTag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}

/* JSON blob variants (addresses, nested PII objects). */
export function sealJson(value, opts = {}) {
  if (value === null || value === undefined || value === "") return value;
  return sealString(JSON.stringify(value), opts);
}
export function openJson(value, opts = {}) {
  if (value === null || value === undefined || value === "") return value;
  const raw = openString(value, opts);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("sealed payload is not valid JSON");
  }
}

/* Constant-time comparison helper. */
export function safeEquals(a, b) {
  const ba = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export default {
  ENVELOPE_PREFIX,
  isSealed,
  sealString,
  openString,
  sealJson,
  openJson,
  safeEquals,
};

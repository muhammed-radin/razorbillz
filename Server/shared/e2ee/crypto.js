/* ============================================================================
 * RazorBillz E2EE Client SDK (isomorphic: browser + Node >= 20)
 *
 * TRUE end-to-end encryption, Tier B. The SERVER NEVER SEES:
 *   - the raw password → wrapping-key derivation happens here,
 *   - the data encryption key (DEK) — it is wrapped client-side,
 *   - any vault plaintext — encryption/decryption happens here.
 *
 * What the server stores (opaque to itself):
 *   keybag: { salt, kdf params, wrappedDek }            → e2ee_keybags
 *   vault:  { ct (AES-GCM ciphertext), idx (HMAC blind-index tokens) }
 *                                                        → e2ee_vault
 *
 * Searchable design: the client locally computes blind indexes
 *   token = trunc( HMAC(indexKey, normalize(value)) )
 * where indexKey is an HMAC key derived from the user's DEK. The server
 * can match equality (find docs whose idx.field === token) but cannot
 * invert tokens or decrypt payloads. Same construction as the
 * server-side (Tier A) blind indexes — just keyed client-side.
 *
 * Key hierarchy:
 *   password --PBKDF2-SHA256(600k, salt)--> WUK (wrap key, 32B)
 *   DEK (random 32B, per user) --AES-256-GCM(WUK)--> wrappedDek (stored)
 *   DEK --PBKDF2-derived subkeys--> { payloadKey, indexKey:<purpose> }
 *
 * Uses ONLY WebCrypto (`crypto.subtle` — browsers on HTTPS/localhost,
 * Node >= 20). Zero dependencies.
 * ============================================================================
 */

const PBKDF2_ITERATIONS = 600_000; // OWASP guidance for PBKDF2-SHA256
const KEY_LENGTH_BYTES = 32;
const ALGO_VERSION = "v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle() {
  if (typeof crypto === "undefined" || !crypto?.subtle) {
    throw new Error(
      "WebCrypto unavailable: use HTTPS (or localhost) in browsers, Node >= 20 otherwise",
    );
  }
  return crypto.subtle;
}

function toB64url(bytes) {
  return btoa8(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlToBytes(str) {
  const b64 =
    str.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (str.length % 4)) % 4);
  return fromB64(b64);
}

function fromB64(b64) {
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function btoa8(bytes) {
  if (typeof btoa === "function") {
    let bin = "";
    for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  return Buffer.from(bytes).toString("base64");
}

/* ------------------------- KDF (client-only) ------------------------- */

/* Salt for a fresh keybag (16 random bytes, base64url). */
export function generateSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return toB64url(salt);
}

/* Default KDF params stored (opaquely) in the server keybag. */
export function defaultKdfParams() {
  return {
    algorithm: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    length: KEY_LENGTH_BYTES,
  };
}

/* Derive the password-based wrapping key (WUK). */
export async function deriveWrappingKey(password, saltB64url, params) {
  const p = { ...defaultKdfParams(), ...(params ?? {}) };
  if (p.algorithm !== "PBKDF2-SHA256") {
    throw new Error(`Unsupported KDF algorithm: ${p.algorithm}`);
  }
  if (p.iterations < 100_000) {
    throw new Error("KDF too weak (server refuses <100k PBKDF2 iterations)");
  }
  const base = await subtle().importKey(
    "raw",
    enc.encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return subtle().deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: b64urlToBytes(saltB64url),
      iterations: p.iterations,
    },
    base,
    p.length * 8,
  );
}

/* ------------------------- DEK lifecycle ------------------------- */

/* Fresh random DEK (32 bytes). Lives ONLY in client memory. */
export function generateDek() {
  const dek = new Uint8Array(KEY_LENGTH_BYTES);
  crypto.getRandomValues(dek);
  return dek;
}

/* Wrap the DEK with the WUK (AES-256-GCM). Stored server-side as an
 * opaque string: "zed.<iv b64u>.<tag+ct b64u>". */
export async function wrapDek(dek, wrappingKeyBits) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const wuk = await subtle().importKey(
    "raw",
    wrappingKeyBits,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  const sealed = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, wuk, dek),
  ); // WebCrypto output is ct||tag concatenated
  return `zed.${toB64url(iv)}.${toB64url(sealed)}`;
}

/* Unwrap the stored DEK with the WUK re-derived from the password.
 * Returns RAW DEK BYTES (keep in memory for the session only). */
export async function unwrapDek(wrappedDekB64, wrappingKeyBits) {
  if (!wrappedDekB64?.startsWith("zed.")) {
    throw new Error("wrappedDek is not a client envelope (wrong format/keys?)");
  }
  const [, ivB64, sealedB64] = wrappedDekB64.split(".");
  const wuk = await subtle().importKey(
    "raw",
    wrappingKeyBits,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  try {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: b64urlToBytes(ivB64) },
      wuk,
      b64urlToBytes(sealedB64),
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error("Wrong password (WUK) — DEK unwrap failed");
  }
}

/* --------------------- Subkey + payload encryption --------------------- */

/* DEK-derived subkeys (domain-separated). */
async function deriveSubkey(dek, purpose) {
  const base = await subtle().importKey("raw", dek, "PBKDF2", false, [
    "deriveBits",
  ]);
  return subtle().deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(`razorbills-e2ee:${purpose}`),
      iterations: 1,
    },
    base,
    KEY_LENGTH_BYTES * 8,
  );
}

/* Encrypt a UTF-8 string: "zee.<iv b64u>.<tag+ct b64u>" */
export async function e2eeEncrypt(dek, plaintext) {
  const payloadBits = await deriveSubkey(dek, "payload");
  const key = await subtle().importKey("raw", payloadBits, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const sealed = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(`e2ee:${ALGO_VERSION}`) },
      key,
      enc.encode(String(plaintext)),
    ),
  );
  return `zee.${toB64url(iv)}.${toB64url(sealed)}`;
}

export async function e2eeDecrypt(dek, ciphertext) {
  if (!ciphertext?.startsWith("zee.")) {
    throw new Error("ciphertext is not an E2EE envelope");
  }
  const [, ivB64, sealedB64] = ciphertext.split(".");
  const payloadBits = await deriveSubkey(dek, "payload");
  const key = await subtle().importKey("raw", payloadBits, "AES-GCM", false, [
    "decrypt",
  ]);
  const plain = await subtle().decrypt(
    {
      name: "AES-GCM",
      iv: b64urlToBytes(ivB64),
      additionalData: enc.encode(`e2ee:${ALGO_VERSION}`),
    },
    key,
    b64urlToBytes(sealedB64),
  );
  return dec.decode(plain);
}

/* ------------------------- Blind indexes ------------------------- */

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0d00-\u0d7f]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

const NORMALIZERS = { text: normalizeText, phone: normalizePhone };

/* Hex blind-index token for a value (client-side DEK-derived HMAC). */
export async function e2eeBlindIndex(dek, value, purpose = "text", bits = 64) {
  const norm = (NORMALIZERS[purpose] ?? normalizeText)(value);
  if (!norm) return null;
  const indexBits = await deriveSubkey(dek, `index:${purpose}`);
  const hmacKey = await subtle().importKey(
    "raw",
    indexBits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await subtle().sign("HMAC", hmacKey, enc.encode(`${purpose}:${norm}`)),
  );
  return Array.from(mac.slice(0, Math.ceil(bits / 8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* All tokens for an address-ish object:
 * { name, email, phoneNumber, postalCode, city } →
 * { name, email, phoneNumber, postalCode, city } token map. */
export async function addressSearchTokens(dek, address) {
  const spec = {
    name: ["name", "text"],
    email: ["email", "text"],
    phoneNumber: ["phoneNumber", "phone"],
    postalCode: ["postalCode", "text"],
    city: ["city", "text"],
  };
  const out = {};
  for (const [field, [purpose, norm]] of Object.entries(spec)) {
    const v = address?.[field];
    if (!v) continue;
    const token = await e2eeBlindIndex(dek, v, norm);
    if (token) out[purpose] = token;
  }
  return out;
}

/* ------------------- High-level address helpers ------------------- */

/* Seal an address object into an E2EE vault payload.
 * Returns { ct, idx } ready for PUT /api/e2ee/vault (kind: "address"). */
export async function encryptAddressE2EE(dek, address) {
  const payload = {
    algo: ALGO_VERSION,
    address: Object.fromEntries(
      Object.entries(address ?? {}).map(([k, v]) => [k, String(v ?? "")]),
    ),
  };
  return {
    ct: await e2eeEncrypt(dek, JSON.stringify(payload)),
    idx: await addressSearchTokens(dek, address),
  };
}

/* Open a vault doc (GET /api/e2ee/vault/:id or search result) back
 * into the original address object. */
export async function decryptAddressE2EE(dek, doc) {
  const raw = await e2eeDecrypt(dek, doc.ct);
  const payload = JSON.parse(raw);
  if (payload?.algo !== ALGO_VERSION) {
    throw new Error(`Unknown E2EE payload version: ${payload?.algo}`);
  }
  return payload.address;
}

export default {
  generateSalt,
  defaultKdfParams,
  deriveWrappingKey,
  generateDek,
  wrapDek,
  unwrapDek,
  e2eeEncrypt,
  e2eeDecrypt,
  e2eeBlindIndex,
  addressSearchTokens,
  encryptAddressE2EE,
  decryptAddressE2EE,
};

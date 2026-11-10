import { db } from "../db.js";

/* =========================================================
 * Tier B — TRUE end-to-end encryption scaffolding (server side).
 *
 * The server NEVER derives, holds, or can unwrap the user's data
 * key. The flow (see shared/e2ee/crypto.js for the client SDK):
 *
 *   password --(client, PBKDF2-SHA256 600k)--> WUK
 *   client generates random DEK (32B)
 *   client wraps DEK with WUK (AES-GCM)  -> wrappedDek
 *   server stores ONLY { salt, params, wrappedDek }  <-- opaque blob
 *
 * - Unlock: client GETs the keybag, derives WUK locally from the
 *   password, unwraps the DEK locally, decrypts/encrypts locally.
 * - Search: client computes its OWN blind indexes with the unwrapped
 *   DEK (different construction: HMAC(DEK-derived key, norm(value)))
 *   and stores them in the vault doc; the server can thus serve
 *   exact-match search on E2EE data it cannot read.
 * - Password reset destroys the keybag (by design): the WUK changes
 *   and cannot re-wrap the old DEK without the old password. The
 *   client surfaces this to the user; admins cannot recover user
 *   E2EE data either — that is the point.
 * ========================================================= */

export const KEYBAG_COLLECTION = "e2ee_keybags";
export const VAULT_COLLECTION = "e2ee_vault";

const MAX_CLOUD_BLOB_BYTES = 48 * 1024; // wrapped DEK is ~60–100 bytes
const MAX_CT_BYTES = 256 * 1024; // per-vault-doc ciphertext cap
const MAX_IDX_FIELDS = 16;
const MAX_TOKEN_CHARS = 128;
const MAX_KIND = 48;

/* ------------------------- keybag ------------------------- */

/* Validate + store (upsert) the user's keybag. Accepts the client's
 * opaque fields; the server performs shape/size checks only. */
export async function storeKeybag({
  userId,
  salt,
  params,
  wrappedDek,
} = {}) {
  if (!userId) throw new Error("userId is required");
  if (
    typeof salt !== "string" ||
    salt.length < 16 ||
    salt.length > 256 ||
    !/^[A-Za-z0-9+/=_-]+$/.test(salt)
  ) {
    throw new Error("salt missing or malformed");
  }
  if (typeof wrappedDek !== "string" || wrappedDek.length < 16) {
    throw new Error("wrappedDek missing or malformed");
  }
  if (Buffer.byteLength(wrappedDek, "utf8") > MAX_CLOUD_BLOB_BYTES) {
    throw new Error("wrappedDek too large");
  }

  const algorithm = String(params?.algorithm ?? "PBKDF2-SHA256");
  const iterations = Number(params?.iterations ?? 0);
  if (Number.isInteger(iterations) === false || iterations < 1) {
    throw new Error("params.iterations must be a positive integer");
  }
  /* Refuse absurdly weak KDF settings (client defaults far exceed). */
  if (algorithm === "PBKDF2-SHA256" && iterations < 100_000) {
    throw new Error("KDF too weak: <100000 PBKDF2 iterations");
  }

  const doc = {
    userId,
    salt,
    params: { algorithm, iterations, length: Number(params?.length) || 32 },
    wrappedDek,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection(KEYBAG_COLLECTION).updateOne(
    { userId },
    { $set: doc, $setOnInsert: { createdAt: doc.createdAt } },
    { upsert: true },
  );
  return doc;
}

export async function getKeybag(userId) {
  if (!userId) return null;
  return db.collection(KEYBAG_COLLECTION).findOne({ userId });
}

/* Delete the keybag — irreversible; used on password reset flows
 * where the client cannot prove it can still unwrap the DEK. */
export async function destroyKeybag(userId) {
  const res = await db.collection(KEYBAG_COLLECTION).deleteOne({ userId });
  return res.deletedCount > 0;
}

/* --------------------------- vault --------------------------- */

function sanitizeIdx(idx) {
  if (idx === undefined || idx === null) return {};
  if (typeof idx !== "object" || Array.isArray(idx)) {
    throw new Error("idx must be an object of hex tokens");
  }
  const out = {};
  for (const [field, token] of Object.entries(idx)) {
    if (Object.keys(out).length >= MAX_IDX_FIELDS) {
      throw new Error(`idx supports at most ${MAX_IDX_FIELDS} fields`);
    }
    const name = String(field).slice(0, MAX_KIND);
    if (!/^[a-zA-Z]{1,32}$/.test(name)) {
      throw new Error(`idx field "${name}" malformed`);
    }
    if (!/^[0-9a-f]{4,64}$/.test(String(token))) {
      throw new Error(`idx token for "${name}" malformed`);
    }
    out[name] = String(token);
  }
  return out;
}

/* Store (or replace by id) a client-encrypted vault document. */
export async function putVaultDoc({
  id,
  userId,
  kind,
  ct,
  idx,
} = {}) {
  if (!userId) throw new Error("userId is required");
  const kindName = String(kind ?? "doc").slice(0, MAX_KIND);
  if (!/^[a-zA-Z0-9._-]{1,48}$/.test(kindName)) {
    throw new Error("kind malformed");
  }
  if (typeof ct !== "string" || ct.length < 8) {
    throw new Error("ct (client ciphertext) missing");
  }
  if (Buffer.byteLength(ct, "utf8") > MAX_CT_BYTES) {
    throw new Error("ct exceeds 256KB");
  }
  const cleanIdx = sanitizeIdx(idx);
  const docId = typeof id === "string" && id ? id.slice(0, 64) : null;

  const doc = {
    userId,
    kind: kindName,
    ct,
    idx: cleanIdx,
    updatedAt: new Date(),
  };

  if (docId) {
    const filter = docId
      ? { id: docId, userId }
      : { userId };
    const existing = await db
      .collection(VAULT_COLLECTION)
      .findOne(filter, { projection: { _id: 1 } });
    if (existing) {
      await db
        .collection(VAULT_COLLECTION)
        .updateOne({ _id: existing._id }, { $set: doc });
      return { ...doc, id: docId, updated: true };
    }
    doc.id = docId;
  } else {
    doc.id = `vlt-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  await db.collection(VAULT_COLLECTION).insertOne(doc);
  return { ...doc, created: true };
}

export async function listVaultDocs(
  userId,
  { kind = null, limit = 50, skip = 0 } = {},
) {
  const query = { userId };
  if (kind) query.kind = String(kind).slice(0, MAX_KIND);
  const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const cappedSkip = Math.max(Number(skip) || 0, 0);
  const [docs, total] = await Promise.all([
    db
      .collection(VAULT_COLLECTION)
      .find(query, { projection: { ct: 1, kind: 1, idx: 1, id: 1, updatedAt: 1, createdAt: 1 } })
      .sort({ updatedAt: -1 })
      .skip(cappedSkip)
      .limit(cappedLimit)
      .toArray(),
    db.collection(VAULT_COLLECTION).countDocuments(query),
  ]);
  return { docs, total };
}

export async function getVaultDoc(userId, id) {
  if (!userId || !id) return null;
  return db.collection(VAULT_COLLECTION).findOne({ userId, id: String(id).slice(0, 64) });
}

export async function deleteVaultDoc(userId, id) {
  if (!userId || !id) return false;
  const res = await db
    .collection(VAULT_COLLECTION)
    .deleteOne({ userId, id: String(id).slice(0, 64) });
  return res.deletedCount > 0;
}

/* Exact-match search over CLIENT-generated blind indexes. The server
 * never sees the underlying values — only tokens it cannot reverse.
 * Body: { kind?, query: { fieldName: [token,…], … } } */
export async function searchVaultDocs(userId, { kind, query } = {}) {
  if (!query || typeof query !== "object") {
    throw new Error("query object required");
  }
  const filter = { userId };
  if (kind) filter.kind = String(kind).slice(0, MAX_KIND);
  for (const [field, tokens] of Object.entries(query)) {
    const name = `idx.${String(field).slice(0, MAX_KIND)}`;
    const list = (Array.isArray(tokens) ? tokens : [tokens])
      .slice(0, 8)
      .map((t) => String(t))
      .filter((t) => /^[0-9a-f]{4,64}$/.test(t));
    if (list.length === 0) {
      throw new Error(`no valid tokens for field "${field}"`);
    }
    filter[name] = { $in: list };
  }
  return db
    .collection(VAULT_COLLECTION)
    .find(filter, { projection: { ct: 1, kind: 1, idx: 1, id: 1, updatedAt: 1 } })
    .limit(50)
    .toArray();
}

export default {
  KEYBAG_COLLECTION,
  VAULT_COLLECTION,
  storeKeybag,
  getKeybag,
  destroyKeybag,
  putVaultDoc,
  listVaultDocs,
  getVaultDoc,
  deleteVaultDoc,
  searchVaultDocs,
};

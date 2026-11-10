/* ============================================================================
 * One-shot encryption migration for RazorBillz.
 *
 *   DRY RUN:   node scripts/migrate-encryption.js --dry
 *   APPLY:     node scripts/migrate-encryption.js
 *   REINDEX:   node scripts/migrate-encryption.js --reindex  (loads every
 *              row that already decrypts, rebuilds blind indexes with the
 *              ACTIVE master key — run after `npm run keys:rotate`)
 *
 * What it does (Tier A):
 *   users            name/image/profilePicture/phoneNumber + addressBook[]/
 *                    address{} re-sealed to envelope AES-GCM; legacy CryptoJS
 *                    values (U2FsdGVkX1…) are opened with env CRYPTED[_STRICT]
 *                    first. Advanced index families backfilled:
 *                    <field>_idx + <field>_prefix + <field>_grams, and the
 *                    email is VAULTED (sealed + tokens).
 *   users_validation Better Auth rows: email sealed + tokens (vault shape
 *                    matching the emailVault adapter's writes).
 *   verification     Better Auth rows: identifier sealed + tokens.
 *   comments         userName/userEmail/userAvatar sealed.
 *   orders           shippingAddress/billingAddress snapshots sealed; legacy
 *                    plaintext opened transparently.
 *   support_tickets  subject/messages[].body/resolutionNote/audit[].note
 *                    sealed; subject_idx/subject_prefix/subject_grams
 *                    (re)built with the active key.
 *
 * Idempotent: values already in envelope format are only RE-INDEXED (when
 * --reindex) not re-sealed. Safe to run repeatedly.
 * ============================================================================
 */

import {
  connectToDatabase,
  mongoose,
} from "../utils/db.js";
import {
  decrypt,
  encryptAddress,
  encryptField,
  isSealed,
  sealAddressObject,
  blindIndex,
  gramTokens,
  prefixTokens,
  advancedPIIIdx,
} from "../utils/crypto/index.js";
import { keysStatus } from "../utils/crypto/keys.js";
import { sealEmailEntry } from "../utils/crypto/emailVault.js";

const argv = new Set(process.argv.slice(2));
const DRY = argv.has("--dry");
const REINDEX = argv.has("--reindex");

let stats = { scanned: 0, rewritten: 0, failed: 0 };
const failures = [];

function note(collection, id, err) {
  stats.failed += 1;
  failures.push(`${collection}:${id}: ${err?.message ?? err}`);
}

async function apply(collectionName, docs, buildUpdate) {
  for (const doc of docs) {
    stats.scanned += 1;
    try {
      const update = buildUpdate(doc);
      if (!update) continue;
      stats.rewritten += 1;
      if (DRY) continue;
      await mongoose.connection
        .collection(collectionName)
        .updateOne({ _id: doc._id }, { $set: update });
    } catch (err) {
      note(collectionName, doc.id ?? doc._id, err);
    }
  }
}

/* Field-by-field users row: re-seal legacy + backfill idx (incl.
 * email vaulting + prefix/gram token families). */
function migrateUserFields(userDoc) {
  const set = {};
  const target = { ...userDoc };

  for (const field of ["name", "image", "profilePicture", "phoneNumber"]) {
    const value = userDoc[field];
    if (typeof value !== "string" || value === "") continue;
    if (!isSealed(value)) {
      const plain = decrypt(value);
      if (typeof plain === "string" && plain) {
        set[field] = encryptField(plain, { context: `user:${field}` });
        target[field] = plain;
      } else {
        target[field] = value; // legacy ciphertext that did NOT decrypt — skip
      }
    } else {
      target[field] = value;
    }
  }

  /* EMAIL — vault: sealed value + eq/prefix/grams tokens. */
  const email = target.email;
  if (typeof email === "string" && email) {
    if (!isSealed(email) && email.includes("@")) {
      Object.assign(set, sealEmailEntry("email", email));
    } else if (REINDEX && isSealed(email)) {
      // Rotation/reindex: rebuild tokens from the decryption of the
      // existing self-contained envelope (fresh seal too, active key).
      const plain = decrypt(email);
      if (typeof plain === "string" && plain.includes("@")) {
        Object.assign(set, sealEmailEntry("email", plain));
      }
    }
  }

  /* NAME / PHONE — advanced token families (eq/prefix/grams). */
  for (const [plainKey, plainPurpose] of [
    ["name", "name"],
    ["phoneNumber", "phone"],
  ]) {
    const raw = target[plainKey];
    const plain =
      typeof raw === "string" && raw
        ? isSealed(raw)
          ? decrypt(raw)
          : raw
        : null;
    if (typeof plain === "string" && plain) {
      Object.assign(set, advancedPIIIdx(
        { [plainKey]: plain },
        { [plainKey]: plainPurpose },
      ));
    }
  }
  return Object.keys(set).length ? set : null;
}

/* Better Auth rows (users_validation / verification): seal email /
 * identifier + tokens so the auth collection matches the adapter's
 * write shape for pre-existing rows. */
function migrateAuthRow(row, fieldName) {
  const value = row[fieldName];
  if (typeof value !== "string" || value === "" || isSealed(value)) return null;
  const opened = decrypt(value);
  if (!opened || typeof opened !== "string") return null;
  return sealEmailEntry(fieldName, opened);
}

function migrateAddressBook(userDoc) {
  const set = {};
  let touched = false;
  const sealBook = (book) =>
    (book ?? []).map((address) => {
      if (!address) return address;
      const hasLegacy = Object.values(address).some(
        (v) => typeof v === "string" && !isSealed(v),
      );
      if (!hasLegacy && address._idx) return null; // already current
      return encryptAddress(address);
    });
  const book = sealBook(userDoc.addressBook).filter(Boolean);

  if (
    Array.isArray(userDoc.addressBook) &&
    JSON.stringify(book.length) !==
      JSON.stringify(userDoc.addressBook.length + 0)
  ) {
    touched = book.some((a, i) => a && a !== userDoc.addressBook[i]);
  }
  if (touched || REINDEX) {
    set.addressBook = book.length ? book : userDoc.addressBook;
  }
  if (userDoc.address && userDoc.address.name) {
    set.address = encryptAddress(userDoc.address);
  }
  return Object.keys(set).length ? set : null;
}

async function run() {
  const status = keysStatus();
  console.log("[migrate] key state:", JSON.stringify(status));
  if (!status.ok) {
    console.error("[migrate] NO master keys configured — aborting.");
    console.error(
      "[migrate] Generate first: npm run keys:generate (or set ENCRYPTION_KEYS_JSON).",
    );
    process.exit(1);
  }

  await connectToDatabase();
  const database = mongoose.connection.db;
  console.log(
    `[migrate] mode: ${DRY ? "DRY RUN" : "APPLY"}${REINDEX ? " + reindex" : ""}`,
  );

  /* ---------------- users (app mirror) ---------------- */
  {
    const users = await database
      .collection("users")
      .find({})
      .limit(5000)
      .toArray();
    await apply("users", users, (u) => {
      const fieldUpdate = migrateUserFields(u);
      const addressUpdate = migrateAddressBook(u);
      const set = { ...(fieldUpdate ?? {}), ...(addressUpdate ?? {}) };
      return Object.keys(set).length ? set : null;
    });
  }

  /* ------------- users_validation (Better Auth) ------------- */
  {
    const rows = await database
      .collection("users_validation")
      .find({})
      .limit(5000)
      .toArray();
    await apply("users_validation", rows, (row) => migrateAuthRow(row, "email"));
  }

  /* ------------- verification (Better Auth) ------------- */
  {
    const rows = await database
      .collection("verification")
      .find({})
      .limit(5000)
      .toArray();
    await apply("verification", rows, (row) => migrateAuthRow(row, "identifier"));
  }

  /* ---------------- comments ---------------- */
  {
    const rows = await database
      .collection("comments")
      .find({})
      .limit(5000)
      .toArray();
    await apply("comments", rows, (c) => {
      const set = {};
      const pairs = [
        ["userName", "comment:userName"],
        ["userEmail", "comment:userEmail"],
        ["userAvatar", "comment:userAvatar"],
      ];
      for (const [field, context] of pairs) {
        const value = c[field];
        if (typeof value === "string" && value && !isSealed(value)) {
          const plain = decrypt(value);
          if (typeof plain === "string" && plain) {
            set[field] = encryptField(plain, { context });
          }
        }
      }
      return Object.keys(set).length ? set : null;
    });
  }

  /* ---------------- orders ---------------- */
  {
    const orders = await database
      .collection("orders")
      .find({})
      .limit(5000)
      .toArray();
    await apply("orders", orders, (o) => {
      const set = {};
      for (const parent of ["shippingAddress", "billingAddress"]) {
        const addr = o[parent];
        if (!addr || typeof addr !== "object") continue;
        const needs = Object.values(addr).some(
          (v) => typeof v === "string" && v && !isSealed(v),
        );
        if (needs) {
          const opened = {};
          for (const [k, v] of Object.entries(addr)) {
            opened[k] =
              typeof v === "string" && !isSealed(v) && v
                ? decrypt(v)
                : v;
          }
          set[parent] = sealAddressObject(opened);
        }
      }
      return Object.keys(set).length ? set : null;
    });
  }

  /* ---------------- support tickets ---------------- */
  {
    const tickets = await database
      .collection("support_tickets")
      .find({})
      .limit(5000)
      .toArray();
    await apply("support_tickets", tickets, (t) => {
      const set = {};
      if (t.subject && !isSealed(t.subject)) {
        set.subject = encryptField(t.subject, { context: "support:subject" });
        set.subject_idx = blindIndex(t.subject, "subject");
        set.subject_prefix = prefixTokens(t.subject, "subject");
        set.subject_grams = gramTokens(t.subject, "subject");
      } else if (REINDEX && isSealed(t.subject)) {
        // Reindex after key rotation: rebuild token families from the
        // decryption of the existing envelope (ciphertext kept).
        const plain = decrypt(t.subject);
        if (typeof plain === "string" && plain) {
          set.subject_idx = blindIndex(plain, "subject");
          set.subject_prefix = prefixTokens(plain, "subject");
          set.subject_grams = gramTokens(plain, "subject");
        }
      }
      if (t.resolutionNote && !isSealed(t.resolutionNote)) {
        set.resolutionNote = encryptField(t.resolutionNote, {
          context: "support:note",
        });
      }
      if (Array.isArray(t.messages)) {
        const messages = t.messages.map((m) =>
          m?.body && !isSealed(m.body)
            ? {
                ...m,
                body: encryptField(m.body, { context: "support:body" }),
              }
            : m,
        );
        if (JSON.stringify(messages) !== JSON.stringify(t.messages)) {
          set.messages = messages;
        }
      }
      if (Array.isArray(t.audit)) {
        const audit = t.audit.map((a) =>
          a?.note && !isSealed(a.note)
            ? {
                ...a,
                note: encryptField(a.note, { context: "support:audit" }),
              }
            : a,
        );
        if (JSON.stringify(audit) !== JSON.stringify(t.audit)) set.audit = audit;
      }
      return Object.keys(set).length ? set : null;
    });
  }

  console.log(
    `[migrate] done: scanned=${stats.scanned} rewritten=${stats.rewritten} ` +
      `failed=${stats.failed}${DRY ? " (DRY RUN — nothing written)" : ""}`,
  );
  if (failures.length) {
    console.log("[migrate] failures:");
    for (const f of failures.slice(0, 20)) console.log("  -", f);
    process.exitCode = 1;
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exitCode = 1;
});

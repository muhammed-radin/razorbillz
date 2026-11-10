import { isSealed as isAlreadySealed } from "./aead.js";
import { decryptField, encryptField, advancedPIIIdx, blindIndex } from "./index.js";

/* =========================================================
 * EMAIL VAULTING — Better Auth adapter wrapper.
 *
 * Goal: emails (and verification identifiers) are NEVER stored
 * plaintext — not even inside Better Auth's own collections
 * (`users_validation`, `verification`). Better Auth itself keeps
 * working because this wrapper:
 *
 * 1. WRITES: seals `email` (user model) / `identifier`
 *    (verification model) on create/update data, adding companion
 *    index fields:
 *      email        → sealed envelope value
 *      email_idx    → deterministic eq token   (counterparts of eq)
 *      email_prefix → anchored prefix tokens     (prefix search)
 *      email_grams  → trigram tokens             (substring search)
 *
 * 2. READS/FILTERS: transparently rewrites `where` clauses that
 *    match on `email`/`identifier` (operator "eq") into eq matches
 *    against `*_idx`. Sign-in lookup, email-verification resolution
 *    and password-reset flow land on the token instead of the
 *    plaintext — the plaintext itself is unguessable to the DB.
 *
 * 3. Everything else (queries touching other models, filters with
 *    other operators/fields) passes through untouched. If sealing
 *    is impossible (no master key), data is passed through and a
 *    warning is logged — auth must stay available.
 *
 * Plaintext email STILL APPEARS transitorily:
 *   - in session/context objects AFTER the row is written (Better
 *     Auth carries them in memory); responses that surface them
 *     post-decrypt in utils/auth.js hooks.after.
 *   - cards that NEED the address (verification links, reset
 *     mails) decrypt at their send callbacks.
 * Lower the risk surface: DB, logs, backups, dashboards now hold
 * ciphertext + unlinkable tokens only.
 * ========================================================= */

const SEALED_MODELS = ["user", "verification"];
const EMAIL_FIELD = "email"; // user model
const IDENTIFIER_FIELD = "identifier"; // verification model

function fieldForModel(model) {
  if (model === "user") return EMAIL_FIELD;
  if (model === "verification") return IDENTIFIER_FIELD;
  return null;
}

/* Seal one plaintext email into { <field>, <field>_idx,
 * <field>_prefix, <field>_grams } — throws when keys are missing
 * (fail closed) unless opts.tolerant. */
export function sealEmailEntry(field, plaintextEmail) {
  const sealed = encryptField(plaintextEmail, { context: `email:${field}` });
  const tokens = advancedPIIIdx(
    { [field]: String(plaintextEmail).trim().toLowerCase() },
    { [field]: "email" },
  );
  return {
    [field]: sealed,
    ...tokens,
  };
}

/* Canonical email normalization for token usage — Better Auth
 * compares case-folded emails; trim + lowercase. */
export function normalizeEmailForAuth(email) {
  return String(email ?? "").trim().toLowerCase();
}

/* Build $$eq token for an email query. */
export function emailEqToken(field, email) {
  return blindIndex(normalizeEmailForAuth(email), "email");
}

/* ---------------------------------------------------------------------------
 * Where-clause translation (eq(email/identifier) → eq(<field>_idx))
 * ------------------------------------------------------------------------- */

function translateWhere(model, where) {
  const field = fieldForModel(model);
  if (!field || !Array.isArray(where)) return where;
  let changed = false;
  const out = where.map((clause) => {
    if (
      clause &&
      typeof clause === "object" &&
      clause.field === field &&
      (!clause.operator || clause.operator === "eq") &&
      typeof clause.value === "string"
    ) {
      changed = true;
      return { ...clause, field: `${field}_idx`, value: emailEqToken(field, clause.value) };
    }
    return clause;
  });
  return changed ? out : where;
}

/* ---------------------------------------------------------------------------
 * Data sealing for create/update payloads
 * ------------------------------------------------------------------------- */

function sealDataValue(model, data) {
  const field = fieldForModel(model);
  if (!field || !data || typeof data !== "object") return data;
  const value = data[field];
  if (typeof value !== "string" || value === "" || isAlreadySealed(value)) {
    return data;
  }
  try {
    return { ...data, ...sealEmailEntry(field, value) };
  } catch (err) {
    console.warn(
      `[emailVault] could not seal ${model}.${field} (missing keys?) — stored as provided:`,
      err?.message,
    );
    return data;
  }
}

/* Recursively pull top-level update operators and seal the model's
 * email/identifier field wherever it appears ($set, $setOnInsert, raw). */
function sealUpdateData(model, update) {
  const field = fieldForModel(model);
  if (!field || !update || typeof update !== "object") return update;
  let out = update;
  for (const key of ["$set", "$setOnInsert"]) {
    if (update?.[key] && typeof update[key] === "object") {
      const sealed = sealDataValue(model, update[key]);
      if (sealed !== update[key]) {
        if (out === update) out = { ...update };
        out[key] = sealed;
      }
    }
  }
  if (
    typeof update?.[field] === "string" &&
    !isAlreadySealed(update[field])
  ) {
    try {
      if (out === update) out = { ...update };
      Object.assign(out, sealEmailEntry(field, update[field]));
    } catch (err) {
      console.warn(`[emailVault] could not seal update on ${model}:`, err?.message);
    }
  }
  return out;
}

/* Avoid double-sealing rows already vaulted (idempotent writes). */

/* ---------------------------------------------------------------------------
 * Model method wrappers (create / update / findOne / delete)
 * ------------------------------------------------------------------------- */

const WRAPPED_METHODS = [
  "create",
  "update",
  "updateMany",
  "findOne",
  "findAll",
  "find",
  "delete",
  "deleteMany",
];

export function emailVaultAdapter(primary) {
  if (!primary) return primary;
  return new Proxy(primary, {
    get(target, prop, receiver) {
      /* Defensive: some BA versions call a dedicated findByEmail.
       * Re-express it as a translated findOne on the tooltip token. */
      if (
        prop === "findByEmail" &&
        typeof target.findOne === "function" &&
        !(prop in target && target[prop] === undefined)
      ) {
        return async ({ model, email, ...rest } = {}) => {
          const translated = await wrapMethod("findOne", target.findOne.bind(target))({
            model,
            where: [{ field: fieldForModel(model) ?? "email", operator: "eq", value: email }],
            ...rest,
          });
          return translated;
        };
      }
      if (WRAPPED_METHODS.includes(prop) && typeof target[prop] === "function") {
        return wrapMethod(prop, target[prop].bind(target));
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function wrapMethod(method, bound) {
  return async function (...args) {
    const passthrough = () => bound(...args);
    try {
      const model = args?.[0]?.model;
      // Only models carrying an email-shaped field.
      if (!model || !SEALED_MODELS.includes(model)) return passthrough();

      if (method === "create") {
        const sealed = sealDataValue(model, args[0].data);
        if (sealed !== args[0].data) args[0] = { ...args[0], data: sealed };
        return passthrough();
      }
      if (method === "update") {
        if (Array.isArray(args[0]?.where)) {
          args[0] = {
            ...args[0],
            where: translateWhere(model, args[0].where),
          };
        }
        const sealed = sealUpdateData(model, args[0].update);
        if (sealed !== args[0].update) args[0] = { ...args[0], update: sealed };
        return passthrough();
      }
      if (
        method === "findOne" ||
        method === "delete" ||
        method === "deleteMany"
      ) {
        if (Array.isArray(args[0]?.where)) {
          args[0] = { ...args[0], where: translateWhere(model, args[0].where) };
        }
        return passthrough();
      }
      if (method === "updateMany") {
        if (Array.isArray(args[0]?.where)) {
          args[0] = { ...args[0], where: translateWhere(model, args[0].where) };
        }
        const sealed = sealUpdateData(model, args[0]?.update);
        if (sealed !== args[0]?.update) args[0] = { ...args[0], update: sealed };
        return passthrough();
      }
      // method === "find" (session user listing etc.) — arrays of rows:
      // nothing to translate at write-side; filters are inside args[0].
      return passthrough();
    } catch (err) {
      console.warn(`[emailVault] ${method} passthrough due to error:`, err?.message);
      return passthrough();
    }
  };
}

/* ---------------------------------------------------------------------------
 * Mirror-sync helper for the app `users` collection
 * ------------------------------------------------------------------------- */

/* Build $set fields for the mirror `users` row from a (possibly
 * sealed) Better Auth user object. BA rows arrive with vaulted
 * (sealed) email/name — decrypt, then re-seal FRESH into the
 * mirror's own envelope with its own index tokens. If decryption
 * fails (no keys), the value is shape-checked and the field is
 * skipped — ciphertext is never hashed into an index.
 * Used by databaseHooks + sync helper + routes. */
export function buildMirrorUserFields(userLike) {
  const set = {};

  for (const [field, purpose, context] of [
    ["email", "email", "email:email"],
    ["name", "name", "user:name"],
    ["phoneNumber", "phone", "user:phoneNumber"],
  ]) {
    const raw = userLike[field] ?? userLike[purpose];
    if (typeof raw !== "string" || raw === "") continue;
    const opened = decryptField(raw); // sealed → opens; plain → passthrough
    if (typeof opened !== "string" || opened === "") continue;
    if (field === "email" && !opened.trim().toLowerCase().includes("@")) continue;
    set[field] = encryptField(opened, { context });
    Object.assign(
      set,
      advancedPIIIdx({ [field]: opened }, { [field]: purpose }),
    );
  }

  /* IMAGE — sealed only. */
  const imageRaw = userLike.image ?? userLike.profilePicture;
  const imagePlain = decryptField(imageRaw);
  if (typeof imagePlain === "string" && imagePlain) {
    set.image = encryptField(imagePlain, { context: "user:image" });
    set.profilePicture = set.image;
  }

  return set;
}

export default {
  emailVaultAdapter,
  sealEmailEntry,
  emailEqToken,
  normalizeEmailForAuth,
  buildMirrorUserFields,
};

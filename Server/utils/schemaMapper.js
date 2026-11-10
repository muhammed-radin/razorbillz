// server/utils/schemaMapper.js
import { UserSchema } from "../models/schema/user.js";

const NATIVE_FIELDS = new Set([
  "_id",
  "id",
  "__v",
  "name",
  "email",
  "emailVerified",
  "image",
  "profilePicture",
  "role",
  "createdAt",
  "updatedAt",
  "banned",
  "banExpires",
  "banReason",
]);

const SECRET_FIELDS = new Set([
  "password",
  "resetToken",
  "verifyToken",
  "providerId",
]);

export const SERVER_OWNED_FIELDS = new Set([
  "isActive",
  "lastLogin",
  "currentlyLoggedIn",
  "totalOrders",
  "totalSpent",
  "AOV",
]);

/* Remove fields that only the server may own before persisting a
 * client-originated user update. Prevents profile edits from rolling
 * back counters maintained by the buffered stats workers. */
export function stripServerOwnedFields(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (!SERVER_OWNED_FIELDS.has(key)) out[key] = value;
  }
  return out;
}

function mapMongooseType(schemaType) {
  if (!schemaType) return null;

  if (schemaType.instance === "Array") {
    const caster = schemaType.caster?.instance;
    if (caster === "String") return "string[]";
    if (caster === "Number") return "number[]";
    if (caster === "Boolean") return "boolean[]";
    if (caster === "Date") return "date[]";
    if (caster === "ObjectId") return "string[]";
    return "json";
  }

  if (schemaType.instance === "String") return "string";
  if (schemaType.instance === "Number") return "number";
  if (schemaType.instance === "Boolean") return "boolean";
  if (schemaType.instance === "Date") return "date";
  if (schemaType.instance === "ObjectId") return "string";
  if (schemaType.instance === "Decimal128") return "number";
  if (schemaType.instance === "Mixed") return "json";

  if (schemaType.schema) return "json";

  return null;
}

function readLiteralDefault(schemaType) {
  const defaultValue = schemaType?.defaultValue || schemaType?.default;

  if (defaultValue === undefined) return undefined;
  if (typeof defaultValue === "function") return undefined;

  return defaultValue;
}

function setDeep(target, path, value) {
  const parts = path.split(".");
  let cursor = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    cursor[part] ??= {};
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
}

export function generateBetterAuthFields(schema = UserSchema) {
  const additionalFields = {};

  schema.eachPath((path, schemaType) => {
    if (NATIVE_FIELDS.has(path)) return;
    if (SECRET_FIELDS.has(path)) return;
    if (path.startsWith("_")) return;

    const type = mapMongooseType(schemaType);
    if (!type) return;

    const fieldConfig = {
      type,
      returned: true,
      input: !SERVER_OWNED_FIELDS.has(path),
    };

    const defaultValue = readLiteralDefault(schemaType);
    if (defaultValue !== undefined) {
      fieldConfig.defaultValue = defaultValue;
    }

    if (schemaType.options?.required === true) {
      fieldConfig.required = true;
    }

    if (schemaType.options?.enum) {
      fieldConfig.enum = [...schemaType.options.enum];
    }

    setDeep(additionalFields, path, fieldConfig);
  });

  return additionalFields;
}

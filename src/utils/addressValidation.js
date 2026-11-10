import validator from "validator";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* =========================================================
 * Library-backed address validation (India)
 * - Format checks: `validator` (isPostalCode IN, lengths, alpha).
 * - Existence + city/state autofill: India Post pincode API
 *   (https://api.postalpincode.in — free, no key). Results cached
 *   in-memory; failures degrade gracefully to format-only checks.
 * - Phone checks: `libphonenumber-js` (already used by the app).
 * ========================================================= */

export const INDIA_PINCODE_LENGTH = 6;

/** Format check only: 6-digit Indian PIN via `validator`. */
export function isPincodeFormatValid(pin) {
  return validator.isPostalCode(String(pin ?? "").trim(), "IN");
}

const lookupCache = new Map();

/** Verify a pincode exists + resolve its city/state via India Post.
 * Returns { exists, city, state, postOffice } — never throws. */
export async function lookupPincode(pin, { timeoutMs = 8000 } = {}) {
  const code = String(pin ?? "").trim();
  if (!isPincodeFormatValid(code)) {
    return { exists: false, reason: "format" };
  }
  if (lookupCache.has(code)) return lookupCache.get(code);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${code}`, {
      signal: controller.signal,
    });
    const json = await res.json();
    const head = Array.isArray(json) ? json[0] : null;
    const offices = head?.PostOffice ?? [];
    if (head?.Status !== "Success" || offices.length === 0) {
      const out = { exists: false, reason: "not-found" };
      lookupCache.set(code, out);
      return out;
    }
    const first = offices[0];
    const out = {
      exists: true,
      city: first.District ?? "",
      state: first.State ?? "",
      postOffice: first.Name ?? "",
      offices: offices.length,
    };
    lookupCache.set(code, out);
    return out;
  } catch {
    // Offline / API down: format is valid, existence unknown.
    return { exists: true, unverified: true, city: "", state: "" };
  } finally {
    clearTimeout(timer);
  }
}

/** Validate a full address object. Returns { valid, errors } where
 * errors maps field -> message. Pure format checks (no network). */
export function validateAddressFields(addr = {}) {
  const errors = {};
  const str = (v) => String(v ?? "").trim();

  if (!validator.isLength(str(addr.name), { min: 2, max: 100 })) {
    errors.name = "Enter the recipient's full name (min 2 characters).";
  }

  const phone = parsePhoneNumberFromString(
    `+${str(addr.phoneNumber).replace(/\D/g, "")}`,
  );
  if (!phone?.isValid()) {
    errors.phoneNumber = "Enter a valid phone number with country code.";
  }

  if (!validator.isLength(str(addr.street), { min: 10, max: 500 })) {
    errors.street =
      "Enter a complete street address (house no, street, area — min 10 characters).";
  }

  if (
    !validator.isLength(str(addr.city), { min: 2, max: 100 }) ||
    !validator.matches(str(addr.city), /^[A-Za-z][A-Za-z .'-]*$/)
  ) {
    errors.city = "Enter a valid city name.";
  }

  if (!INDIAN_STATES.includes(str(addr.state))) {
    errors.state = "Select a valid Indian state.";
  }

  if (!isPincodeFormatValid(addr.postalCode)) {
    errors.postalCode = "Enter a valid 6-digit Indian pincode.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Indian states/UTs for the state field (validated, not free text). */
export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

export default {
  isPincodeFormatValid,
  lookupPincode,
  validateAddressFields,
  INDIAN_STATES,
};

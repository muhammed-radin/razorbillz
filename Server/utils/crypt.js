import CryptoJS from "crypto-js";

/* =========================================================
 * DEPRECATED — legacy CryptoJS AES field encryption.
 *
 * Superseded by ../utils/crypto/ (authenticated AES-256-GCM
 * envelope encryption + blind indexes). Kept because this module
 * IS the read path for rows stored before the encryption upgrade
 * (ciphertext prefix `U2FsdGVkX1…`) and the current frontend's
 * sign-in password obfuscation. Do NOT use for new writes; new
 * code imports from ../utils/crypto/index.js.
 * ========================================================= */

function validateEncrypted(ciphertext) {
  if (typeof ciphertext !== "string" || !ciphertext.startsWith("U2FsdGVkX1")) {
    return false;
  }
  return true;
}

function decryptCipher(ciphertext, strict = false) {
  if (!validateEncrypted(ciphertext)) {
    return ciphertext; // Return the original value if it's not encrypted
  }
  const key = strict ? process.env.CRYPTED_STRICT : process.env.CRYPTED;
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}

function encrypt(plaintext, strict = false) {
  // to avoid re-encrypting
  if (validateEncrypted(plaintext)) {
    return plaintext;
  }

  const key = strict ? process.env.CRYPTED_STRICT : process.env.CRYPTED;
  return CryptoJS.AES.encrypt(plaintext, key).toString();
}

/**
 * Decrypt a single PII field (e.g. user `name`) encrypted with CRYPTED.
 * Values are stored as `U2FsdGVkX1…` ciphertext; anything else (plain text,
 * numbers, null) passes through untouched. Never blanks a value: if
 * decryption yields nothing, the original is returned.
 */
function decryptField(value, strict = false) {
  if (typeof value !== "string" || !value.startsWith("U2FsdGVkX1")) {
    return value;
  }
  try {
    return decryptCipher(value, strict) || value;
  } catch {
    return value;
  }
}

function decryptStrict(ciphertext) {
  return decryptField(ciphertext, true);
}

function encryptStrict(plaintext) {
  return encrypt(plaintext, true);
}

function encryptAddress(address) {
  return Object.fromEntries(
    Object.entries(address).map(([key, value]) => [
      key,
      key === "id" ? value : encrypt(JSON.stringify(value)),
    ]),
  );
}

function decryptAddress(address) {
  return Object.fromEntries(
    Object.entries(address).map(([key, value]) => {
      if (key === "id" || typeof value !== "string") return [key, value];

      try {
        const decrypted = decryptField(value);
        return [key, JSON.parse(decrypted)];
      } catch {
        return [key, value];
      }
    }),
  );
}

/**
 *
 * @param {Object} obj - The object to decrypt.
 * @param {boolean} strict - Whether to use strict decryption.
 * @param {Array} strict - Include keys to strictly decrypt, if strict is true. If false, all keys will be decrypted except those in excludeKeys.
 * @param {Array} excludeKeys - Keys to exclude from decryption.
 * @returns {Object} The decrypted object.
 * @description This function decrypts an object using AES encryption and returns the decrypted object. deeply nested objects are not supported. If strict is true, only the keys specified in the strict array will be decrypted. If strict is false, all keys will be decrypted except those specified in the excludeKeys array.
 */
function decryptObj(obj, strict = false, excludeKeys = []) {
  const decryptedObj = {};
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      decryptedObj[key] = decryptObj(value, strict, excludeKeys);
    } else {
      if (strict) {
        if (strict.includes(key)) {
          decryptedObj[key] = decryptStrict(obj[key]);
        } else {
          decryptedObj[key] = obj[key];
        }
      } else {
        if (!excludeKeys.includes(key)) {
          decryptedObj[key] = decryptCipher(obj[key]);
        } else {
          decryptedObj[key] = obj[key];
        }
      }
    }
  }
  return decryptedObj;
}

export {
  decryptStrict,
  decryptField as decrypt,
  decryptField,
  encryptStrict,
  encrypt,
  encryptAddress,
  decryptAddress,
  decryptObj,
  validateEncrypted,
};

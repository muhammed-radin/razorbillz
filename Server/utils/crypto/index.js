/* =========================================================
 * Crypto barrel — single import point for the rest of the app.
 *
 *   import { encrypt, decrypt, encryptAddress, decryptAddress,
 *            blindIndex, userSearchIdx } from "../utils/crypto/index.js";
 *
 * Replaces `utils/crypt.js` (legacy CryptoJS, kept only as the LAST
 * RESORT read path for rows predating this upgrade + the sign-in
 * password obfuscation used by the current frontend).
 * ========================================================= */

export {
  ENVELOPE_PREFIX,
  isSealed,
  sealString,
  openString,
  sealJson,
  openJson,
  safeEquals,
} from "./aead.js";

export {
  INDEX_BITS,
  PREFIX_MARKER,
  GRAM_MARKER,
  GRAM_SIZE,
  PREFIX_MAX,
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
} from "./blindIndex.js";

export {
  isEncrypted,
  isSealedEnvelope,
  isLegacyEncrypted,
  validateEncrypted,
  encrypt,
  encryptField,
  encryptStrict,
  encryptPlain,
  decrypt,
  decryptField,
  decryptStrict,
  encryptAddress,
  decryptAddress,
  encryptAddressBook,
  decryptAddressBook,
  sealAddressObject,
  openAddressObject,
  stripSearchIndexes,
  userSearchIdx,
  advancedPIIIdx,
  sealObjectFields,
} from "./field.js";

export {
  keyState,
  getEnvelopeKeysSync,
  getActiveEnvelopeKeySync,
  requireActiveEnvelopeKey,
  getActiveBlindIndexKeySync,
  deriveBlindIndexKey,
  keysStatus,
} from "./keys.js";

export {
  storeKeybag,
  getKeybag,
  destroyKeybag,
  putVaultDoc,
  listVaultDocs,
  getVaultDoc,
  deleteVaultDoc,
  searchVaultDocs,
  KEYBAG_COLLECTION,
  VAULT_COLLECTION,
} from "./e2ee.js";

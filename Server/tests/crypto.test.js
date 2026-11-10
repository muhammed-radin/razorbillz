import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";

/* Provider a key material for the test run before importing modules
 * whose keyState warms at module load. */
process.env.ENCRYPTION_KEYS_JSON = JSON.stringify({
  version: 1,
  keys: [
    {
      id: "test1",
      algorithm: "AES-256-GCM",
      key: Buffer.alloc(32, 7).toString("base64url"),
      createdAt: new Date().toISOString(),
    },
  ],
});
process.env.CRYPTED_STRICT ??= "test-legacy-strict-key";
process.env.CRYPTED ??= "test-legacy-key";

const {
  sealString,
  openString,
  isSealed,
  sealJson,
  openJson,
} = await import("../utils/crypto/aead.js");
const {
  encryptField,
  decryptField,
  encryptAddress,
  decryptAddress,
  sealAddressObject,
  openAddressObject,
  isEncrypted,
  validateEncrypted,
} = await import("../utils/crypto/field.js");
const {
  blindIndex,
  normalizePhone,
  normalizeText,
  prefixTokens,
  gramTokens,
  searchTokens,
  eqToken,
} = await import("../utils/crypto/blindIndex.js");

test("aead: round-trip preserves plaintext", () => {
  const sealed = sealString("hello اोക്കേ world 123", {
    context: "user:name",
  });
  assert.ok(isSealed(sealed));
  assert.equal(sealed.split(".").length, 8);
  assert.equal(
    openString(sealed, { context: "user:name" }),
    "hello اोക്കേ world 123",
  );
});

test("aead: seals are non-deterministic (fresh DEK + IVs per value)", () => {
  const a = sealString("same value", { context: "x" });
  const b = sealString("same value", { context: "x" });
  assert.notEqual(a, b);
  assert.ok(openString(a, { context: "x" }) === "same value");
  assert.ok(openString(b, { context: "x" }) === "same value");
  assert.notEqual(a, b);
});

test("aead: tamper detection flips ciphertext", () => {
  const sealed = sealString("sensitive", { context: "order:city" });
  const tampered = sealed.endsWith("A") || sealed.endsWith("B")
    ? sealed.slice(0, -1) + (sealed.endsWith("A") ? "B" : "A")
    : sealed.slice(0, -1) + "A";
  assert.throws(() => openString(tampered, { context: "order:city" }));
});

test("aead: AAD context binding prevents cross-field replay", () => {
  const sealed = sealString("9876543210", { context: "user:phoneNumber" });
  assert.throws(() => openString(sealed, { context: "user:email" }));
  assert.throws(() => openString(sealed, { context: "" }));
});

test("aead: json helpers", () => {
  const obj = { street: "MG Road", pin: "682001" };
  const sealed = sealJson(obj, { context: "address" });
  assert.ok(isSealed(sealed));
  assert.deepEqual(openJson(sealed, { context: "address" }), obj);
});

test("field: encryptField is idempotent, decryptField dispatches", () => {
  const once = encryptField("Miral George");
  const twice = encryptField(once);
  assert.equal(once, twice);
  assert.equal(decryptField(once), "Miral George");
});

test("field: legacy CryptoJS values decrypt via dispatch", async () => {
  const CryptoJS = (await import("crypto-js")).default;
  const legacy = CryptoJS.AES.encrypt("Legacy Name", "test-legacy-key").toString();
  assert.ok(legacy.startsWith("U2FsdGVkX1"));
  assert.equal(decryptField(legacy), "Legacy Name");
});

test("field: non-encrypted values pass through untouched", () => {
  assert.equal(decryptField("plain-id"), "plain-id");
  assert.equal(decryptField(null), null);
  assert.equal(decryptField(42), 42);
  assert.ok(!isEncrypted("plain"));
  assert.ok(isEncrypted(encryptField("x")));
  assert.ok(validateEncrypted("U2FsdGVkX1whatever"));
});

test("field: address round-trip keeps meta fields, opens PII, builds idx", () => {
  const address = {
    id: "addr-1",
    userId: "user-1",
    name: "Rahif Muhammed",
    street: "12/3 Baker St",
    city: "Kochi",
    state: "Kerala",
    postalCode: "682001",
    country: "India",
    email: "rahif@example.com",
  };
  const sealed = encryptAddress(address);
  assert.ok(!isSealed(sealed.id)); // meta passthrough
  assert.ok(isSealed(sealed.name));
  assert.ok(sealed._idx.name);
  assert.ok(sealed._idx.postalCode);

  const opened = decryptAddress(sealed);
  assert.equal(opened.name, "Rahif Muhammed");
  assert.equal(opened.city, "Kochi");
  assert.equal(opened.id, "addr-1");
  assert.equal(opened._idx, undefined); // never leaves the server
});

test("field: order snapshot round-trip", () => {
  const snap = {
    name: "Miral George",
    street: "MG Road 5",
    city: "Thrissur",
    state: "Kerala",
    postalCode: "680001",
    email: "miral@example.com",
  };
  const sealed = sealAddressObject(snap);
  assert.ok(isSealed(sealed.name));
  const opened = openAddressObject(sealed);
  assert.deepEqual(opened, snap);
});

test("blindIndex: deterministic + normalized", () => {
  const a = blindIndex("Rahif M.", "name");
  const b = blindIndex("  rahif  m ", "name");
  assert.equal(a, b);
  assert.equal(a.length, 16); // 64-bit / 4
  assert.notEqual(blindIndex("A", "name"), blindIndex("A", "email")); // purpose-separated
});

test("blindIndex: phone normalization folds +91/91/0 prefixes", () => {
  assert.equal(normalizePhone("+91 98470 12345"), "9847012345");
  assert.equal(normalizePhone("09847012345"), "9847012345");
  assert.equal(normalizePhone("98470-12345"), "9847012345");
  assert.equal(
    blindIndex("+91 98470 12345", "phone"),
    blindIndex("9847012345", "phone"),
  );
});

test("blindIndex: null/empty yields null and normalization strips diacritics", () => {
  assert.equal(blindIndex(null, "name"), null);
  assert.equal(normalizeText("Rahïf"), "rahif");
});

/* ============================================================
 * ADVANCED SEARCH — prefix + trigram families
 * ============================================================ */

test("prefix tokens: determinism, anchoring, ordering", () => {
  const name = "Rahif Muhammed";
  const a = prefixTokens(name, "name");
  const b = prefixTokens("  rahif   muhammed ", "name");
  assert.deepEqual(a, b); // normalization folds spacing/case
  assert.ok(a.length >= 6 && a.length <= 16); // depth capped at PREFIX_MAX (lost caps on short names)
  // A query matches the prefix family iff it IS an anchored prefix.
  const q = searchTokens("Rah", "name");
  assert.ok(q.prefix);
  assert.ok(a.includes(q.prefix)); // "rah" = position-0 prefix of value
  // Mid-string/suffix queries must NOT match the prefix family.
  const mid = searchTokens("ahif", "name");
  if (mid.prefix) assert.ok(!a.includes(mid.prefix));
  assert.notEqual(q.prefix, mid.prefix);
});

test("gram tokens: substring matching is complete (no false negatives)", () => {
  const name = "Rahif Muhammed";
  const stored = gramTokens(name, "name");
  // Substring query "f Muh" → its trigrams must ALL be present.
  const q = searchTokens("f muh", "name");
  assert.ok(q.grams.length > 0);
  for (const g of q.grams) {
    assert.ok(stored.includes(g), `missing gram ${g}`);
  }
  // Values shorter than a gram fall back to a single whole-value token.
  assert.equal(gramTokens("pi", "name").length, 1);
});

test("gram tokens: cap bounds the indexed window for long values", () => {
  const longEmail = "aaaaaaaaaa.bbbbbbbbbb.cccccccccc.ddd@example.com";
  const grams = gramTokens(longEmail, "email");
  assert.ok(grams.length <= 64);
});

test("eq/prefix/gram domains are distinct on the same key", () => {
  const v = "abc";
  const eq = eqToken(v, "name");
  const p = gramTokens(v, "name")[0]; // len < 3 → whole-value "g" token
  // normalization "abc" → g token = HMAC("name:g:abc"), eq = HMAC("name:abc"), p1 = HMAC("name:p:a")
  assert.notEqual(eq, p);
  assert.ok(prefixTokens("abc", "name").length === 3);
});

test("searchTokens: substring minimum enforced — sub-3-char queries carry NO gram tokens", () => {
  // "ra" is shorter than a trigram: only exact + anchored prefix.
  const short = searchTokens("ra", "name");
  assert.ok(short);
  assert.ok(short.eq);
  assert.ok(short.prefix); // anchored-prefix suggestion still works
  assert.deepEqual(short.grams, []); // no fake whole-value gram token

  // Exactly 3 chars: trigram branch is armed.
  const tri = searchTokens("mar", "name");
  assert.equal(tri.grams.length, 1);

  // Empty/whitespace queries yield no tokens at all.
  assert.equal(searchTokens("", "name"), null);
  assert.equal(searchTokens("   ", "name"), null);
});

test("support schema hook seals subject + body and keeps a usable index", async () => {
  const { SupportTicketModel, decryptSupportTicket } = await import(
    "../models/schema/support.js"
  );
  const ticket = new SupportTicketModel({
    id: "TKT-TEST-1",
    userId: "user-1",
    subject: "Damaged product delivery",
    messages: [{ sender: "user", senderId: "user-1", body: "The box arrived crushed, please help." }],
  });
  await ticket.validate();
  assert.ok(isSealed(ticket.subject));
  assert.ok(isSealed(ticket.messages[0].body));
  assert.ok(ticket.subject_idx);
  assert.equal(ticket.subject_idx, blindIndex("Damaged product delivery", "subject"));

  const plain = decryptSupportTicket(ticket);
  assert.equal(plain.subject, "Damaged product delivery");
  assert.equal(plain.messages[0].body, "The box arrived crushed, please help.");
});

/* ============================================================
 * EMAIL VAULTING — Better Auth adapter wrapper
 * ============================================================ */

test("emailVault adapter: seals email + tokens on create/update, translates eq() filters", async () => {
  const { emailVaultAdapter } = await import("../utils/crypto/emailVault.js");
  const { eqToken } = await import("../utils/crypto/blindIndex.js");
  const { isSealed } = await import("../utils/crypto/aead.js");

  const calls = [];
  const fake = {
    create: async (a) => {
      calls.push(["create", a]);
      return { id: "u1" };
    },
    findOne: async (a) => {
      calls.push(["findOne", a]);
      return null;
    },
    update: async (a) => {
      calls.push(["update", a]);
      return true;
    },
    updateMany: async (a) => {
      calls.push(["updateMany", a]);
      return true;
    },
    delete: async (a) => {
      calls.push(["delete", a]);
      return true;
    },
  };
  const adapter = emailVaultAdapter(fake);

  // CREATE on user model: seal email + companion tokens.
  await adapter.create({
    model: "user",
    data: { email: "  Rahif@Example.COM ", name: "Rahif" },
  });
  const [, createArg] = calls.find((c) => c[0] === "create");
  assert.ok(isSealed(createArg.data.email));
  assert.equal(
    createArg.data.email_idx,
    eqToken("rahif@example.com", "email"),
  );
  assert.ok(Array.isArray(createArg.data.email_prefix));
  assert.ok(Array.isArray(createArg.data.email_grams));
  assert.equal(createArg.data.name, "Rahif"); // name untouched by the adapter

  // FIND by email: where-clause is translated to the eq token.
  await adapter.findOne({
    model: "user",
    where: [{ field: "email", operator: "eq", value: "RAHIF@example.com" }],
  });
  const [, findArg] = calls.find((c) => c[0] === "findOne");
  assert.equal(findArg.where[0].field, "email_idx");
  assert.equal(
    "eq wrong".length > 0 && findArg.where[0].operator,
    "eq",
  );
  assert.equal(
    findArg.where[0].value,
    eqToken("rahif@example.com", "email"),
  );

  // UPDATE: filters translated AND $set value sealed.
  await adapter.update({
    model: "user",
    where: [{ field: "email", operator: "eq", value: "rahif@example.com" }],
    update: { $set: { email: "New@Example.com" } },
  });
  const [, updateArg] = calls.find((c) => c[0] === "update");
  assert.equal(updateArg.where[0].field, "email_idx");
  assert.ok(updateArg.update.$set.email.startsWith("ze1."));

  // UPDATE by id: filter untouched, email sealed.
  await adapter.updateMany({
    model: "user",
    where: [{ field: "id", operator: "eq", value: "u1" }],
    update: { email: "Changed@Example.com" },
  });
  const [, umArg] = calls.find((c) => c[0] === "updateMany");
  assert.equal(umArg.where[0].field, "id"); // unrelated field untouched
  assert.ok(umArg.update.email.startsWith("ze1."));

  // Non-vaulted models pass through completely untouched.
  await adapter.findOne({
    model: "session",
    where: [{ field: "userId", operator: "eq", value: "u1" }],
  });
  const [, sessArg] = calls.find((c) => c[0] === "findOne" && c[1].model === "session");
  assert.equal(sessArg.where[0].field, "userId");

  // Verification identifier model gets the same treatment.
  await adapter.create({
    model: "verification",
    data: { identifier: "broken@lens.example", value: "tok", expiresAt: new Date() },
  });
  const [, verArg] = calls.find((c) => c[0] === "create" && c[1].model === "verification");
  assert.ok(isSealed(verArg.data.identifier));
  assert.equal(
    verArg.data.identifier_idx,
    eqToken("broken@lens.example", "email"),
  );
});

test("emailVault: buildMirrorUserFields decrypts BA rows and rebuilds mirror tokens", async () => {
  const {
    buildMirrorUserFields,
  } = await import("../utils/crypto/emailVault.js");
  const { decryptField } = await import("../utils/crypto/field.js");
  const { sealString } = await import("../utils/crypto/aead.js");

  // Simulate a BA row that already has a vaulted (sealed) email.
  const baRow = {
    email: sealString("mirror@example.com", { context: "email:email" }),
    name: "Mirror Name",
  };
  const set = buildMirrorUserFields(baRow);
  assert.ok(set.email.startsWith("ze1."));
  assert.equal(decryptField(set.email), "mirror@example.com");
  assert.equal(set.email_idx, eqToken("mirror@example.com", "email"));
  assert.equal(decryptField(set.name), "Mirror Name");
});

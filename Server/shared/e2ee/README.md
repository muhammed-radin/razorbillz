# RazorBillz E2EE (Tier B) — Client Integration Guide

This SDK lives in `shared/e2ee/crypto.js` and is consumed by the FRONTEND
(Vite/React app in the sibling repo). It is dependency-free and isomorphic
(uses WebCrypto — browsers on HTTPS/localhost, Node ≥ 20).

## What E2EE means here

The server stores only **opaque** material:

| Stored | Content | Server can decrypt? |
|---|---|---|
| `e2ee_keybags` | `{ salt, kdf params, wrappedDek }` | **No** — unwrap needs your password |
| `e2ee_vault` | `{ ct: AES-GCM ciphertext, idx: blind-index tokens }` | **No** — only match equality |

Server-side (Tier A) sealing — order address snapshots, user PII fields,
support tickets — still exists and protects data **at rest** (DB staff,
backups, dumps). Tier B is for data the server itself must never read.

## Key hierarchy

```
password ──PBKDF2-SHA256(600k, salt)──▶ WUK (never sent anywhere)
random 32B DEK ──AES-GCM(WUK)──▶ wrappedDek (stored on server)
DEK ──domain-separated subkeys──▶ payloadKey / indexKey:<purpose>
```

## Quick start

```js
import {
  generateSalt, generateDek, defaultKdfParams, deriveWrappingKey,
  wrapDek, unwrapDek, encryptAddressE2EE, decryptAddressE2EE,
} from "@shared/e2ee/crypto.js";

// --- First time (enrollment), after login: -----------------------------
const salt = generateSalt();
const wuk = await deriveWrappingKey(password, salt); // client-side only
const dek = generateDek();                            // lives in memory only
const wrappedDek = await wrapDek(dek, wuk);

await fetch("/api/e2ee/keybag", {
  method: "PUT",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ salt, params: defaultKdfParams(), wrappedDek }),
});

// --- Later sessions: unlock -------------------------------------------
async function unlock(password) {
  const kb = await fetch("/api/e2ee/keybag", { credentials: "include" })
    .then((r) => r.json());
  const wuk = await deriveWrappingKey(password, kb.salt, kb.params);
  return unwrapDek(kb.wrappedDek, wuk); // → DEK bytes (Uint8Array)
}

// --- Store an address (searchable E2EE) -------------------------------
const { ct, idx } = await encryptAddressE2EE(dek, address);
await fetch("/api/e2ee/vault", {
  method: "PUT", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: address.id, kind: "address", ct, idx }),
});

// --- Read them back ---------------------------------------------------
const { docs } = await fetch("/api/e2ee/vault?kind=address",
  { credentials: "include" }).then((r) => r.json());
for (const doc of docs) {
  const address = await decryptAddressE2EE(dek, doc);
}

// --- Search over encrypted data (exact match) -------------------------
const token = idx.name; // token already computed on write
await fetch("/api/e2ee/vault/search", {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "address", query: { name: [token] } }),
});
```

## Checkout with an E2EE address book

Order placement (`POST /api/orders`, `POST /api/payments/razorpay/create`)
requires plaintext `shippingAddress`/`billingAddress` **in the request
body** — the courier (Shipmozo) and payment (Razorpay) APIs need plaintext.
The client decrypts the chosen address locally and includes it in the
checkout call (this is already how checkout works today). The server seals
the snapshot at rest and opens it only transiently when creating a courier
label. This is the deliberate *just-in-time reveal* boundary of E2EE.

## Critical semantics

1. **Password reset breaks the keybag** (by design). The new password's
   WUK cannot unwrap the old DEK. Flow: after a reset, the client cannot
   unlock; user must re-enroll and re-enter E2EE data. Prefer surfacing
   "set a new password" flows that take the CURRENT password (update-
   password path) — re-wrap the DEK client-side before replacing it:
   decrypt with old WUK → PUT new keybag with new WUK + same DEK.
2. **Don't persist the DEK to disk** (no localStorage). Hold it in memory
   per session; re-derive on unlock.
3. **Blind indexes are server-matchable but not reversible** — search
    supports three families over client-computed tokens:
    - **Exact** (unlimited): `idx.<field>` = HMAC of the normalized value.
      Case/diacritic fold for text, +91/0 digit folding for phones.
    - **Prefix** (anchored, up to 16 chars): the query must BE an anchored
      prefix of the stored value; the client sends the single token
      `prefix` and it matches by array membership. Zero false positives.
      Works for ANY length ≥ 1.
    - **Substring** (trigram, queries ≥ 3 chars): the client sends all
      trigram tokens of the query (`grams`), matched with MongoDB `$all`.
      Complete (no false negatives) but may over-match scattered-gram
      candidates (e.g. "abc…def" matching query "abcdef") — the client
      MUST post-filter locally after decrypting candidates. The ≥ 3-char
      minimum is SERVER-ENFORCED (`searchTokens` emits no gram tokens
      below GRAM_SIZE) — shorter queries degrade to exact + prefix only;
      delayed 1–2-char mid-string matches are a deliberate trade-off
      (2-char grams would be brute-forceable, defeating the index).
      Range queries are not supported.
4. **Emails are vaulted server-side too (Tier A)** — even inside Better
   Auth's own collections (`users_validation.email` and
   `verification.identifier`), the email is sealed at rest and searched
   via blind-index token fields (`email_idx`, `email_prefix`,
   `email_grams`). Sign-in/verification/reset flows query the token,
   never the plaintext; responses decrypt just-in-time in
   `utils/auth.js` hooks. Plaintext never lands in the DB.
5. Guests (anonymous accounts) can use the vault with a server-generated
   salt, but have no password — treat their keybag as session-scoped.

## Server endpoints (all under `/api/e2ee`, cookie auth)

| Method | Path | Purpose |
|---|---|---|
| PUT | `/e2ee/keybag` | Enroll / re-wrap (password change) |
| GET | `/e2ee/keybag` | Fetch own keybag (sanity: no DEK is included) |
| DELETE | `/e2ee/keybag` | Destroy (irreversible) |
| PUT/GET/DELETE | `/e2ee/vault[/:id]` | CRUD client-encrypted docs |
| POST | `/e2ee/vault/search` | Client-token search: exact eq, prefix membership, trigram `$all` (client post-filters substring results after decrypt) |
| GET | `/e2ee/status` | Ops: Tier A master-key state |

## Tier A search semantics (server routes — users/support)

The mirror collections hold sealed values plus token families; admin
search runs entirely on ciphertext:

| Query | Storage match | Notes |
|---|---|---|
| exact value | `<field>_idx EQ token` | unlimited length |
| anchored prefix (any length ≥ 1, ≤ 16 chars) | `<field>_prefix` membership | exact, zero FPs |
| substring (≥ 3 chars, server-enforced) | `<field>_grams` `$all` trigrams | complete; server decrypts candidates and drops scattered-gram false positives |

Token arrays live alongside the doc (`users`, support `subject_*`).
Legacy plaintext regex fallbacks remain in the query branches so search
keeps working on rows that pre-date the migration.

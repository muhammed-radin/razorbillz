import express from "express";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import {
  destroyKeybag,
  getKeybag,
  putVaultDoc,
  getVaultDoc,
  deleteVaultDoc,
  listVaultDocs,
  searchVaultDocs,
  storeKeybag,
} from "../utils/crypto/e2ee.js";

/* =========================================================
 * Tier B — E2EE key management + client-encrypted vault.
 *
 * The server handles OPAQUE client-side ciphertext only:
 * - keybag: { salt, kdf params, wrappedDek } — password-derived
 *   wrapping key stays in the client; the server cannot unwrap.
 * - vault: arbitrary per-user documents the client encrypts with its
 *   DEK, searchable through CLIENT-computed blind-index tokens
 *   (`idx.field`), which the server can only match, never invert.
 *
 * Client SDK (frontend repo): shared/e2ee/crypto.js
 * ========================================================= */

const router = express.Router();

/* ---------------- keybag (per-user E2EE root material) ---------------- */

/* Enroll or re-wrap: PUT /e2ee/keybag
 * { salt, params: {algorithm, iterations, length}, wrappedDek }
 * Re-enrolling after a password change is how the user migrates
 * their DEK to the new wrapping key (client decrypts with old,
 * re-wraps with new — the DEK itself never crosses the wire). */
router.put("/keybag", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: "User ID not found" });
    const { salt, params, wrappedDek } = req.body ?? {};
    const keybag = await storeKeybag({ userId, salt, params, wrappedDek });
    res.json({
      message: "Keybag stored (server holds wrapped material only)",
      keybag: {
        salt: keybag.salt,
        params: keybag.params,
        wrappedDek: keybag.wrappedDek,
        updatedAt: keybag.updatedAt,
      },
    });
  } catch (err) {
    console.error("[e2ee] keybag store failed:", err?.message);
    res.status(400).json({ error: err?.message ?? "Could not store keybag" });
  }
});

/* Fetch own keybag (needed client-side to derive WUK + unwrap DEK). */
router.get("/keybag", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: "User ID not found" });
    const keybag = await getKeybag(userId);
    if (!keybag) return res.status(404).json({ error: "No E2EE keybag yet" });
    res.json({
      salt: keybag.salt,
      params: keybag.params,
      wrappedDek: keybag.wrappedDek,
      updatedAt: keybag.updatedAt,
    });
  } catch (err) {
    console.error("[e2ee] keybag fetch failed:", err?.message);
    res.status(500).json({ error: "Failed to fetch keybag" });
  }
});

/* Destroy own keybag — irreversible. DEK becomes unrecoverable for
 * every vault doc previously written with it (true E2EE semantics). */
router.delete("/keybag", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: "User ID not found" });
    const ok = await destroyKeybag(userId);
    res.json({ message: ok ? "Keybag destroyed" : "No keybag existed", ok });
  } catch (err) {
    console.error("[e2ee] keybag destroy failed:", err?.message);
    res.status(500).json({ error: "Failed to destroy keybag" });
  }
});

/* ------------------------- vault (enc'd docs) ------------------------- */

/* PUT /e2ee/vault  { id?, kind, ct, idx } — server stores opaque. */
router.put("/vault", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: "User ID not found" });
    const doc = await putVaultDoc({ userId, ...req.body });
    res.json({ message: "Stored", doc });
  } catch (err) {
    console.error("[e2ee] vault put failed:", err?.message);
    res.status(400).json({ error: err?.message ?? "Could not store vault doc" });
  }
});

/* GET /e2ee/vault?kind=&limit=&skip= */
router.get("/vault", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: "User ID not found" });
    const { kind, limit, skip } = req.query ?? {};
    const { docs, total } = await listVaultDocs(userId, { kind, limit, skip });
    res.json({ docs, total });
  } catch (err) {
    console.error("[e2ee] vault list failed:", err?.message);
    res.status(500).json({ error: "Failed to list vault docs" });
  }
});

router.get("/vault/:id", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: "User ID not found" });
    const doc = await getVaultDoc(userId, req.params.id);
    if (!doc) return res.status(404).json({ error: "Vault doc not found" });
    res.json(doc);
  } catch (err) {
    console.error("[e2ee] vault get failed:", err?.message);
    res.status(500).json({ error: "Failed to fetch vault doc" });
  }
});

router.delete("/vault/:id", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: "User ID not found" });
    const ok = await deleteVaultDoc(userId, req.params.id);
    if (!ok) return res.status(404).json({ error: "Vault doc not found" });
    res.json({ message: "Deleted", ok });
  } catch (err) {
    console.error("[e2ee] vault delete failed:", err?.message);
    res.status(500).json({ error: "Failed to delete vault doc" });
  }
});

/* POST /e2ee/vault/search { kind?, query: { field: [tokens] } }
 * Tokens are client-computed blind indexes; server matches exactly. */
router.post("/vault/search", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: "User ID not found" });
    const { kind, query } = req.body ?? {};
    const docs = await searchVaultDocs(userId, { kind, query });
    res.json({ docs });
  } catch (err) {
    console.error("[e2ee] vault search failed:", err?.message);
    res.status(400).json({ error: err?.message ?? "Vault search failed" });
  }
});

/* Health/config of the server-side (Tier A) keys — used by ops. */
router.get("/status", async (_req, res) => {
  const { keysStatus } = await import("../utils/crypto/keys.js");
  res.json({ tierA: keysStatus() });
});

export default router;

import express from "express";
import { db } from "../utils/db.js";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import createAuth, { getAuthInstance } from "../utils/auth.js";
import { globalMemory } from "../utils/cache-utils/global-cache.js";
import settingsRouter from "./settings.js";
import {
  encrypt,
  decryptField,
  decryptAddress,
  decryptAddressBook,
  isEncrypted,
  advancedPIIIdx,
  searchTokens,
} from "../utils/crypto/index.js";
import { isAPIError } from "better-auth/api";

const router = express.Router();

/* Address snapshots (users.address + users.addressBook[]) are sealed
 * at rest (envelope AES-GCM, server-only key). Decrypt-on-read at
 * every endpoint that returns them — the browser cannot open `ze1…`
 * envelopes, and client-side legacy decrypt passes plaintext through. */
function decryptUserAddresses(user) {
  if (!user || typeof user !== "object") return user;
  const out = { ...user };
  if (out.address) out.address = decryptAddress(out.address);
  if (Array.isArray(out.addressBook)) {
    out.addressBook = decryptAddressBook(out.addressBook);
  }
  return out;
}

router.use("/settings", settingsRouter);

// user profile route for users
router.get("/profile", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: "User ID not found in request" });
    }

    const user = await db.collection("users").findOne({ id: userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    /* PII is sealed at rest (envelope AES-GCM); decrypt-on-read so the
     * client never handles the storage format. Blind-index subdocs are
     * server-internal and stripped here. */
    const decrypted = decryptUserAddresses({
      ...user,
      name: decryptField(user.name),
      email: decryptField(user.email),
      image: decryptField(user.image),
      profilePicture: decryptField(user.profilePicture),
      phoneNumber: decryptField(user.phoneNumber),
    });
    delete decrypted.name_idx;
    delete decrypted.email_idx;
    delete decrypted.phone_idx;
    delete decrypted.name_prefix;
    delete decrypted.name_grams;
    delete decrypted.email_prefix;
    delete decrypted.email_grams;
    delete decrypted.phone_prefix;
    delete decrypted.phone_grams;

    res.json(decrypted);
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

router.post("/profile", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: "User ID not found in request" });
    }

    const { name, avatar, phone } = req.body;

    const updateFields = {};
    if (name) updateFields.name = encrypt(name);
    if (avatar) {
      updateFields.image = encrypt(avatar);
      updateFields.profilePicture = encrypt(avatar);
    }
    if (phone) updateFields.phoneNumber = encrypt(phone);
    /* vaulted mirror tokens are rebuilt by the databaseHooks.user.update
     * after-hook (buildMirrorUserFields) — writes here stay minimal. */

    const result = await getAuthInstance().api.updateUser({
      query: { id: userId },
      body: updateFields,
      headers: req.headers,
    });

    res.json({ message: "Profile updated successfully", result });
  } catch (error) {
    // FAILURE: An error was thrown

    // 1. Check if it's a Better Auth specific API error
    if (isAPIError(error)) {
      // Example: User not found / Session expired usually returns a 401 or 404 status
      return res.status(error.status).json({
        success: false,
        message: error.message, // e.g., "Unauthorized" or validation errors
        errorCode: error.code, // e.g., "USER_NOT_FOUND" or "SESSION_EXPIRED"
        error: error, // Include the full error object for debugging purposes
      });
    }

    // 2. Fallback for generic database or network crashes
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
      error: error.message || "Unknown error",
    });
  }
});

/* GET users listing. for Admin */
router.get(
  "/",
  requireAuth,
  requireAdmin,
  requirePermission({ user: ["list"] }),
  async function (req, res) {
    if (
      globalMemory?.getLocalMemory(req.url) &&
      req.query?.realtime !== "true"
    ) {
      return res.json(globalMemory.getLocalMemory(req.url));
    }
    let query = {};
    let result = {};
    let page = parseInt(req.query?.page) || parseInt(req.body?.page) || 1;
    let limit = parseInt(req.query?.limit) || parseInt(req.body?.limit) || 10;
    let sortBy = req.query?.sortBy || req.body?.sortBy || "createdAt";
    let sortOrder = req.query?.sortOrder === "asc" ? 1 : -1;
    let startIndex =
      parseInt(req.query?.startIndex) || parseInt(req.body?.startIndex) || 0;
    let roles =
      req.query?.roles?.split(",") || req.body?.roles?.split(",") || null;

    if (page > 1) {
      startIndex = (page - 1) * limit;
    }

    // build query based on request parameters
    // Admin search across name / email / id / phone.
    // Encrypted fields are matched through blind-index families:
    //   exact   → field_idx eq token
    //   prefix  → field_prefix membership (anchored, zero FPs)
    //   substring → field_grams $all (complete, may over-match;
    //               decrypted candidates are post-filtered below)
    // The plaintext is never readable here — the UX-equivalent regex
    // fallbacks on legacy plaintext rows (pre-migration) are kept so
    // search keeps working before the migration completes.
    const search = String(req.query?.search ?? req.body?.search ?? "").trim();
    query = {};
    let needsGramsFilter = false;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      let adv = null;
      try {
        adv = {
          name: searchTokens(search, "name"),
          email: searchTokens(search, "email"),
          phone: searchTokens(search, "phone"),
        };
      } catch {
        adv = null; // keys not configured — regex-only search still works
      }

      const orBranches = [{ name: rx }, { email: rx }, { id: rx }];
      if (adv) {
        for (const [field, tokens] of Object.entries(adv)) {
          if (!tokens) continue;
          if (tokens.eq) {
            orBranches.push({ [`${field}_idx`]: tokens.eq });
          }
          if (tokens.prefix) {
            orBranches.push({ [`${field}_prefix`]: tokens.prefix });
          }
          if (tokens.grams.length) {
            // Only reachable for queries >= 3 chars — searchTokens
            // emits NO grams below GRAM_SIZE (substring minimum).
            orBranches.push({ [`${field}_grams`]: { $all: tokens.grams } });
            needsGramsFilter = true; // trigram may over-match → post-filter
          }
        }
      }
      query = { $or: orBranches };
    }
    if (roles && Array.isArray(roles) && roles.length > 0) {
      query.role = { $in: roles };
    }

    let totalCount = await db.collection("users").countDocuments(query);

    db.collection("users")
      .find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(startIndex)
      .limit(limit)
      .toArray()
      .then((users) => {
        // Decrypt-at-read for admin listing; keep server index tokens
        // and auth internals out of the response. When trigram (grams)
        // branches were used, decrypted candidates are post-filtered to
        // remove scattered-gram false positives (substring semantics).
        const needle = search.toLowerCase();
        let safeUsers = users
          .map((u) =>
            decryptUserAddresses({
              ...u,
              name: decryptField(u.name),
              email: decryptField(u.email),
              phoneNumber: decryptField(u.phoneNumber),
              image: decryptField(u.image),
              profilePicture: decryptField(u.profilePicture),
            }),
          )
          .filter((u) => {
            if (!needsGramsFilter || !needle) return true;
            // Mirror the full query branch set (name/email/phone/id,
            // all "contains" semantics) on DECRYPTED values so only
            // scattered-gram false positives get dropped.
            return (
              String(u.name ?? "").toLowerCase().includes(needle) ||
              String(u.email ?? "").toLowerCase().includes(needle) ||
              String(u.phoneNumber ?? "").replace(/\s+/g, "").toLowerCase().includes(needle.replace(/\s+/g, "")) ||
              String(u.id ?? "").toLowerCase().includes(needle)
            );
          });
        safeUsers = safeUsers.map((u) => {
          const clean = { ...u };
          for (const k of [
            "name_idx", "email_idx", "phone_idx",
            "name_prefix", "name_grams",
            "email_prefix", "email_grams",
            "phone_prefix", "phone_grams",
            "password", "token",
          ]) {
            delete clean[k];
          }
          return clean;
        });
        result = {
          users: safeUsers,
          page: page,
          limit: limit,
          count: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          next: page < Math.ceil(totalCount / limit) ? page + 1 : null,
          previous: page > 1 ? page - 1 : null,
          startIndex: startIndex,
          endIndex: startIndex + users.length - 1,
          sort: {
            by: sortBy,
            order: sortOrder,
          },
          fromCache: false,
        };

        globalMemory?.setLocalMemory(
          req.url,
          { ...result, fromCache: true },
          60 * 2,
        ); // Cache for 2 minutes
        res.json(result);
      })
      .catch((err) => {
        console.error("Error fetching users:", err);
        res.status(500).json({ error: "Failed to fetch users" });
      });
  },
);

router.get(
  "/:id",
  requireAuth,
  requireAdmin,
  requirePermission({ user: ["get"] }),
  function (req, res, next) {
    const userId = req.params.id;
    // Never expose sensitive internals (hashes, tokens, indexes).
    const propsToStrip = (u) => {
      const clean = decryptUserAddresses({
        ...u,
        name: decryptField(u.name),
        email: decryptField(u.email),
        phoneNumber: decryptField(u.phoneNumber),
        image: decryptField(u.image),
        profilePicture: decryptField(u.profilePicture),
      });
      for (const k of [
        "name_idx", "email_idx", "phone_idx",
        "name_prefix", "name_grams",
        "email_prefix", "email_grams",
        "phone_prefix", "phone_grams",
      ]) {
        delete clean[k];
      }
      return clean;
    };
    db.collection("users")
      .findOne({ id: userId }, { projection: { password: 0, token: 0 } })
      .then((user) => {
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        res.json(propsToStrip(user));
      })
      .catch((err) => {
        console.error("Error fetching user:", err);
        res.status(500).json({ error: "Failed to fetch user" });
      });
  },
);

router.get(
  "/auth/:id/",
  requireAuth,
  requireAdmin,
  requirePermission({ user: ["get"] }),
  (req, res) => {
    const userId = req.params.id;

    getAuthInstance()
      .api.getUser({
        query: {
          id: userId,
        },
        headers: req.headers,
      })
      .then((user) => {
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        res.json(user);
      })
      .catch((err) => {
        console.error("Error fetching user from auth:", err);
        res.status(500).json({ error: "Failed to fetch user from auth" });
      });
  },
);

/* PATCH /users/:id/status { banned: boolean, banReason? }
 * Admin-only account activate/deactivate. Never allows self-ban or
 * role changes (roles are managed elsewhere). */
router.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  requirePermission({ user: ["ban"] }),
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { banned, banReason } = req.body ?? {};
      if (typeof banned !== "boolean") {
        return res.status(400).json({ error: "banned (boolean) is required" });
      }
      if (req.user?.id === userId) {
        return res
          .status(400)
          .json({ error: "You cannot change your own status" });
      }
      const update = banned
        ? {
            banned: true,
            banReason: String(banReason ?? "Disabled by admin").slice(0, 500),
            isActive: false,
          }
        : { banned: false, banReason: "", isActive: true };
      const result = await getAuthInstance().api.banUser({
        body: { userId, ...update },
        headers: req.headers,
      });
      const updated = await db
        .collection("users")
        .updateOne({ id: userId }, { $set: update });
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating user status:", err);
      res.status(500).json({ error: "Failed to update user status" });
    }
  },
);

// update user profile route for admin
router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  requirePermission({ user: ["update", "set-role", "list", "set-email"] }),
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { name, avatar, image, profilePicture, phone, isActive } = req.body;

      const updateFields = {};
      if (name) updateFields.name = encrypt(name);
      if (avatar)
        updateFields.image = encrypt(avatar || image || profilePicture);
      if (avatar)
        updateFields.profilePicture = encrypt(
          avatar || image || profilePicture,
        );
      if (phone) updateFields.phoneNumber = encrypt(phone);
      if (typeof isActive === "boolean") updateFields.isActive = isActive;

      updateFields.updatedAt = new Date().toISOString();

      const result = await getAuthInstance().api.updateUser({
        query: { id: userId },
        body: updateFields,
        headers: req.headers,
      });

      res.status(200).json({
        success: true,
        message: "User profile updated successfully",
        result,
      });
    } catch (error) {
      // FAILURE: An error was thrown

      // 1. Check if it's a Better Auth specific API error
      if (isAPIError(error)) {
        // Example: User not found / Session expired usually returns a 401 or 404 status
        return res.status(error.statusCode).json({
          success: false,
          message: error.body?.message,
          errorCode: error.statusCode,
          error: error.status,
        });
      }

      // 2. Fallback for generic database or network crashes
      return res.status(500).json({
        success: false,
        message: "An internal server error occurred.",
        error: error.message || "Unknown error",
      });
    }
  },
);

export default router;

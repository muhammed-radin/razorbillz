import express from "express";
import { db } from "../utils/db.js";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { decryptField } from "../utils/crypto/index.js";
import { buildMirrorUserFields } from "../utils/crypto/emailVault.js";

const router = express.Router();

router.get("/", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: "User ID not found in request" });
    }

    const user = await db.collection("users").findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found! - 404" });
    }

    res.json({
      ...(user.prefrences || {}),
      phone: decryptField(user.phoneNumber),
      email: decryptField(user.email),
      id: user.id,
    });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    res.status(500).json({ error: "Failed to fetch user settings" });
  }
});

router.post("/", requireAuth, passUserAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: "User ID not found in request" });
    }

    const {
      language,
      notificationEnabled,
      pushNotificationEnabled,
      emailNotificationsEnabled,
      phone,
    } = req.body;

    const user = await db.collection("users").findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const set = {
      "prefrences.language": String(
        language || user.prefrences?.language || "en",
      ).toLowerCase(),
      "prefrences.notificationEnabled":
        typeof notificationEnabled === "boolean"
          ? notificationEnabled
          : Boolean(user.prefrences?.notificationEnabled),
      "prefrences.pushNotificationEnabled":
        typeof pushNotificationEnabled === "boolean"
          ? pushNotificationEnabled
          : Boolean(user.prefrences?.pushNotificationEnabled),
      "prefrences.emailNotificationsEnabled":
        typeof emailNotificationsEnabled === "boolean"
          ? emailNotificationsEnabled
          : Boolean(user.prefrences?.emailNotificationsEnabled),
      updatedAt: new Date().toISOString(),
    };

    /* Phone lives in the vaulted mirror, not in Better Auth's user
     * fields — persist it here when the settings form includes it. */
    const unset = {};
    if (typeof phone === "string") {
      if (phone.trim()) {
        Object.assign(
          set,
          buildMirrorUserFields({ phoneNumber: phone.trim() }),
        );
      } else {
        for (const key of [
          "phoneNumber",
          "phone_idx",
          "phone_prefix",
          "phone_grams",
          "phoneNumber_idx",
          "phoneNumber_prefix",
          "phoneNumber_grams",
        ]) {
          unset[key] = "";
        }
      }
    }

    const update = { $set: set };
    if (Object.keys(unset).length) update.$unset = unset;

    const updatedUser = await db
      .collection("users")
      .updateOne({ id: userId }, update);
    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user settings:", error);
    res.status(500).json({ error: "Failed to update user settings" });
  }
});

export default router;

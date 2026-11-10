import express from "express";
import { db } from "../utils/db.js";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";

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
      phone: user.phoneNumber,
      email: user.email,
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
    } = req.body;

    const user = await db.collection("users").findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedUser = await db.collection("users").updateOne(
      { userId },
      {
        $set: {
          "prefrences.language": (
            language ||
            user.prefrences?.language ||
            "en"
          ).toLowerCase(),
          "prefrences.notificationEnabled":
            notificationEnabled ||
            user.prefrences?.notificationEnabled ||
            false,
          "prefrences.pushNotificationEnabled":
            pushNotificationEnabled ||
            user.prefrences?.pushNotificationEnabled ||
            false,
          "prefrences.emailNotificationsEnabled":
            emailNotificationsEnabled ||
            user.prefrences?.emailNotificationsEnabled ||
            false,
        },
      },
    );
    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user settings:", error);
    res.status(500).json({ error: "Failed to update user settings" });
  }
});

export default router;

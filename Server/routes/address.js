import express from "express";
import { db } from "../utils/db.js";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { evt, Evts, ErrorEvent, CommentEvent } from "../utils/events.manage.js";
import { AddressSchema } from "../models/schema/address.js";
import {
  decryptAddress,
  encryptAddress,
} from "../utils/crypto/index.js";

const router = express.Router();

const decryptAddressBook = (addressBook = []) =>
  addressBook.map(decryptAddress);

// get addressBook
router.get("/", requireAuth, passUserAuth, (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  db.collection("users")
    .findOne({ id: userId })
    .then((user) => {
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const addressBook = Array.isArray(user.addressBook)
        ? decryptAddressBook(user.addressBook)
        : [];
      let currentAddress = user.address ? decryptAddress(user.address) : null;

      if (!currentAddress && addressBook.length > 0) {
        currentAddress = addressBook[0];
        db.collection("users").updateOne(
          { id: userId },
          { $set: { address: encryptAddress(currentAddress) } },
        );
      }

      const responseAddressBook = addressBook.map((address) => {
        if (address && address.id == currentAddress?.id) {
          address.isDefault = true;
        } else {
          address.isDefault = false;
        }
        return address;
      });

      res.json(responseAddressBook);
    })
    .catch((err) => {
      console.error("Error fetching address book:", err);
      res.status(500).json({ error: "Failed to fetch address book" });
    });
});

// get current address
router.get("/current", requireAuth, passUserAuth, (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  db.collection("users")
    .findOne({ id: userId })
    .then((user) => {
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.address) {
        return res.status(404).json({ error: "Current address not set" });
      }
      res.json(decryptAddress(user.address));
    })
    .catch((err) => {
      console.error("Error fetching current address:", err);
      res.status(500).json({ error: "Failed to fetch current address" });
    });
});

// add new address
router.post("/", requireAuth, passUserAuth, (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  const { address } = req.body;
  const encryptedAddress = encryptAddress(address);

  db.collection("users")
    .findOneAndUpdate(
      { id: userId },
      {
        $push: { addressBook: encryptedAddress },
        $set: { address: encryptedAddress },
      },
      { upsert: true, returnDocument: "after" },
    )
    .then((user) => {
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        message: "Address added successfully",
        address: decryptAddress(user.address),
        addressBook: decryptAddressBook(user.addressBook),
        userId: user.id,
      });
    })
    .catch((err) => {
      console.error("Error adding address:", err);
      res.status(500).json({ error: "Failed to add address" });
    });
});

// update/set current address
router.put("/", requireAuth, passUserAuth, (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  const { address } = req.body;
  const addressId = address?.id || address?._id;

  if (!addressId) {
    return res.status(400).json({ error: "Address ID is required" });
  }

  db.collection("users")
    .findOneAndUpdate(
      { id: userId },
      { $set: { address: encryptAddress(address) } },
      { upsert: true, returnDocument: "after" },
    )
    .then((user) => {
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.status(200).json({
        message: "Current address set successfully",
        address: decryptAddress(user.address),
        userId: user.id,
      });
    })
    .catch((err) => {
      console.error("Error setting current address:", err);
      res.status(500).json({ error: "Failed to set current address" });
    });
});

// delete address
router.delete("/", requireAuth, passUserAuth, (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  const { addressId } = req.body;

  if (!addressId) {
    return res.status(400).json({ error: "Address ID is required" });
  }

  db.collection("users")
    .findOneAndUpdate(
      { id: userId },
      { $pull: { addressBook: { id: addressId } } },
      { returnDocument: "after" },
    )
    .then((user) => {
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        message: "Address deleted successfully",
        addressBook: decryptAddressBook(user.addressBook),
        userId: user.id,
      });
    })
    .catch((err) => {
      console.error("Error deleting address:", err);
      res.status(500).json({ error: "Failed to delete address" });
    });
});

// update address
router.put("/update", requireAuth, passUserAuth, (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "User ID not found in request" });
  }

  const { address } = req.body;
  const addressId = address?.id || address?._id || address?.addressId;

  if (!addressId) {
    return res.status(400).json({ error: "Address ID is required" });
  }

  db.collection("users")
    .findOneAndUpdate(
      { id: userId },
      { $set: { "addressBook.$[elem]": encryptAddress(address) } },
      { arrayFilters: [{ "elem.id": addressId }], returnDocument: "after" },
    )
    .then((user) => {
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        message: "Address updated successfully",
        addressBook: decryptAddressBook(user.addressBook),
        userId: user.id,
      });
    })
    .catch((err) => {
      console.error("Error updating address:", err);
      res.status(500).json({ error: "Failed to update address" });
    });
});

export default router;

import mongoose, { Schema } from "mongoose";
import { AddressSchema } from "./address.js";

const generateId = () =>
  CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);

export const UserSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    emailVerified: { type: Boolean, default: false },
    name: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },

    currentlyLoggedIn: { type: Boolean, default: false },
    lastLogin: { type: Date, default: null },
    addressBook: { type: [AddressSchema], default: [], required: true },
    address: { type: AddressSchema, default: null },
    phoneNumber: { type: String, default: "" },
    /* Blind-index tokens (HMAC-SHA256 over normalized PII) enabling
     * exact-match admin search on sealed values. Server-internal. */
    name_idx: { type: String, default: null },
    email_idx: { type: String, default: null },
    phone_idx: { type: String, default: null },
    /* Advanced search families (email vaulting): anchored prefix
     * tokens (membership) + trigram tokens ($all substring). */
    name_prefix: { type: [String], default: undefined },
    name_grams: { type: [String], default: undefined },
    email_prefix: { type: [String], default: undefined },
    email_grams: { type: [String], default: undefined },
    phone_prefix: { type: [String], default: undefined },
    phone_grams: { type: [String], default: undefined },
    preferences: { type: Schema.Types.Mixed, default: {} },
    providedBy: { type: String, default: "local" },

    role: { type: String, default: "user", enum: ["user", "admin", "owner"] },
    image: { type: String, default: null },
    banned: { type: Boolean, default: false },
    banExpires: { type: Date, default: null },
    banReason: { type: String, default: null },

    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    // AOV caluculated in client side, not stored in DB
    // AOV = totalSpent / totalOrders
  },
  {
    timestamps: true,
    strict: true, // Allow additional fields not defined in the schema
    collection: "users", // Specify the collection name
    id: true, // Add a virtual 'id' getter that returns the string representation of '_id'
    _id: true, // Disable the default '_id' field since we are using 'id' as the primary key
  },
);

export const UserModel = mongoose.model("UserAccount", UserSchema, "users");

export default { UserSchema, UserModel };

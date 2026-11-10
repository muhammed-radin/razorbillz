import mongoose, { Schema } from "mongoose";
import {
  blindIndex,
  gramTokens,
  isSealed,
  openString,
  prefixTokens,
  searchTokens,
  sealString,
} from "../../utils/crypto/index.js";

/* =========================================================
 * Customer care tickets. Customers see ONLY their own tickets
 * and customer/admin messages — never internal notes.
 * Every status change is audited.
 *
 * Ticket content (subject, message bodies, resolution/audit
 * notes) is SEALED at rest via envelope AES-GCM (Tier A): any
 * plaintext assigned to these fields is encrypted in the
 * pre-validate hook below; legacy plaintext rows are re-sealed
 * lazily on their next save and in bulk by
 * scripts/migrate-encryption.js. Tickets remain OPENSABLE by
 * the server (admins support customers), but the DATABASE
 * alone contains only ciphertext. For true "server cannot
 * read" E2EE messaging, volumes would use the e2ee vault
 * endpoint (see /api/e2ee) instead.
 * ========================================================= */

export const TicketStatus = Object.freeze({
  OPEN: "open",
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const TicketCategory = Object.freeze({
  ORDER: "order",
  PAYMENT: "payment",
  DELIVERY: "delivery",
  PRODUCT: "product",
  CANCELLATION: "cancellation",
  RETURN: "return",
  REFUND: "refund",
  OTHER: "other",
});

export const TicketPriority = Object.freeze({
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
});

const TicketMessageSchema = new Schema(
  {
    sender: { type: String, enum: ["user", "admin"], required: true },
    senderId: { type: String, default: null, trim: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false, id: false },
);

const TicketAuditSchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    actorId: { type: String, default: null, trim: true },
    note: { type: String, default: null, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false, id: false },
);

export const SupportTicketSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: { type: String, required: true, index: true, trim: true },
    /* STORED sealed (envelope) values; plaintext bounds are enforced in
     * routes/support.js BEFORE sealing (5–150 chars). The envelope adds
     * deterministic overhead (~200 chars), so the stored cap is larger. */
    subject: { type: String, required: true, trim: true, maxlength: 512 },
    /* Blind index (HMAC-SHA256 token) over the subject's normalized
     * plaintext — enables admin exact-match search on sealed subjects.
     * Never returned off the server (routes decrypt without it). */
    subject_idx: { type: String, default: null, index: true },
    subject_prefix: { type: [String], default: undefined },
    subject_grams: { type: [String], default: undefined },
    category: {
      type: String,
      enum: Object.values(TicketCategory),
      default: TicketCategory.OTHER,
      index: true,
    },
    orderId: { type: String, default: null, trim: true, index: true },
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.OPEN,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(TicketPriority),
      default: TicketPriority.NORMAL,
      index: true,
    },
    messages: { type: [TicketMessageSchema], default: [] },
    assignedAdmin: { type: String, default: null, trim: true, index: true },
    resolutionNote: { type: String, default: null, trim: true },
    audit: { type: [TicketAuditSchema], default: [] },
  },
  { timestamps: true },
);

SupportTicketSchema.index({ userId: 1, createdAt: -1 });
SupportTicketSchema.index({ status: 1, createdAt: -1 });
SupportTicketSchema.index({ category: 1, status: 1 });

/* =========================================================
 * AT-REST SEALING (Tier A) — subject / message bodies /
 * resolution notes / audit notes, plus a blind index for the
 * subject so admin exact-match search works on ciphertext
 * (MongoDB QE is unavailable on this deployment).
 * ========================================================= */

const SUPPORT_FIELDS = {
  subject: "support:subject",
  resolutionNote: "support:note",
};

function sealSupportDoc(ticket) {
  try {
    // Subject: index the plaintext token, then seal.
    if (
      typeof ticket.subject === "string" &&
      ticket.subject &&
      !isSealed(ticket.subject)
    ) {
      try {
        ticket.subject_idx = blindIndex(ticket.subject, "subject");
        ticket.subject_prefix = prefixTokens(ticket.subject, "subject");
        ticket.subject_grams = gramTokens(ticket.subject, "subject");
      } catch {
        ticket.subject_idx = null; // missing master keys — search degrades gracefully
      }
      ticket.subject = sealString(ticket.subject, {
        context: SUPPORT_FIELDS.subject,
      });
    }
    // Resolution note.
    if (
      typeof ticket.resolutionNote === "string" &&
      ticket.resolutionNote &&
      !isSealed(ticket.resolutionNote)
    ) {
      ticket.resolutionNote = sealString(ticket.resolutionNote, {
        context: SUPPORT_FIELDS.resolutionNote,
      });
    }
    // Message bodies.
    for (const msg of ticket.messages ?? []) {
      if (
        typeof msg.body === "string" &&
        msg.body &&
        !isSealed(msg.body)
      ) {
        msg.body = sealString(msg.body, { context: "support:body" });
      }
    }
    // Audit notes (mirror resolution notes; seal them too).
    for (const audit of ticket.audit ?? []) {
      if (
        typeof audit.note === "string" &&
        audit.note &&
        !isSealed(audit.note)
      ) {
        audit.note = sealString(audit.note, { context: "support:audit" });
      }
    }
  } catch (err) {
    // Sealing must never be silently skipped.
    throw err;
  }
  return ticket;
}

SupportTicketSchema.pre("validate", async function () {
  sealSupportDoc(this);
});

/* Open ticket content for a response. Tolerant of legacy plaintext
 * rows (non-envelope values pass through). Internal `_idx` tokens
 * never leave the server. */
export function decryptSupportTicket(ticket) {
  const plain = ticket?.toObject ? ticket.toObject() : ticket;
  if (!plain) return plain;
  const out = {
    ...plain,
    subject: plain.subject
      ? openStringSafe(plain.subject, SUPPORT_FIELDS.subject)
      : plain.subject,
    resolutionNote: plain.resolutionNote
      ? openStringSafe(plain.resolutionNote, SUPPORT_FIELDS.resolutionNote)
      : plain.resolutionNote,
  };
  for (const k of ["subject_idx", "subject_prefix", "subject_grams"]) {
    delete out[k]; // server-internal search tokens never leave the server
  }
  out.messages = (plain.messages ?? []).map((m) => ({
    ...m,
    body: m.body ? openStringSafe(m.body, "support:body") : m.body,
  }));
  out.audit = (plain.audit ?? []).map((a) => ({
    ...a,
    note: a.note ? openStringSafe(a.note, "support:audit") : a.note,
  }));
  return out;
}

function openStringSafe(sealed, context) {
  if (typeof sealed !== "string") return sealed;
  try {
    if (isSealed(sealed)) return openString(sealed, { context }) ?? sealed;
    return sealed; // legacy plaintext / legacy CryptoJS
  } catch (err) {
    console.warn(
      "[support] decrypt failed (tampered or context-mismatched envelope):",
      err?.message,
    );
    return sealed;
  }
}

/* Blind-index token for admin subject search (exact match). */
export function supportSubjectIdx(subject) {
  return blindIndex(subject, "subject");
}

/* Full search-token bundle for admin subject search:
 * exact eq + anchored prefix + trigrams ($all substring). */
export function supportSubjectSearchTokens(subject) {
  return searchTokens(subject, "subject");
}

export const SupportTicketModel = mongoose.model(
  "SupportTicket",
  SupportTicketSchema,
  "support_tickets",
);

export default {
  SupportTicketSchema,
  SupportTicketModel,
  TicketStatus,
  TicketCategory,
  TicketPriority,
};

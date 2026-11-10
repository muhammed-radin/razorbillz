import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  passUserAuth,
  requireAuth,
} from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import {
  SupportTicketModel,
  TicketStatus,
  TicketCategory,
  TicketPriority,
  decryptSupportTicket,
  supportSubjectSearchTokens,
} from "../models/schema/support.js";
import { OrderModel } from "../models/schema/order.js";
import { evt, Evts } from "../utils/events.manage.js";
import { Errors } from "../utils/httpError.js";
import { ah } from "../utils/middlewares/errorHandler.js";

const router = express.Router();

/* Spam guard: max 10 tickets/hour per account (IP-fallback is
 * IPv6-safe via ipKeyGenerator). */
const ticketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req),
  message: { error: "Too many tickets. Please try again later." },
});

/* Spam guard: max 30 messages/hour per account. */
const messageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req),
  message: { error: "Too many messages. Please try again later." },
});

function newTicketId() {
  return (
    `TKT-${Date.now().toString(36).toUpperCase()}-` +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

function safeEvent(name, payload) {
  try {
    evt.fire(name, payload);
  } catch (err) {
    console.error(`analytics event ${name} failed:`, err?.message);
  }
}

function validateMessage(body) {
  const text = String(body ?? "").trim();
  if (text.length < 10) {
    throw Errors.validation("Message must be at least 10 characters.");
  }
  if (text.length > 2000) {
    throw Errors.validation("Message must be under 2000 characters.");
  }
  return text;
}

async function assertOwnedOrder(orderId, userId) {
  const order = await OrderModel.findOne({ id: orderId });
  if (!order) throw Errors.validation("Linked order does not exist.");
  if (order.userId !== userId) {
    throw Errors.forbidden("You can only link your own orders.");
  }
  return order;
}

const isStaff = (req) =>
  req.user?.role === "admin" || req.user?.role === "owner";

async function loadTicketOrThrow(id, req) {
  const ticket = await SupportTicketModel.findOne({ id });
  if (!ticket) throw Errors.notFound("Ticket not found.");
  if (!isStaff(req) && ticket.userId !== req.user?.id) {
    throw Errors.forbidden("Access denied.");
  }
  return ticket;
}

/* Customer-visible shape: strips audit trail (internal).
 * Ticket content is sealed at rest — decrypt for display. */
function publicTicket(t) {
  const o = decryptSupportTicket(t);
  delete o.audit;
  return o;
}

const VALID_TRANSITIONS = {
  [TicketStatus.OPEN]: [TicketStatus.PENDING, TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.PENDING]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.OPEN],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.PENDING, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED]: [TicketStatus.OPEN, TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

/* =========================================================
 * POST /support — create ticket (customer)
 * ========================================================= */
router.post(
  "/",
  requireAuth,
  passUserAuth,
  ticketLimiter,
  ah(async (req, res) => {
    const { subject, category, message, orderId } = req.body ?? {};
    const cleanSubject = String(subject ?? "").trim();
    if (cleanSubject.length < 5 || cleanSubject.length > 150) {
      throw Errors.validation("Subject must be 5–150 characters.");
    }
    if (!Object.values(TicketCategory).includes(category)) {
      throw Errors.validation(
        `Category must be one of: ${Object.values(TicketCategory).join(", ")}.`,
      );
    }
    const text = validateMessage(message);
    if (orderId) await assertOwnedOrder(String(orderId), req.user.id);

    const ticket = await SupportTicketModel.create({
      id: newTicketId(),
      userId: req.user.id,
      subject: cleanSubject,
      category,
      orderId: orderId ? String(orderId) : null,
      status: TicketStatus.OPEN,
      messages: [{ sender: "user", senderId: req.user.id, body: text }],
      audit: [{ action: "created", actorId: req.user.id }],
    });
    safeEvent(Evts.TICKET_CREATED, {
      ticketId: ticket.id,
      userId: ticket.userId,
      category,
      orderId: ticket.orderId,
    });
    return res.status(201).json({ success: true, ticket: publicTicket(ticket) });
  }),
);

/* GET /support/mine — customer's own tickets (paginated). */
router.get(
  "/mine",
  requireAuth,
  passUserAuth,
  ah(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const [tickets, total] = await Promise.all([
      SupportTicketModel.find({ userId: req.user.id })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicketModel.countDocuments({ userId: req.user.id }),
    ]);
    return res.json({
      success: true,
      tickets: tickets.map(({ audit, ...rest }) => rest),
      total,
    });
  }),
);

/* GET /support/:id — owner or admin. */
router.get(
  "/:id",
  requireAuth,
  passUserAuth,
  ah(async (req, res) => {
    const ticket = await loadTicketOrThrow(req.params.id, req);
    if (isStaff(req))
      return res.json({ success: true, ticket: decryptSupportTicket(ticket) });
    return res.json({ success: true, ticket: publicTicket(ticket) });
  }),
);

/* POST /support/:id/messages — follow-up (reopens resolved). */
router.post(
  "/:id/messages",
  requireAuth,
  passUserAuth,
  messageLimiter,
  ah(async (req, res) => {
    const ticket = await loadTicketOrThrow(req.params.id, req);
    if (ticket.status === TicketStatus.CLOSED && !isStaff(req)) {
      throw Errors.validation("Closed tickets cannot receive new messages.");
    }
    const text = validateMessage(req.body?.message);
    const sender = isStaff(req) ? "admin" : "user";
    ticket.messages.push({
      sender,
      senderId: req.user?.id ?? null,
      body: text,
    });
    let reopened = false;
    if (ticket.status === TicketStatus.RESOLVED && sender === "user") {
      ticket.status = TicketStatus.OPEN;
      reopened = true;
      ticket.audit.push({ action: "reopened", actorId: req.user?.id });
    }
    await ticket.save();
    safeEvent(reopened ? Evts.TICKET_REOPENED : Evts.TICKET_REPLIED, {
      ticketId: ticket.id,
      userId: ticket.userId,
      orderId: ticket.orderId,
      sender,
    });
    const open = isStaff(req)
      ? decryptSupportTicket(ticket)
      : publicTicket(ticket);
    return res.json({ success: true, ticket: open });
  }),
);

/* =========================================================
 * Admin: list / reply / status / assign / priority
 * ========================================================= */
router.get(
  "/",
  requireAuth,
  requireAdmin,
  requirePermission({ support: ["view"] }),
  ah(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const q = {};
    for (const key of ["status", "category", "priority", "assignedAdmin"]) {
      if (req.query[key]) q[key] = req.query[key];
    }
    if (req.query.orderId) q.orderId = req.query.orderId;
    if (req.query.search) {
      // Subject content is sealed at rest; admin search goes through
      // blind-index families: exact token, anchored prefix token, and
      // trigram $all for substring — over ciphertext only.
      let tokens = null;
      try {
        tokens = supportSubjectSearchTokens(String(req.query.search));
      } catch {
        tokens = null;
      }
      q.$or = [
        { id: { $regex: String(req.query.search), $options: "i" } },
        ...(tokens?.eq ? [{ subject_idx: tokens.eq }] : []),
        ...(tokens?.prefix ? [{ subject_prefix: tokens.prefix }] : []),
        ...(tokens?.grams?.length
          ? [{ subject_grams: { $all: tokens.grams } }]
          : []),
      ];
    }
    const [tickets, total, counts] = await Promise.all([
      SupportTicketModel.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      SupportTicketModel.countDocuments(q),
      SupportTicketModel.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    return res.json({
      success: true,
      tickets: tickets.map(decryptSupportTicket),
      total,
      byStatus: Object.fromEntries(counts.map((c) => [c._id, c.count])),
    });
  }),
);

router.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  requirePermission({ support: ["close"] }),
  ah(async (req, res) => {
    const ticket = await loadTicketOrThrow(req.params.id, req);
    const next = req.body?.status;
    if (!Object.values(TicketStatus).includes(next)) {
      throw Errors.validation("Invalid status.");
    }
    if (!(VALID_TRANSITIONS[ticket.status] ?? []).includes(next)) {
      throw Errors.validation(
        `Cannot move ticket from ${ticket.status} to ${next}.`,
      );
    }
    ticket.status = next;
    if (next === TicketStatus.RESOLVED || next === TicketStatus.CLOSED) {
      ticket.resolutionNote = String(req.body?.note ?? "").slice(0, 1000) || null;
    }
    ticket.audit.push({
      action: `status:${next}`,
      actorId: req.user?.id,
      note: ticket.resolutionNote,
    });
    await ticket.save();
    safeEvent(
      next === TicketStatus.RESOLVED
        ? Evts.TICKET_RESOLVED
        : next === TicketStatus.CLOSED
          ? Evts.TICKET_CLOSED
          : Evts.TICKET_REPLIED,
      { ticketId: ticket.id, userId: ticket.userId, status: next },
    );
    return res.json({ success: true, ticket: decryptSupportTicket(ticket) });
  }),
);

router.patch(
  "/:id/assign",
  requireAuth,
  requireAdmin,
  requirePermission({ support: ["assign"] }),
  ah(async (req, res) => {
    const ticket = await loadTicketOrThrow(req.params.id, req);
    ticket.assignedAdmin = req.body?.adminId ? String(req.body.adminId) : null;
    ticket.audit.push({
      action: "assigned",
      actorId: req.user?.id,
      note: ticket.assignedAdmin,
    });
    await ticket.save();
    return res.json({ success: true, ticket: decryptSupportTicket(ticket) });
  }),
);

router.patch(
  "/:id/priority",
  requireAuth,
  requireAdmin,
  requirePermission({ support: ["update"] }),
  ah(async (req, res) => {
    const ticket = await loadTicketOrThrow(req.params.id, req);
    if (!Object.values(TicketPriority).includes(req.body?.priority)) {
      throw Errors.validation("Invalid priority.");
    }
    ticket.priority = req.body.priority;
    ticket.audit.push({ action: `priority:${ticket.priority}`, actorId: req.user?.id });
    await ticket.save();
    return res.json({ success: true, ticket: decryptSupportTicket(ticket) });
  }),
);

export default router;

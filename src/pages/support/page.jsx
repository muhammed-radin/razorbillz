import React, { useState } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StoreMeta } from "@/components/store-meta";
import { useStoreInfo } from "@/utils/store";
import {
  LifeBuoy,
  Plus,
  Send,
  Loader2,
  Inbox,
  ChevronRight,
  CircleAlert,
  Headset,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supportApi } from "@/services/shop";
import { useOrderStore } from "@/stores/shop";
import { friendlyError } from "@/utils/apiError";

const CATEGORIES = [
  { id: "order", label: "Order problem" },
  { id: "payment", label: "Payment issue" },
  { id: "delivery", label: "Delivery / shipping" },
  { id: "product", label: "Product question" },
  { id: "cancellation", label: "Cancellation" },
  { id: "return", label: "Return" },
  { id: "refund", label: "Refund" },
  { id: "other", label: "Other" },
];

const STATUS_STYLE = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  in_progress: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  resolved: "bg-green-500/10 text-green-700 dark:text-green-400",
  closed: "bg-muted text-muted-foreground",
};

export default function SupportPage() {
  const store = useStoreInfo();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [sending, setSending] = useState(false);
  const orders = useOrderStore((s) => s.orders);
  const fetchUserOrders = useOrderStore((s) => s.fetchUserOrders);

  const [form, setForm] = useState({
    subject: "",
    category: "order",
    orderId: "",
    message: "",
  });
  const [creating, setCreating] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await supportApi.mine({ limit: 50 });
      setTickets(res.tickets ?? []);
    } catch (err) {
      toast.error(friendlyError(err, "Could not load tickets."));
    } finally {
      setLoading(false);
    }
  };

  useStrictEffect(() => {
    fetchTickets().catch(() => {});
    fetchUserOrders().catch(() => {});
  }, [fetchUserOrders]);

  const openTicket = async (t) => {
    setSelected(t);
    setDetailLoading(true);
    try {
      const res = await supportApi.get(t.id);
      setDetail(res.ticket);
    } catch (err) {
      toast.error(friendlyError(err, "Could not open ticket."));
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const createTicket = async () => {
    if (form.subject.trim().length < 5) {
      toast.error("Subject must be at least 5 characters.");
      return;
    }
    if (form.message.trim().length < 10) {
      toast.error("Message must be at least 10 characters.");
      return;
    }
    setCreating(true);
    try {
      const res = await supportApi.create({
        subject: form.subject.trim(),
        category: form.category,
        orderId: form.orderId || undefined,
        message: form.message.trim(),
      });
      toast.success(`Ticket ${res.ticket.id} created.`);
      setForm({ subject: "", category: "order", orderId: "", message: "" });
      setDialogOpen(false);
      await fetchTickets();
    } catch (err) {
      toast.error(friendlyError(err, "Could not create ticket."));
    } finally {
      setCreating(false);
    }
  };

  const sendFollowUp = async () => {
    if (followUp.trim().length < 10) {
      toast.error("Message must be at least 10 characters.");
      return;
    }
    setSending(true);
    try {
      const res = await supportApi.message(selected.id, followUp.trim());
      setDetail(res.ticket);
      setFollowUp("");
      await fetchTickets();
      toast.success("Message sent.");
    } catch (err) {
      toast.error(friendlyError(err, "Could not send message."));
    } finally {
      setSending(false);
    }
  };

  const canFollowUp = detail && detail.status !== "closed";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <StoreMeta
        title="Customer Care"
        description={`Get help with orders, payments, delivery, returns and refunds. Raise a support ticket and track responses from the ${store.name} care team.`}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Customer Care
            </h1>
            <p className="text-sm text-muted-foreground">
              Tickets about orders, payments, delivery, returns & refunds.
            </p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              New ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Raise a support ticket</DialogTitle>
              <DialogDescription>
                Our team replies here — watch this page for responses.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="e.g. Payment captured but no order created"
                  maxLength={150}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Related order (optional)</Label>
                  <Select
                    value={form.orderId || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, orderId: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No order</SelectItem>
                      {(orders ?? []).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.id} · ₹{Number(o.totalAmount ?? 0).toFixed(0)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Describe the issue with order/payment/delivery details…"
                  rows={5}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground">
                  {form.message.length}/2000
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createTicket} disabled={creating} className="w-full sm:w-auto">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit ticket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        {/* Ticket list */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/40 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4" />
              My tickets ({tickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2].map((k) => (
                  <Skeleton key={k} className="h-16 w-full" />
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No tickets yet — raise one and we&apos;ll respond here.
              </p>
            ) : (
              <ul className="max-h-[480px] space-y-1 overflow-auto">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => openTicket(t)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg p-3 text-left text-sm transition hover:bg-muted",
                        selected?.id === t.id && "bg-muted",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {t.subject}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{t.id}</span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", STATUS_STYLE[t.status])}
                          >
                            {t.status?.replace("_", " ")}
                          </Badge>
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Conversation */}
        <Card className="min-h-[320px]">
          {!selected ? (
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Headset className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Select a ticket to view its conversation.
              </p>
            </CardContent>
          ) : detailLoading ? (
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          ) : detail ? (
            <>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{detail.subject}</CardTitle>
                  <Badge variant="outline" className={cn(STATUS_STYLE[detail.status])}>
                    {detail.status?.replace("_", " ")}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">
                  {detail.id}
                  {detail.orderId ? ` · order ${detail.orderId}` : ""} ·{" "}
                  {detail.category}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4 sm:p-6">
                <ul className="max-h-[380px] space-y-3 overflow-auto pr-1">
                  {(detail.messages ?? []).map((m, i) => (
                    <li
                      key={i}
                      className={cn(
                        "max-w-[85%] rounded-xl p-3 text-sm",
                        m.sender === "admin"
                          ? "bg-primary/10"
                          : "ml-auto bg-muted",
                      )}
                    >
                      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                        {m.sender === "admin" ? `${store.name} Care` : "You"} ·{" "}
                        {m.createdAt
                          ? new Date(m.createdAt).toLocaleString()
                          : ""}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </li>
                  ))}
                </ul>
                <Separator />
                {canFollowUp ? (
                  <div className="flex gap-2">
                    <Textarea
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                      placeholder={
                        detail.status === "resolved"
                          ? "Replies reopen a resolved ticket…"
                          : "Write a follow-up…"
                      }
                      rows={2}
                      maxLength={2000}
                      className="flex-1"
                    />
                    <Button onClick={sendFollowUp} disabled={sending} size="icon" className="shrink-0" aria-label="Send follow-up">
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CircleAlert className="h-3.5 w-3.5" />
                    This ticket is closed. Raise a new ticket for further help.
                  </p>
                )}
              </CardContent>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LifeBuoy, Send, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supportApi } from "@/services/shop";
import { friendlyError } from "@/utils/apiError";

const STATUSES = ["open", "pending", "in_progress", "resolved", "closed"];

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [byStatus, setByStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "all", search: "" });
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [acting, setActing] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (filters.status !== "all") params.status = filters.status;
      if (filters.search.trim()) params.search = filters.search.trim();
      const res = await supportApi.list(params);
      setTickets(res.tickets ?? []);
      setTotal(res.total ?? 0);
      setByStatus(res.byStatus ?? {});
    } catch (err) {
      toast.error(friendlyError(err, "Could not load tickets."));
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.search]);

  useEffect(() => {
    const t = setTimeout(() => fetchTickets().catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [fetchTickets]);

  const sendReply = async () => {
    if (reply.trim().length < 2) {
      toast.error("Reply must be at least 2 characters.");
      return;
    }
    setActing(true);
    try {
      const res = await supportApi.reply(selected.id, reply.trim());
      setSelected(res.ticket);
      setReply("");
      await fetchTickets();
      toast.success("Reply sent.");
    } catch (err) {
      toast.error(friendlyError(err, "Could not send reply."));
    } finally {
      setActing(false);
    }
  };

  const changeStatus = async (status) => {
    setActing(true);
    try {
      const res = await supportApi.setStatus(selected.id, status);
      setSelected(res.ticket);
      await fetchTickets();
      toast.success(`Ticket ${status.replace("_", " ")}.`);
    } catch (err) {
      toast.error(friendlyError(err, "Status change failed."));
    } finally {
      setActing(false);
    }
  };

  const openCount =
    (byStatus.open ?? 0) + (byStatus.pending ?? 0) + (byStatus.in_progress ?? 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Customer Care
            </h1>
            <p className="text-sm text-muted-foreground">
              {openCount} awaiting action · {byStatus.resolved ?? 0} resolved ·{" "}
              {total} total
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              placeholder="Search id / subject…"
              className="w-56 pl-9"
            />
          </div>
          <Select
            value={filters.status}
            onValueChange={(v) => setFilters({ ...filters, status: v })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((k) => (
                <Skeleton key={k} className="h-14 w-full" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No tickets match these filters.
            </p>
          ) : (
            <ul className="divide-y">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelected(t)}
                    className="flex w-full flex-wrap items-center gap-2 py-3 text-left text-sm hover:bg-muted/50 sm:gap-4"
                  >
                    <span className="font-mono font-semibold">{t.id}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {t.subject}
                    </span>
                    <Badge variant="outline">{t.category}</Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        t.status === "open" && "border-blue-500/40 text-blue-600",
                        t.status === "resolved" && "border-green-500/40 text-green-600",
                      )}
                    >
                      {t.status?.replace("_", " ")}
                    </Badge>
                    <span className="hidden text-xs text-muted-foreground md:inline">
                      {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-base">
                  {selected.id} · {selected.subject}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Customer {selected.userId}
                  {selected.orderId ? ` · order ${selected.orderId}` : ""} ·{" "}
                  {selected.category} · priority {selected.priority}
                  {selected.assignedAdmin
                    ? ` · assigned ${selected.assignedAdmin}`
                    : ""}
                </p>
              </DialogHeader>
              <ul className="max-h-[300px] space-y-2 overflow-auto py-2">
                {(selected.messages ?? []).map((m, i) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded-lg p-3 text-sm",
                      m.sender === "admin" ? "bg-primary/10" : "bg-muted",
                    )}
                  >
                    <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                      {m.sender === "admin" ? "Support (you)" : "Customer"} ·{" "}
                      {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </li>
                ))}
              </ul>
              <Separator />
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply as support…"
                    rows={2}
                    maxLength={2000}
                    className="flex-1"
                  />
                  <Button onClick={sendReply} disabled={acting} size="icon" className="shrink-0" aria-label="Send reply">
                    {acting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs">Status</Label>
                  {STATUSES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={selected.status === s ? "default" : "outline"}
                      disabled={acting}
                      onClick={() => changeStatus(s)}
                    >
                      {s.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

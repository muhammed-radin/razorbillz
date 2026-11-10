import { useState } from "react";
import { toast } from "sonner";
import { Truck, RefreshCw, DollarSign, PackageX, PackageCheck, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ordersApi, paymentsApi, shipmentsApi } from "@/services/shop";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";

const inr = (n) => `₹${Number(n ?? 0).toFixed(2)}`;

function OrderRow({ order, actions }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="font-mono font-semibold text-primary text-sm">{order.id ?? order._id}</p>
        <p className="text-xs text-muted-foreground">
          {(order.products ?? []).length} item(s) · {order.payment?.method} ({order.payment?.status})
          {order.payment?.codStatus ? ` · COD ${order.payment.codStatus}` : ""} ·{" "}
          {order.fulfillment?.status}
          {order.fulfillment?.awb ? ` · AWB ${order.fulfillment.awb}` : ""}
        </p>
      </div>
      <p className="font-bold">{inr(order.totalAmount)}</p>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const [tab, setTab] = useState("pending");
  const [queues, setQueues] = useState({ pending: [], processing: [], returns: [], refunds: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useStrictEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      // Load every queue in one pass so the KPI counts are always real.
      const results = await Promise.allSettled([
        ordersApi.pending(),
        ordersApi.processing(),
        ordersApi.returns(),
        ordersApi.refunds(),
      ]);
      const pick = (r) => {
        if (r.status !== "fulfilled") return [];
        const data = r.value;
        const list = data?.orders ?? (Array.isArray(data) ? data : []);
        return Array.isArray(list) ? list : [];
      };
      setQueues({
        pending: pick(results[0]),
        processing: pick(results[1]),
        returns: pick(results[2]),
        refunds: pick(results[3]),
      });
      if (results.every((r) => r.status === "rejected")) {
        const err = results[0].reason;
        setLoadError(
          err?.response?.status === 403
            ? "Admin access required to view payments."
            : "Could not load payment queues. Check the connection and retry.",
        );
      }
    } catch (error) {
      console.error("Error loading payment queues:", error);
      setLoadError("Could not load payment queues. Check the connection and retry.");
    } finally {
      setIsLoading(false);
    }
  };

  const run = async (id, label, fn) => {
    if (busyId) return;
    try {
      setBusyId(id + label);
      await fn();
      toast.success(label);
      await load();
    } catch (error) {
      console.error(label, error);
      toast.error(error?.response?.data?.error ?? `Failed: ${label}`);
    } finally {
      setBusyId(null);
    }
  };

  const collectCod = (o) => run(o.id, "COD collected", () => paymentsApi.collectCod(o.id, o.totalAmount));
  const createShipment = (o) => run(o.id, "Shipment creation requested", () => shipmentsApi.create(o.id, {}));
  const trackShipment = async (o) => {
    try {
      setBusyId(o.id + "track");
      const resp = await shipmentsApi.track(o.id);
      if (resp?.trackingUrl) window.open(resp.trackingUrl, "_blank", "noopener,noreferrer");
      else toast.success(resp?.awb ? `Tracking synced: ${resp.awb}` : "Tracking synced");
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error ?? "Tracking sync failed");
    } finally {
      setBusyId(null);
    }
  };
  const approveReturn = (o) => run(o.id, "Return approved", () => ordersApi.approveReturn(o.id));
  const completeRefund = (o) =>
    run(o.id, "Refund completed", () => ordersApi.completeRefund(o.id));

  const orders = queues[tab] ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="h-14 w-14 sm:h-16 sm:w-16 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-base sm:text-lg font-semibold text-foreground">Loading Payments &amp; Shipping</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Please wait while we fetch the data...</p>
        </div>
      </div>
    );
  }

  const kpis = [
    {
      key: "pending",
      title: "Pending payment",
      icon: PackageX,
      tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      key: "processing",
      title: "Processing",
      icon: PackageCheck,
      tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      key: "returns",
      title: "Returns",
      icon: Undo2,
      tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      key: "refunds",
      title: "Refunds",
      icon: Wallet,
      tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="container mx-auto p-0 space-y-4 sm:space-y-6 max-w-6xl">
        {loadError && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span className="flex-1 text-destructive">{loadError}</span>
            <Button onClick={() => load()} variant="outline" size="sm">Retry</Button>
          </div>
        )}
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Payments &amp; Shipping</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              COD collection, refunds, returns &amp; shipments
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => load()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>

        {/* KPI cards — click to jump into a queue */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <button key={k.key} type="button" onClick={() => setTab(k.key)} className="text-left">
                <Card
                  className={
                    tab === k.key
                      ? "cursor-pointer ring-1 ring-primary/40 hover:shadow-md transition-shadow"
                      : "cursor-pointer hover:shadow-md transition-shadow"
                  }
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${k.tile}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">{k.title}</p>
                        <p className="text-lg sm:text-2xl font-bold tabular-nums">{queues[k.key].length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-muted/50 gap-1">
            <TabsTrigger value="pending" className="py-2 text-xs sm:text-sm">
              <PackageX className="h-3.5 w-3.5 mr-1 hidden sm:inline" /> Pending
            </TabsTrigger>
            <TabsTrigger value="processing" className="py-2 text-xs sm:text-sm">
              <PackageCheck className="h-3.5 w-3.5 mr-1 hidden sm:inline" /> Processing
            </TabsTrigger>
            <TabsTrigger value="returns" className="py-2 text-xs sm:text-sm">
              <Undo2 className="h-3.5 w-3.5 mr-1 hidden sm:inline" /> Returns
            </TabsTrigger>
            <TabsTrigger value="refunds" className="py-2 text-xs sm:text-sm">
              <Wallet className="h-3.5 w-3.5 mr-1 hidden sm:inline" /> Refunds
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">{tab} queue</CardTitle>
                <CardDescription>{orders.length} order(s) awaiting action</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {orders.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <Truck className="h-8 w-8 mx-auto mb-2" />
                    <p className="font-medium">Queue is empty</p>
                    <p className="text-sm">No {tab} orders right now — a good sign.</p>
                  </div>
                ) : (
                  orders.map((o) => {
                    const id = o.id ?? o._id;
                    const busy = busyId?.startsWith(id);
                    const isCod = o.payment?.method === "cod";
                    return (
                      <OrderRow
                        key={id}
                        order={o}
                        actions={
                          <>
                            {isCod && o.payment?.codStatus === "pending_collection" && (
                              <Button size="sm" disabled={busy} onClick={() => collectCod(o)}>
                                <DollarSign className="h-3.5 w-3.5 mr-1" /> Collect COD
                              </Button>
                            )}
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => createShipment(o)}>
                              <Truck className="h-3.5 w-3.5 mr-1" /> Create Shipment
                            </Button>
                            {o.fulfillment?.awb && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => trackShipment(o)}>
                                Track
                              </Button>
                            )}
                            {tab === "returns" && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => approveReturn(o)}>
                                Approve Return
                              </Button>
                            )}
                            {tab === "refunds" && (
                              <Button size="sm" disabled={busy} onClick={() => completeRefund(o)}>
                                Complete Refund
                              </Button>
                            )}
                            <Badge variant="outline" className="capitalize">{o.status}</Badge>
                          </>
                        }
                      />
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

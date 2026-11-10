import { useState } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { BarChart3, Calendar, RefreshCw, DollarSign, TrendingUp, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { analyticsApi } from "@/services/shop";

const chartConfig = {
  revenue: { label: "Revenue", color: "#8b5cf6" },
  orders: { label: "Orders", color: "#22c55e" },
};

const inr = (n) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminAnalyticsPage() {
  const [granularity, setGranularity] = useState("day");
  const [summary, setSummary] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useStrictEffect(() => {
    load(granularity);
  }, []);

  const load = async (gran = granularity) => {
    try {
      setIsLoading(true);
      setError(null);
      const [s, g, e] = await Promise.allSettled([
        analyticsApi.ordersSummary({ granularity: gran }),
        analyticsApi.global(),
        analyticsApi.events({ limit: 20 }),
      ]);
      if (s.status === "fulfilled") setSummary(s.value);
      if (g.status === "fulfilled") setGlobalStats(g.value);
      if (e.status === "fulfilled") {
        const list = Array.isArray(e.value) ? e.value : (e.value?.events ?? []);
        setEvents(Array.isArray(list) ? list : []);
      }
      if (s.status === "rejected") throw s.reason;
    } catch (err) {
      console.error("Error loading analytics:", err);
      setError(
        err?.response?.status === 403
          ? "Admin access required to view analytics."
          : err?.response?.status === 404
            ? "No analytics recorded yet."
            : "Could not load analytics. Check the connection and retry.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const changeGranularity = (g) => {
    setGranularity(g);
    load(g);
  };

  const series = (summary?.series ?? []).map((b) => ({
    bucket: new Date(b.bucket).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    revenue: b.revenue,
    orders: b.orders,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="h-14 w-14 sm:h-16 sm:w-16 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-base sm:text-lg font-semibold text-foreground">Loading Analytics</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Please wait while we fetch the data...</p>
        </div>
      </div>
    );
  }

  const kpis = [
    {
      title: "Orders",
      value: String(summary?.totals?.orders ?? 0),
      icon: BarChart3,
      tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      title: "Paid orders",
      value: String(summary?.payments?.paidOrders ?? 0),
      icon: DollarSign,
      tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Revenue",
      value: inr(summary?.payments?.revenue),
      hint: "verified paid only",
      icon: TrendingUp,
      tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      title: "Avg. order value",
      value: summary?.payments?.aov != null ? inr(summary.payments.aov) : "—",
      icon: ShoppingBag,
      tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="container mx-auto p-0 space-y-4 sm:space-y-6 max-w-6xl">
        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span className="flex-1 text-destructive">{error}</span>
            <Button onClick={() => load()} variant="outline" size="sm">Retry</Button>
          </div>
        )}
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Database-backed commerce &amp; traffic metrics
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["day", "week", "month"]).map((g) => (
              <Button
                key={g}
                variant={granularity === g ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs capitalize"
                onClick={() => changeGranularity(g)}
              >
                <Calendar className="h-3.5 w-3.5 mr-1" />{g}
              </Button>
            ))}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => load()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <Card key={k.title}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${k.tile}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{k.title}</p>
                      <p className="text-lg sm:text-2xl font-bold tabular-nums truncate">{k.value}</p>
                    </div>
                  </div>
                  {k.hint && <p className="text-[11px] text-muted-foreground mt-2">{k.hint}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Revenue & Orders Trend</CardTitle>
              <CardDescription>Verified-paid revenue per {granularity}</CardDescription>
            </CardHeader>
            <CardContent>
              {series.length ? (
                <ChartContainer config={chartConfig} className="h-[280px] w-full">
                  <AreaChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="aRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" fill="url(#aRevenue)" strokeWidth={2} />
                    <Area type="monotone" dataKey="orders" stroke="#22c55e" fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-10 text-center">No series data for this range.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Breakdown</CardTitle>
              <CardDescription>Status, payments, shipments, COD</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-semibold mb-2">By status</p>
                <div className="flex flex-wrap gap-2">
                  {summary && Object.keys(summary.byStatus ?? {}).length
                    ? Object.entries(summary.byStatus).map(([s, c]) => (
                        <Badge key={s} variant="secondary" className="capitalize">{s}: {c}</Badge>
                      ))
                    : <span className="text-muted-foreground">No data</span>}
                </div>
              </div>
              <div>
                <p className="font-semibold mb-2">By payment</p>
                <div className="flex flex-wrap gap-2">
                  {summary?.byPaymentMethod?.length
                    ? summary.byPaymentMethod.map((p, i) => (
                        <Badge key={i} variant="outline">{p.method}/{p.status}: {p.count}</Badge>
                      ))
                    : <span className="text-muted-foreground">No data</span>}
                </div>
              </div>
              <div>
                <p className="font-semibold mb-2">Shipments</p>
                <div className="flex flex-wrap gap-2">
                  {summary && Object.keys(summary.shipments ?? {}).length
                    ? Object.entries(summary.shipments).map(([s, c]) => (
                        <Badge key={s} variant="secondary" className="capitalize">{s}: {c}</Badge>
                      ))
                    : <span className="text-muted-foreground">No data</span>}
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="font-semibold">COD</p>
                <p className="text-muted-foreground">
                  Pending {inr(summary?.cod?.pendingCollection)} ({summary?.cod?.pendingCount ?? 0}) ·{" "}
                  Collected {inr(summary?.cod?.collected)} ({summary?.cod?.collectedCount ?? 0})
                </p>
              </div>
              {globalStats && (
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="font-semibold">Site traffic</p>
                  <p className="text-muted-foreground">
                    {globalStats.traffic?.allViews ?? 0} views ·{" "}
                    {globalStats.traffic?.uniqueGuests ?? 0} guests ·{" "}
                    {globalStats.traffic?.uniqueUsers ?? 0} users
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-2 shadow-xl">
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
            <CardDescription>Latest recorded platform events (max 20)</CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No events recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev, i) => (
                  <div key={`${ev.eventId ?? ev._id ?? "ev"}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{ev.type ?? ev.title ?? "event"}</p>
                      <p className="text-xs text-muted-foreground truncate">{ev.path ?? ev.message ?? ""}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

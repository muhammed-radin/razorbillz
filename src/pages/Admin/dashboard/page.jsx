import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  ShoppingCart,
  Users,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  RefreshCcw,
  CreditCard,
  Boxes,
} from "lucide-react";
import { api } from "@/utils/api";
import { decryptField } from "@/utils/crypt";
import {
  Pie,
  PieChart,
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import AvatarIcon from "@/components/avatar-icon";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";

export const description = "Admin dashboard with live store metrics";

const revenueChartConfig = {
  revenue: {
    label: "Revenue",
    color: "#8b5cf6",
  },
  orders: {
    label: "Orders",
    color: "#22c55e",
  },
};

const BROWSER_COLORS = {
  chrome: "#22c55e",
  safari: "#3b82f6",
  firefox: "#f97316",
  edge: "#8b5cf6",
  other: "#ec4899",
};

const trafficChartConfig = {
  visitors: { label: "Visitors" },
  ...Object.fromEntries(
    Object.entries(BROWSER_COLORS).map(([k, color]) => [
      k,
      { label: k[0].toUpperCase() + k.slice(1), color },
    ]),
  ),
};

const deviceChartConfig = {
  desktop: { label: "Desktop", color: "#6366f1" },
  mobile: { label: "Mobile", color: "#22d3ee" },
};

const inr = (n) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function WidgetError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
      {message}
    </p>
  );
}

function EmptyState({ icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 sm:py-10 text-center px-4">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
        {React.createElement(icon, { className: "h-5 w-5 text-muted-foreground" })}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground max-w-xs">{hint}</p>}
    </div>
  );
}

function Meter({ value, tone }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function AdminDashboardPage() {
  const [products, setProducts] = useState([]);
  const [productCount, setProductCount] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [liveOrders, setLiveOrders] = useState([]);
  const [customerCount, setCustomerCount] = useState(null);
  const [lowStock, setLowStock] = useState(null);
  const [siteStats, setSiteStats] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [granularity, setGranularity] = useState("day");
  const [errors, setErrors] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const fail = useCallback((key, err) => {
    console.error(`Dashboard widget failed (${key}):`, err);
    setErrors((e) => ({
      ...e,
      [key]:
        err?.response?.status === 403
          ? "Admin access required."
          : err?.response?.status === 404
            ? "No data recorded yet."
            : "Could not load this widget.",
    }));
  }, []);

  const loadAll = useCallback(
    async (gran = granularity) => {
      setRefreshing(true);
      const { analyticsApi, ordersApi, usersApi, productsApi } = await import(
        "@/services/shop"
      );
      const tasks = [
        (async () => {
          try {
            const res = await api.client.get(api.products(), {
              params: { limit: 1, realtime: "true" },
            });
            const list = res.data?.products ?? res.data ?? [];
            setProducts(Array.isArray(list) ? list : []);
            setProductCount(
              typeof res.data?.count === "number"
                ? res.data.count
                : Array.isArray(list)
                  ? list.length
                  : null,
            );
          } catch (err) {
            fail("products", err);
          }
        })(),
        (async () => {
          try {
            const s = await analyticsApi.ordersSummary({ granularity: gran });
            setSummary(s);
          } catch (err) {
            fail("summary", err);
          }
        })(),
        (async () => {
          try {
            /* One paginated read feeds both the recent-order list and the
             * top-products aggregate. Previously the dashboard requested
             * /orders/list twice (limit 5 and limit 100). */
            const data = await ordersApi.list({
              limit: 100,
              sortBy: "createdAt",
              sortOrder: "desc",
            });
            const list = data?.orders ?? (Array.isArray(data) ? data : []);
            const orders = Array.isArray(list) ? list : [];
            setLiveOrders(orders.slice(0, 5));

            const agg = new Map();
            for (const o of orders) {
              if (o?.status === "cancelled") continue;
              const paid = o?.payment?.status === "paid";
              for (const p of o?.products ?? []) {
                const key = p?.productId ?? p?.title ?? "unknown";
                const cur = agg.get(key) ?? {
                  name: p?.title ?? "Unknown product",
                  sales: 0,
                  revenue: 0,
                };
                cur.sales += Number(p?.quantity ?? 1);
                if (paid) cur.revenue += Number(p?.price ?? 0) * Number(p?.quantity ?? 1);
                agg.set(key, cur);
              }
            }
            setTopProducts(
              [...agg.values()].sort((a, b) => b.sales - a.sales).slice(0, 4),
            );
          } catch (err) {
            fail("orders", err);
            fail("top", err);
          }
        })(),
        (async () => {
          try {
            const data = await usersApi.list({ limit: 1 });
            setCustomerCount(
              typeof data?.count === "number" ? data.count : null,
            );
          } catch (err) {
            fail("customers", err);
          }
        })(),
        (async () => {
          try {
            const s = await productsApi.status();
            const low = Array.isArray(s?.lowStock)
              ? s.lowStock.length
              : typeof s?.lowStockCount === "number"
                ? s.lowStockCount
                : typeof s?.lowStock === "number"
                  ? s.lowStock
                  : null;
            setLowStock(low);
          } catch (err) {
            fail("stock", err);
          }
        })(),
        (async () => {
          try {
            const g = await analyticsApi.global();
            setSiteStats(g);
          } catch (err) {
            fail("traffic", err);
          }
        })(),
      ];
      await Promise.allSettled(tasks);
      setIsLoading(false);
      setRefreshing(false);
    },
    [fail], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useStrictEffect(() => {
    setIsLoading(true);
    loadAll("day");
  }, [loadAll]);

  const changeGranularity = (g) => {
    setGranularity(g);
    setErrors((e) => ({ ...e, summary: undefined }));
    import("@/services/shop").then(({ analyticsApi }) =>
      analyticsApi
        .ordersSummary({ granularity: g })
        .then(setSummary)
        .catch((err) => fail("summary", err)),
    );
  };

  const metrics = [
    {
      title: "Revenue",
      hint: "verified paid orders",
      value: summary ? inr(summary.payments?.revenue) : (errors.summary ?? "—"),
      sub: summary
        ? `${summary.payments?.paidOrders ?? 0} paid orders`
        : (errors.summary ?? "Loading…"),
      icon: DollarSign,
      tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Orders",
      hint: "all statuses in range",
      value: summary ? String(summary.totals?.orders ?? 0) : (errors.summary ?? "—"),
      sub: summary
        ? `AOV ${summary.payments?.aov != null ? inr(summary.payments.aov) : "—"}`
        : (errors.summary ?? "Loading…"),
      icon: ShoppingCart,
      tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      title: "Products",
      hint: "active in catalog",
      value: productCount ?? (products.length || "—"),
      sub:
        errors.products ??
        (lowStock != null ? `${lowStock} low-stock` : "Live inventory"),
      icon: Package,
      tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      title: "Customers",
      hint: `COD collected ${summary ? inr(summary.cod?.collected) : "—"}`,
      value: customerCount ?? errors.customers ?? "—",
      sub: summary
        ? `COD pending ${inr(summary.cod?.pendingCollection)}`
        : (errors.summary ?? "Loading…"),
      icon: Users,
      tile: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
  ];

  const recentOrders = liveOrders.map((o) => ({
    id: o.id ?? o._id,
    customer:
      o.shippingAddress?.name ??
      decryptField(o.userName) ??
      o.userId ??
      "Customer",
    email: o.shippingAddress?.email ?? o.userEmail ?? "",
    product: o.products?.[0]?.title ?? `${o.products?.length ?? 0} item(s)`,
    amount: `₹${Number(o.totalAmount ?? 0).toFixed(2)}`,
    status: ({
      pending: "Pending",
      processing: "Processing",
      shipped: "Shipped",
      delivered: "Delivered",
      confirmed: "Processing",
      cancelled: "Cancelled",
    })[o.status] ?? o.status,
    date: o.createdAt ? new Date(o.createdAt).toLocaleString() : "",
    avatar: (o.shippingAddress?.name ?? o.id ?? "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  }));

  const revenueData = (summary?.series ?? []).map((b) => ({
    month: new Date(b.bucket).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
    revenue: b.revenue,
    orders: b.orders,
  }));

  const traffic = siteStats?.traffic ?? null;
  const browserData = traffic
    ? [
        { browser: "chrome", visitors: traffic.sources?.chrome ?? traffic.browsers?.chrome ?? 0, fill: BROWSER_COLORS.chrome },
        { browser: "safari", visitors: traffic.sources?.safari ?? traffic.browsers?.safari ?? 0, fill: BROWSER_COLORS.safari },
        { browser: "firefox", visitors: traffic.sources?.firefox ?? traffic.browsers?.firefox ?? 0, fill: BROWSER_COLORS.firefox },
        { browser: "edge", visitors: traffic.sources?.edge ?? traffic.browsers?.edge ?? 0, fill: BROWSER_COLORS.edge },
        { browser: "other", visitors: traffic.sources?.other ?? traffic.browsers?.other ?? 0, fill: BROWSER_COLORS.other },
      ]
    : [];

  const deviceData = traffic?.devices
    ? [{ month: "All time", desktop: traffic.devices.desktop ?? 0, mobile: traffic.devices.mobile ?? 0 }]
    : [];

  const getStatusConfig = (status) => {
    switch (status) {
      case "Delivered":
        return {
          color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
          icon: CheckCircle2,
        };
      case "Shipped":
        return {
          color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
          icon: Package,
        };
      case "Processing":
        return {
          color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
          icon: RefreshCcw,
        };
      case "Pending":
        return {
          color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
          icon: Clock,
        };
      default:
        return {
          color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
          icon: AlertCircle,
        };
    }
  };

  const aov = summary?.payments?.aov;
  const paidOrders = summary?.payments?.paidOrders ?? 0;
  const totalOrders = summary?.totals?.orders ?? 0;
  const statusEntries = Object.entries(summary?.byStatus ?? {});
  const statusTotal = statusEntries.reduce((n, [, c]) => n + Number(c ?? 0), 0) || 1;
  const codPending = summary?.cod?.pendingCollection ?? 0;
  const codCollected = summary?.cod?.collected ?? 0;
  const codTotal = codPending + codCollected;

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Live store overview{summary?.range?.granularity ? ` · per ${summary.range.granularity}` : ""}
            {isLoading ? " · loading…" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-card p-1" role="group" aria-label="Date granularity">
            {(["day", "week", "month"]).map((g) => (
              <Button
                key={g}
                variant={granularity === g ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 sm:px-3 text-xs capitalize"
                onClick={() => changeGranularity(g)}
              >
                {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => loadAll(granularity)}
            disabled={refreshing}
          >
            <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link to="/auth/admin/products/new">
              <Package className="h-3.5 w-3.5 mr-1.5" />
              Add product
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-3 w-36" />
                </CardContent>
              </Card>
            ))
          : metrics.map((m) => {
              const Icon = m.icon;
              return (
                <Card key={m.title}>
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${m.tile}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-none">{m.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">{m.hint}</p>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-[1.7rem] font-bold tracking-tight mt-3">{m.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                      <span className="truncate">{m.sub}</span>
                    </p>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Revenue + status distribution */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between pb-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Revenue overview</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Verified-paid revenue and order volume
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit text-[11px] capitalize">
              <Calendar className="h-3 w-3 mr-1" />
              per {granularity}
            </Badge>
          </CardHeader>
          <CardContent>
            {revenueData.length ? (
              <ChartContainer config={revenueChartConfig} className="h-[220px] sm:h-[280px] w-full">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: "#6b7280", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(v) => `₹${v}`} tick={{ fill: "#6b7280", fontSize: 12 }} width={56} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2.5} />
                  <Area type="monotone" dataKey="orders" stroke="#22c55e" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            ) : (
              <EmptyState icon={TrendingUp} title="No revenue data for this range" hint={errors.summary ?? "Paid orders will appear here once verified."} />
            )}
            <WidgetError message={errors.summary} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Orders by status</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{totalOrders} orders in range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusEntries.length ? (
              statusEntries.map(([s, c]) => (
                <div key={s} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{s.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground tabular-nums">{c}</span>
                  </div>
                  <Meter value={(Number(c) / statusTotal) * 100} tone="bg-primary" />
                </div>
              ))
            ) : (
              <EmptyState icon={ShoppingCart} title="No orders in range" hint={errors.summary ?? "Orders will appear here."} />
            )}
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">Paid share</p>
                <p className="text-sm font-bold text-emerald-600">
                  {totalOrders ? `${((paidOrders / totalOrders) * 100).toFixed(1)}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">Avg. order value</p>
                <p className="text-sm font-bold text-blue-600">{aov != null ? inr(aov) : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent orders + operations */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Recent orders</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Latest customer orders</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" asChild>
              <Link to="/auth/admin/orders">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length ? (
              <ul className="divide-y">
                {recentOrders.map((order) => {
                  const cfg = getStatusConfig(order.status);
                  const StatusIcon = cfg.icon;
                  return (
                    <li key={order.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <AvatarIcon name={order.avatar} decrypted={false} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{order.customer}</p>
                        <p className="text-xs text-muted-foreground truncate">{order.product} · {order.date}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums hidden xs:block sm:block">{order.amount}</p>
                      <Badge variant="outline" className={`shrink-0 text-[11px] ${cfg.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {order.status}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={ShoppingCart} title="No orders yet" hint={errors.orders ?? "Orders will appear here once customers check out."} />
            )}
            <WidgetError message={errors.orders} />
          </CardContent>
        </Card>

        <div className="space-y-3 sm:space-y-4 min-w-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                COD collection
              </CardTitle>
              <CardDescription className="text-xs">Cash handled outside prepaid flow</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Outstanding</span>
                <span className="text-lg font-bold tabular-nums">{summary ? inr(codPending) : "—"}</span>
              </div>
              <Meter value={codTotal ? (codPending / codTotal) * 100 : 0} tone="bg-amber-500" />
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-xs text-muted-foreground">Collected</span>
                <span className="font-semibold tabular-nums">{summary ? inr(codCollected) : "—"}</span>
              </div>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
                <Link to="/auth/admin/payments">Open payments</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className={lowStock ? "border-amber-500/40" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Boxes className="h-4 w-4 text-muted-foreground" />
                Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Low-stock products</span>
                <span className="text-lg font-bold tabular-nums">{lowStock ?? errors.stock ?? "…"}</span>
              </div>
              <WidgetError message={errors.stock} />
              <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
                <Link to="/auth/admin/products">Manage products</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Analytics row */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Top products</CardTitle>
            <CardDescription className="text-xs sm:text-sm">By units sold from real orders</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length ? (
              <ul className="space-y-1">
                {topProducts.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                    <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sales} sold</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums shrink-0">{inr(p.revenue)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Package} title="No sales data yet" hint={errors.top ?? "Top products will appear once orders are placed."} />
            )}
            <WidgetError message={errors.top} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Traffic sources</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Visitor browsers</CardDescription>
          </CardHeader>
          <CardContent>
            {browserData.length && browserData.some((d) => d.visitors > 0) ? (
              <>
                <ChartContainer config={trafficChartConfig} className="mx-auto aspect-square max-h-[180px] sm:max-h-[200px]">
                  <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Pie data={browserData} dataKey="visitors" nameKey="browser" innerRadius={45} outerRadius={70} strokeWidth={3} stroke="#fff" />
                  </PieChart>
                </ChartContainer>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {browserData.map((item) => (
                    <li key={item.browser} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                      <span className="text-muted-foreground capitalize truncate">{item.browser}</span>
                      <span className="font-semibold ml-auto tabular-nums">{item.visitors}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState icon={TrendingUp} title="No traffic data yet" hint={errors.traffic ?? "Visitor analytics will appear once events are recorded."} />
            )}
            <WidgetError message={errors.traffic} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Devices</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Desktop vs mobile</CardDescription>
          </CardHeader>
          <CardContent>
            {deviceData.length && (deviceData[0].desktop > 0 || deviceData[0].mobile > 0) ? (
              <>
                <ChartContainer config={deviceChartConfig} className="h-[180px] sm:h-[200px] w-full">
                  <BarChart accessibilityLayer data={deviceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} width={40} />
                    <ChartTooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} content={<ChartTooltipContent indicator="dashed" />} />
                    <Bar dataKey="desktop" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="mobile" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
                <div className="mt-3 flex justify-center gap-6 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                    Desktop ({deviceData[0].desktop})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                    Mobile ({deviceData[0].mobile})
                  </span>
                </div>
              </>
            ) : (
              <EmptyState icon={Users} title="No device data yet" hint={errors.traffic ?? "Device analytics will appear once events are recorded."} />
            )}
          </CardContent>
          <CardFooter className="border-t pt-3 text-xs text-muted-foreground">
            {siteStats
              ? `${siteStats.traffic?.uniqueGuests ?? 0} guests · ${siteStats.traffic?.uniqueUsers ?? 0} users · ${siteStats.traffic?.allViews ?? 0} views`
              : "Connect analytics to see trends"}
          </CardFooter>
        </Card>
      </div>

      <p className="text-[11px] sm:text-xs text-muted-foreground">
        Revenue counts verified paid orders only — unpaid COD is never revenue.
        {summary?.definitions?.revenue ? ` Definition: ${summary.definitions.revenue}.` : ""}
      </p>
    </div>
  );
}

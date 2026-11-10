import React, { useMemo, useState } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Package,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Truck,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { StoreMeta } from "@/components/store-meta";
import {
  CancelOrderDialog,
  ReturnRequestDialog,
} from "@/components/order-dialogs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOrderStore } from "@/stores/shop";
import { decryptField } from "@/utils/crypt";
import { currency } from "@/utils/currency";
import { cn } from "@/lib/utils";

/* ===========================================================================
 * Helpers
 * ========================================================================= */

const CANCELLABLE_STATUSES = new Set(["pending", "confirmed", "processing"]);
const ACTIVE_STATUSES = new Set([
  "pending",
  "confirmed",
  "processing",
  "shipped",
]);

const RETURN_WINDOW_DAYS = 7;

const STATUS_META = {
  pending: {
    label: "Pending Payment",
    icon: AlertCircle,
    className:
      "border-transparent bg-amber-500/10 text-amber-600 border-amber-500/50 border-solid",
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    className:
      "border-transparent bg-emerald-500/10 text-emerald-600 border-emerald-500/50 border-solid",
  },
  processing: {
    label: "Processing",
    icon: PackageOpen,
    className:
      "border-transparent bg-amber-500/10 text-amber-600 border-amber-500/50 border-solid",
  },
  shipped: {
    label: "Shipped",
    icon: Truck,
    className:
      "border-transparent bg-blue-500/10 text-blue-600 border-blue-500/50 border-solid",
  },
  delivered: {
    label: "Delivered",
    icon: PackageCheck,
    className:
      "border-transparent bg-emerald-500/10 text-emerald-600 border-emerald-500/50 border-dotted",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className:
      "border-transparent bg-red-500/10 text-red-600 border-red-500/50 border-dashed",
  },
  return_requested: {
    label: "Return Requested",
    icon: RotateCcw,
    className:
      "border-transparent bg-orange-500/10 text-orange-600 border-orange-500/50 border-dashed",
  },
  returned: {
    label: "Returned",
    icon: Undo2,
    className:
      "border-transparent bg-purple-500/10 text-purple-600 border-purple-500/50 border-dashed",
  },
};

/**
 * Recursively decrypt every string property that arrived from the server.
 * `decryptField` passes plain text through untouched, so this is safe to run
 * over the whole payload.
 */
function deepDecrypt(value) {
  if (typeof value === "string") return decryptField(value);
  if (Array.isArray(value)) return value.map(deepDecrypt);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) out[key] = deepDecrypt(val);
    return out;
  }
  return value;
}

const orderIdOf = (order) => order?.id ?? order?._id ?? "";
const itemsOf = (order) =>
  Array.isArray(order?.products) ? order.products : [];
const totalOf = (order) => Number(order?.totalAmount ?? 0);
const currencyOf = (order) => order?.currency ?? "INR";

const formatMoney = (amount, code = "INR") =>
  currency(Number(amount ?? 0), undefined, code);

function formatDate(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const prettify = (value) =>
  value
    ? String(value)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

function canCancelOrder(order) {
  const status = order?.status;
  const cancellation = order?.cancellation?.status ?? "none";
  return CANCELLABLE_STATUSES.has(status) && cancellation !== "requested";
}

function canReturnOrder(order) {
  if (order?.status !== "delivered") return false;
  const ret = order?.return?.status ?? "none";
  if (["requested", "approved", "received", "completed"].includes(ret)) {
    return false;
  }
  const deliveredAt = order?.fulfillment?.deliveredAt;
  if (deliveredAt) {
    const days =
      (Date.now() - new Date(deliveredAt).getTime()) / (24 * 60 * 60 * 1000);
    if (days > RETURN_WINDOW_DAYS) return false;
  }
  return true;
}

/* ===========================================================================
 * Presentational primitives
 * ========================================================================= */

function StatusBadge({ status, className }) {
  const meta = STATUS_META[status] ?? {
    label: prettify(status) || "Order",
    icon: Package,
    className: "border-transparent bg-muted text-muted-foreground",
  };
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn(meta.className, "gap-2 px-2", className)}
    >
      <Icon className="size-3.5" />
      {meta.label}
    </Badge>
  );
}

function CopyButton({ value, label = "Copy order id" }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={copy}
          aria-label={label}
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : label}</TooltipContent>
    </Tooltip>
  );
}

function StatCard({ icon, label, value, tone }) {
  const Icon = icon;
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg sm:size-10",
            tone,
          )}
        >
          <Icon className="size-4 sm:size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-base font-semibold sm:text-lg">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderThumbs({ items }) {
  const thumbs = items.filter((item) => item?.thumbnail).slice(0, 3);
  if (!thumbs.length) {
    return (
      <div className="grid size-14 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
        <Package className="size-5" />
      </div>
    );
  }
  return (
    <div className="flex shrink-0 -space-x-3">
      {thumbs.map((item, index) => (
        <img
          key={item.productId ?? index}
          src={item.thumbnail}
          alt={item.title ?? "Product"}
          loading="lazy"
          className="size-14 rounded-lg border-2 border-background object-cover"
        />
      ))}
      {items.length > thumbs.length && (
        <span className="grid size-14 place-items-center rounded-lg border-2 border-background bg-muted text-xs font-medium">
          +{items.length - thumbs.length}
        </span>
      )}
    </div>
  );
}

function OrderCard({ order, acting, onCancel, onReturn }) {
  const id = orderIdOf(order);
  const items = itemsOf(order);
  const total = totalOf(order);
  const code = currencyOf(order);
  const isCod = order.payment?.method === "cod";
  const cancellable = canCancelOrder(order);
  const returnable = canReturnOrder(order);
  const cancellation = order.cancellation?.status;
  const returnStatus = order.return?.status;
  const hasRequests =
    (cancellation && cancellation !== "none") ||
    (returnStatus && returnStatus !== "none");

  return (
    <Card className="shadow-none transition-colors hover:border-primary/40">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <OrderThumbs items={items} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-sm font-semibold">{id}</span>
              <CopyButton value={id} />
              <StatusBadge status={order.status ?? "pending"} />
            </div>

            <p className="mt-1.5 truncate text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
              {items[0]?.title ? ` • ${items[0].title}` : ""}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {formatDate(order.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                {isCod ? (
                  <Banknote className="size-3.5" />
                ) : (
                  <CreditCard className="size-3.5" />
                )}
                {isCod ? "Cash on Delivery" : "Online payment"}
              </span>
            </div>

            {hasRequests && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cancellation && cancellation !== "none" && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Cancellation: {prettify(cancellation)}
                  </Badge>
                )}
                {returnStatus && returnStatus !== "none" && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Return: {prettify(returnStatus)}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="hidden shrink-0 text-right sm:block">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">{formatMoney(total, code)}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="font-semibold sm:hidden">
            {formatMoney(total, code)}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to={`/order-status?id=${encodeURIComponent(id)}`}>
                <Truck className="size-4" />
                Track order
              </Link>
            </Button>
            {cancellable && (
              <Button
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={onCancel}
              >
                {acting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <XCircle className="size-4" />
                )}
                Cancel
              </Button>
            )}
            {returnable && (
              <Button
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={onReturn}
              >
                {acting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Undo2 className="size-4" />
                )}
                Return
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="shadow-none">
          <CardContent className="flex items-start gap-4 p-4 sm:p-5">
            <Skeleton className="size-14 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="hidden h-6 w-20 shrink-0 sm:block" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ===========================================================================
 * Page
 * ========================================================================= */

export default function Orderhistory() {
  const orders = useOrderStore((s) => s.orders);
  const loading = useOrderStore((s) => s.loading);
  const error = useOrderStore((s) => s.error);
  const fetchUserOrders = useOrderStore((s) => s.fetchUserOrders);
  const cancelOrder = useOrderStore((s) => s.cancel);
  const requestReturn = useOrderStore((s) => s.requestReturn);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("newest");
  const [actingId, setActingId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);

  useStrictEffect(() => {
    fetchUserOrders().catch(() => {});
  }, [fetchUserOrders]);

  // Decrypt every property that came from the server before rendering.
  const decrypted = useMemo(
    () => (Array.isArray(orders) ? deepDecrypt(orders) : []),
    [orders],
  );

  const stats = useMemo(() => {
    return decrypted.reduce(
      (acc, order) => {
        acc.total += 1;
        acc.spent += totalOf(order);
        if (ACTIVE_STATUSES.has(order.status)) acc.active += 1;
        if (order.status === "delivered") acc.delivered += 1;
        return acc;
      },
      { total: 0, spent: 0, active: 0, delivered: 0 },
    );
  }, [decrypted]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = decrypted;

    if (tab === "active") {
      list = list.filter((o) => ACTIVE_STATUSES.has(o.status));
    } else if (tab === "delivered") {
      list = list.filter((o) => o.status === "delivered");
    } else if (tab === "cancelled") {
      list = list.filter((o) => o.status === "cancelled");
    } else if (tab === "returns") {
      list = list.filter(
        (o) =>
          ["return_requested", "returned"].includes(o.status) ||
          (o.return?.status && o.return.status !== "none"),
      );
    }

    if (q) {
      list = list.filter((o) => {
        const id = orderIdOf(o).toLowerCase();
        const titles = itemsOf(o)
          .map((item) => String(item?.title ?? "").toLowerCase())
          .join(" ");
        return id.includes(q) || titles.includes(q);
      });
    }

    const sorted = [...list];
    switch (sort) {
      case "oldest":
        sorted.sort(
          (a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0),
        );
        break;
      case "highest":
        sorted.sort((a, b) => totalOf(b) - totalOf(a));
        break;
      case "lowest":
        sorted.sort((a, b) => totalOf(a) - totalOf(b));
        break;
      default:
        sorted.sort(
          (a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0),
        );
    }
    return sorted;
  }, [decrypted, tab, query, sort]);

  const filtersActive = query.trim() !== "" || tab !== "all";

  const clearFilters = () => {
    setQuery("");
    setTab("all");
  };

  const confirmCancel = async ({ reason, detail }) => {
    if (!cancelTarget) return;
    const id = orderIdOf(cancelTarget);
    setActingId(id);
    try {
      await cancelOrder(id, reason, detail);
      toast.success("Cancellation requested — pending admin review");
      setCancelTarget(null);
      await fetchUserOrders();
    } catch (err) {
      toast.error(
        err?.response?.data?.error ?? "Failed to request cancellation",
      );
    } finally {
      setActingId(null);
    }
  };

  const confirmReturn = async ({ reason, detail }) => {
    if (!returnTarget) return;
    const id = orderIdOf(returnTarget);
    setActingId(id);
    try {
      await requestReturn(id, reason, detail);
      toast.success("Return requested — pending admin review");
      setReturnTarget(null);
      await fetchUserOrders();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? "Failed to request return");
    } finally {
      setActingId(null);
    }
  };

  const hasOrders = decrypted.length > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <StoreMeta title="Order History" noIndex />

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/settings">Account</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Order History</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Order History
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track deliveries, download details and manage your past orders.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/search">
              <ShoppingBag className="size-4" />
              Continue shopping
            </Link>
          </Button>
        </div>

        {/* Stats */}
        {hasOrders && (
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={ShoppingBag}
              label="Total orders"
              value={stats.total}
              tone="bg-background text-primary"
            />
            <StatCard
              icon={Wallet}
              label="Total spent"
              value={formatMoney(stats.spent)}
              tone="bg-background text-emerald-600"
            />
            <StatCard
              icon={Truck}
              label="In progress"
              value={stats.active}
              tone="bg-background text-amber-600"
            />
            <StatCard
              icon={PackageCheck}
              label="Delivered"
              value={stats.delivered}
              tone="bg-background text-blue-600"
            />
          </div>
        )}

        {/* Controls */}
        {hasOrders && (
          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by order id or product"
                className="pl-9"
                aria-label="Search orders"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Tabs value={tab} onValueChange={setTab}>
                {/* Filter-only control: no tab panels exist, so suppress the
                 * dangling `aria-controls` Radix emits. */}
                <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
                  <TabsTrigger value="all" aria-controls={undefined}>All</TabsTrigger>
                  <TabsTrigger value="active" aria-controls={undefined}>Active</TabsTrigger>
                  <TabsTrigger value="delivered" aria-controls={undefined}>Delivered</TabsTrigger>
                  <TabsTrigger value="cancelled" aria-controls={undefined}>Cancelled</TabsTrigger>
                  <TabsTrigger value="returns" aria-controls={undefined}>Returns</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <span className="flex items-center gap-2">
                    <SelectValue placeholder="Sort" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="highest">Highest amount</SelectItem>
                  <SelectItem value="lowest">Lowest amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* List */}
        <div className="mt-4">
          {loading && !hasOrders ? (
            <OrderListSkeleton />
          ) : error && !hasOrders ? (
            <Card className="shadow-none">
              <CardContent className="p-0">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <AlertCircle className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>Couldn&apos;t load your orders</EmptyTitle>
                    <EmptyDescription>
                      {error?.response?.data?.error ??
                        "Something went wrong while fetching your order history."}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      variant="outline"
                      onClick={() => fetchUserOrders().catch(() => {})}
                    >
                      <RefreshCw className="size-4" />
                      Try again
                    </Button>
                  </EmptyContent>
                </Empty>
              </CardContent>
            </Card>
          ) : !hasOrders ? (
            <Card className="shadow-none">
              <CardContent className="p-0">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PackageSearch className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>No orders yet</EmptyTitle>
                    <EmptyDescription>
                      Your orders will appear here once you complete a checkout.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button asChild>
                      <Link to="/search">
                        <ShoppingBag className="size-4" />
                        Start shopping
                      </Link>
                    </Button>
                  </EmptyContent>
                </Empty>
              </CardContent>
            </Card>
          ) : visible.length === 0 ? (
            <Card className="shadow-none">
              <CardContent className="p-0">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>No matching orders</EmptyTitle>
                    <EmptyDescription>
                      Try a different search term or clear the filters.
                    </EmptyDescription>
                  </EmptyHeader>
                  {filtersActive && (
                    <EmptyContent>
                      <Button variant="outline" onClick={clearFilters}>
                        <RefreshCw className="size-4" />
                        Clear filters
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {visible.map((order) => {
                const id = orderIdOf(order);
                return (
                  <OrderCard
                    key={id}
                    order={order}
                    acting={actingId === id}
                    onCancel={() => setCancelTarget(order)}
                    onReturn={() => setReturnTarget(order)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CancelOrderDialog
        order={cancelTarget}
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        busy={Boolean(actingId)}
      />
      <ReturnRequestDialog
        order={returnTarget}
        open={Boolean(returnTarget)}
        onClose={() => setReturnTarget(null)}
        onConfirm={confirmReturn}
        busy={Boolean(actingId)}
      />
    </TooltipProvider>
  );
}

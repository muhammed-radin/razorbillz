import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Package,
  Search,
  Download,
  Eye,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Undo2,
  Inbox,
  DollarSign,
  Calendar,
  User,
  MapPin,
  Phone,
  Mail,
  MoreVertical,
  RefreshCw,
  FileText,
  ShoppingBag,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ordersApi, paymentsApi, shipmentsApi } from "@/services/shop";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { decryptAddress, decryptField } from "@/utils/crypt";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    color:
      "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    dotColor: "bg-yellow-500",
  },
  processing: {
    label: "Processing",
    icon: RefreshCw,
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    dotColor: "bg-blue-500",
  },
  shipped: {
    label: "Shipped",
    icon: Truck,
    color:
      "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    dotColor: "bg-purple-500",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle2,
    color:
      "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    dotColor: "bg-green-500",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    dotColor: "bg-red-500",
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    color: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
    dotColor: "bg-teal-500",
  },
  packed: {
    label: "Packed",
    icon: Package,
    color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
    dotColor: "bg-cyan-500",
  },
  returned: {
    label: "Returned",
    icon: Undo2,
    color:
      "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    dotColor: "bg-orange-500",
  },
};

/* Crash-safe lookup: unknown/future statuses (confirmed, packed, returned,
 * refunded, …) must render a neutral badge, never throw on `.icon`. */
const getStatus = (status) =>
  statusConfig[status] ?? {
    label: String(status ?? "Unknown")
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase()),
    icon: AlertCircle,
    color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
    dotColor: "bg-gray-500",
  };

/* One kebab-menu component for both the desktop table and mobile cards.
 * Content comes from getOrderActionMenu(order) — only operations valid for
 * the order's CURRENT state are listed, so e.g. a cancelled order has no
 * Cancel button and unaired orders have no Track button. */
function OrderActionMenu({ items, statusLabel }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Order actions"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Actions · {statusLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No actions available for this order state.
          </p>
        ) : (
          items.map((item) => (
            <React.Fragment key={item.key}>
              {item.sepBefore ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                className={cn(
                  item.danger &&
                    "text-red-600 focus:text-red-600 focus:bg-red-500/10",
                )}
                onClick={item.onClick}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </DropdownMenuItem>
            </React.Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* Customer cancel / return requests awaiting an admin decision.
 * Fully responsive: stacked cards on mobile, comfortable grid on desktop. */
function RequestGroup({ title, icon, tone, orders, kind, onDecide }) {
  if (!orders.length) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        {React.createElement(icon, {
          className: "h-4 w-4 text-muted-foreground",
        })}
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary" className="text-[10px]">
          {orders.length}
        </Badge>
      </div>
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        {orders.map((order) => {
          const req =
            kind === "cancel"
              ? (order.raw?.cancellation ?? {})
              : (order.raw?.return ?? {});
          return (
            <Card key={`${kind}-${order.id}`} className="overflow-hidden">
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-primary text-xs sm:text-sm break-all">
                      {order.id}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {order.customer.name} · {order.customer.email}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0", tone)}>
                    ₹{Number(order.total ?? 0).toFixed(2)}
                  </Badge>
                </div>
                <div className="rounded-lg bg-muted/60 p-3 text-sm space-y-1">
                  <p className="font-medium">
                    {req.reason || "No reason given"}
                  </p>
                  {req.detail && (
                    <p className="text-muted-foreground text-xs sm:text-sm break-words">
                      {req.detail}
                    </p>
                  )}
                  {req.requestedAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Requested {new Date(req.requestedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => onDecide(order, kind, "reject")}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => onDecide(order, kind, "approve")}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function RequestsView({ cancelRequests, returnRequests, onDecide }) {
  if (!cancelRequests.length && !returnRequests.length) {
    return (
      <Card>
        <CardContent className="py-10 sm:py-14">
          <div className="flex flex-col items-center gap-3 text-center px-4">
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-600" />
            </div>
            <p className="font-semibold text-base sm:text-lg">All caught up</p>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-sm">
              No pending cancellation or return requests. New customer requests
              will appear here for approval.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6 sm:space-y-8">
      <RequestGroup
        title="Cancellation requests"
        icon={XCircle}
        tone="border-red-500/30 text-red-700 dark:text-red-400"
        orders={cancelRequests}
        kind="cancel"
        onDecide={onDecide}
      />
      <RequestGroup
        title="Return requests"
        icon={Undo2}
        tone="border-amber-500/30 text-amber-700 dark:text-amber-400"
        orders={returnRequests}
        kind="return"
        onDecide={onDecide}
      />
    </div>
  );
}

// Form Schema for Edit Order
const editOrderFormSchema = z.object({
  orderId: z.string(),
  customerName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name is too long"),
  customerEmail: z.string().email("Invalid email address"),
  customerPhone: z
    .string()
    .min(10, "Phone number must be at least 10 characters"),
  shippingAddress: z.string().min(10, "Address must be at least 10 characters"),
  paymentMethod: z.string().min(2, "Payment method is required"),
});

/* Normalize one backend order for the admin UI. Customer PII and address
 * snapshots may be end-to-end encrypted — always present decrypted. */
const mapOrder = (o) => {
  const ship =
    o.shippingAddress && typeof o.shippingAddress === "object"
      ? decryptAddress(o.shippingAddress)
      : {};
  const name =
    decryptField(o.userName) ||
    decryptField(o.customer?.name) ||
    decryptField(ship.name) ||
    "";
  const nm = name.trim();
  return {
    id: o.id ?? o._id,
    customer: {
      name,
      email:
        decryptField(o.userEmail) ||
        decryptField(o.customer?.email) ||
        decryptField(ship.email) ||
        "",
      phone:
        decryptField(o.userPhone) ||
        decryptField(o.customer?.phone) ||
        decryptField(ship.phone ?? ship.phoneNumber) ||
        "",
      avatar: nm
        ? nm
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
        : "•",
    },
    items: (o.products ?? []).length,
    total: o.totalAmount ?? 0,
    status: o.status ?? "pending",
    date: o.createdAt ? new Date(o.createdAt).toISOString().split("T")[0] : "",
    shippingAddress:
      typeof o.shippingAddress === "string"
        ? o.shippingAddress
        : [ship.street ?? ship.address, ship.city].filter(Boolean).join(", "),
    paymentMethod: o.payment?.method ?? "",
    paymentStatus: o.payment?.status ?? "pending",
    codStatus: o.payment?.codStatus ?? null,
    fulfillmentStatus: o.fulfillment?.status ?? "unfulfilled",
    awb: o.fulfillment?.awb ?? o.fulfillment?.trackingNumber ?? null,
    courier: o.fulfillment?.courierName ?? null,
    raw: o,
  };
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");
  const [currentTab, setCurrentTab] = useState("all");

  // Sheet states
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  // Approve/deny decision dialog for customer cancel & return requests
  const [decisionDialog, setDecisionDialog] = useState(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [deciding, setDeciding] = useState(false);

  // Live orders from GET /api/orders/list (admin, read permission).
  // StrictMode-safe: the initial read fires once, not twice.
  useStrictEffect(() => {
    fetchOrders();
  }, []);

  const [loadError, setLoadError] = useState(null);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const data = await ordersApi.list({ limit: 50 });
      const list = Array.isArray(data) ? data : (data.orders ?? data ?? []);
      setOrders((Array.isArray(list) ? list : []).map(mapOrder));
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching orders:", error);
      // Never render fake rows as if they were real orders.
      setOrders([]);
      setLoadError(
        error?.response?.status === 403
          ? "Admin access required to view orders."
          : "Could not load orders. Check the connection and retry.",
      );
      setIsLoading(false);
    }
  };

  // Form for Edit Order Sheet
  const editOrderForm = useForm({
    resolver: zodResolver(editOrderFormSchema),
    defaultValues: {
      orderId: "",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      shippingAddress: "",
      paymentMethod: "",
    },
  });

  // Handler functions for sheets
  const handleEditOrder = (order) => {
    setSelectedOrder(order);
    editOrderForm.reset({
      orderId: order.id,
      customerName: order.customer.name,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phone,
      shippingAddress: order.shippingAddress,
      paymentMethod: order.paymentMethod,
    });
    setEditSheetOpen(true);
  };

  const handleUpdateStatus = (order) => {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setStatusSheetOpen(true);
  };

  const handleCancelOrder = (order) => {
    setSelectedOrder(order);
    setCancelReason("");
    setCancelSheetOpen(true);
  };

  const [savingEdit, setSavingEdit] = useState(false);

  const saveOrderEdit = async (values) => {
    if (savingEdit) return;
    try {
      setSavingEdit(true);
      // Persist editable shipment fields via PATCH /api/orders/:id/shipping.
      // Customer identity lives in the user record, so only the
      // shipment snapshot + note-safe fields are sent to the server.
      const raw = selectedOrder?.raw ?? {};
      const prevShip =
        raw.shippingAddress && typeof raw.shippingAddress === "object"
          ? raw.shippingAddress
          : {};
      const street = String(values.shippingAddress ?? "").split(",")[0];
      const shipment = {
        ...(prevShip.serviceName ? { serviceName: prevShip.serviceName } : {}),
        shippingAddress: {
          ...prevShip,
          name: values.customerName,
          email: values.customerEmail,
          phone: values.customerPhone,
          street: (street ?? "").trim() || prevShip.street || "",
          address: values.shippingAddress,
        },
      };
      const updated = await ordersApi
        .patchShipping(selectedOrder.id, {
          serviceName: shipment.serviceName,
          shippingAddress: shipment.shippingAddress,
        })
        .catch(() => null);

      const serverShip =
        updated?.shippingAddress ?? updated?.order?.shippingAddress;
      const updatedOrder = {
        ...selectedOrder,
        customer: {
          ...selectedOrder.customer,
          name: values.customerName,
          email: values.customerEmail,
          phone: values.customerPhone,
        },
        shippingAddress: values.shippingAddress,
        paymentMethod: values.paymentMethod,
        raw: updated?.order ?? updated ?? selectedOrder.raw,
        ...(serverShip
          ? {
              shippingAddress:
                typeof serverShip === "string"
                  ? serverShip
                  : [serverShip.address, serverShip.city]
                      .filter(Boolean)
                      .join(", "),
            }
          : {}),
      };
      setOrders(
        orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
      );
      toast.success("Order updated successfully");
      setEditSheetOpen(false);
    } catch (error) {
      console.error("Error updating order:", error);
      toast.error(error?.response?.data?.error ?? "Failed to update order");
    } finally {
      setSavingEdit(false);
    }
  };

  const exportOrdersCsv = () => {
    try {
      const rows = [
        [
          "orderId",
          "date",
          "customer",
          "email",
          "items",
          "total",
          "status",
          "paymentMethod",
          "paymentStatus",
          "fulfillment",
          "awb",
        ],
        ...filteredOrders.map((o) => [
          o.id,
          o.date,
          o.customer.name,
          o.customer.email,
          o.items,
          Number(o.total ?? 0).toFixed(2),
          o.status,
          o.paymentMethod,
          o.paymentStatus,
          o.fulfillmentStatus,
          o.awb ?? "",
        ]),
      ];
      const csv = rows
        .map((r) =>
          r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","),
        )
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `razorbills-orders-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filteredOrders.length} order(s) to CSV`);
    } catch (error) {
      console.error("CSV export failed:", error);
      toast.error("Failed to export orders");
    }
  };

  const downloadInvoice = (order) => {
    try {
      const raw = order.raw ?? {};
      const lines = (raw.products ?? []).map(
        (p) =>
          `  - ${p.title ?? p.productId} x${p.quantity ?? 1} @ ₹${Number(p.price ?? 0).toFixed(2)}`,
      );
      const text = [
        "RAZORBILLS — TAX INVOICE",
        `Order: ${order.id}`,
        `Date: ${order.date}`,
        `Customer: ${order.customer.name} <${order.customer.email}> ${order.customer.phone}`,
        `Ship to: ${order.shippingAddress}`,
        `Payment: ${order.paymentMethod} (${order.paymentStatus})`,
        `Status: ${order.status} / Fulfillment: ${order.fulfillmentStatus}`,
        "",
        "Items:",
        ...lines,
        "",
        `Total: ₹${Number(order.total ?? 0).toFixed(2)}`,
      ].join("\n");
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${order.id}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Invoice for ${order.id} downloaded`);
    } catch (error) {
      console.error("Invoice download failed:", error);
      toast.error("Failed to generate invoice");
    }
  };

  const saveStatusUpdate = async () => {
    try {
      if (!newStatus) {
        toast.error("Please select a status");
        return;
      }

      await ordersApi.updateStatus(selectedOrder.id, newStatus);

      // Update local state
      setOrders(
        orders.map((o) =>
          o.id === selectedOrder.id ? { ...o, status: newStatus } : o,
        ),
      );
      toast.success(`Order status updated to ${getStatus(newStatus).label}`);
      setStatusSheetOpen(false);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const confirmCancelOrder = async () => {
    try {
      if (!cancelReason.trim()) {
        toast.error("Please provide a reason for cancellation");
        return;
      }

      const requested =
        selectedOrder?.raw?.cancellation?.status === "requested";
      if (requested) {
        // A customer request is pending: approving resolves it.
        await ordersApi.approveCancel(selectedOrder.id);
        toast.success("Cancellation request approved");
      } else {
        // No pending request: record an admin-side status change
        // with the reason as the audit note.
        await ordersApi.updateStatus(
          selectedOrder.id,
          "cancelled",
          cancelReason.trim(),
        );
        toast.success("Order cancelled successfully");
      }

      // Update local state
      setOrders(
        orders.map((o) =>
          o.id === selectedOrder.id ? { ...o, status: "cancelled" } : o,
        ),
      );
      setCancelSheetOpen(false);
      await refreshOrders();
    } catch (error) {
      console.error("Error cancelling order:", error);
      toast.error(error?.response?.data?.error ?? "Failed to cancel order");
    }
  };

  /* Customer cancel / return requests awaiting an admin decision. */
  const cancelRequests = orders.filter(
    (o) => o.raw?.cancellation?.status === "requested",
  );
  const returnRequests = orders.filter(
    (o) => o.raw?.return?.status === "requested",
  );
  const requestCount = cancelRequests.length + returnRequests.length;

  const openDecision = (order, kind, action) => {
    setDecisionDialog({ kind, action, order });
    setDecisionReason("");
  };

  const confirmDecision = async () => {
    if (!decisionDialog || deciding) return;
    const { kind, action, order } = decisionDialog;
    if (action === "reject" && !decisionReason.trim()) {
      toast.error("A reason is required to deny this request");
      return;
    }
    try {
      setDeciding(true);
      if (kind === "cancel") {
        if (action === "approve") await ordersApi.approveCancel(order.id);
        else await ordersApi.rejectCancel(order.id, decisionReason.trim());
      } else {
        if (action === "approve") await ordersApi.approveReturn(order.id);
        else await ordersApi.rejectReturn(order.id, decisionReason.trim());
      }
      toast.success(
        action === "approve"
          ? `${kind === "cancel" ? "Cancellation" : "Return"} request approved`
          : `${kind === "cancel" ? "Cancellation" : "Return"} request denied`,
      );
      setDecisionDialog(null);
      await refreshOrders();
    } catch (error) {
      console.error("Error deciding request:", error);
      toast.error(error?.response?.data?.error ?? "Failed to process request");
    } finally {
      setDeciding(false);
    }
  };

  const getOrderStats = () => {
    const stats = {
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      processing: orders.filter((o) => o.status === "processing").length,
      shipped: orders.filter((o) => o.status === "shipped").length,
      delivered: orders.filter((o) => o.status === "delivered").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      // Revenue counts VERIFIED paid orders only (never unpaid COD).
      revenue: orders
        .filter((o) => o.paymentStatus === "paid")
        .reduce((sum, o) => sum + o.total, 0),
    };
    return stats;
  };

  const refreshOrders = async (opts = {}) => {
    try {
      const params = { limit: 50 };
      if (opts.realtime) params.realtime = "true";
      const data = await ordersApi.list(params);
      const list = Array.isArray(data) ? data : (data.orders ?? []);
      setOrders(list.map(mapOrder));
    } catch (error) {
      console.error("Error refreshing orders:", error);
    }
  };

  /* Fulfillment + shipment + COD admin operations. */
  const runAdminOp = async (label, fn) => {
    try {
      await fn();
      toast.success(label);
      await refreshOrders();
    } catch (error) {
      console.error(label, error);
      toast.error(error?.response?.data?.error ?? `Failed: ${label}`);
    }
  };

  const opProcess = (order) =>
    runAdminOp("Order moved to processing", () => ordersApi.process(order.id));
  const opPacked = (order) =>
    runAdminOp("Order marked packed", () => ordersApi.packed(order.id));
  const opShip = (order) =>
    runAdminOp("Order marked shipped", () =>
      ordersApi.ship(order.id, {
        trackingNumber: order.awb ?? undefined,
        serviceName: order.courier ?? undefined,
      }),
    );
  const opDeliver = (order) =>
    runAdminOp("Order marked delivered", () => ordersApi.deliver(order.id));
  const opCreateShipment = (order) =>
    runAdminOp("Shipment creation requested", () =>
      shipmentsApi.create(order.id, {}),
    );
  const opTrackShipment = async (order) => {
    try {
      const resp = await shipmentsApi.track(order.id);
      if (resp?.stub) toast.info("Shipmozo not configured — tracking stubbed.");
      else if (resp?.trackingAvailable === false)
        toast.info(resp?.message ?? "No tracking yet.");
      else {
        toast.success(`Tracking synced${resp?.awb ? `: ${resp.awb}` : ""}`);
        const url = resp?.trackingUrl;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
      await refreshOrders();
    } catch (error) {
      console.error("Track shipment failed", error);
      toast.error(error?.response?.data?.error ?? "Tracking sync failed");
    }
  };
  const opCollectCod = (order) =>
    runAdminOp("COD collected", () =>
      paymentsApi.collectCod(order.id, order.total),
    );

  /* Dynamic per-status action list. Rules mirror the backend state
   * machine: order.status moves pending→confirmed→processing→shipped→
   * delivered while packing lives on fulfillment.status (packed), so both
   * are consulted — e.g. "Mark Shipped" only appears once an AWB exists.
   * Customer cancel/return requests surface as approve/deny entries. */
  const getOrderActionMenu = (order) => {
    const status = order.status;
    const fulfillment = order.fulfillmentStatus ?? "unfulfilled";
    const cancelRequested = order.raw?.cancellation?.status === "requested";
    const returnRequested = order.raw?.return?.status === "requested";
    const cancelable = ["pending", "confirmed", "processing"].includes(status);
    const items = [
      {
        key: "edit",
        label: "Edit Order",
        icon: Eye,
        onClick: () => handleEditOrder(order),
      },
      {
        key: "status",
        label: "Update Status",
        icon: Truck,
        onClick: () => handleUpdateStatus(order),
      },
    ];

    if (cancelRequested) {
      items.push(
        {
          key: "cancel-approve",
          label: "Approve Cancel Request",
          icon: CheckCircle2,
          danger: false,
          sepBefore: true,
          onClick: () => openDecision(order, "cancel", "approve"),
        },
        {
          key: "cancel-deny",
          label: "Deny Cancel Request…",
          icon: XCircle,
          danger: true,
          onClick: () => openDecision(order, "cancel", "reject"),
        },
      );
    } else if (cancelable) {
      items.push({
        key: "cancel",
        label: "Cancel Order",
        icon: XCircle,
        danger: true,
        sepBefore: true,
        onClick: () => handleCancelOrder(order),
      });
    }

    if (returnRequested) {
      items.push(
        {
          key: "return-approve",
          label: "Approve Return Request",
          icon: Undo2,
          sepBefore: true,
          onClick: () => openDecision(order, "return", "approve"),
        },
        {
          key: "return-deny",
          label: "Deny Return Request…",
          icon: XCircle,
          danger: true,
          onClick: () => openDecision(order, "return", "reject"),
        },
      );
    }

    if (status === "pending" || status === "confirmed") {
      items.push({
        key: "process",
        label: "Move to Processing",
        icon: RefreshCw,
        sepBefore: true,
        onClick: () => opProcess(order),
      });
    }
    if (
      status === "processing" &&
      ["unfulfilled", "processing"].includes(fulfillment)
    ) {
      items.push({
        key: "packed",
        label: "Mark Packed",
        icon: Package,
        sepBefore: true,
        onClick: () => opPacked(order),
      });
    }
    if (status === "processing" && fulfillment === "packed") {
      items.push(
        order.awb
          ? {
              key: "ship",
              label: "Mark Shipped",
              icon: Truck,
              sepBefore: true,
              onClick: () => opShip(order),
            }
          : {
              key: "shipment",
              label: "Create Shipmozo Shipment",
              icon: Truck,
              sepBefore: true,
              onClick: () => opCreateShipment(order),
            },
      );
    }
    if (status === "shipped") {
      items.push({
        key: "deliver",
        label: "Mark Delivered",
        icon: CheckCircle2,
        sepBefore: true,
        onClick: () => opDeliver(order),
      });
    }
    if (order.awb) {
      items.push({
        key: "track",
        label: "Track Shipment",
        icon: Eye,
        onClick: () => opTrackShipment(order),
      });
    }
    if (
      order.paymentMethod === "cod" &&
      order.codStatus === "pending_collection" &&
      !["cancelled", "returned"].includes(status)
    ) {
      items.push({
        key: "cod",
        label: "Collect COD",
        icon: DollarSign,
        onClick: () => opCollectCod(order),
      });
    }
    items.push({
      key: "invoice",
      label: "Generate Invoice",
      icon: FileText,
      sepBefore: true,
      onClick: () => downloadInvoice(order),
    });
    return items;
  };

  const filteredOrders = orders
    .filter((order) => {
      const matchesSearch =
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer.email.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;
      const matchesTab = currentTab === "all" || order.status === currentTab;

      return matchesSearch && matchesStatus && matchesTab;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.date) - new Date(a.date);
        case "date-asc":
          return new Date(a.date) - new Date(b.date);
        case "amount-desc":
          return b.total - a.total;
        case "amount-asc":
          return a.total - b.total;
        default:
          return 0;
      }
    });

  const stats = getOrderStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="flex flex-col items-center gap-4 sm:gap-5 py-10">
          <div className="relative">
            <div className="h-14 w-14 sm:h-16 sm:w-16 animate-spin rounded-full border-4 border-muted border-t-primary"></div>
            <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="text-center">
            <p className="text-base sm:text-lg font-semibold text-foreground mb-1">
              Loading Orders
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Please wait while we fetch the data...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const kpis = [
    {
      title: "Total orders",
      value: stats.total,
      icon: ShoppingBag,
      tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      title: "Pending",
      value: stats.pending,
      icon: Clock,
      tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      title: "Requests",
      value: requestCount,
      hint: "awaiting decision",
      icon: Inbox,
      tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      onClick: () => setCurrentTab("requests"),
    },
    {
      title: "Revenue",
      value: `₹${stats.revenue.toFixed(2)}`,
      hint: "verified paid only",
      icon: DollarSign,
      tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="container mx-auto p-0 space-y-4 sm:space-y-6 max-w-6xl">
        {loadError && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span className="flex-1 text-destructive">{loadError}</span>
            <Button onClick={fetchOrders} variant="outline" size="sm">
              Retry
            </Button>
          </div>
        )}
        {/* Page header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Orders
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track and manage all customer orders
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            const card = (
              <Card
                className={
                  k.onClick
                    ? "cursor-pointer hover:shadow-md transition-shadow"
                    : ""
                }
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${k.tile}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">
                        {k.title}
                      </p>
                      <p className="text-lg sm:text-2xl font-bold tabular-nums truncate">
                        {k.value}
                      </p>
                    </div>
                  </div>
                  {k.hint && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {k.hint}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
            return k.onClick ? (
              <button
                key={k.title}
                type="button"
                onClick={k.onClick}
                className="text-left"
              >
                {card}
              </button>
            ) : (
              <div key={k.title}>{card}</div>
            );
          })}
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardContent className="p-3 sm:p-4 md:p-6">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 sm:h-11 text-sm sm:text-base"
                />
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 sm:h-11 text-xs sm:text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-10 sm:h-11 text-xs sm:text-sm">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-desc">Newest First</SelectItem>
                    <SelectItem value="date-asc">Oldest First</SelectItem>
                    <SelectItem value="amount-desc">Highest Amount</SelectItem>
                    <SelectItem value="amount-asc">Lowest Amount</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={exportOrdersCsv}
                  className="h-10 sm:h-11 px-4 sm:px-6 col-span-2 sm:col-span-1 text-xs sm:text-sm"
                >
                  <Download className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders Tabs */}
        <Tabs
          value={currentTab}
          onValueChange={(v) => {
            setCurrentTab(v);
            // The decision queue must always be live when opened.
            if (v === "requests") refreshOrders({ realtime: true });
          }}
        >
          <TabsList className="grid w-full grid-cols-4 sm:grid-cols-7 h-auto p-1 bg-muted/50 gap-1">
            <TabsTrigger
              value="all"
              className="flex flex-col items-center gap-1 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold">All</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2"
              >
                {stats.total}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="requests"
              className="flex flex-col items-center gap-1 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold hidden sm:inline">Requests</span>
              <span className="font-semibold sm:hidden">Req</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2 bg-amber-500/20 text-amber-700"
              >
                {requestCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="pending"
              className="flex flex-col items-center gap-1 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold hidden sm:inline">Pending</span>
              <span className="font-semibold sm:hidden">Pend</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2 bg-yellow-500/20 text-yellow-700"
              >
                {stats.pending}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="processing"
              className="flex flex-col items-center gap-1 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold hidden sm:inline">Processing</span>
              <span className="font-semibold sm:hidden">Proc</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2 bg-blue-500/20 text-blue-700"
              >
                {stats.processing}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="shipped"
              className="flex flex-col items-center gap-1 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold hidden sm:inline">Shipped</span>
              <span className="font-semibold sm:hidden">Ship</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2 bg-purple-500/20 text-purple-700"
              >
                {stats.shipped}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="delivered"
              className="flex flex-col items-center gap-1 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold hidden sm:inline">Delivered</span>
              <span className="font-semibold sm:hidden">Deliv</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2 bg-green-500/20 text-green-700"
              >
                {stats.delivered}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="cancelled"
              className="flex flex-col items-center gap-1 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold hidden sm:inline">Cancelled</span>
              <span className="font-semibold sm:hidden">Canc</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2 bg-red-500/20 text-red-700"
              >
                {stats.cancelled}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={currentTab} className="mt-4 sm:mt-6">
            {currentTab === "requests" ? (
              <RequestsView
                cancelRequests={cancelRequests}
                returnRequests={returnRequests}
                onDecide={openDecision}
              />
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="block lg:hidden space-y-3 sm:space-y-4">
                  {filteredOrders.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 sm:py-12">
                        <div className="flex flex-col items-center gap-3 sm:gap-4">
                          <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-muted flex items-center justify-center">
                            <Package className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-base sm:text-lg">
                              No orders found
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Try adjusting your search or filters
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    filteredOrders.map((order) => {
                      const StatusIcon = getStatus(order.status).icon;
                      return (
                        <Card
                          key={order.id}
                          className="hover:shadow-md transition-shadow"
                        >
                          <CardContent className="p-3 sm:p-4">
                            <div className="space-y-3">
                              {/* Header */}
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-mono font-semibold text-primary text-xs sm:text-sm">
                                    {order.id}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(order.date).toLocaleDateString()}
                                  </div>
                                </div>
                                <OrderActionMenu
                                  items={getOrderActionMenu(order)}
                                  statusLabel={getStatus(order.status).label}
                                />
                              </div>

                              {/* Customer Info */}
                              <div className="flex items-center gap-2 sm:gap-3 py-2 border-y">
                                <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
                                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs sm:text-sm">
                                    {order.customer.avatar}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-sm sm:text-base truncate">
                                    {order.customer.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {order.customer.email}
                                  </p>
                                </div>
                              </div>

                              {/* Order Details */}
                              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-1">
                                    Items
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className="font-semibold text-xs"
                                  >
                                    {order.items}
                                  </Badge>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-1">
                                    Total
                                  </p>
                                  <p className="font-bold text-sm sm:text-base">
                                    ₹{order.total.toFixed(2)}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-1">
                                    Status
                                  </p>
                                  <Badge
                                    className={cn(
                                      "gap-1 text-[10px] sm:text-xs border",
                                      getStatus(order.status).color,
                                    )}
                                  >
                                    <StatusIcon className="h-3 w-3" />
                                    <span className="hidden sm:inline">
                                      {getStatus(order.status).label}
                                    </span>
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>

                {/* Desktop Table View */}
                <Card className="overflow-hidden hidden lg:block">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">
                            Order ID
                          </TableHead>
                          <TableHead className="font-semibold">
                            Customer
                          </TableHead>
                          <TableHead className="font-semibold">Items</TableHead>
                          <TableHead className="font-semibold">Total</TableHead>
                          <TableHead className="font-semibold">
                            Status
                          </TableHead>
                          <TableHead className="font-semibold">Date</TableHead>
                          <TableHead className="font-semibold text-right">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center py-12"
                            >
                              <div className="flex flex-col items-center gap-4">
                                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                                  <Package className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="font-semibold text-lg">
                                    No orders found
                                  </p>
                                  <p className="text-muted-foreground">
                                    Try adjusting your search or filters
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredOrders.map((order) => {
                            const StatusIcon = getStatus(order.status).icon;
                            return (
                              <TableRow
                                key={order.id}
                                className="hover:bg-muted/30 transition-colors"
                              >
                                <TableCell>
                                  <div className="font-mono font-semibold text-primary">
                                    {order.id}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10 shrink-0">
                                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                        {order.customer.avatar}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-semibold">
                                        {order.customer.name}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {order.customer.email}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className="font-semibold"
                                  >
                                    {order.items} items
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <span className="font-bold text-lg">
                                    ₹{order.total.toFixed(2)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    className={cn(
                                      "gap-2 border",
                                      getStatus(order.status).color,
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "h-2 w-2 rounded-full",
                                        getStatus(order.status).dotColor,
                                      )}
                                    ></span>
                                    <StatusIcon className="h-3.5 w-3.5" />
                                    <span>{getStatus(order.status).label}</span>
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(order.date).toLocaleDateString()}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <OrderActionMenu
                                    items={getOrderActionMenu(order)}
                                    statusLabel={getStatus(order.status).label}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Order Sheet */}
      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col max-h-[100dvh] gap-0 p-0 overflow-hidden">
          <SheetHeader className="shrink-0 px-4 sm:px-6 pt-5 sm:pt-6 pr-12">
            <SheetTitle className="text-lg sm:text-xl font-bold">
              Edit Order
            </SheetTitle>
            <SheetDescription>
              Make changes to the order details here. Click save when you're
              done.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
            <Form {...editOrderForm}>
              <form
                onSubmit={editOrderForm.handleSubmit(saveOrderEdit)}
                className="space-y-6"
              >
                {/* Order ID */}
                <FormField
                  control={editOrderForm.control}
                  name="orderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order ID</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          readOnly
                          className="bg-muted cursor-not-allowed"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Customer Name */}
                <FormField
                  control={editOrderForm.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="Enter customer name"
                            className="pl-10"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Customer Email */}
                <FormField
                  control={editOrderForm.control}
                  name="customerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="Enter customer email"
                            className="pl-10"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Customer Phone */}
                <FormField
                  control={editOrderForm.control}
                  name="customerPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Phone</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="Enter customer phone"
                            className="pl-10"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Shipping Address */}
                <FormField
                  control={editOrderForm.control}
                  name="shippingAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shipping Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Textarea
                            {...field}
                            placeholder="Enter shipping address"
                            className="pl-10 min-h-[80px] resize-none"
                            rows={3}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Payment Method */}
                <FormField
                  control={editOrderForm.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="Enter payment method"
                            className="pl-10"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <SheetFooter className="gap-2 pt-4 border-t px-4 sm:px-6 pb-5 sm:pb-6 shrink-0 flex-col-reverse sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => setEditSheetOpen(false)}
                    className="w-full sm:flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="w-full sm:flex-1"
                    disabled={savingEdit}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    {savingEdit ? "Saving…" : "Save Changes"}
                  </Button>
                </SheetFooter>
              </form>
            </Form>
          </div>
        </SheetContent>
      </Sheet>

      {/* Update Status Sheet */}
      <Sheet open={statusSheetOpen} onOpenChange={setStatusSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col max-h-[100dvh] gap-0 p-0 overflow-hidden">
          <SheetHeader className="shrink-0 px-4 sm:px-6 pt-5 sm:pt-6 pr-12">
            <SheetTitle className="text-lg sm:text-xl font-bold">
              Update Order Status
            </SheetTitle>
            <SheetDescription>
              Change the status of the order. The customer will be notified of
              this change.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
            <div className="space-y-6">
              {/* Order ID */}
              <div className="space-y-2">
                <Label
                  htmlFor="status-order-id"
                  className="text-sm font-medium"
                >
                  Order ID
                </Label>
                <Input
                  id="status-order-id"
                  type="text"
                  value={selectedOrder?.id || ""}
                  readOnly
                  className="bg-muted cursor-not-allowed font-mono"
                />
              </div>

              {/* Current Status */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Current Status</Label>
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                  {selectedOrder?.status && (
                    <>
                      <div
                        className={cn(
                          "h-3 w-3 rounded-full",
                          getStatus(selectedOrder.status).dotColor,
                        )}
                      />
                      <Badge
                        className={cn(
                          "gap-2 border",
                          getStatus(selectedOrder.status).color,
                        )}
                      >
                        {React.createElement(
                          getStatus(selectedOrder.status).icon,
                          { className: "h-3.5 w-3.5" },
                        )}
                        <span>{getStatus(selectedOrder.status).label}</span>
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              {/* New Status */}
              <div className="space-y-2">
                <Label htmlFor="new-status" className="text-sm font-medium">
                  New Status <span className="text-destructive">*</span>
                </Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger id="new-status" className="w-full">
                    <SelectValue placeholder="Select a new status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        <span>Pending</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="processing">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-blue-500" />
                        <span>Processing</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="shipped">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-purple-500" />
                        <span>Shipped</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="delivered">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>Delivered</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="cancelled">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span>Cancelled</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select the new status for this order
                </p>
              </div>

              {/* Customer Info Card */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="text-sm font-medium mb-3">
                  Customer Information
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">
                      {selectedOrder?.customer?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium">
                      {selectedOrder?.customer?.email}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2 pt-4 border-t px-4 sm:px-6 pb-5 sm:pb-6 shrink-0 flex-col-reverse sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setStatusSheetOpen(false)}
              className="w-full sm:flex-1"
            >
              Cancel
            </Button>
            <Button onClick={saveStatusUpdate} className="w-full sm:flex-1">
              <Truck className="mr-2 h-4 w-4" />
              Update Status
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Cancel Order Sheet */}
      <Sheet open={cancelSheetOpen} onOpenChange={setCancelSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col max-h-[100dvh] gap-0 p-0 overflow-hidden">
          <SheetHeader className="shrink-0 px-4 sm:px-6 pt-5 sm:pt-6 pr-12">
            <SheetTitle className="text-lg sm:text-xl font-bold text-destructive">
              Cancel Order
            </SheetTitle>
            <SheetDescription>
              This action cannot be undone. Please provide a reason for
              cancelling this order.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
            <div className="space-y-6">
              {/* Order ID */}
              <div className="space-y-2">
                <Label
                  htmlFor="cancel-order-id"
                  className="text-sm font-medium"
                >
                  Order ID
                </Label>
                <Input
                  id="cancel-order-id"
                  type="text"
                  value={selectedOrder?.id || ""}
                  readOnly
                  className="bg-muted cursor-not-allowed font-mono"
                />
              </div>

              {/* Order Details Card */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="text-sm font-medium mb-3">Order Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium break-words">
                      {selectedOrder?.customer?.name}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
                    <span className="text-muted-foreground">Items:</span>
                    <span className="font-medium">
                      {selectedOrder?.items} items
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
                    <span className="text-muted-foreground">Total Amount:</span>
                    <span className="font-bold text-base sm:text-lg">
                      ₹{selectedOrder?.total?.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Current Status:
                    </span>
                    {selectedOrder?.status && (
                      <Badge
                        className={cn(
                          "gap-1",
                          getStatus(selectedOrder.status).color,
                        )}
                      >
                        {React.createElement(
                          getStatus(selectedOrder.status).icon,
                          { className: "h-3 w-3" },
                        )}
                        <span>{getStatus(selectedOrder.status).label}</span>
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Cancellation Reason */}
              <div className="space-y-2">
                <Label htmlFor="cancel-reason" className="text-sm font-medium">
                  Reason for Cancellation{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Please provide a detailed reason for cancelling this order..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="min-h-[120px] resize-none"
                  rows={5}
                />
                <p className="text-xs text-muted-foreground">
                  This reason will be shared with the customer
                </p>
              </div>

              {/* Warning Message */}
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="flex gap-3">
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">
                      Warning: This action is permanent
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Once cancelled, the order cannot be restored. The customer
                      will receive a notification about the cancellation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2 pt-4 border-t px-4 sm:px-6 pb-5 sm:pb-6 shrink-0 flex-col-reverse sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setCancelSheetOpen(false)}
              className="w-full sm:flex-1"
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancelOrder}
              className="w-full sm:flex-1"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel Order
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Approve / Deny decision dialog for customer requests */}
      <Dialog
        open={Boolean(decisionDialog)}
        onOpenChange={(v) => !v && !deciding && setDecisionDialog(null)}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {decisionDialog?.action === "approve" ? "Approve" : "Deny"}{" "}
              {decisionDialog?.kind === "cancel" ? "cancellation" : "return"}{" "}
              request
            </DialogTitle>
            <DialogDescription className="break-all">
              {decisionDialog?.order?.id} ·{" "}
              {decisionDialog?.order?.customer?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/60 p-3 text-sm space-y-1">
              <p className="font-medium">
                {decisionDialog?.kind === "cancel"
                  ? decisionDialog?.order?.raw?.cancellation?.reason ||
                    "No reason given"
                  : decisionDialog?.order?.raw?.return?.reason ||
                    "No reason given"}
              </p>
              {(decisionDialog?.kind === "cancel"
                ? decisionDialog?.order?.raw?.cancellation?.detail
                : decisionDialog?.order?.raw?.return?.detail) && (
                <p className="text-muted-foreground text-xs sm:text-sm break-words">
                  {decisionDialog?.kind === "cancel"
                    ? decisionDialog?.order?.raw?.cancellation?.detail
                    : decisionDialog?.order?.raw?.return?.detail}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="decision-reason" className="text-sm font-medium">
                {decisionDialog?.action === "reject" ? (
                  <>
                    Reason for denial{" "}
                    <span className="text-destructive">*</span>
                  </>
                ) : (
                  <>
                    Note for the customer{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </>
                )}
              </Label>
              <Textarea
                id="decision-reason"
                placeholder={
                  decisionDialog?.action === "reject"
                    ? "Explain why this request cannot be approved..."
                    : "Optional message shown to the customer..."
                }
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                className="min-h-[100px] resize-none"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDecisionDialog(null)}
              disabled={deciding}
              className="w-full sm:w-auto"
            >
              Back
            </Button>
            <Button
              variant={
                decisionDialog?.action === "reject" ? "destructive" : "default"
              }
              onClick={confirmDecision}
              disabled={deciding}
              className="w-full sm:w-auto"
            >
              {deciding
                ? "Processing…"
                : decisionDialog?.action === "approve"
                  ? "Approve request"
                  : "Deny request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useRef, useCallback } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Search,
  Download,
  Eye,
  Mail,
  Phone,
  MapPin,
  ShoppingBag,
  DollarSign,
  Calendar,
  MoreVertical,
  UserPlus,
  Edit,
  Star,
  TrendingUp,
  Package,
  Ban,
  CheckCircle,
  UserCheck,
  Crown,
  UserCog2,
  Trash2,
  RefreshCcw,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usersApi } from "@/services/shop";
import { decrypt, decryptAddress, decryptField } from "@/utils/crypt";
import { cn } from "@/lib/utils";
import AvatarIcon from "@/components/avatar-icon";
import { api } from "@/utils/api";
import { alert } from "@/components/dialog-alert-provider";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import PaginationWithPrimaryButton from "@/components/customized/pagination/pagination-02";

const customerTierConfig = {
  new: {
    label: "New",
    icon: UserPlus,
    color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
    dotColor: "bg-gray-500",
  },
  regular: {
    label: "Regular",
    icon: UserCheck,
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    dotColor: "bg-blue-500",
  },
  premium: {
    label: "Premium",
    icon: Star,
    color:
      "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    dotColor: "bg-purple-500",
  },
  vip: {
    label: "VIP",
    icon: Crown,
    color:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    dotColor: "bg-amber-500",
  },
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [currentTab, setCurrentTab] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMode, setProfileMode] = useState("profile");
  const [profileDetail, setProfileDetail] = useState(null);
  const [profileOrders, setProfileOrders] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const requestRef = useRef({ key: "", promise: null });
  const [refreshKey, setRefreshKey] = useState(0);

  const [isSudo, setSudo] = useState(false);

  useStrictEffect(() => {
    async function checkSudo() {
      let { data: session } = await api.getSession();
      if (session && session.user) {
        setSudo(session.user.role === "owner" || session.user.role === "admin");
      }
    }
    checkSudo();
  }, []);

  const [loadError, setLoadError] = useState(null);

  const fetchCustomers = useCallback(
    async (realtime = false) => {
      const sort =
        sortBy === "spent-desc"
          ? { sortBy: "totalSpent", sortOrder: "desc" }
          : sortBy === "spent-asc"
            ? { sortBy: "totalSpent", sortOrder: "asc" }
            : sortBy === "orders-desc"
              ? { sortBy: "totalOrders", sortOrder: "desc" }
              : {
                  sortBy: "createdAt",
                  sortOrder: sortBy === "oldest" ? "asc" : "desc",
                };
      const params = {
        page: currentPage,
        limit: 30,
        ...sort,
        ...(appliedSearch.trim() ? { search: appliedSearch.trim() } : {}),
        ...(roleFilter !== "all" ? { roles: roleFilter } : {}),
        ...(currentTab !== "all"
          ? { status: currentTab === "active" ? "active" : "inactive" }
          : {}),
        ...(realtime ? { realtime: "true" } : {}),
      };
      const key = JSON.stringify(params);
      if (requestRef.current.key === key && requestRef.current.promise) {
        return requestRef.current.promise;
      }
      const request = (async () => {
        try {
          setIsLoading(true);
          setLoadError(null);
          const data = await usersApi.list(params);
          const users = Array.isArray(data) ? data : (data.users ?? []);
          setTotalPages(Math.max(Number(data?.totalPages) || 1, 1));
          setTotalCustomers(Number(data?.count) || users.length);
          setCustomers(
            users.map((u, i) => {
              // Names and address books are end-to-end encrypted at rest.
              const name = decryptField(u.name) ?? "Unknown";
              const address =
                u.address && typeof u.address === "object"
                  ? decryptAddress(u.address)
                  : {};
              return {
                id: u.id ?? u._id ?? `user-${i}`,
                name,
                // Email is stored plain, but decrypt defensively —
                // decryptField passes non-ciphertext through untouched.
                email:
                  decryptField(u.email) ||
                  "No email registered, Maybe suspicious",
                // Phone numbers may be stored encrypted (address-book flow).
                phone:
                  decryptField(u.phoneNumber) || "No phone number registered",
                image: decrypt(u.image) ?? "",
                // Determine the user's tier based on their role.
                tier:
                  u.role === "admin" || u.role === "owner" ? "vip" : "regular",
                role: u.role ?? "user",
                totalOrders: u.totalOrders ?? 0,
                totalSpent: u.totalSpent ?? 0,
                isActive: u.banned && u.isActive === false ? false : true,
                avatar: u.image ? decrypt(u.image) : null,
                averageOrderValue: u.totalOrders
                  ? (u.totalSpent ?? 0) / u.totalOrders
                  : 0,
                joinDate: u.createdAt
                  ? new Date(u.createdAt).toISOString().split("T")[0]
                  : "",
                lastOrder: u.lastLogin
                  ? new Date(u.lastLogin).toISOString().split("T")[0]
                  : "",
                location:
                  address.street && address.city && address.state
                    ? address.street +
                      ", " +
                      address.city +
                      ", " +
                      address.state
                    : address.street && address.city
                      ? address.street + ", " + address.city
                      : "No location registered",
                status: u.banned ? "inactive" : "active",
              };
            }),
          );
          setIsLoading(false);
        } catch (error) {
          console.error("Error fetching customers:", error);
          // Never render fake rows as if they were real customers.
          setCustomers([]);
          setLoadError(
            error?.response?.status === 403
              ? "Admin access required to view customers."
              : "Could not load customers. Check the connection and retry.",
          );
          setIsLoading(false);
        }
      })();
      requestRef.current = { key, promise: request };
      try {
        await request;
      } finally {
        if (requestRef.current.promise === request) {
          requestRef.current = { key: "", promise: null };
        }
      }
    },
    [appliedSearch, currentPage, currentTab, roleFilter, sortBy],
  );

  useStrictEffect(() => {
    fetchCustomers();
  }, [fetchCustomers, refreshKey]);

  const getCustomerStats = () => {
    const stats = {
      total: totalCustomers,
      active: customers.filter((c) => c.status === "active").length,
      inactive: customers.filter((c) => c.status === "inactive").length,
      new: customers.filter((c) => c.tier === "new").length,
      regular: customers.filter((c) => c.tier === "regular").length,
      premium: customers.filter((c) => c.tier === "premium").length,
      vip: customers.filter((c) => c.tier === "vip").length,
      totalRevenue: customers.reduce((sum, c) => sum + c.totalSpent, 0),
      averageLifetimeValue:
        customers.length > 0
          ? customers.reduce((sum, c) => sum + c.totalSpent, 0) /
            customers.length
          : 0,
    };
    return stats;
  };

  const openProfile = async (customer) => {
    setSelectedCustomer(customer);
    setProfileMode("profile");
    setProfileOpen(true);
    setProfileLoading(true);
    setProfileDetail(null);
    try {
      const user = await usersApi.get(customer.id);
      setProfileDetail({
        ...user,
        name: decryptField(user.name) || customer.name,
        email: decryptField(user.email) || customer.email,
        phoneNumber: decryptField(user.phoneNumber) || customer.phone,
        address:
          user.address && typeof user.address === "object"
            ? decryptAddress(user.address)
            : null,
        addressBook: Array.isArray(user.addressBook)
          ? user.addressBook.map(decryptAddress)
          : [],
      });
    } catch (error) {
      console.error("Error loading customer profile:", error);
      toast.error("Could not load customer profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const openOrderHistory = async (customer) => {
    setSelectedCustomer(customer);
    setProfileMode("orders");
    setProfileOpen(true);
    setProfileLoading(true);
    setProfileOrders([]);
    try {
      const { ordersApi } = await import("@/services/shop");
      const response = await ordersApi.list({ userId: customer.id, limit: 20 });
      const list =
        response?.orders ?? (Array.isArray(response) ? response : []);
      setProfileOrders(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Error loading customer orders:", error);
      toast.error("Could not load customer order history");
    } finally {
      setProfileLoading(false);
    }
  };

  const toggleCustomerStatus = async (customer) => {
    if (togglingId) return;
    const toBanned = customer.status === "active";
    if (
      !window.confirm(
        `${toBanned ? "Deactivate" : "Reactivate"} ${customer.name}?`,
      )
    )
      return;
    try {
      setTogglingId(customer.id);
      const { usersApi: uApi } = await import("@/services/shop");
      await uApi.setStatus(
        customer.id,
        toBanned,
        toBanned ? "Disabled by admin" : undefined,
      );
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customer.id
            ? { ...c, status: toBanned ? "inactive" : "active" }
            : c,
        ),
      );
      toast.success(`Customer ${toBanned ? "deactivated" : "reactivated"}`);
    } catch (error) {
      console.error("Error toggling customer status:", error);
      toast.error(
        error?.response?.data?.error ?? "Failed to update customer status",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const exportCustomersCsv = () => {
    try {
      const rows = [
        [
          "id",
          "name",
          "email",
          "phone",
          "tier",
          "status",
          "totalOrders",
          "totalSpent",
          "joinDate",
        ],
        ...filteredCustomers.map((c) => [
          c.id,
          c.name,
          c.email,
          c.phone,
          c.tier,
          c.status,
          c.totalOrders,
          Number(c.totalSpent ?? 0).toFixed(2),
          c.joinDate,
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
      a.download = `razorbills-customers-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filteredCustomers.length} customer(s) to CSV`);
    } catch (error) {
      console.error("CSV export failed:", error);
      toast.error("Failed to export customers");
    }
  };

  const roleOptions = [
    { value: "user", label: "User" },
    { value: "admin", label: "Admin" },
    { value: "owner", label: "Owner" },
    { value: "manager", label: "Manager" },
    { value: "productManager", label: "Product Manager" },
    { value: "orderManager", label: "Order Manager" },
    { value: "supportAgent", label: "Support Agent" },
  ];

  const openChangeRole = (customer) => {
    alert
      .prompt({
        title: "Change Customer Role",
        description: `Change the role of ${customer.name}.`,
        fields: [
          {
            name: "role",
            label: "Role",
            type: "select",
            defaultValue: new String(customer.role).trim().toLowerCase(),
            required: true,
            options: roleOptions,
          },
        ],
      })
      .then(function (result) {
        if (result && result.role && result.role !== customer.role) {
          toast.promise(
            () =>
              new Promise(async (resolve, reject) => {
                const newRole = result.role;
                authClient.admin
                  .setRole(
                    {
                      userId: customer.id,
                      role: newRole,
                    },
                    {
                      onSuccess: () => {
                        resolve();
                        setCustomers(() =>
                          customers.map((c) =>
                            c.id === customer.id ? { ...c, role: newRole } : c,
                          ),
                        );
                      },
                      onError: (ctx) => {
                        reject(ctx?.error?.message || "Failed to change role");
                      },
                    },
                  )
                  .then(({ error }) => {
                    if (error) {
                      reject(error.message || "Failed to change role");
                    }
                  })
                  .catch((error) => {
                    reject("Network error or unexpected issue occurred");
                  });
              }),
            {
              loading: "Changing role...",
              success: `Role changed to ${result.role}`,
              error: (err) => err || "Failed to change role",
            },
          );
        }
      });
  };

  const openProfileEdit = (customer) => {
    alert
      .prompt({
        title: "Edit Customer Profile",
        description: `Edit the profile of ${customer.name}.`,
        fields: [
          {
            name: "name",
            label: "Name",
            type: "text",
            defaultValue: customer.name,
            required: true,
          },
          {
            name: "phone",
            label: "Phone",
            type: "tel",
            defaultValue: customer.phone,
            required: false,
          },
          {
            name: "avatar",
            label: "Avatar URL",
            type: "text",
            defaultValue: customer.image,
            required: false,
          },
          {
            name: "isActive",
            label: "Active Status",
            type: "checkbox",
            defaultValue: !!customer.isActive,
          },
        ],
        schema: z.object({
          name: z
            .string()
            .min(3, "Name is required and must be at least 3 characters long"),
          phone: z.string().optional(),
          avatar: z.string().url("Invalid avatar URL").optional(),
          isActive: z.boolean().optional(),
        }),
      })
      .then(function (result) {
        // check if the result is valid and different from the current customer data
        const isDifferent = Object.keys(result).some((key) => {
          return result[key] !== customer[key];
        });
        if (result && isDifferent) {
          toast.promise(
            () =>
              new Promise(async (resolve, reject) => {
                usersApi
                  .update(customer.id, {
                    name: result.name,
                    phone: result.phone,
                    avatar: result.avatar,
                    isActive: result.isActive,
                  })
                  .then((result) => {
                    console.log("Profile update result:", result);
                    resolve();
                  })
                  .catch((error) => {
                    reject("Network error or unexpected issue occurred");
                  });
              }),
            {
              loading: "Updating profile...",
              success: "Profile updated successfully",
              error: (err) => err || "Failed to update profile",
            },
          );
        }
      });
  };

  const deleteCustomer = (customer) => {
    alert.error({
      // error used for here to show red color for delete confirmation ( as Danger action )
      title: "Delete Customer",
      description: `Are you sure you want to delete ${customer.name}?`,
      onClose: (confirmed) => {
        if (confirmed === true) {
          toast.promise(
            new Promise(async (resolve, reject) => {
              try {
                const { data, error } = await authClient.admin.removeUser({
                  userId: customer.id,
                });

                if (error) {
                  reject(error.message || "Failed to delete customer");
                } else {
                  resolve(data);
                  setCustomers((prev) =>
                    prev.filter((c) => c.id !== customer.id),
                  );
                }
              } catch (error) {
                reject(error.message || "Failed to delete customer");
              }
            }),
            {
              loading: "Deleting customer...",
              success: "Customer deleted successfully",
              error: (err) => err || "Failed to delete customer",
            },
          );
        } else {
          toast.info("Delete action cancelled");
        }
      },
      buttonText: "Delete",
      secondaryButtonText: "Cancel",
    });
  };

  const filteredCustomers = customers;
  const stats = getCustomerStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="flex flex-col items-center gap-4 sm:gap-5 py-10">
          <div className="relative">
            <div className="h-14 w-14 sm:h-16 sm:w-16 animate-spin rounded-full border-4 border-muted border-t-primary"></div>
            <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="text-center">
            <p className="text-base sm:text-lg font-semibold text-foreground mb-1">
              Loading Customers
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
      title: "Total customers",
      value: stats.total,
      icon: Users,
      tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      title: "Active",
      value: stats.active,
      icon: CheckCircle,
      tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "VIP members",
      value: stats.vip,
      icon: Crown,
      tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      title: "Avg. lifetime value",
      value: `₹${stats.averageLifetimeValue.toFixed(0)}`,
      icon: TrendingUp,
      tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="container mx-auto p-0 space-y-4 sm:space-y-6 max-w-6xl">
        {loadError && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span className="flex-1 text-destructive">{loadError}</span>
            <button
              onClick={() => setRefreshKey((value) => value + 1)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Retry
            </button>
          </div>
        )}
        {/* Page header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Customers
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage and engage with your customers
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <Card key={k.title}>
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
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setCurrentPage(1);
                      setAppliedSearch(searchQuery);
                    }
                  }}
                  className="pl-10 h-10 sm:h-11 text-sm sm:text-base"
                />
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3">
                <Select
                  value={roleFilter}
                  onValueChange={(value) => {
                    setCurrentPage(1);
                    setRoleFilter(value);
                  }}
                >
                  <SelectTrigger className="h-10 sm:h-11 text-xs sm:text-sm">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sortBy}
                  onValueChange={(value) => {
                    setCurrentPage(1);
                    setSortBy(value);
                  }}
                >
                  <SelectTrigger className="h-10 sm:h-11 text-xs sm:text-sm">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Most Recent</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="spent-desc">Highest Spending</SelectItem>
                    <SelectItem value="spent-asc">Lowest Spending</SelectItem>
                    <SelectItem value="orders-desc">Most Orders</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => setRefreshKey((value) => value + 1)}
                  className="h-10 sm:h-11 px-4 sm:px-6 col-span-2 sm:col-span-1 text-xs sm:text-sm"
                  variant="outline"
                >
                  <RefreshCcw className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Refresh
                </Button>
                <Button
                  onClick={exportCustomersCsv}
                  className="h-10 sm:h-11 px-4 sm:px-6 col-span-2 sm:col-span-1 text-xs sm:text-sm"
                  variant="secondary"
                >
                  <Download className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customers Tabs */}
        <Tabs
          value={currentTab}
          onValueChange={(value) => {
            setCurrentPage(1);
            setCurrentTab(value);
          }}
        >
          <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-muted/50 gap-1">
            <TabsTrigger
              value="all"
              className="flex flex-row items-center gap-2 py-2 sm:py-3 text-xs sm:text-sm"
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
              value="active"
              className="flex flex-row items-center gap-2 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold">Active</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2 bg-green-500/20 text-green-700"
              >
                {stats.active}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="inactive"
              className="flex flex-row items-center gap-2 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <span className="font-semibold">Inactive</span>
              <Badge
                variant="secondary"
                className="text-[10px] sm:text-xs px-1.5 sm:px-2 bg-gray-500/20 text-gray-700"
              >
                {stats.inactive}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={currentTab} className="mt-4 sm:mt-6">
            <div className="grid gap-3 sm:gap-4 md:gap-6">
              {filteredCustomers.length === 0 ? (
                <Card>
                  <CardContent className="py-8 sm:py-12">
                    <div className="flex flex-col items-center gap-3 sm:gap-4">
                      <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-muted flex items-center justify-center">
                        <Users className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-base sm:text-lg">
                          No customers found
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Try adjusting your search or filters
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredCustomers.map((customer) => {
                    const TierIcon = customerTierConfig[customer.tier].icon;
                    return (
                      <Card
                        key={customer.id}
                        className="hover:shadow-md transition-shadow overflow-hidden"
                      >
                        <CardHeader className="pb-3 sm:pb-4 bg-muted/40 border-b p-3 sm:p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              <AvatarIcon
                                className={
                                  "h-11 w-11 sm:h-12 sm:w-12 shrink-0 border"
                                }
                                name={customer.name}
                                img={customer.image}
                              ></AvatarIcon>
                              <div className="min-w-0 flex-1">
                                <CardTitle className="text-base sm:text-lg truncate">
                                  {customer.role === "owner" && (
                                    <Crown className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-amber-500 inline-block mr-1" />
                                  )}
                                  {customer.role === "admin" && (
                                    <BadgeCheck className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-green-500  rounded-full inline-block mr-1" />
                                  )}
                                  {customer.role === "manager" && (
                                    <UserCheck className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-green-500 inline-block mr-1" />
                                  )}
                                  {customer.role === "productManager" && (
                                    <Package className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-purple-500 inline-block mr-1" />
                                  )}
                                  {customer.role === "orderManager" && (
                                    <ShoppingCart className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-yellow-500 inline-block mr-1" />
                                  )}
                                  {customer.role === "supportAgent" && (
                                    <Headphones className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-red-500 inline-block mr-1" />
                                  )}
                                  {customer.name}
                                </CardTitle>
                                <p className="text-xs sm:text-sm text-muted-foreground font-mono truncate">
                                  {customer.id}
                                </p>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 flex-shrink-0"
                                  aria-label="Customer actions"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openProfile(customer)}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openOrderHistory(customer)}
                                >
                                  <ShoppingBag className="mr-2 h-4 w-4" />
                                  Order History
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <a href={`mailto:${customer.email}`}>
                                    <Mail className="mr-2 h-4 w-4" />
                                    Send Email
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openChangeRole(customer)}
                                  disabled={isSudo === false}
                                >
                                  <UserCog2 className="mr-2 h-4 w-4" />
                                  Change Role
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openProfileEdit(customer)}
                                  disabled={isSudo === false}
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Update details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className={
                                    customer.status === "active"
                                      ? "text-red-600"
                                      : "text-green-600"
                                  }
                                  disabled={isSudo === false}
                                  onClick={() => toggleCustomerStatus(customer)}
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  {customer.status === "active"
                                    ? "Deactivate"
                                    : "Reactivate"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => deleteCustomer(customer)}
                                  disabled={isSudo === false}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Customer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-3 sm:pt-4 space-y-3 sm:space-y-4 p-3 sm:p-4">
                          {/* Tier Badge */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-row gap-2">
                              <Badge
                                className={cn(
                                  "gap-1.5 sm:gap-2 border text-xs",
                                  customerTierConfig[customer.tier].color,
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full",
                                    customerTierConfig[customer.tier].dotColor,
                                  )}
                                ></span>
                                <TierIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                {customerTierConfig[customer.tier].label}
                              </Badge>
                              <Badge
                                className={cn(
                                  "gap-1.5 sm:gap-2 border text-xs",
                                  "bg-card/10 text-primary border-border",
                                )}
                              >
                                {/* <TierIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> */}
                                {new String(customer.role).at(0).toUpperCase() +
                                  new String(customer.role).slice(1)}
                              </Badge>
                            </div>
                            <Badge
                              variant={
                                customer.status === "active"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {customer.status}
                            </Badge>
                          </div>

                          {/* Contact Info */}
                          <div className="space-y-1.5 sm:space-y-2">
                            <div className="flex items-center gap-2 text-xs sm:text-sm">
                              <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground truncate">
                                {customer.email}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs sm:text-sm">
                              <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">
                                {customer.phone}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs sm:text-sm">
                              <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground truncate">
                                {customer.location}
                              </span>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2 sm:pt-3 border-t">
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
                                <ShoppingBag className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
                                <p className="text-[10px] sm:text-xs text-muted-foreground">
                                  Orders
                                </p>
                              </div>
                              <p className="text-base sm:text-lg font-bold">
                                {customer.totalOrders}
                              </p>
                            </div>
                            <div className="text-center border-x">
                              <div className="flex items-center justify-center gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
                                <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600" />
                                <p className="text-[10px] sm:text-xs text-muted-foreground">
                                  Spent
                                </p>
                              </div>
                              <p className="text-base sm:text-lg font-bold text-green-600">
                                ₹{customer.totalSpent.toFixed(0)}
                              </p>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
                                <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-600" />
                                <p className="text-[10px] sm:text-xs text-muted-foreground">
                                  AOV
                                </p>
                              </div>
                              <p className="text-base sm:text-lg font-bold text-blue-600">
                                ₹{customer.averageOrderValue.toFixed(0)}
                              </p>
                            </div>
                          </div>

                          {/* Dates */}
                          <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-2 sm:pt-3 border-t text-[10px] sm:text-xs">
                            <div>
                              <p className="text-muted-foreground mb-0.5 sm:mb-1">
                                Joined
                              </p>
                              <div className="flex items-center gap-0.5 sm:gap-1 font-semibold">
                                <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                <span className="truncate">
                                  {customer.joinDate
                                    ? new Date(
                                        customer.joinDate,
                                      ).toLocaleDateString()
                                    : "—"}
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5 sm:mb-1">
                                Last Order
                              </p>
                              <div className="flex items-center gap-0.5 sm:gap-1 font-semibold">
                                <Package className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                <span className="truncate">
                                  {customer.lastOrder
                                    ? new Date(
                                        customer.lastOrder,
                                      ).toLocaleDateString()
                                    : "—"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-2 sm:pt-3 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-8 sm:h-9 text-xs"
                              onClick={() => openProfile(customer)}
                            >
                              <Eye className="mr-1 sm:mr-2 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 h-8 sm:h-9 text-xs"
                              asChild
                            >
                              <a href={`mailto:${customer.email}`}>
                                <Mail className="mr-1 sm:mr-2 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                Contact
                              </a>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              {totalPages > 1 && (
                <PaginationWithPrimaryButton
                  page={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Customer profile + order history dialog (live backend data) */}
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {profileMode === "orders"
                  ? `${selectedCustomer?.name ?? "Customer"} - Order History`
                  : (selectedCustomer?.name ?? "Customer")}
              </DialogTitle>
              <DialogDescription>
                {selectedCustomer?.email} · {selectedCustomer?.id}
              </DialogDescription>
            </DialogHeader>
            {profileLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Loading profile…
              </p>
            ) : profileMode === "orders" ? (
              <div>
                <p className="text-sm font-semibold mb-2">Order history</p>
                {profileOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No orders found for this customer.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {profileOrders.map((o) => (
                      <div
                        key={o.id ?? o._id}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm"
                      >
                        <div>
                          <p className="font-mono font-semibold">
                            {o.id ?? o._id}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {o.status} · {o.payment?.method} (
                            {o.payment?.status})
                          </p>
                        </div>
                        <p className="font-bold">
                          ₹{Number(o.totalAmount ?? 0).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Orders</p>
                    <p className="text-lg font-bold">
                      {profileDetail?.totalOrders ??
                        selectedCustomer?.totalOrders ??
                        0}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Spent</p>
                    <p className="text-lg font-bold">
                      ₹
                      {Number(
                        profileDetail?.totalSpent ??
                          selectedCustomer?.totalSpent ??
                          0,
                      ).toFixed(0)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-lg font-bold capitalize">
                      {selectedCustomer?.status}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="break-all text-sm font-medium">
                      {profileDetail?.email ?? selectedCustomer?.email ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium">
                      {profileDetail?.phoneNumber ??
                        selectedCustomer?.phone ??
                        "—"}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-1 text-xs text-muted-foreground">
                      Address
                    </p>
                    {(() => {
                      const address =
                        profileDetail?.address ??
                        profileDetail?.addressBook?.[0];
                      return address ? (
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span>
                            {[
                              address.street,
                              address.city,
                              address.state,
                              address.postalCode ?? address.zipCode,
                              address.country,
                            ]
                              .filter(Boolean)
                              .join(", ") || "No address registered"}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No address registered
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

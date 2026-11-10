import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  BarChart3,
  Tags,
  FileText,
  ChevronRight,
  LifeBuoy,
  CreditCard,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useEffect } from "react";
import { useStoreInfo } from "@/utils/store";
import { useUserSession } from "@/contexts/user-session-context";
import { decrypt } from "@/utils/crypt";
import AvatarIcon from "./avatar-icon";

const navItems = {
  main: {
    label: "Main Navigation",
    items: [
      {
        title: "Dashboard",
        url: "/auth/admin/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Products",
        url: "/auth/admin/products",
        icon: Package,
      },
      {
        title: "Orders",
        url: "/auth/admin/orders",
        icon: ShoppingCart,
      },
      {
        title: "Customers",
        url: "/auth/admin/customers",
        icon: Users,
      },
      {
        title: "Categories",
        url: "/auth/admin/categories",
        icon: Tags,
      },
      {
        title: "Analytics",
        url: "/auth/admin/analytics",
        icon: BarChart3,
      },
      {
        title: "Payments",
        url: "/auth/admin/payments",
        icon: CreditCard,
      },
      {
        title: "Support",
        url: "/auth/admin/support",
        icon: LifeBuoy,
      },
    ],
  },
  quick: {
    label: "Quick Actions",
    items: [
      {
        title: "New Product",
        url: "/auth/admin/products/new",
        icon: Package,
      },
    ],
  },
};

const navItemsArray = [
  ...Object.values(navItems).flatMap((group) => group.items),
  {
    title: "Settings",
    url: "/auth/admin/settings",
    icon: Settings,
  },
];

export function AdminSidebar({
  collapsible,
  variant,
  side,
  savePageInfo,
  ...props
}) {
  const location = useLocation();
  const store = useStoreInfo();
  const navItemsKeys = Object.keys(navItems);
  const { data: session } = useUserSession();
  const adminName = session?.user?.name ?? "Admin User";
  const adminEmail = session?.user?.email ?? store.emailSupport;

  // Update page info when location changes
  useEffect(() => {
    const currentNav = navItemsArray.find(
      (item) => item.url === location.pathname,
    );
    if (currentNav) {
      savePageInfo(currentNav);
    }
  }, [location.pathname, savePageInfo]);

  return (
    <Sidebar collapsible={collapsible} variant={variant} side={side} {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Admin Panel</span>
            <span className="text-xs text-muted-foreground">{store.name}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navItemsKeys.map((key) => {
          const group = navItems[key];

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.url;

                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link to={item.url}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-4">
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center justify-center rounded-full bg-primary/10">
              <AvatarIcon
                className={"w-8 h-8"}
                name={adminName}
                img={session?.user?.image}
                size={32}
              />
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{decrypt(adminName)}</span>
              <span className="text-xs text-muted-foreground">
                {adminEmail}
              </span>
            </div>
          </div>
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/auth/admin/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

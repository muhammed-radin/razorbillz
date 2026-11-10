import React, { useState } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  User,
  Users,
  Palette,
  LogOut,
  Sun,
  Moon,
  Laptop,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { useTheme } from "@/utils/theme-provider";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { decryptField } from "@/utils/crypt";
import { useUserSession } from "@/contexts/user-session-context";
import AvatarIcon from "@/components/avatar-icon";

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { data: session, isPending } = useUserSession();
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [adminError, setAdminError] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const current = session?.user ?? null;

  useStrictEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingAdmins(true);
        setAdminError(null);
        const { usersApi } = await import("@/services/shop");
        const data = await usersApi.list({
          limit: 50,
          roles: "admin,owner",
        });
        const users = Array.isArray(data) ? data : (data.users ?? []);
        if (!cancelled) {
          setAdmins(
            users
              .filter((u) => u.role === "admin" || u.role === "owner")
              .map((u) => ({
                ...u,
                // Names are end-to-end encrypted at rest.
                name: decryptField(u.name) ?? "Unknown",
              }))
              .slice(0, 10),
          );
        }
      } catch (err) {
        console.error("Error fetching admins:", err);
        if (!cancelled) {
          setAdmins([]);
          setAdminError(
            err?.response?.status === 403
              ? "Admin access required to view the admin list."
              : "Could not load the admin list. Check the connection and retry.",
          );
        }
      } finally {
        if (!cancelled) setLoadingAdmins(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await api.actions.logOut();
      toast.success("Logged out of Admin session");
      navigate("/login");
    } catch (err) {
      console.error("Admin logout failed:", err);
      toast.error("Logout failed. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  const getInitials = (name) => {
    return (name ?? "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const displayName = current?.name ?? "Admin";
  const displayEmail = current?.email ?? "";
  const displayRole =
    current?.role === "owner"
      ? "Owner"
      : current?.role === "admin"
        ? "Admin"
        : "Admin";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Helmet>
        {/* Single expression: react-helmet-async renders nothing for a <title>
         * assembled from multiple JSX children. */}
        <title>{`${t("adminSettings.title")} - ${t("store.name")}`}</title>
      </Helmet>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t("adminSettings.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("adminSettings.subtitle")}
        </p>
      </div>

      <div className="space-y-6">
        {/* 1. Admin Profile (live session) */}
        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="w-5 h-5 text-primary" />
              {t("adminSettings.adminProfile")}
            </CardTitle>
            <CardDescription>
              {t("adminSettings.adminProfileDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 p-4 rounded-lg bg-muted/30 border">
              <AvatarIcon
                name={current?.name}
                img={current?.image}
                className="h-16 w-16 border-2 border-primary/20"
              />

              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {isPending ? "Loading…" : displayName}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    <ShieldCheck className="w-3 h-3" />
                    {displayRole}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {displayEmail}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Admin List (live, max 10) */}
        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5 text-primary" />
              {t("adminSettings.admins")}
            </CardTitle>
            <CardDescription>{t("adminSettings.adminsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAdmins ? (
              <p className="text-sm text-muted-foreground p-4">
                Loading administrators…
              </p>
            ) : adminError ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <span className="flex-1 text-destructive">{adminError}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </div>
            ) : admins.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">
                No administrator accounts found.
              </p>
            ) : (
              <div className="divide-y rounded-lg border bg-card">
                {admins.slice(0, 10).map((admin) => (
                  <div
                    key={admin.id ?? admin._id}
                    className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3.5">
                      <AvatarIcon
                        name={admin.name}
                        img={admin.image}
                        className="h-10 w-10 border"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {admin.name ?? "Unknown"}
                          </span>
                          {current && admin.id === current.id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground block">
                          {admin.email ?? ""}
                        </span>
                      </div>
                    </div>

                    <span className="text-xs text-muted-foreground font-medium px-2 py-1 rounded bg-muted capitalize">
                      {admin.role ?? "admin"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Theme Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="w-5 h-5 text-primary" />
              {t("adminSettings.theme")}
            </CardTitle>
            <CardDescription>{t("adminSettings.themeDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Light */}
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex flex-col items-center justify-center p-5 rounded-lg border-2 transition-all duration-200 ${
                  theme === "light"
                    ? "border-primary bg-primary/5 text-primary shadow-sm"
                    : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sun className="w-7 h-7 mb-2" />
                <span className="font-semibold text-sm">
                  {t("adminSettings.light")}
                </span>
              </button>

              {/* Dark */}
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex flex-col items-center justify-center p-5 rounded-lg border-2 transition-all duration-200 ${
                  theme === "dark"
                    ? "border-primary bg-primary/5 text-primary shadow-sm"
                    : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Moon className="w-7 h-7 mb-2" />
                <span className="font-semibold text-sm">
                  {t("adminSettings.dark")}
                </span>
              </button>

              {/* System */}
              <button
                type="button"
                onClick={() => setTheme("system")}
                className={`flex flex-col items-center justify-center p-5 rounded-lg border-2 transition-all duration-200 ${
                  theme === "system"
                    ? "border-primary bg-primary/5 text-primary shadow-sm"
                    : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Laptop className="w-7 h-7 mb-2" />
                <span className="font-semibold text-sm">
                  {t("adminSettings.system")}
                </span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* 4. Account / Logout */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t("adminSettings.account")}
            </CardTitle>
            <CardDescription>{t("adminSettings.accountDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div>
                <h4 className="font-semibold text-sm">
                  {t("adminSettings.logout")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t("adminSettings.logoutDesc")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                disabled={loggingOut}
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
                {loggingOut ? "Logging out…" : t("adminSettings.logout")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

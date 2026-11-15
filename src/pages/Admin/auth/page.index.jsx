import { Logo } from "@/components/logo";
import { Outlet, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/utils/theme-provider";

import { StrictMode, useEffect } from "react";
import { LoaderScreen } from "@/components/LoaderScreen";
import { authClient } from "@/lib/auth-client";
import { isStaffRole } from "@shared/utils/roles";

const AdminAuth = () => {
  const navigate = useNavigate();

  const { data, isPending, error } = authClient.useSession();

  useEffect(() => {
    if (isPending) {
      return;
    }
    if (error) {
      navigate("/404");
      return;
    }
    if (!data || !data.user || !isStaffRole(data.user.role)) {
      navigate("/404");
    }
  }, [data, error, isPending, navigate]);

  return (
    <StrictMode>
      <ThemeProvider>
        {isPending ? (
          <LoaderScreen />
        ) : data && data.user && isStaffRole(data.user?.role) ? (
          <Outlet />
        ) : (
          <div className="flex min-h-screen flex-col items-center justify-center bg-background">
            <div className="flex flex-row mb-3">
              <Logo />
            </div>
            <h1 className="text-2xl font-bold text-foreground font- mb-1">
              AUTHENTICATION REQUIRED
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              Please authenticate to access the admin panel.
            </p>
          </div>
        )}
      </ThemeProvider>
    </StrictMode>
  );
};

export default AdminAuth;

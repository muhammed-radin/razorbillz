import { Button } from "@/components/ui/button";
import { Logo } from "../logo";
import { NavMenu } from "./nav-menu";
import { NavigationSheet } from "./navigation-sheet";
import { SunIcon, MoonIcon, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "@/utils/theme-provider";
import AvatarMenu from "../avatar-menu";
import { useTranslation } from "react-i18next";
import { useUserSession } from "@/contexts/user-session-context";
import { Skeleton } from "../ui/skeleton";
import { isStaffRole } from "@shared/utils/roles";

const NavbarBlock = () => {
  const { setTheme, theme } = useTheme();
  const { t } = useTranslation();

  const { data, isPending } = useUserSession();
  const user = data?.user;

  /* Quick admin-console entry for staff accounts only. Shoppers
   * ("user" / legacy "customer") and guests never see it. */
  const canOpenAdmin =
    Boolean(user) && !user.isAnonymous && isStaffRole(user.role);

  return (
    <nav className="h-16 bg-background border-b sticky top-0 z-50 w-full">
      <div className="h-full flex items-center justify-between max-w-(--breakpoint-xl) mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Logo />

          {/* Desktop Menu */}
          <NavMenu className="hidden lg:block" />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {canOpenAdmin ? (
            <Button
              asChild
              size="icon"
              variant="outline"
              aria-label={t("nav.adminPanel", {
                defaultValue: "Open admin panel",
              })}
              title={t("nav.adminPanel", {
                defaultValue: "Open admin panel",
              })}
              className="shrink-0"
            >
              <Link to="/auth/admin/dashboard">
                <LayoutDashboard className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}

          {/* theme button */}
          <Button
            size="icon"
            variant="outline"
            aria-label={t("nav.toggleTheme")}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="max-[330px]:hidden"
          >
            {theme === "light" ? (
              <MoonIcon className="h-4 w-4" />
            ) : (
              <SunIcon className="h-4 w-4" />
            )}
          </Button>

          {/* avatar or auth buttons */}
          {isPending ? (
            <Skeleton className="h-10 w-10 rounded-full" />
          ) : user && user.isAnonymous == false ? (
            <AvatarMenu
              name={user.name}
              img={user.profilePicture}
              user={user}
              size={40}
              decrypted={true}
              isAnonymous={user.isAnonymous}
            />
          ) : (
            <>
              <Link to="/login" className="cursor-pointer">
                <Button variant="outline" className="hidden lg:inline-flex">
                  {t("nav.signIn")}
                </Button>
              </Link>
              <Link to="/signup" className="cursor-pointer">
                <Button>{t("nav.signUp")}</Button>
              </Link>
            </>
          )}

          {/* Mobile Menu */}
          <div className="lg:hidden">
            <NavigationSheet />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default NavbarBlock;

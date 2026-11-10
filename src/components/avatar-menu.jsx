import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  User,
  MapPin,
} from "lucide-react";
import { api } from "@/utils/api";
import { toast } from "sonner";
import AvatarIcon from "./avatar-icon";
import { decrypt } from "@/utils/crypt";
import React, { useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";

const AvatarMenu = ({ name, img, user, isAnonymous }) => {
  const { t } = useTranslation();

  const decryptedUserName = useMemo(() => {
    return decrypt(name);
  }, [user.name]);

  const handleLogout = useCallback(() => {
    toast.promise(
      () =>
        new Promise((resolve, reject) => {
          api.actions
            .logOut()
            .then(() => {
              resolve(t("avatarMenu.signedOutSuccess"));
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            })
            .catch((err) => {
              reject(err);
            });
        }),
      {
        loading: t("avatarMenu.signingOut"),
        success: (msg) => `${msg}`,
        error: (err) =>
          t("avatarMenu.logOutFailed", {
            error:
              err.response?.data?.message || err.message || "Unknown error",
          }),
      },
    );
  }, [t]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-3">
        <AvatarIcon name={name} img={img} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="mt-2 w-72">
        <DropdownMenuItem className="py-3">
          <AvatarIcon name={name} img={img} />
          <div className="ml-1 flex flex-col">
            <p className="text-sm font-medium">{decryptedUserName}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <User className="mr-1" /> {t("avatarMenu.myProfile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/cart">
            <ShoppingCart className="mr-1" /> {t("avatarMenu.cart")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/order">
            <ShoppingBag className="mr-1" /> {t("avatarMenu.orders")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings2 className="mr-1" /> {t("avatarMenu.preferences")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/addressbook">
            <MapPin className="mr-1" /> {t("avatarMenu.addresses")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-1" /> {t("avatarMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default React.memo(AvatarMenu);

import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { encrypt } from "../crypt";
import { generateHashLink } from "@shared/utils/route-util";
import { api } from "../api";

export default function onUserGoogleSignIn(setIsInputDisabled) {
  function navigate(path) {
    window.location.href = generateHashLink(path);
  }

  function setInputDisabledState(state) {
    if (typeof setIsInputDisabled === "function") {
      setIsInputDisabled(state);
    }
  }

  toast.promise(
    () =>
      new Promise((resolveui, rejectui) => {
        try {
          authClient.signIn
            .social(
              {
                provider: "google",
                callbackURL: generateHashLink("/?auth=google&success=true"),
                errorCallbackURL: generateHashLink(
                  "/login?auth=google&success=false",
                ),
                scopes: ["profile", "email", "openid"],
              },
              {
                onError: (ctx) => {
                  const error = ctx.error || ctx;
                  const errorMessage = error.message || error.statusText;
                  rejectui(
                    `${errorMessage || ctx.response?.statusText || "Unknown error"}`,
                  );
                },
              },
            )
            .then((response) => {
              api.clearSessionCache(); // clear session cache to ensure fresh session data
            })
            .catch((error) => {
              console.error("Google Sign-In error:", error);
              rejectui(
                `${error.errorMessage || error.message || error.response?.data?.message || "Unknown error"}`,
              );
            });
        } catch (error) {
          console.error("Google Sign-In error:", error);
          rejectui(
            `${error.errorMessage || error.message || error.response?.data?.message || "Unknown error"}`,
          );
        }
      }),
    {
      loading: "Signing in...",
      success: (msg) => {
        setInputDisabledState(false);
        return `${msg}`;
      },
      error: (err) => {
        setInputDisabledState(false);
        return `Sign-in failed: ${err || err.errorMessage || err.message || err.response?.data?.message || "Unknown error"}`;
      },
    },
  );
}

import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { origin } from "@shared/utils/route-util";
import { api } from "../api";

export default function onUserGoogleSignIn(setIsInputDisabled) {
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
                callbackURL: origin()
                  .path("/")
                  .query({ auth: "google", success: "true" })
                  .url(),
                errorCallbackURL: origin()
                  .path("/login")
                  .query({ auth: "google", success: "false" })
                  .url(),
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
            .then(() => {
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

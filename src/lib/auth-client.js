import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { t } from "i18next";

/* Drop the locally cached session. A failed auth call usually means the
 * cached user no longer matches the cookie session (expired session,
 * guest account versus the real account being signed into, …), so keep
 * the cache from shadowing the server on the next getSession(). */
function clearStaleSessionCache() {
  try {
    api.clearSessionCache();
  } catch {
    // Cache cleanup must never mask the original auth error.
  }
}

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_ENDPOINT,

  fetchOptions: {
    credentials: "include", // Ensure cookies are sent with requests
    onError: (ctx) => {
      /* Rate limits are not a session fault; every other auth error means
       * the local cache may be stale, so clear it before it can conflict
       * with the next request. */
      if (ctx.response.status !== 429) clearStaleSessionCache();

      // Check if the response status is a 429 Rate Limit
      if (ctx.response.status === 429) {
        const retryAfter =
          ctx.response.headers.get("X-Retry-After") || "a few seconds";

        toast.error(
          `Too many requests! Please wait ${retryAfter} before trying again.`,
        );
        return;
      } else if (ctx.response.status === 401) {
        if (!ctx.request.url.includes("/sign-in")) {
          toast.error("Unauthorized access! Please log in again to continue.");
        }
        return;
      } else if (ctx.response.status === 403) {
        toast.error(
          "Forbidden! You don't have permission to perform this action.",
        );
        return;
      } else if (ctx.response.status === 404) {
        toast.error(
          "Resource not found! The requested resource does not exist.",
        );
        return;
      } else if (ctx.response.status === 500) {
        toast.error(
          "Internal server error! Please try again later or contact support.",
        );
        return;
      }

      // Handle other errors generically
      toast.error(ctx.error.message || "An unexpected error occurred.");
    },
  },

  plugins: [anonymousClient()],
});

const resendVerification = async (email) => {
  try {
    /* A guest (anonymous) or stale session cookie makes Better Auth's
     * /send-verification-email compare its email with the one we submit
     * and reject the request with EMAIL_MISMATCH. Clear the cached
     * session and send the request WITHOUT cookies so Better Auth takes
     * its public email-only verification path. */
    clearStaleSessionCache();

    const { error } = await authClient.sendVerificationEmail(
      {
        email: email,
        callbackURL: "/api/redirect-app/verify-email", // Where to redirect the user after they click the link
      },
      { credentials: "omit" },
    );

    clearStaleSessionCache(); // Clear any cached session data after sending the verification email

    if (error) {
      console.error("Failed to send verification email:", error.message);
      toast.error(
        "Failed to send verification email. Please try again later or contact support.",
      );
      return;
    }

    return toast.info(
      t("auth.verificationEmailSent", {
        defaultValue:
          "Verification email sent!, check your spam folder if you don't see it in your inbox.",
      }),
    );
  } catch {
    toast.error(
      "An unexpected error occurred while sending the verification email. Please try again later.",
    );
  }
};

export const { useSession, signIn, signUp, signOut } = authClient;
export { resendVerification };

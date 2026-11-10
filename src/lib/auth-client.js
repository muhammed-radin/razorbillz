import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { t } from "i18next";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_ENDPOINT,

  fetchOptions: {
    credentials: "include", // Ensure cookies are sent with requests
    onError: (ctx) => {
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
    const { data, error } = await authClient.sendVerificationEmail({
      email: email,
      callbackURL: "/api/redirect-app/verify-email", // Where to redirect the user after they click the link
    });

    api.clearSessionCache(); // Clear any cached session data after sending the verification email

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
  } catch (error) {
    toast.error(
      "An unexpected error occurred while sending the verification email. Please try again later.",
    );
  }
};

export const { useSession, signIn, signUp, signOut } = authClient;
export { resendVerification };

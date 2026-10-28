import {
  Outlet,
  useLocation,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "react-router-dom";
import NavbarBlock from "@/components/navbar/navbar";
import MobileBottomNav from "@/components/mobile-bottom-nav/MobileBottomNav";
import { Footer } from "./components/footer/footer";
import { ThemeProvider } from "./utils/theme-provider";
import ScrollToTop from "./utils/ScrollToTop"; // Import the ScrollToTop component
import { useEffect, useRef, useState } from "react";
import { alert } from "./components/dialog-alert-provider";
import { toast } from "sonner";
import { LoaderScreen } from "./components/LoaderScreen";
import { api } from "./utils/api";
import { authClient } from "./lib/auth-client";
import { openAuthenticationModal } from "./utils/signin-modal-required";

const HIDE_CHROME_PATHS = ["/login", "/signup", "/forgot-password"];
const GUEST_ACCESS_PATHS = [
  // main pages
  "/",
  "/search",
  "/categories",
  "/order-status",
  "/product/:id",
  "/404",

  // auth
  "/login",
  "/signup",
  "/forgot-password",

  // policy pages
  "/about",
  "/contact",
  "/return",
  "/shipping",
  "/privacy",
  "/terms",
]; // Add paths that allow guest access

function App() {
  const location = useLocation();
  const hideChrome = HIDE_CHROME_PATHS.includes(location.pathname);
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  const [searchParams, setSearchParams] = useSearchParams();

  const isGuestAccess =
    GUEST_ACCESS_PATHS.includes(location.pathname) ||
    location.pathname.startsWith("/product/");
  const [isLoading, setIsLoading] = useState(true); // Defualt to true to show the loader until session validation is complete
  const hasRun = useRef(false);

  useEffect(() => {
    async function validateIt() {
      const { data: session } = await api.getSession();
      const isSessionFound = !!session;
      if (isSessionFound) {
        setIsLoading(false);
        // User is authenticated, you can perform actions here if needed
      } else {
        if (HIDE_CHROME_PATHS.includes(location.pathname)) {
          setIsLoading(false);
          return; // Allow access to login, signup, and forgot-password pages
        }
        alert
          .confirm({
            title: "Authentication Required",
            description:
              "Please log in to access this page, or continue as a guest to explore limited features. Guest access requires cookies to be enabled.",
            buttonText: "Login",
            secondaryButtonText: "Continue as Guest",
          })
          .then(async (confirmed) => {
            if (confirmed) {
              // Redirect to login page
              navigate("/login");
            } else {
              // Continue as guest
              try {
                const result = await authClient.signIn.anonymous();

                console.log("Guest sign-in result:", result);
                let error = result.error;
                if (error) {
                  toast.error(
                    "Failed to sign in as guest. Please try again. Error: " +
                      error.message,
                  );
                } else {
                  toast.success("Signed in as guest.");
                  // Drop any cached null-session so the new guest session
                  // takes effect on the next fetch without a reload.
                  api.clearSessionCache();
                }
              } catch (error) {
                console.error("Error during guest sign-in:", error);
                toast.error(
                  "An unexpected error occurred during guest sign-in. Please try again.",
                );
              }
              setTimeout(() => {
                setIsLoading(false);
                api.clearSessionCache(); // Clear any existing session data
                window.location.reload(); // Reload the page to reflect the guest session
              }, 1500);
            }
          });
      }

      if (!hasRun.current) {
        if (
          searchParams.get("auth") === "google" &&
          searchParams.get("success") === "true"
        ) {
          toast.success("Google Sign-In successful");
          api.clearSessionCache(); // Clear any existing session data
          setSearchParams({}); // Clear the search params to avoid repeated handling
          hasRun.current = true;
          navigate("/"); // Navigate to the home page after successful Google sign-in
        } else if (
          searchParams.get("auth") === "google" &&
          searchParams.get("success") === "false"
        ) {
          toast.error("Google Sign-In failed. Please try again.");
          hasRun.current = true;
          navigate("/login"); // Navigate to the login page after failed Google sign-in
        }

        if (
          searchParams.get("action") === "verify-email" &&
          searchParams.get("status") === "success"
        ) {
          toast.success("Email verification successful.");
          hasRun.current = true;
          setSearchParams({}); // Clear the search params to avoid repeated handling
          api.clearSessionCache(); // Clear any existing session data
          setTimeout(() => {
            window.location.reload();
          }, 1000); // Reload the page to reflect the verified session
        }
      }

      if (
        isSessionFound &&
        isGuestAccess === false &&
        session?.user?.isAnonymous === true
      ) {
        openAuthenticationModal().then((isLoggedin) => {
          if (isLoggedin === false) navigate("/"); // Navigate to the current path if authenticated and not on a guest access page
        });
      }
    }

    validateIt();
  }, [isGuestAccess, location.pathname, navigate]);

  return (
    <>
      <ScrollToTop />
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        {!hideChrome && <NavbarBlock />}
        {/* Public/guest pages render immediately; only protected routes wait
            for the session round-trip (avoids blocking first paint). */}
        {isNavigating || (isLoading && !isGuestAccess) ? (
          <LoaderScreen />
        ) : (
          <Outlet />
        )}
        <Footer />
        {!hideChrome && <MobileBottomNav />}
      </ThemeProvider>
    </>
  );
}

export default App;

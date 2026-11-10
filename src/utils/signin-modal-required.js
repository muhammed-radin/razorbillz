// Sign in modal required utility function
import { api } from "./api";
import { alert } from "../components/dialog-alert-provider";
import { generateHashLink } from "@shared/utils/route-util";

async function validateSignInModalRequired() {
  // Check if the user is signed in
  const { data: session } = await api.getSession();
  const isSignedIn =
    session && session.user && session.user.isAnonymous === false;

  return isSignedIn;
}

async function openAuthenticationModal() {
  const isSignedIn = await validateSignInModalRequired();
  if (isSignedIn) {
    return isSignedIn; // User is already signed in, no need to show the modal
  }
  const result = await alert.confirm({
    title: "Authentication Required",
    description:
      "Please log in to access this page, or continue as a guest to explore limited features. Guest access requires cookies to be enabled.",
    buttonText: "Login",
    secondaryButtonText: "Close",
  });

  if (result) {
    // Redirect to login page
    window.location.href = generateHashLink("/login");
  } else {
    return isSignedIn; // User chose to continue as guest, return false
  }
}

export { validateSignInModalRequired, openAuthenticationModal };

import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { i18nReady } from "./i18n";
import Router from "./router/Router.jsx";
import { ThemeProvider } from "./utils/theme-provider.jsx";
import { HelmetProvider } from "react-helmet-async";
import { DialogAlertProvider } from "./components/dialog-alert-provider";

/* sonner is only needed once a toast is shown; keep it out of the entry chunk.
 * A missing Toaster just means toasts fired in the first few hundred ms are
 * queued rather than painted. */
const Toaster = lazy(() =>
  import("sonner").then((mod) => ({ default: mod.Toaster })),
);

function renderApp() {
  // Remove the static HTML splash (see index.html) right before React takes
  // over, so the first React commit replaces it without a blank frame.
  document.getElementById("app-splash")?.remove();

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <HelmetProvider>
        <ThemeProvider>
          <DialogAlertProvider>
            <Suspense fallback={null}>
              <Toaster
                expand={true}
                richColors
                position="top-right"
                theme="dark"
                visibleToasts={4}
              />
            </Suspense>
            <Router />
          </DialogAlertProvider>
        </ThemeProvider>
      </HelmetProvider>
    </React.StrictMode>,
  );
}

// Wait for the active locale to finish loading (English is bundled; Malayalam
// is fetched on demand) so the first frame is never partially translated.
i18nReady
  .catch((error) => console.error("Failed to initialise i18n:", error))
  .finally(renderApp);

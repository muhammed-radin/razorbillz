import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import {
  getStoreHtmlTokens,
  storeConfig,
} from "./Server/shared/store.config.js";

/**
 * Fills the `%STORE_*%` placeholders in index.html from the shared store config
 * so the static <head> (title, description, Open Graph, favicons, ...) stays in
 * sync with `Server/shared/store.config.js` at both dev and build time.
 */
function storeHtmlConfigPlugin() {
  return {
    name: "store-html-config",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const tokens = getStoreHtmlTokens(storeConfig.site.defaultLanguage);
        return Object.entries(tokens).reduce(
          (out, [token, value]) => out.split(token).join(value ?? ""),
          html,
        );
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss(), storeHtmlConfigPlugin()],
    /* @ffmpeg/ffmpeg spawns its worker with
     * `new Worker(new URL("./worker.js", import.meta.url))`. Pre-bundling it
     * with esbuild rewrites that to a path that does not exist, so keep it out
     * of the dependency optimizer and let Vite resolve it natively. */
    optimizeDeps: {
      exclude: ["@ffmpeg/ffmpeg"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "./Server/shared"), // this can be accessed from anywhere in the project, helpful for sharing utils function between server and client
      },
    },
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      },
    },
    base: "./",
    build: {
      rollupOptions: {
        output: {
          /* lucide ships one module per icon. Because several lazy routes
           * (categories, admin, icon picker) share icons with the storefront,
           * Rollup otherwise emitted a ~250 byte chunk per icon — dozens of
           * requests on a cold load. Grouping them into one cached chunk is
           * markedly cheaper than the request waterfall. */
          manualChunks(id) {
            if (id.includes("node_modules/lucide-react")) return "lucide";
          },
          /* Icons and small UI helpers are pulled in from several lazy chunks
           * at once; without this Rollup emits a separate ~300 byte chunk per
           * shared module, which floods a cold load with dozens of requests. */
          experimentalMinChunkSize: 20_000,
        },
      },
    },
  };
});

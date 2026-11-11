import axios from "axios";
import { decrypt, decryptObj, encrypt, decryptField } from "./crypt";
import { authClient } from "@/lib/auth-client";

const apiBase = import.meta.env.VITE_API_ENDPOINT;
const ACTION_HEADER = {
  "server-api-key": import.meta.env.VITE_SERVER_API_KEY || "",
  "actions-api-key": import.meta.env.VITE_ACTION_ACESS_TOKEN || "",
};

const API_KEY_HEADER = {
  "server-api-key": import.meta.env.VITE_SERVER_API_KEY || "",
};

axios.defaults.headers.common["server-api-key"] =
  import.meta.env.VITE_SERVER_API_KEY || "";
axios.defaults.headers.common["actions-api-key"] =
  import.meta.env.VITE_ACTION_ACESS_TOKEN || "";

const api = {
  API_KEY_HEADER,
  ACTION_HEADER,
  client: new axios.create({
    baseURL: apiBase,
    headers: ACTION_HEADER,
    withCredentials: true, // Ensure cookies are sent with requests
  }),
  enableDecryption: true,
  enableEncryption: true,
  base(path = "") {
    // THIS FUNCTION USED FOR RECOVER OLD VERSIONS OF API CALLS, NEW ONES SHOULD USE api.client DIRECTLY
    // TO Prevent any issues with the base URL, we can ensure it always ends with a slash
    // if (!apiBase.endsWith("/")) {
    //   apiBase += "/";
    // }
    return path;
  },
  categories(id) {
    if (id) {
      return api.base("/api/categories/" + id);
    }
    return api.base("/api/categories");
  },
  products(id) {
    if (id) {
      return api.base("/api/products/" + id);
    }
    return api.base("/api/products");
  },
  auth() {
    return api.base("/api/auth");
  },
  cart(path = "") {
    return api.base("/api/cart" + (path ? `/${path}` : ""));
  },
  wishlists() {
    return api.base("/api/wishlists");
  },
  address(path = "") {
    return api.base("/api/address" + (path ? `/${path}` : ""));
  },
  orders(path = "") {
    return api.base("/api/orders" + (path ? `/${path}` : ""));
  },
  comments(productId = "") {
    return api.base("/api/comments" + (productId ? `/${productId}` : ""));
  },
  interactions(path = "") {
    return api.base("/api/interactions" + (path ? `/${path}` : ""));
  },
  users(path = "") {
    return api.base("/api/users" + (path ? `/${path}` : ""));
  },
  settings() {
    return api.base("/api/users/settings");
  },
  async getUser(decryptData = true, fullData = false) {
    const { data: session } = await authClient.getSession();
    if (!session || !session.user) {
      return null;
    }
    let userData = session.user;
    if (fullData) {
      const response = await api.client.get("/api/users/profile/");
      userData = response.data;
    }
    if (decryptData) {
      userData = decryptObj(userData, false, ["emailVerified"]);
    }
    // Names are end-to-end encrypted at rest; always present decrypted.
    if (userData && typeof userData.name === "string") {
      userData = { ...userData, name: decryptField(userData.name) };
    }
    userData.session = session;
    return userData;
  },
  alreadyTryingToGetSession: false,
  sessionPromise: null,
  async waitForSession(
    retryIntervalMs = 300,
    timeoutEnabled = false,
    timeoutMs = 5000,
  ) {
    return new Promise((resolve) => {
      // If already trying to get session, wait for a short period and retry
      let MAX_WAIT_TIME_MS = timeoutMs; // Maximum wait time of 5 seconds
      let elapsedTime = 0;
      let interval = retryIntervalMs; // Check every 100ms
      let TIMEOUT_ENABLED = timeoutEnabled; // Set to true to disable timeout
      let checkInterval = setInterval(() => {
        if (sessionStorage.getItem("session")) {
          clearInterval(checkInterval);
          resolve();
        }
        elapsedTime += interval;
        if (elapsedTime >= MAX_WAIT_TIME_MS && TIMEOUT_ENABLED) {
          clearInterval(checkInterval);
          resolve();
        }
      }, interval);
    });
  },
  async getSession() {
    // 1. Cache-first: an already-decrypted session is reused until the
    //    cache is explicitly cleared (logout / refresh).
    try {
      const raw = sessionStorage.getItem("session");
      if (raw) {
        const session = JSON.parse(decrypt(raw));
        if (session) return { ...session };
      }
    } catch {
      // Corrupt cache: fall through to a live fetch.
    }

    // 2. Coalesce concurrent bootstrap calls (App + provider + guards)
    //    onto ONE live request. Without this, an unguarded StrictMode
    //    mount fired /get-session two or three times.
    if (this.sessionPromise) return this.sessionPromise;

    const promise = (async () => {
      this.alreadyTryingToGetSession = true;
      let live;
      try {
        live = await authClient.getSession();
      } catch {
        sessionStorage.removeItem("session");
        return {
          data: null,
          fromCache: false,
          error: new Error("Failed to retrieve session from server"),
        };
      } finally {
        this.alreadyTryingToGetSession = false;
      }

      // Build a fresh wrapper (never mutate the auth client's internal
      // state), then decrypt E2EE-at-rest profile fields.
      let session = live;
      if (live?.data?.user) {
        const user = { ...live.data.user };
        if (user.name) user.name = decryptField(user.name);
        if (user.profilePicture) {
          user.profilePicture = decryptField(user.profilePicture);
        }
        if (user.image) user.image = decryptField(user.image);
        session = { ...live, data: { ...live.data, user } };
      }

      // 3. Cache the decrypted session for future callers.
      try {
        sessionStorage.setItem(
          "session",
          encrypt(JSON.stringify({ ...session, fromCache: true })),
        );
        return { ...session, fromCache: false };
      } catch {
        // Storage full/blocked: session still returned live.
        return { ...session, fromCache: false };
      }
    })();

    this.sessionPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.sessionPromise === promise) this.sessionPromise = null;
    }
  },
  clearSessionCache() {
    try {
      sessionStorage.removeItem("session");
    } catch {
      // Ignore errors when clearing session cache
    }
  },
  async refreshSession() {
    this.clearSessionCache();
    return this.getSession();
  },
  async isSudo() {
    const session = await this.getSession();
    if (!session || !session.data || !session.data.user) {
      return false;
    }
    if (
      session.data.user.role === "owner" ||
      session.data.user.role === "admin"
    ) {
      return true;
    }
    return false;
  },
  async getUserRole() {
    const session = await this.getSession();
    if (!session || !session.data || !session.data.user) {
      return null;
    }
    return session.data.user.role || null;
  },
  actions: {
    async logOut() {
      api.clearSessionCache();
      sessionStorage.clear();
      api.alreadyTryingToGetSession = false;
      api.sessionPromise = null;
      return authClient.signOut();
    },
  },
};

/* =========================================================
 * GET request coalescing.
 *
 * Pages frequently fire the same read from a mount effect, a store
 * action and a component both rendering at once (made worse by
 * StrictMode). Sharing the in-flight promise removes those duplicate
 * round-trips at the lowest layer, so direct `api.client.get(...)`
 * call sites are covered too. Only identical url + params requests
 * share; caller-managed AbortSignals opt out because aborting one
 * consumer would cancel the shared request for all of them.
 * ========================================================= */
const inflightGets = new Map();
const axiosGet = api.client.get.bind(api.client);

api.client.get = function dedupedGet(url, config = {}) {
  if (config?.signal) return axiosGet(url, config);

  const key = `${url}::${config?.responseType ?? "json"}::${JSON.stringify(
    config.params ?? {},
  )}`;
  const existing = inflightGets.get(key);
  if (existing) return existing;

  const request = axiosGet(url, config).finally(() => {
    if (inflightGets.get(key) === request) inflightGets.delete(key);
  });

  inflightGets.set(key, request);
  return request;
};

export { api };

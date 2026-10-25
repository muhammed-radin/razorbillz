import axios from "axios";
import { decrypt, decryptObj, encrypt, decryptField } from "./crypt";
import { authClient } from "@/lib/auth-client";

const apiBase = import.meta.env.VITE_API_ENDPOINT;
const ACTION_HEADER = {
  "server-api-key": import.meta.env.VITE_SERVER_API_KEY,
  "actions-api-key": import.meta.env.VITE_ACTION_ACESS_TOKEN,
};

const API_KEY_HEADER = {
  "server-api-key": import.meta.env.VITE_SERVER_API_KEY,
};

axios.defaults.headers.common["server-api-key"] =
  import.meta.env.VITE_SERVER_API_KEY;
axios.defaults.headers.common["actions-api-key"] =
  import.meta.env.VITE_ACTION_ACESS_TOKEN;

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
  async waitForSession(
    retryIntervalMs = 300,
    timeoutEnabled = false,
    timeoutMs = 5000,
  ) {
    let self = this;
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
    let self = this;

    // 1. If already trying to get session, wait for it to be available
    if (self.alreadyTryingToGetSession === true) {
      await self.waitForSession();
    }

    // 2. Try to get session from cache first
    try {
      const raw = sessionStorage.getItem("session");
      if (!raw) {
        throw new Error("No cached session found");
      }
      const session = JSON.parse(decrypt(raw));
      if (!session) {
        throw new Error("Invalid cached session");
      }
      return { ...session };
    } catch (error) {
      // Corrupt cache: fall through to a live fetch.
      // continue to fetch session from server
    }

    // 3. Fetch session from server if not found in cache
    try {
      self.alreadyTryingToGetSession = true;
      let live = await authClient.getSession();
      self.alreadyTryingToGetSession = false;

      // Names are end-to-end encrypted at rest: present them decrypted to
      // every consumer (navbar, sidebar, greetings). Build a fresh wrapper
      // (never mutate the auth client's internal state) and cache that, so
      // cached and live sessions share one decrypted shape.
      const session = live;

      if (session && session.data && session.data.user) {
        if (session.data.user.name) {
          session.data.user.name = decryptField(session.data.user.name);
        }
        if (session.data.user.profilePicture) {
          session.data.user.profilePicture = decryptField(
            session.data.user.profilePicture,
          );
        }
        if (session.data.user.image) {
          session.data.user.image = decryptField(session.data.user.image);
        }
      }

      // 4. Cache the session in sessionStorage for future use
      try {
        sessionStorage.setItem(
          "session",
          encrypt(JSON.stringify({ ...session, fromCache: true })),
        );
        return { ...session, fromCache: false }; // Add fromCache property to indicate it's a live fetch
      } catch {
        // Storage full/blocked: session still returned live.
        return { ...session, fromCache: false };
      }
    } catch {
      // Corrupt cache: fall through to a live fetch.
      sessionStorage.removeItem("session"); // Clear cache if session is invalid. it helps to avoid caching invalid sessions.
      return {
        data: null,
        fromCache: false,
        error: new Error("Failed to retrieve session from server"),
      };
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
      return authClient.signOut();
    },
  },
};

export { api };

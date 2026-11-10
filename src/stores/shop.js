import { create } from "zustand";
import { cartApi, wishlistApi, addressApi, ordersApi } from "@/services/shop";
import { MinimalProduct } from "@shared/models/product";
import { api } from "@/utils/api";
import {
  openAuthenticationModal,
  validateSignInModalRequired,
} from "@/utils/signin-modal-required";

const isAuthError = (err) =>
  err?.response?.status === 401 || err?.response?.status === 403;

const readLocal = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable — ignore
  }
};

const normalizeCart = (doc) => {
  if (!doc) return [];
  const list = Array.isArray(doc) ? doc : (doc.products ?? []);
  return list.map((p) => ({
    productId: p.productId ?? p.id,
    quantity: p.quantity ?? 1,
    title: p.title,
    thumbnail: p.thumbnail,
    price: p.price,
    originalPrice: p.originalPrice,
    sku: p.sku,
    category: p.category,
    brand: p.brand,
  }));
};

/* Delayed server sync for quantity edits: rapid +/- clicks apply
 * instantly (optimistic) and flush ONE request per product after the
 * user pauses. Aborts superseded flights, rolls back on failure. */
const qtyTimers = new Map();
const qtyControllers = new Map();
/* Last server-confirmed items per product, captured before the first
 * optimistic edit, so a failed/superseded sync can roll back safely. */
const qtySnapshots = new Map();
const QTY_SYNC_DELAY_MS = 600;

export const useCartStore = create((set, get) => ({
  items: [],
  loading: false,
  error: null,
  serverBacked: true,
  syncing: {},

  fetch: async () => {
    const isSignedIn = await validateSignInModalRequired();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    set({ loading: true, error: null });
    try {
      const cart = await cartApi.get();
      set({ items: normalizeCart(cart), loading: false, serverBacked: true });
    } catch (err) {
      if (isAuthError(err)) {
        set({
          items: readLocal("guest-cart", []),
          loading: false,
          serverBacked: false,
        });
      } else if (err?.response?.status === 404) {
        set({ items: [], loading: false, serverBacked: true });
      } else {
        set({ loading: false, error: err });
      }
    }
  },

  add: async (product, quantity = 1) => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    const productId = product.productId ?? product.id;
    if (get().serverBacked) {
      try {
        const cart = await cartApi.add(productId, quantity);
        set({ items: normalizeCart(cart), error: null });
        return;
      } catch (err) {
        if (!isAuthError(err)) {
          set({ error: err });
          throw err;
        }
        set({ serverBacked: false });
      }
    }
    const items = [...get().items];
    const existing = items.find((i) => i.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({
        productId,
        quantity,
        title: product.title,
        thumbnail: product.thumbnail ?? product.image,
        price: product.price,
        originalPrice: product.originalPrice,
        sku: product.sku,
        category: product.category,
        brand: product.brand,
      });
    }
    writeLocal("guest-cart", items);
    set({ items });
  },

  /* Push ONE quantity update for a product using the latest optimistic
   * value. Rolls back to the last server-confirmed snapshot on failure.
   * Shared by the debounced setQuantity and the pre-checkout flush. */
  syncQuantity: async (productId, controller) => {
    const snapshot =
      qtySnapshots.get(productId) ?? get().items.map((i) => ({ ...i }));
    try {
      const latest =
        get().items.find((i) => i.productId === productId)?.quantity ?? 1;
      const cart = await cartApi.setQuantity(
        productId,
        latest,
        controller?.signal,
      );
      if (controller?.signal.aborted) return;
      set({
        items: normalizeCart(cart),
        error: null,
        syncing: { ...get().syncing, [productId]: false },
      });
    } catch (err) {
      if (controller?.signal.aborted) return;
      // Roll back to the last server-confirmed snapshot.
      set({
        items: snapshot,
        error: err,
        syncing: { ...get().syncing, [productId]: false },
      });
      const { toast } = await import("sonner");
      toast.error("Couldn't sync quantity — restored previous value.");
      throw err;
    } finally {
      qtyTimers.delete(productId);
      if (qtyControllers.get(productId) === controller) {
        qtyControllers.delete(productId);
        qtySnapshots.delete(productId);
      }
    }
  },

  setQuantity: async (productId, quantity) => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    const nextQty = Math.max(1, Math.floor(Number(quantity) || 1));

    if (!get().serverBacked) {
      const items = get().items.map((i) =>
        i.productId === productId ? { ...i, quantity: nextQty } : i,
      );
      writeLocal("guest-cart", items);
      set({ items });
      return;
    }

    /* Keep the LAST server-confirmed snapshot (not the optimistic one)
     * so rapid +/- clicks still roll back to the correct value. */
    if (!qtySnapshots.has(productId)) {
      qtySnapshots.set(
        productId,
        get().items.map((i) => ({ ...i })),
      );
    }

    // Optimistic: reflect instantly, sync with the server after a pause.
    set((state) => ({
      items: state.items.map((i) =>
        i.productId === productId ? { ...i, quantity: nextQty } : i,
      ),
      syncing: { ...state.syncing, [productId]: true },
    }));

    clearTimeout(qtyTimers.get(productId));
    qtyControllers.get(productId)?.abort();
    const controller = new AbortController();
    qtyControllers.set(productId, controller);
    qtyTimers.set(
      productId,
      setTimeout(() => {
        get()
          .syncQuantity(productId, controller)
          .catch(() => {});
      }, QTY_SYNC_DELAY_MS),
    );
  },

  /* Immediately push every pending optimistic quantity change to the
   * server and resolve once they all settle. Used before checkout so the
   * server cart can never lag behind what the user sees. Rejects if any
   * sync fails (the store has already rolled back + surfaced the error). */
  flushQuantitySync: async () => {
    const pendingIds = [...qtyTimers.keys()];
    if (pendingIds.length === 0) return;

    const flights = pendingIds.map((productId) => {
      clearTimeout(qtyTimers.get(productId));
      qtyTimers.delete(productId);
      qtyControllers.get(productId)?.abort();
      const controller = new AbortController();
      qtyControllers.set(productId, controller);
      return get().syncQuantity(productId, controller);
    });

    await Promise.all(flights);
  },

  remove: async (productId) => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }
    if (get().serverBacked) {
      try {
        const cart = await cartApi.remove(productId);
        set({ items: normalizeCart(cart), error: null });
        return;
      } catch (err) {
        set({ error: err });
        throw err;
      }
    }
    const items = get().items.filter((i) => i.productId !== productId);
    writeLocal("guest-cart", items);
    set({ items });
  },

  clear: async () => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }
    if (get().serverBacked) {
      try {
        await cartApi.clear();
        set({ items: [], error: null });
        return;
      } catch (err) {
        set({ error: err });
        throw err;
      }
    }
    writeLocal("guest-cart", []);
    set({ items: [] });
  },
}));

const toWishlistSnapshot = (product) =>
  new MinimalProduct({
    ...product,
    productId: product.productId ?? product.id,
  });

export const useWishlistStore = create((set, get) => ({
  items: readLocal("guest-wishlist", []),
  loading: false,
  error: null,
  serverBacked: true,

  fetch: async (folder = "/") => {
    const isSignedIn = await validateSignInModalRequired();
    if (!isSignedIn) {
      set({ items: readLocal("guest-wishlist", []), serverBacked: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      const doc = await wishlistApi.get(folder);
      const products = Array.isArray(doc) ? doc : (doc.products ?? []);
      set({ items: products, loading: false, serverBacked: true });
    } catch (err) {
      if (isAuthError(err)) {
        set({
          items: readLocal("guest-wishlist", []),
          loading: false,
          serverBacked: false,
        });
      } else if (err?.response?.status === 404) {
        set({ items: [], loading: false, serverBacked: true });
      } else {
        set({ loading: false, error: err });
      }
    }
  },

  has: (productId) =>
    get().items.some((p) => String(p.productId ?? p.id) === String(productId)),

  toggle: async (product, folder = "/") => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    const productId = product.productId ?? product.id;
    if (get().has(productId)) {
      await get().remove(productId, folder);
    } else {
      await get().add(product, folder);
    }
  },

  add: async (product, folder = "/") => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    if (get().serverBacked && isSignedIn) {
      try {
        const doc = await wishlistApi.add(toWishlistSnapshot(product), folder);
        set({ items: doc.products ?? [], error: null });
        return;
      } catch (err) {
        if (!isAuthError(err)) {
          set({ error: err });
          throw err;
        }
        set({ serverBacked: false });
      }
    }
    const items = [...get().items, toWishlistSnapshot(product)];
    writeLocal("guest-wishlist", items);
    set({ items });
  },

  remove: async (productId, folder = "/") => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    if (get().serverBacked && isSignedIn) {
      try {
        const doc = await wishlistApi.remove(productId, folder);
        set({
          items:
            doc.products ??
            get().items.filter((p) => (p.productId ?? p.id) !== productId),
          error: null,
        });
        return;
      } catch (err) {
        set({ error: err });
        throw err;
      }
    }
    const items = get().items.filter(
      (p) => (p.productId ?? p.id) !== productId,
    );
    writeLocal("guest-wishlist", items);
    set({ items });
  },

  syncToServer: async () => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    if (!get().serverBacked && isSignedIn) {
      wishlistApi.setProducts(get().items, "/").catch((err) => {
        set({ error: err });
      });
    }
  },
}));

class Address {
  constructor({
    id,
    name,
    phoneNumber,
    userId,
    street,
    city,
    state,
    postalCode,
    country,
    email,
    type = "home",
  }) {
    this.id = id || crypto.randomUUID();
    this.name = name;
    this.phoneNumber = phoneNumber;
    this.userId = userId;
    this.street = street;
    this.city = city;
    this.state = state;
    this.postalCode = postalCode;
    this.country = country;
    this.email = email;
    this.type = type;
  }
}

export { Address as AddressMold };

export const useAddressStore = create((set) => ({
  addresses: [],
  current: null,
  loading: false,
  error: null,

  fetch: async () => {
    const isSignedIn = await validateSignInModalRequired();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }
    set({ loading: true, error: null });
    try {
      const addresses = await addressApi.list();
      addresses.forEach((address) => {
        if (address.isDefault) {
          set({ current: address });
        }
      });
      set({
        addresses: Array.isArray(addresses) ? addresses : [],
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err });
    }
  },

  delete: async (addressId) => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    await addressApi.remove(addressId);
  },

  update: async (address) => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    await addressApi.update(address);
  },

  add: async (address) => {
    const isSignedIn = await openAuthenticationModal();
    if (!isSignedIn) {
      throw new Error({ message: "User is not signed in", errorCode: 403 }); // User is not signed in, exit the function
    }

    const { data: session } = await api.getSession();
    const user = session?.user;
    if (!user) {
      throw new Error("User not authenticated");
    }
    address.userId = user.id;
    address.email = user.email;
    const addresses = await addressApi.add(new Address(address));
    set({ addresses: Array.isArray(addresses) ? addresses : [] });
  },

  setDefault: async (address) => {
    const current = await addressApi.setCurrent(address);
    set({ current });
    await useAddressStore.getState().fetch();
  },
}));

export const useOrderStore = create((set) => ({
  orders: [],
  detail: null,
  loading: false,
  error: null,

  fetchUserOrders: async () => {
    set({ loading: true, error: null });
    try {
      const orders = await ordersApi.userOrders();
      set({
        orders: Array.isArray(orders)
          ? orders.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          : [],
        loading: false,
      });
      console.log("Fetched user orders:", orders);
    } catch (err) {
      set({ loading: false, error: err });
    }
  },

  fetchDetail: async (id) => {
    set({ loading: true, error: null });
    try {
      const detail = await ordersApi.get(id);
      set({ detail, loading: false });
    } catch (err) {
      set({ loading: false, error: err });
    }
  },

  create: async (payload) => {
    const order = await ordersApi.create(payload);
    return order;
  },

  cancel: async (id, reason, detail) => {
    await ordersApi.cancel(id, reason, detail);
    await useOrderStore.getState().fetchUserOrders();
  },

  requestReturn: async (id, reason, detail) => {
    await ordersApi.requestReturn(id, reason, detail);
    await useOrderStore.getState().fetchUserOrders();
  },
}));

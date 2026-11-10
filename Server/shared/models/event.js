class EventEmitter {
  constructor(options = {}) {
    this.events = new Map();
    this.listenListeners = [];

    this.maxListeners = options.maxListeners ?? 10;
  }

  // ==========================================
  // Event listeners
  // ==========================================

  on(event, listener) {
    this.#validateListener(listener);

    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    this.events.get(event).push({
      listener,
      original: listener,
      once: false,
    });

    this.#checkMaxListeners(event);

    return this;
  }

  once(event, listener) {
    this.#validateListener(listener);

    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const wrapper = (...args) => {
      this.off(event, listener);
      return listener(...args);
    };

    this.events.get(event).push({
      listener: wrapper,
      original: listener,
      once: true,
    });

    this.#checkMaxListeners(event);

    return this;
  }

  prependListener(event, listener) {
    this.#validateListener(listener);

    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    this.events.get(event).unshift({
      listener,
      original: listener,
      once: false,
    });

    this.#checkMaxListeners(event);

    return this;
  }

  prependOnceListener(event, listener) {
    this.#validateListener(listener);

    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const wrapper = (...args) => {
      this.off(event, listener);
      return listener(...args);
    };

    this.events.get(event).unshift({
      listener: wrapper,
      original: listener,
      once: true,
    });

    this.#checkMaxListeners(event);

    return this;
  }

  // ==========================================
  // Global event listeners
  // ==========================================

  onListen(listener) {
    this.#validateListener(listener);

    this.listenListeners.push({
      listener,
      original: listener,
    });

    return this;
  }

  offListen(listener) {
    const index = this.listenListeners.findIndex(
      (entry) => entry.original === listener,
    );

    if (index !== -1) {
      this.listenListeners.splice(index, 1);
    }

    return this;
  }

  removeAllListenListeners() {
    this.listenListeners = [];

    return this;
  }

  listenListenersList() {
    return this.listenListeners.map((entry) => entry.original);
  }

  listenListenerCount() {
    return this.listenListeners.length;
  }

  // ==========================================
  // Emit
  // ==========================================

  fire(event, ...data) {
    const eventInfo = {
      event,
      data,
      timestamp: Date.now(),
    };

    // --------------------------------------
    // Notify ALL global listeners
    // --------------------------------------

    for (const entry of [...this.listenListeners]) {
      this.#invokeSafely(entry.listener, event, eventInfo);
    }

    // --------------------------------------
    // Notify event-specific listeners
    // --------------------------------------

    const listeners = this.events.get(event);

    if (!listeners || listeners.length === 0) {
      return false;
    }

    for (const entry of [...listeners]) {
      this.#invokeSafely(entry.listener, event, data);
    }

    return true;
  }

  // ==========================================
  // Remove event listener
  // ==========================================

  off(event, listener) {
    const listeners = this.events.get(event);

    if (!listeners) {
      return this;
    }

    const index = listeners.findIndex((entry) => entry.original === listener);

    if (index !== -1) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      this.events.delete(event);
    }

    return this;
  }

  // ==========================================
  // Remove all event listeners
  // ==========================================

  removeAllListeners(event) {
    if (event === undefined) {
      this.events.clear();
    } else {
      this.events.delete(event);
    }

    return this;
  }

  // ==========================================
  // Information
  // ==========================================

  listeners(event) {
    const listeners = this.events.get(event);

    if (!listeners) {
      return [];
    }

    return listeners.map((entry) => entry.original);
  }

  rawListeners(event) {
    const listeners = this.events.get(event);

    if (!listeners) {
      return [];
    }

    return listeners.map((entry) => entry.listener);
  }

  listenerCount(event) {
    return this.events.get(event)?.length ?? 0;
  }

  eventNames() {
    return [...this.events.keys()];
  }

  has(event) {
    return this.events.has(event);
  }

  // ==========================================
  // Max listeners
  // ==========================================

  setMaxListeners(number) {
    if (typeof number !== "number" || number < 0 || !Number.isFinite(number)) {
      throw new TypeError("maxListeners must be a non-negative finite number");
    }

    this.maxListeners = number;

    return this;
  }

  getMaxListeners() {
    return this.maxListeners;
  }

  // ==========================================
  // Internal
  // ==========================================

  /* Analytics, metrics and logging listeners must never be able to break
   * a business request. Listener failures are isolated and reported here. */
  #invokeSafely(listener, eventName, args) {
    try {
      const result = Array.isArray(args)
        ? listener(...args)
        : listener(args);

      if (result && typeof result.then === "function") {
        result.catch((error) => {
          console.error(
            `[events] async listener for "${String(eventName)}" failed:`,
            error?.message || error,
          );
        });
      }
    } catch (error) {
      console.error(
        `[events] listener for "${String(eventName)}" failed:`,
        error?.message || error,
      );
    }
  }

  #validateListener(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function");
    }
  }

  #checkMaxListeners(event) {
    if (this.maxListeners === 0) {
      return;
    }

    const count = this.listenerCount(event);

    if (count > this.maxListeners) {
      console.warn(
        `Possible EventEmitter memory leak detected. ` +
          `${count} "${String(event)}" listeners added. ` +
          `Maximum is ${this.maxListeners}.`,
      );
    }
  }
}

class ClassicEvent {
  constructor({
    type,
    isMajor = false,
    sector = "global",
    content = {},
    id = null,
    userId = null,
    userName = null,
    userEmail = null,
    userAvatar = null,
    isGuest = false,

    isReq = false,
    reqPath = null,
    isError = false,
    userAgent = null,

    error = null,
    errorCode = null,

    title = null,
    message = null,

    orderId = null,
    wishlistId = null,
    cartId = null,
    productId = null,
    actorId = null,
    quantity = null,
  }) {
    this.type = type;
    this.timestamp = Date.now();
    this.sector = sector;
    this.content = content;
    this.isMajor = isMajor;

    this.isReq = isReq;
    this.reqPath = reqPath;
    this.isError = isError;

    this.userId = userId;
    this.userName = userName;
    this.userEmail = userEmail;
    this.userAvatar = userAvatar;
    this.isGuest = isGuest;

    this.title = title;
    this.message = message;
    this.userAgent = userAgent || null;

    this.error = error;
    this.errorCode = errorCode;

    this.orderId = orderId;
    this.wishlistId = wishlistId;
    this.cartId = cartId;
    this.productId = productId;
    this.actorId = actorId;
    this.quantity = quantity;

    this.id = id
      ? id
      : `${type}-${this.timestamp}-${sector}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

export { ClassicEvent };
export default EventEmitter;

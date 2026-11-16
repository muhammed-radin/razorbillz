import { db } from "./db.js";

/**
 * Minimum lifetime for any cached value: one hour.
 *
 * Cache entries may live longer, but a shorter TTL is treated as a mistake
 * and silently raised to this floor. This keeps every cache (global stores,
 * per-route response snapshots and product feeds) consistently warm.
 */
export const MIN_CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeCacheTtlMs(timeout) {
  const value = Number(timeout);
  if (!Number.isFinite(value) || value <= 0) return MIN_CACHE_TTL_MS;
  return Math.max(value, MIN_CACHE_TTL_MS);
}

export class Memory {
  constructor(data) {
    this._memory = data;
    this.isExpired = false;
    this.createdAt = new Date();
    this.expireTime = null;
    this.updateFn = () => {};
  }

  set(newData) {
    this._memory = newData;
    return this._memory;
  }

  toUpdate(fn) {
    this.updateFn = fn;
    return this;
  }

  async update(...params) {
    await this.updateFn(this, ...params);
  }

  get() {
    return this._memory;
  }

  expireTimeout(timeout) {
    const ttlMs = normalizeCacheTtlMs(timeout);
    this.expireTime = new Date(Date.now() + ttlMs);
    setTimeout(() => {
      this.isExpired = true;
      this._memory = null;
    }, ttlMs);
  }

  async expire() {
    this.isExpired = true;
    this._memory = null;
  }

  sizeMB() {
    // Convert object to a string
    const str = JSON.stringify(this._memory);

    // Get bytes using TextEncoder
    const bytes = new TextEncoder().encode(str).length;

    // Convert bytes to Megabytes
    const mb = bytes / (1024 * 1024);

    return mb;
  }

  locals = {};

  setLocalMemory(url, data, timeout) {
    url = url.toLowerCase();
    this.locals[url] = data;
    if (timeout) {
      // `timeout` is expressed in seconds here; clamp to the 1 hour floor.
      const ttlMs = normalizeCacheTtlMs(Number(timeout) * 1000);
      setTimeout(() => {
        delete this.locals[url];
      }, ttlMs);
    }
  }
  getLocalMemory(url) {
    url = url.toLowerCase();
    return this.locals[url] || null;
  }
  clearLocalMemory(url) {
    url = url.toLowerCase();
    if (this.locals[url]) {
      delete this.locals[url];
    }
  }
  clearByPrefix(prefix) {
    const p = String(prefix ?? "").toLowerCase();
    for (const key of Object.keys(this.locals)) {
      if (key.startsWith(p)) delete this.locals[key];
    }
  }
}

// backward-compatible factory

export const CacheTable = {};

/**
 * @param {object} data
 * @param {string} id
 * @param {number} timeout in milliseconds
 * @param {function} updateFn
 * @returns {Memory}
 */
export function useMemory(data, id, timeout, updateFn) {
  if (id) {
    CacheTable[id] = new Memory(data);
    if (timeout) {
      CacheTable[id].expireTimeout(timeout);
    }
    if (updateFn) {
      CacheTable[id].toUpdate(updateFn);
    }
    return CacheTable[id];
  }
  return new Memory(data);
}

export function getMemory(id) {
  return CacheTable[id] || null;
}

export function clearMemory(id) {
  if (CacheTable[id]) {
    delete CacheTable[id];
  }
}

export function clearAllMemory() {
  for (const id in CacheTable) {
    delete CacheTable[id];
  }
}

export function setMemory(id, data) {
  if (CacheTable[id]) {
    CacheTable[id].set(data);
  } else {
    CacheTable[id] = new Memory(data);
  }
}

export default {
  Memory,
  useMemory,
  getMemory,
  clearMemory,
  clearAllMemory,
  setMemory,
  CacheTable,
};

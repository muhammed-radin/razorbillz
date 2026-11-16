import { MIN_CACHE_TTL_MS, useMemory } from "../memory.js";

export let productMemoryCache = useMemory(
  null,
  "productMemoryCache",
  MIN_CACHE_TTL_MS,
).toUpdate(async (memory) => {});

export default { productMemoryCache };

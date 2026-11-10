import { useEffect, useRef } from "react";

/**
 * Performs shallow equality comparison between two dependency arrays.
 */
function areDepsEqual(prevDeps, nextDeps) {
  if (prevDeps === nextDeps) return true;
  if (!prevDeps || !nextDeps) return false;
  if (prevDeps.length !== nextDeps.length) return false;
  for (let i = 0; i < prevDeps.length; i++) {
    if (!Object.is(prevDeps[i], nextDeps[i])) return false;
  }
  return true;
}

/**
 * useStrictEffect
 *
 * Runs a side-effect exactly once per dependency set, even under React
 * Strict Mode's mount -> cleanup -> mount simulation.
 *
 * The key detail is that cleanup is deferred to a microtask. Strict
 * Mode performs its simulated unmount/remount synchronously, so the
 * second effect run bumps the generation token before the microtask
 * fires; the stale cleanup then sees the newer generation and does
 * nothing. A real unmount has no newer run, so cleanup executes.
 *
 * @param {Function} effect - Callback returning an optional cleanup function
 * @param {Array} deps - Dependency array.
 */
export function useStrictEffect(effect, deps = []) {
  const depsRef = useRef(null);
  const cleanupRef = useRef(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const depsChanged = !areDepsEqual(depsRef.current, deps);

    if (depsChanged) {
      if (typeof cleanupRef.current === "function") {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      depsRef.current = deps;
      cleanupRef.current = effect();
    }

    const generation = ++generationRef.current;

    return () => {
      // Defer: StrictMode re-runs this effect synchronously. A newer
      // generation means this cleanup belongs to the simulated unmount.
      queueMicrotask(() => {
        // Intentional: inspect the LATEST generation to detect a
        // StrictMode remount that happened after this cleanup was queued.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (generationRef.current !== generation) return;
        if (typeof cleanupRef.current === "function") {
          cleanupRef.current();
          cleanupRef.current = null;
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * useStrictFetchEffect
 *
 * Async specialization of useStrictEffect with an AbortController.
 *
 * - The fetch fires once per dependency set.
 * - StrictMode's simulated unmount does NOT abort the only request.
 * - A real dependency change aborts the previous request immediately.
 * - A real unmount aborts the request (deferred one microtask so a
 *   StrictMode remount can cancel the pending abort).
 *
 * @param {(signal: AbortSignal) => Promise<void> | void} fetchFn
 * @param {Array} deps
 */
export function useStrictFetchEffect(fetchFn, deps = []) {
  const depsRef = useRef(null);
  const controllerRef = useRef(null);
  const generationRef = useRef(0);
  const fetchFnRef = useRef(fetchFn);

  // Always call the latest callback without making it a dependency.
  fetchFnRef.current = fetchFn;

  useEffect(() => {
    const depsChanged = !areDepsEqual(depsRef.current, deps);

    if (depsChanged) {
      // Dependencies genuinely changed: cancel the previous request
      // before starting the next one.
      controllerRef.current?.abort();

      depsRef.current = deps;
      const controller = new AbortController();
      controllerRef.current = controller;

      Promise.resolve(fetchFnRef.current(controller.signal)).catch((err) => {
        if (err?.name !== "CanceledError" && err?.name !== "AbortError") {
          console.error("[useStrictFetchEffect] Request error:", err);
        }
      });
    }

    const generation = ++generationRef.current;

    return () => {
      queueMicrotask(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (generationRef.current !== generation) return;
        controllerRef.current?.abort();
        controllerRef.current = null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

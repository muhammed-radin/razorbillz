import { useRef, useState } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";

const API_BASE = (import.meta.env.VITE_API_ENDPOINT || "").replace(/\/+$/, "");
const STREAM_URL = `${API_BASE}/api/live-events/stream`;
const MAX_RETRY_MS = 30_000;
const STREAM_EVENTS = ["snapshot", "metrics", "events", "requests", "db"];

/**
 * EventSource-based SSE client.
 *
 * Native EventSource performs a CORS-simple GET (no custom headers), so
 * cross-origin production hosts do not need to answer a preflight for the
 * live stream. Cookies are still sent via the `withCredentials` option,
 * which is what the owner gate relies on.
 *
 * EventSource retries some failures on its own, but browsers disagree on
 * when. We close and reconnect manually with capped exponential backoff so
 * the status is predictable and repeated failures cannot hammer the API.
 */
export function useLiveEventsStream({ enabled = true, onMessage } = {}) {
  const [state, setState] = useState({
    status: "idle",
    error: null,
    attempts: 0,
  });
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useStrictEffect(() => {
    if (!enabled) {
      setState({ status: "idle", error: null, attempts: 0 });
      return undefined;
    }

    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setState({
        status: "forbidden",
        error: "This browser does not support server-sent events.",
        attempts: 0,
      });
      return undefined;
    }

    let disposed = false;
    let source = null;
    let retryTimer = null;
    let attempts = 0;

    const handleMessage = (event) => {
      if (!event?.data) return;

      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      onMessageRef.current?.({
        event: event.type || "message",
        id: event.lastEventId || null,
        data,
      });
    };

    const scheduleRetry = (message) => {
      if (disposed) return;

      attempts += 1;
      setState({ status: "reconnecting", error: message, attempts });

      const delay = Math.min(
        MAX_RETRY_MS,
        1_000 * 2 ** Math.min(attempts - 1, 5),
      );
      retryTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      retryTimer = null;

      setState((previous) =>
        previous.status === "open"
          ? previous
          : { status: "connecting", error: null, attempts },
      );

      try {
        source = new EventSource(STREAM_URL, { withCredentials: true });
      } catch {
        scheduleRetry("Could not open the live stream.");
        return;
      }

      source.onopen = () => {
        if (disposed) return;
        attempts = 0;
        setState({ status: "open", error: null, attempts: 0 });
      };

      for (const name of STREAM_EVENTS) {
        source.addEventListener(name, handleMessage);
      }
      source.onmessage = handleMessage;

      source.onerror = () => {
        if (disposed) return;

        // Drop the browser-managed connection so our backoff is the only
        // retry mechanism.
        if (source) {
          source.close();
          source = null;
        }

        scheduleRetry(
          attempts >= 5
            ? "Live stream unavailable. Check that the API host allows this origin."
            : "Live stream disconnected. Reconnecting…",
        );
      };
    };

    connect();

    return () => {
      disposed = true;
      if (source) {
        source.close();
        source = null;
      }
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled]);

  return state;
}

export default useLiveEventsStream;

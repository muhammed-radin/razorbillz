import { useRef, useState } from "react";
import { api } from "@/utils/api";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";

const STREAM_URL = `${import.meta.env.VITE_API_ENDPOINT}/api/live-events/stream`;
const MAX_RETRY_MS = 30_000;

function parseFrame(raw) {
  let event = "message";
  let id = null;
  const data = [];

  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue;

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id") id = value;
  }

  if (!data.length) return null;

  try {
    return { event, id, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

/**
 * Fetch-based SSE client.
 *
 * EventSource cannot attach the API key headers used by the rest of the
 * app, so we read the stream with fetch + ReadableStream (credentials
 * included) and reconnect with capped exponential backoff.
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

    let disposed = false;
    let controller = null;
    let retryTimer = null;
    let attempts = 0;

    const connect = async () => {
      if (disposed) return;
      retryTimer = null;
      controller = new AbortController();

      setState((previous) =>
        previous.status === "open"
          ? previous
          : { status: "connecting", error: null, attempts },
      );

      try {
        const response = await fetch(STREAM_URL, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            ...api.ACTION_HEADER,
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = new Error(
            response.status === 401 || response.status === 403
              ? "Owner access is required to watch the live stream."
              : `Live stream failed with status ${response.status}.`,
          );
          error.status = response.status;
          throw error;
        }

        if (!response.body) {
          throw new Error("This browser cannot read the live stream.");
        }

        attempts = 0;
        setState({ status: "open", error: null, attempts: 0 });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!disposed) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder
            .decode(value, { stream: true })
            .replace(/\r\n/g, "\n");

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            const frame = parseFrame(raw);
            if (frame) onMessageRef.current?.(frame);

            boundary = buffer.indexOf("\n\n");
          }
        }

        if (!disposed) {
          throw new Error("The live stream disconnected.");
        }
      } catch (error) {
        if (disposed || error?.name === "AbortError") return;

        if (error?.status === 401 || error?.status === 403) {
          setState({
            status: "forbidden",
            error: error.message,
            attempts,
          });
          return;
        }

        attempts += 1;
        setState({
          status: "reconnecting",
          error: error?.message || "Live stream disconnected.",
          attempts,
        });

        const delay = Math.min(
          MAX_RETRY_MS,
          1_000 * 2 ** Math.min(attempts - 1, 5),
        );
        retryTimer = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      disposed = true;
      controller?.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled]);

  return state;
}

export default useLiveEventsStream;

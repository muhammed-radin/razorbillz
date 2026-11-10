/**
 * Admin product video section (rendered inside the "Resources" accordion).
 *
 * Two ways to add a video:
 *   • file  — picked from disk and staged locally. Nothing is uploaded while
 *             editing; on form submit every file is transcoded to WebM (VP8)
 *             and uploaded one by one. A trace dialog shows that progress.
 *   • URL   — pasted directly (metadata/poster are fetched best-effort; the
 *             file is already hosted, so nothing is uploaded).
 *
 * Items are plain serialisable state so the parent page can keep drafts in
 * IndexedDB (File objects included).
 */
import { useCallback, useRef } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Film,
  Link as LinkIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  MAX_DURATION_SECONDS,
  MAX_INPUT_BYTES,
  VIDEO_ACCEPT,
  formatBytes,
  formatDuration,
  posterFromVideoUrl,
  readVideoMetadata,
  readVideoUrlMetadata,
} from "@/utils/video-upload";

const newId = () =>
  `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Accept only http(s) URLs; bare `//host/path` is upgraded to https. */
function normalizeVideoUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;

  try {
    const parsed = new URL(candidate);
    return /^https?:$/.test(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function nameFromUrl(url) {
  try {
    const { pathname, hostname } = new URL(url);
    const last = pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : hostname;
  } catch {
    return "Video URL";
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Video URL";
  }
}

export function ProductVideosSection({ videos, onChange, disabled = false }) {
  const inputRef = useRef(null);

  const patch = useCallback(
    (id, values) => {
      onChange((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...values } : item)),
      );
    },
    [onChange],
  );

  const inspectFile = useCallback(
    async (item) => {
      if (item.file.size > MAX_INPUT_BYTES) {
        patch(item.id, {
          status: "error",
          error: `Video is too large. The limit is ${Math.round(
            MAX_INPUT_BYTES / 1024 / 1024,
          )} MB.`,
        });
        return;
      }

      try {
        const meta = await readVideoMetadata(item.file);

        if (meta.duration && meta.duration > MAX_DURATION_SECONDS) {
          patch(item.id, {
            ...meta,
            status: "error",
            error: `Video is too long. The limit is ${MAX_DURATION_SECONDS} seconds.`,
          });
          return;
        }

        patch(item.id, { ...meta, status: "ready", error: "" });
      } catch (error) {
        patch(item.id, {
          status: "error",
          error: error.message || "This video could not be read.",
        });
      }
    },
    [patch],
  );

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const items = files.map((file) => ({
      id: newId(),
      name: file.name,
      source: "upload",
      size: file.size,
      file,
      objectUrl: URL.createObjectURL(file),
      status: "reading",
      stage: "reading",
      progress: 0,
      error: "",
      url: "",
      poster: "",
      duration: 0,
      width: 0,
      height: 0,
      encodedSize: 0,
    }));

    onChange((prev) => [...prev, ...items]);
    items.forEach((item) => inspectFile(item));
  };

  const addUrlRow = () => {
    onChange((prev) => [
      ...prev,
      {
        id: newId(),
        name: "Video URL",
        source: "url",
        size: 0,
        file: null,
        objectUrl: "",
        status: "draft",
        stage: "reading",
        progress: 0,
        error: "",
        url: "",
        poster: "",
        duration: 0,
        width: 0,
        height: 0,
        encodedSize: 0,
      },
    ]);
  };

  const confirmUrl = async (id) => {
    const item = videos.find((video) => video.id === id);
    if (!item) return;

    const normalized = normalizeVideoUrl(item.url);
    if (!normalized) {
      toast.error("Enter a valid http(s) video URL.");
      return;
    }

    patch(id, {
      url: normalized,
      status: "reading",
      progress: 0,
      error: "",
    });

    let meta = { duration: 0, width: 0, height: 0 };
    try {
      meta = await readVideoUrlMetadata(normalized);
    } catch {
      /* Metadata is best-effort: the URL itself is still valid. */
    }

    patch(id, {
      ...meta,
      name: nameFromUrl(normalized),
      poster: posterFromVideoUrl(normalized),
      encodedSize: 0,
      status: "ready",
      stage: "done",
      progress: 1,
      error: "",
    });
  };

  const remove = (id) => {
    onChange((prev) => {
      const item = prev.find((video) => video.id === id);
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((video) => video.id !== id);
    });
  };

  const readingCount = videos.filter(
    (video) => video.status === "reading",
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Videos</h3>
        <p className="text-xs text-muted-foreground">
          Upload MP4/WebM/MOV/MKV files; each one is compressed and converted to
          WebM (VP8) in your browser when you save the product (max{" "}
          {Math.round(MAX_INPUT_BYTES / 1024 / 1024)} MB /{" "}
          {MAX_DURATION_SECONDS}s). You can also paste an existing video URL.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload Videos
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addUrlRow}
        >
          <LinkIcon className="mr-2 h-4 w-4" />
          Add Video URL
        </Button>
        {readingCount > 0 && (
          <span className="text-xs text-muted-foreground">
            Reading {readingCount} video{readingCount === 1 ? "" : "s"}…
          </span>
        )}
      </div>

      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <Film className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No videos yet</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Upload a file to have it converted to WebM when you save, or add a
            video URL that is already hosted (Cloudinary, your own CDN, …).
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {videos.map((video) => {
            if (video.status === "draft") {
              return (
                <li
                  key={video.id}
                  className="flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row sm:items-center"
                >
                  <Film className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
                  <Input
                    autoFocus
                    value={video.url}
                    placeholder="https://res.cloudinary.com/…/video/upload/…webm"
                    aria-label="Video URL"
                    onChange={(event) =>
                      patch(video.id, { url: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirmUrl(video.id);
                      }
                    }}
                  />
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => confirmUrl(video.id)}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove video URL"
                      onClick={() => remove(video.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            }

            const reading = video.status === "reading";
            const previewSrc = video.objectUrl || video.url;

            return (
              <li
                key={video.id}
                className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row"
              >
                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border bg-black">
                  {video.poster ? (
                    <img
                      src={video.poster}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : previewSrc ? (
                    <video
                      src={`${previewSrc}#t=0.1`}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-white/60">
                      <Film className="h-6 w-6" />
                    </div>
                  )}

                  {video.duration > 0 && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px] font-medium text-white">
                      {formatDuration(video.duration)}
                    </span>
                  )}

                  {reading && (
                    <span className="absolute inset-0 grid place-items-center bg-black/45">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-medium"
                        title={video.name}
                      >
                        {video.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {video.size ? (
                          <span>
                            {formatBytes(video.size)}
                            {video.encodedSize
                              ? ` → ${formatBytes(video.encodedSize)}`
                              : ""}
                          </span>
                        ) : video.source === "url" ? (
                          <span className="truncate">
                            {hostFromUrl(video.url)}
                          </span>
                        ) : null}
                        {video.width ? (
                          <span>
                            {video.width}×{video.height}
                          </span>
                        ) : null}
                        {video.status === "ready" && (
                          <Badge
                            variant="secondary"
                            className="gap-1 text-[10px] text-amber-600"
                          >
                            <Upload className="h-3 w-3" />
                            {video.source === "url"
                              ? "URL added"
                              : "Ready to upload"}
                          </Badge>
                        )}
                        {video.status === "uploaded" && (
                          <Badge
                            variant="secondary"
                            className="gap-1 text-[10px] text-emerald-600"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {video.source === "url" ? "URL added" : "WebM ready"}
                          </Badge>
                        )}
                        {video.status === "reading" && (
                          <span className="text-[10px]">Reading details…</span>
                        )}
                        {video.status === "error" && (
                          <Badge
                            variant="destructive"
                            className="gap-1 text-[10px]"
                          >
                            <AlertCircle className="h-3 w-3" />
                            Failed
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        aria-label={`Remove ${video.name}`}
                        onClick={() => remove(video.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {video.status === "error" && video.error && (
                    <p className="text-[11px] text-destructive">{video.error}</p>
                  )}

                  {(video.status === "ready" ||
                    video.status === "uploaded") && (
                    <p className="text-[11px] text-muted-foreground">
                      {video.status === "ready"
                        ? "Will be uploaded when you save the product."
                        : "Already uploaded."}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ProductVideosSection;

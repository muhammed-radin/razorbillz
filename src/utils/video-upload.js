/**
 * Browser-side video pipeline (admin uploads).
 * ---------------------------------------------------------------------------
 * Every video is normalised BEFORE it reaches the CDN:
 *
 *   1. metadata is read locally (duration / dimensions),
 *   2. ffmpeg.wasm transcodes it to WebM (VP8 + Opus, constant-quality CRF),
 *   3. a poster frame is extracted from the *encoded* file,
 *   4. video + poster are uploaded to Cloudinary (unsigned `thumbs` preset).
 *
 * The ~32 MB ffmpeg core is fetched from a CDN on first use only, so ordinary
 * storefront visitors never download it. Encoding happens in a worker, so the
 * admin UI stays responsive.
 *
 * Quality knobs live in VIDEO_ENCODE — CRF is the one to tweak.
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
} from "./image-upload";

/** Encoder profile: visually lossless for typical product footage. */
export const VIDEO_ENCODE = {
  /** VP8 constant quality. Lower = better & bigger; 24 is visually lossless. */
  crf: 24,
  /** Sources taller than this are downscaled. Never upscales. */
  maxHeight: 1080,
  audioBitrate: "128k",
  /** wasm VP8 speed/quality knob: 0 slowest … 8 fastest. */
  cpuUsed: 4,
};

/** Hard guards so a phone upload cannot lock the admin tab up for an hour. */
export const MAX_INPUT_BYTES = 500 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 180;

/** File-input accept string (mp4, webm, mov, m4v, ogv, mkv, avi). */
export const VIDEO_ACCEPT =
  "video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg,video/x-matroska,video/x-msvideo,video/*";

const FFMPEG_CORE_VERSION = "0.12.10";
/* The ESM core is required: the ffmpeg worker is a module worker, and the UMD
 * build only assigns `createFFmpegCore` to the global scope, which module
 * workers do not expose (dynamic import returns an empty namespace). */
const FFMPEG_CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

const CLOUDINARY_VIDEO_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
const CLOUDINARY_IMAGE_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/** Sentinel returned when a caller aborts a job. */
export const CANCELLED = Symbol("video-cancelled");

/* -------------------------------------------------------------------------
 * ffmpeg engine (singleton)
 * ---------------------------------------------------------------------- */

let engine = null; // { promise: Promise<FFmpeg> }

function abortError() {
  const error = new Error("Video processing cancelled");
  error.name = "AbortError";
  return error;
}

function assertLive(signal) {
  if (signal?.aborted) throw abortError();
}

/** Fetch a URL as a Blob, reporting download progress when possible. */
async function fetchBlobWithProgress(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not load the video engine (${response.status}). Check your connection and try again.`,
    );
  }

  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !onProgress) return response.blob();

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    if (total) onProgress(Math.min(1, loaded / total));
  }

  return new Blob(chunks);
}

async function getEngine(onProgress) {
  if (engine) return engine.promise;

  const promise = (async () => {
    const ffmpeg = new FFmpeg();

    const core = await fetchBlobWithProgress(
      `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
      (p) => onProgress?.(p * 0.03),
    );
    const wasm = await fetchBlobWithProgress(
      `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
      (p) => onProgress?.(0.03 + p * 0.97),
    );

    await ffmpeg.load({
      coreURL: URL.createObjectURL(
        new Blob([core], { type: "text/javascript" }),
      ),
      wasmURL: URL.createObjectURL(new Blob([wasm], { type: "application/wasm" })),
    });

    return ffmpeg;
  })();

  engine = { promise };

  try {
    return await promise;
  } catch (error) {
    engine = null;
    throw error;
  }
}

/**
 * Terminate the worker. Call this after an abort: the in-flight `exec()`
 * Promise is abandoned by the caller (see `raceCancellation`), and a fresh
 * engine is created for the next job.
 */
export async function shutdownVideoEngine() {
  const current = engine;
  engine = null;
  if (!current) return;
  try {
    const ffmpeg = await current.promise;
    ffmpeg.terminate();
  } catch {
    /* engine never finished loading */
  }
}

/** Resolve `CANCELLED` as soon as the signal aborts, without leaking errors. */
function raceCancellation(promise, signal) {
  if (!signal) return promise;

  return Promise.race([
    promise,
    new Promise((resolve) => {
      if (signal.aborted) resolve(CANCELLED);
      else
        signal.addEventListener("abort", () => resolve(CANCELLED), {
          once: true,
        });
    }),
  ]);
}

/* -------------------------------------------------------------------------
 * Inspection (local files + remote URLs)
 * ---------------------------------------------------------------------- */

/**
 * Read duration + dimensions from any playable source without decoding it.
 * @param {string} src object URL for a local file, or a remote video URL
 */
function probeVideoMetadata(src, { timeout = 0, errorMessage } = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      fn(value);
    };

    if (timeout) {
      timer = setTimeout(
        () =>
          finish(
            reject,
            new Error(errorMessage || "Timed out while reading the video."),
          ),
        timeout,
      );
    }

    video.onloadedmetadata = () =>
      finish(resolve, {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });

    video.onerror = () =>
      finish(
        reject,
        new Error(
          errorMessage ||
            "This video could not be read. Try an MP4 (H.264) or WebM file.",
        ),
      );

    video.src = src;
  });
}

/** Read duration + dimensions from a local file without decoding it. */
export function readVideoMetadata(file) {
  const url = URL.createObjectURL(file);
  return probeVideoMetadata(url).finally(() => URL.revokeObjectURL(url));
}

/** Read duration + dimensions from a remote video URL (best-effort). */
export function readVideoUrlMetadata(url) {
  return probeVideoMetadata(url, {
    timeout: 15000,
    errorMessage: "This video URL could not be loaded.",
  });
}

/**
 * Derive a poster frame for Cloudinary-hosted videos. Other hosts return ""
 * and the UI falls back to a muted <video preload="metadata"> thumbnail.
 */
export function posterFromVideoUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("cloudinary.com")) return "";
    if (!parsed.pathname.includes("/video/upload/")) return "";
    if (/\.(m3u8|mpd)$/i.test(parsed.pathname)) return "";

    return url
      .replace("/video/upload/", "/video/upload/so_0/")
      .replace(/\.[a-z0-9]+$/i, ".jpg");
  } catch {
    return "";
  }
}

/* -------------------------------------------------------------------------
 * Transcode
 * ---------------------------------------------------------------------- */

/**
 * Transcode any supported browser-decodable video to WebM (VP8 + Opus).
 *
 * VP8 rather than VP9 on purpose: the single-thread ffmpeg.wasm core crashes
 * (wasm "memory access out of bounds") partway through every VP9 encode. VP8
 * is still WebM, plays everywhere, and encodes faster in wasm.
 *
 * @param {File} file
 * @param {{signal?: AbortSignal, onProgress?: (p:number)=>void,
 *          onEngineProgress?: (p:number)=>void}} [options]
 * @returns {Promise<{blob: Blob}>}
 */
export async function transcodeToWebm(
  file,
  { signal, onProgress, onEngineProgress } = {},
) {
  assertLive(signal);

  const ffmpeg = await getEngine(onEngineProgress);
  assertLive(signal);

  const extension =
    (file.name?.match(/\.[a-z0-9]+$/i)?.[0] || ".mp4").toLowerCase();
  const input = `input${extension}`;
  const output = "output.webm";

  const handleProgress = ({ progress }) => {
    if (Number.isFinite(progress)) {
      onProgress?.(Math.min(1, Math.max(0, progress)));
    }
  };
  ffmpeg.on("progress", handleProgress);

  const videoCodec = [
    "-c:v",
    "libvpx",
    "-crf",
    String(VIDEO_ENCODE.crf),
    "-b:v",
    "0",
    "-cpu-used",
    String(VIDEO_ENCODE.cpuUsed),
    "-deadline",
    "good",
    "-auto-alt-ref",
    "0",
  ];

  const common = [
    "-pix_fmt",
    "yuv420p",
    "-vf",
    `scale=-2:'min(${VIDEO_ENCODE.maxHeight},ih)'`,
    "-c:a",
    "libopus",
    "-b:a",
    VIDEO_ENCODE.audioBitrate,
  ];

  try {
    await ffmpeg.writeFile(input, await fetchFile(file));

    const code = await ffmpeg.exec([
      "-i",
      input,
      ...videoCodec,
      ...common,
      output,
    ]);
    if (code !== 0) {
      throw new Error(
        "This video could not be converted. Try an MP4 (H.264) or WebM file.",
      );
    }
    assertLive(signal);

    const encoded = await ffmpeg.readFile(output);
    const blob = new Blob([encoded], { type: "video/webm" });
    if (!blob.size) throw new Error("The converted video was empty.");

    return { blob };
  } finally {
    ffmpeg.off?.("progress", handleProgress);
    await Promise.allSettled(
      [input, output].map((name) => ffmpeg.deleteFile(name)),
    );
  }
}

/* -------------------------------------------------------------------------
 * Poster frame
 * ---------------------------------------------------------------------- */

/**
 * Grab a poster frame from the encoded video using the browser's own decoder.
 *
 * Deliberately *not* another ffmpeg pass: a second `exec()` after an encode is
 * where the single-thread wasm core runs out of memory. Canvas capture is
 * instant, needs no extra download, and produces a well-formed JPEG.
 *
 * Best-effort by design — callers treat `null` as "no poster".
 *
 * @param {Blob} blob encoded video
 * @returns {Promise<Blob|null>}
 */
async function capturePoster(blob, { maxWidth = 1280 } = {}) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  const withTimeout = (promise, ms, message) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);

  try {
    await withTimeout(
      new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () => reject(new Error("Poster frame could not be read."));
        video.src = url;
      }),
      15000,
      "Poster frame timed out.",
    );

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekTo = Math.min(0.5, duration / 2);
    if (seekTo > 0) {
      await withTimeout(
        new Promise((resolve, reject) => {
          video.onseeked = resolve;
          video.onerror = () => reject(new Error("Poster seek failed."));
          video.currentTime = seekTo;
        }),
        15000,
        "Poster seek timed out.",
      );
    }

    const sourceWidth = video.videoWidth || 0;
    const sourceHeight = video.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(1, maxWidth / sourceWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/* -------------------------------------------------------------------------
 * Cloudinary
 * ---------------------------------------------------------------------- */

function uploadBlob(endpoint, blob, filename, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };

    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* fall through to the generic error below */
      }

      if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) {
        resolve(body);
      } else {
        reject(
          new Error(body?.error?.message || `Upload failed (${xhr.status})`),
        );
      }
    };

    xhr.onerror = () =>
      reject(new Error("Network error while uploading the video."));
    xhr.onabort = () => reject(abortError());

    if (signal) {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      const onAbort = () => xhr.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      xhr.onloadend = () => signal.removeEventListener("abort", onAbort);
    }

    xhr.send(form);
  });
}

/* -------------------------------------------------------------------------
 * Public entry point
 * ---------------------------------------------------------------------- */

/**
 * Transcode + upload one video.
 *
 * @param {File} file
 * @param {{signal?: AbortSignal,
 *          onProgress?: (s:{stage:string, progress:number})=>void}} [options]
 * @returns {Promise<{url:string, poster:string, duration:number,
 *   width:number, height:number, size:number} | null>}
 *   `null` when the caller aborted.
 */
export async function prepareAndUploadVideo(file, { signal, onProgress } = {}) {
  if (!file) throw new Error("No video selected.");

  const looksLikeVideo =
    file.type?.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|ogv|mkv|avi)$/i.test(file.name || "");
  if (!looksLikeVideo) throw new Error("That file is not a video.");

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(
      `Video is too large. The limit is ${Math.round(
        MAX_INPUT_BYTES / 1024 / 1024,
      )} MB.`,
    );
  }

  const report = (stage, progress) => onProgress?.({ stage, progress });
  assertLive(signal);

  report("reading", 0);
  const meta = await readVideoMetadata(file);

  if (meta.duration && meta.duration > MAX_DURATION_SECONDS) {
    throw new Error(
      `Video is too long. The limit is ${MAX_DURATION_SECONDS} seconds.`,
    );
  }

  report("transcoding", 0);
  let transcoded;
  try {
    transcoded = await raceCancellation(
      transcodeToWebm(file, {
        signal,
        onEngineProgress: (progress) => report("engine", progress),
        onProgress: (progress) => report("transcoding", progress),
      }),
      signal,
    );
  } catch (error) {
    // A crashed wasm instance is unusable, so a retry must start fresh.
    await shutdownVideoEngine();
    throw error;
  }

  if (transcoded === CANCELLED) {
    await shutdownVideoEngine();
    return null;
  }

  const base =
    (file.name || "video")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.-]+/g, "-")
      .slice(0, 60) || "video";

  report("uploading", 0);
  const video = await uploadBlob(
    CLOUDINARY_VIDEO_URL,
    transcoded.blob,
    `${base}.webm`,
    { signal, onProgress: (progress) => report("uploading", progress) },
  );

  let poster = "";
  const posterBlob = await capturePoster(transcoded.blob);
  if (posterBlob) {
    report("poster", 0);
    try {
      const uploaded = await uploadBlob(
        CLOUDINARY_IMAGE_URL,
        posterBlob,
        `${base}-poster.jpg`,
        { signal },
      );
      poster = uploaded.secure_url || "";
    } catch (error) {
      if (error.name === "AbortError") throw error;
      /* poster is optional */
    }
  }

  report("done", 1);

  return {
    url: video.secure_url,
    poster,
    duration: Math.round(meta.duration || 0),
    width: meta.width || 0,
    height: meta.height || 0,
    size: transcoded.blob.size,
  };
}

/* -------------------------------------------------------------------------
 * Formatting helpers for the admin UI
 * ---------------------------------------------------------------------- */

export function formatBytes(bytes) {
  if (!bytes || bytes < 1) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

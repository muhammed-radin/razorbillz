/**
 * Admin product resource upload pipeline (images + videos).
 *
 * Nothing is uploaded while the admin edits the product: files are staged in
 * component state (and IndexedDB drafts) until the form is submitted. At submit
 * time every staged file is uploaded one at a time, in form order:
 *
 *   thumbnail → additional images → videos
 *
 * Videos additionally run through the browser transcode step
 * (`utils/video-upload`) before they are uploaded. The caller receives a
 * progress callback per step so the UI can render the upload trace.
 */
import { uploadToCloudinary } from "./image-upload";
import {
  posterFromVideoUrl,
  prepareAndUploadVideo,
} from "./video-upload";

/** Human readable labels for the transcode/upload stages. */
export const UPLOAD_STAGE_LABEL = {
  starting: "Starting…",
  reading: "Reading video…",
  engine: "Downloading video engine (first time only)…",
  transcoding: "Compressing and converting to WebM…",
  poster: "Creating poster…",
  uploading: "Uploading…",
  saving: "Saving product…",
  saved: "Saved",
  done: "Done",
};

/**
 * Build the ordered list of resources that still have a local File to upload.
 * URL-backed resources are already hosted and are skipped.
 *
 * @param {{thumbnail: object, images: object[], videos: object[]}} resources
 * @returns {Array<{id:string, kind:"image"|"video", label:string,
 *   file:File, imageIndex?:number, videoId?:string, size?:number}>}
 */
export function buildUploadSteps({ thumbnail, images = [], videos = [] }) {
  const steps = [];

  if (thumbnail?.file && !thumbnail.url) {
    steps.push({
      id: "thumbnail",
      kind: "image",
      label: "Thumbnail",
      file: thumbnail.file,
      size: thumbnail.file.size,
    });
  }

  images.forEach((image, index) => {
    if (image?.file && !image.url) {
      steps.push({
        id: `image-${index}`,
        kind: "image",
        label: image.meta?.name || image.file.name || `Image ${index + 1}`,
        file: image.file,
        imageIndex: index,
        size: image.file.size,
      });
    }
  });

  videos.forEach((video) => {
    if (video?.file && !video.url) {
      steps.push({
        id: `video-${video.id}`,
        kind: "video",
        label: video.name || video.file.name || "Video",
        file: video.file,
        videoId: video.id,
        size: video.file.size,
      });
    }
  });

  return steps;
}

/**
 * Upload the given steps sequentially. Stops at the first failure so the
 * remaining steps stay untouched (the admin can fix the problem and submit
 * again; finished items are skipped because they now have URLs).
 *
 * @param {Array} steps from `buildUploadSteps`
 * @param {{
 *   onStep?: (id:string, patch:object)=>void,
 *   onThumbnail?: (url:string)=>void,
 *   onImage?: (index:number, url:string)=>void,
 *   onVideo?: (videoId:string, result:object)=>void,
 * }} callbacks
 * @returns {Promise<{ok:boolean, error?:Error,
 *   thumbnailUrl?:string, images:Map<string,string>,
 *   videos:Map<string,object>}>}
 */
export async function uploadProductResources(
  steps,
  { onStep, onThumbnail, onImage, onVideo } = {},
) {
  const results = {
    thumbnailUrl: "",
    images: new Map(),
    videos: new Map(),
  };

  for (const step of steps) {
    onStep?.(step.id, {
      status: "running",
      stage: "starting",
      progress: 0,
      error: "",
    });

    try {
      if (step.kind === "video") {
        const result = await prepareAndUploadVideo(step.file, {
          onProgress: ({ stage, progress }) =>
            onStep?.(step.id, { status: "running", stage, progress }),
        });

        if (!result) throw new Error("Video processing was cancelled.");

        results.videos.set(step.videoId, result);
        onVideo?.(step.videoId, result);
      } else {
        const url = await uploadToCloudinary(step.file, {
          onProgress: (percent) =>
            onStep?.(step.id, {
              status: "running",
              stage: "uploading",
              progress: Math.min(1, Math.max(0, percent / 100)),
            }),
        });

        results.images.set(step.id, url);
        if (step.id === "thumbnail") {
          results.thumbnailUrl = url;
          onThumbnail?.(url);
        } else {
          onImage?.(step.imageIndex, url);
        }
      }

      onStep?.(step.id, { status: "done", stage: "done", progress: 1 });
    } catch (error) {
      onStep?.(step.id, {
        status: "error",
        stage: "error",
        progress: 0,
        error: error.message || "Upload failed.",
      });
      return { ok: false, error, step, ...results };
    }
  }

  return { ok: true, ...results };
}

/**
 * Product payload for videos: either the already-hosted URL or the freshly
 * uploaded result from `uploadProductResources`.
 */
export function buildVideosPayload(videos = [], uploaded = new Map()) {
  return videos
    .map((video) => {
      const uploadedVideo = uploaded.get(video.id);
      const url = video.url || uploadedVideo?.url;
      if (!url) return null;

      return {
        url,
        poster: uploadedVideo?.poster || video.poster || "",
        duration: uploadedVideo?.duration || video.duration || 0,
        width: uploadedVideo?.width || video.width || 0,
        height: uploadedVideo?.height || video.height || 0,
        // For uploads this is the encoded WebM size; `video.size` is the
        // original file size and is only used for URL-hosted videos.
        size: uploadedVideo?.size || video.encodedSize || video.size || 0,
      };
    })
    .filter(Boolean);
}

/** Best-effort display name for a video URL. */
export function videoNameFromUrl(url) {
  try {
    const { pathname, hostname } = new URL(url);
    const last = pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : hostname;
  } catch {
    return "Video URL";
  }
}

/**
 * Normalize an imported video (string URL or `{url, poster, duration, …}`)
 * into the shape used by the admin video state.
 */
export function videoItemFromDocument(video, index = 0) {
  const source = typeof video === "string" ? { url: video } : video || {};
  const url = String(source.url || "").trim();
  if (!url) return null;

  return {
    id: `imported-video-${Date.now()}-${index}`,
    name: source.name || videoNameFromUrl(url),
    source: "url",
    size: Number(source.size) || 0,
    encodedSize: Number(source.size) || 0,
    file: null,
    objectUrl: "",
    status: "uploaded",
    stage: "done",
    progress: 1,
    error: "",
    url,
    poster: source.poster || posterFromVideoUrl(url),
    duration: Number(source.duration) || 0,
    width: Number(source.width) || 0,
    height: Number(source.height) || 0,
  };
}

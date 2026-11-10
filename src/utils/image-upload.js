/**
 * Shared image upload helpers (admin pages).
 *
 * Cloudinary unsigned upload — same preset the product pages use
 * ("thumbs" on cloud drv6qpv56). Images are normalized BEFORE upload:
 * converted to .webp, longest edge capped (default 524px) and compressed,
 * so uploads stay small and consistent.
 */

export const CLOUDINARY_UPLOAD_PRESET = "thumbs";
export const CLOUDINARY_CLOUD_NAME = "drv6qpv56";
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/**
 * Convert an image file to .webp with a resolution cap.
 * @param {File} file source image (any raster format the browser can decode)
 * @param {{maxSize?: number, quality?: number}} opts
 *   maxSize: cap for the LONGEST edge in px (default 524).
 *   quality: webp encoder quality 0..1 (default 0.8 compressed).
 * @returns {Promise<File>} a new File named "<orig>.webp" (type image/webp).
 *   SVG-like inputs that cannot be drawn are returned unchanged so the
 *   original file is still uploadable.
 */
export async function convertToWebp(file, { maxSize = 524, quality = 0.8 } = {}) {
  if (!file) throw new Error("No file provided");
  // Already webp and small enough: still re-encode for consistent size? No —
  // keep it (avoids double compression loss).
  if (file.type === "image/webp") return file;

  const bitmap = await loadImage(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("WebP encoding failed"))),
        "image/webp",
        quality,
      );
    });

    const baseName = (file.name || "image").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

async function loadImage(file) {
  // Prefer createImageBitmap (fast, keeps orientation), fall back to <img>.
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image"));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Upload a file to Cloudinary (unsigned preset). Resolves the secure_url.
 * @param {File|Blob} file
 * @param {{onProgress?: (pct:number)=>void}} [opts]
 */
export function uploadToCloudinary(file, opts = {}) {
  if (!file) return Promise.reject(new Error("No file provided"));
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", CLOUDINARY_UPLOAD_URL);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const resp = JSON.parse(xhr.response);
          if (resp.secure_url) return resolve(resp.secure_url);
          reject(new Error(resp?.error?.message || "Upload failed"));
        } catch {
          reject(new Error("Cloudinary returned an invalid response"));
        }
      } else {
        let message = "Cloudinary upload failed";
        try {
          message = JSON.parse(xhr.response)?.error?.message ?? message;
        } catch {
          /* keep default */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

/**
 * Convert to webp (capped + compressed) and upload in one step.
 * @returns {Promise<string>} the Cloudinary secure_url
 */
export async function convertAndUpload(file, opts = {}) {
  const webp = await convertToWebp(file, {
    maxSize: opts.maxSize,
    quality: opts.quality,
  });
  return uploadToCloudinary(webp, { onProgress: opts.onProgress });
}

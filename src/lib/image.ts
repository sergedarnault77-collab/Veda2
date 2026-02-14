// src/lib/image.ts
// browser-only utilities (used by scan modal to reduce payload size before calling /api/*)

export type CompressOpts = {
  maxW?: number;      // max width in px
  maxH?: number;      // max height in px
  quality?: number;   // 0..1 (jpeg quality)
  mimeType?: "image/jpeg" | "image/webp";
};

/**
 * Compress a data URL image in the browser using Canvas.
 * IMPORTANT: This must never run on the server. Guarded with typeof window.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  opts: CompressOpts = {}
): Promise<string> {
  if (typeof window === "undefined") {
    // Vercel/Node build safety — this function is browser-only.
    throw new Error("compressImageDataUrl called on server");
  }

  const {
    maxW = 1400,
    maxH = 1400,
    quality = 0.72,
    mimeType = "image/jpeg",
  } = opts;

  if (!dataUrl?.startsWith("data:image/")) {
    throw new Error("Invalid dataUrl");
  }

  // Load image
  const img = new Image();
  img.decoding = "async";
  img.src = dataUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
  });

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  if (!srcW || !srcH) {
    throw new Error("Image has invalid dimensions");
  }

  // Scale down (never upscale)
  const scale = Math.min(maxW / srcW, maxH / srcH, 1);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No canvas context");

  // Better downscaling quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);

  return canvas.toDataURL(mimeType, quality);
}

/** Approximate byte-length of a base64 data URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return 0;
  const b64 = dataUrl.slice(comma + 1);
  return Math.floor((b64.length * 3) / 4);
}

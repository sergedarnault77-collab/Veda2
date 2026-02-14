// src/lib/image.ts

/**
 * Down-scale + JPEG-compress a data-URL image.
 * Returns a smaller data:image/jpeg;base64,… string.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  opts?: { maxW?: number; maxH?: number; quality?: number }
): Promise<string> {
  const maxW = opts?.maxW ?? 1400;
  const maxH = opts?.maxH ?? 1400;
  const quality = opts?.quality ?? 0.72;

  const img = new Image();
  img.src = dataUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
  });

  let { width, height } = img;

  const scale = Math.min(maxW / width, maxH / height, 1);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");

  ctx.drawImage(img, 0, 0, width, height);

  // convert to jpeg (smaller than png)
  const out = canvas.toDataURL("image/jpeg", quality);
  return out;
}

/** Approximate byte-length of a base64 data URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return 0;
  const b64 = dataUrl.slice(comma + 1);
  return Math.floor((b64.length * 3) / 4);
}

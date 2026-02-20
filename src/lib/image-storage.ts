/**
 * Upload images to Supabase Storage and return URLs.
 * Falls back to in-browser thumbnails if storage isn't configured
 * or the upload fails (graceful degradation).
 *
 * Requires a "label-images" bucket in Supabase Storage with:
 *   - Public access for reads
 *   - Authenticated uploads allowed
 */

import { supabase } from "./supabase";
import { toThumbnail } from "./image";

const BUCKET = "label-images";

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function getUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Upload a single base64 data URL to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 */
async function uploadOne(dataUrl: string, label: string): Promise<string | null> {
  if (!dataUrl?.startsWith("data:image/")) return null;

  const userId = await getUserId();
  if (!userId) return null;

  try {
    const blob = dataUrlToBlob(dataUrl);
    const ext = blob.type === "image/png" ? "png" : "jpg";
    const path = `${userId}/${Date.now()}-${label}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: false });

    if (error) {
      console.warn("[image-storage] upload failed:", error.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return urlData?.publicUrl ?? null;
  } catch (err) {
    console.warn("[image-storage] upload error:", err);
    return null;
  }
}

function isStorageUrl(val: unknown): boolean {
  return typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"));
}

/**
 * Process an item's images for persistent storage:
 * 1. Try uploading to Supabase Storage → store URL
 * 2. Fall back to tiny thumbnail if upload fails
 *
 * Drop-in replacement for shrinkImagesForStorage.
 */
export async function prepareImagesForStorage(obj: any): Promise<any> {
  if (!obj || typeof obj !== "object") return obj;
  const clone = { ...obj };

  if (typeof clone.frontImage === "string" && clone.frontImage.startsWith("data:image/")) {
    const url = await uploadOne(clone.frontImage, "front");
    clone.frontImage = url ?? await toThumbnail(clone.frontImage);
  }

  if (typeof clone.ingredientsImage === "string" && clone.ingredientsImage.startsWith("data:image/")) {
    const url = await uploadOne(clone.ingredientsImage, "label");
    clone.ingredientsImage = url ?? await toThumbnail(clone.ingredientsImage);
  }

  if (Array.isArray(clone.ingredientsImages)) {
    clone.ingredientsImages = await Promise.all(
      clone.ingredientsImages.slice(0, 4).map(async (img: string, i: number) => {
        if (typeof img !== "string" || !img.startsWith("data:image/")) return img;
        if (isStorageUrl(img)) return img;
        const url = await uploadOne(img, `label-${i}`);
        return url ?? await toThumbnail(img);
      }),
    );
  }

  return clone;
}

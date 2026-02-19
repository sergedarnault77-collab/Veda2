import { shrinkImagesForStorage } from "./image";

const MIGRATED_KEY = "veda.img-migration.v1";

/**
 * One-time migration: walk through supps and meds in localStorage,
 * downscale any large base64 images to tiny thumbnails.
 * Prevents localStorage quota errors on subsequent writes.
 */
export async function migrateStorageImages() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATED_KEY) === "done") return;

  try {
    await shrinkCollection("veda.supps.v1");
    await shrinkCollection("veda.meds.v1");
    localStorage.setItem(MIGRATED_KEY, "done");
  } catch (err) {
    console.warn("[storage-migrate] migration failed:", err);
  }
}

async function shrinkCollection(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) return;

  let items: any[];
  try {
    items = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(items) || items.length === 0) return;

  const originalSize = raw.length;
  let changed = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") continue;

    const hasLargeImage =
      (typeof item.frontImage === "string" && item.frontImage.length > 40_000) ||
      (typeof item.ingredientsImage === "string" && item.ingredientsImage.length > 40_000) ||
      (Array.isArray(item.ingredientsImages) && item.ingredientsImages.some((img: string) => typeof img === "string" && img.length > 40_000));

    if (hasLargeImage) {
      items[i] = await shrinkImagesForStorage(item);
      changed = true;
    }
  }

  if (changed) {
    const newJson = JSON.stringify(items);
    console.log(`[storage-migrate] ${key}: ${(originalSize / 1024).toFixed(0)}KB → ${(newJson.length / 1024).toFixed(0)}KB`);
    try {
      localStorage.setItem(key, newJson);
    } catch {
      // If still over quota, strip images entirely
      for (const item of items) {
        delete item.frontImage;
        delete item.ingredientsImage;
        delete item.ingredientsImages;
      }
      localStorage.setItem(key, JSON.stringify(items));
    }
  }
}

import { shrinkImagesForStorage } from "./image";
import { prepareImagesForStorage } from "./image-storage";

const V1_KEY = "veda.img-migration.v1";
const V2_KEY = "veda.img-migration.v2";

/**
 * One-time migrations for image data in localStorage.
 * v1: downscale large base64 images to tiny thumbnails
 * v2: upload remaining base64 images to Supabase Storage (URLs replace data)
 */
export async function migrateStorageImages() {
  if (typeof window === "undefined") return;

  if (localStorage.getItem(V1_KEY) !== "done") {
    try {
      await shrinkCollection("veda.supps.v1", shrinkImagesForStorage);
      await shrinkCollection("veda.meds.v1", shrinkImagesForStorage);
      localStorage.setItem(V1_KEY, "done");
    } catch (err) {
      console.warn("[storage-migrate] v1 migration failed:", err);
    }
  }

  if (localStorage.getItem(V2_KEY) !== "done") {
    try {
      await shrinkCollection("veda.supps.v1", prepareImagesForStorage);
      await shrinkCollection("veda.meds.v1", prepareImagesForStorage);
      localStorage.setItem(V2_KEY, "done");
    } catch (err) {
      console.warn("[storage-migrate] v2 migration failed:", err);
    }
  }
}

async function shrinkCollection(key: string, processor: (obj: any) => Promise<any>) {
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

    const hasBase64Image =
      (typeof item.frontImage === "string" && item.frontImage.startsWith("data:image/")) ||
      (typeof item.ingredientsImage === "string" && item.ingredientsImage.startsWith("data:image/")) ||
      (Array.isArray(item.ingredientsImages) &&
        item.ingredientsImages.some(
          (img: string) => typeof img === "string" && img.startsWith("data:image/"),
        ));

    if (hasBase64Image) {
      items[i] = await processor(item);
      changed = true;
    }
  }

  if (changed) {
    const newJson = JSON.stringify(items);
    console.log(
      `[storage-migrate] ${key}: ${(originalSize / 1024).toFixed(0)}KB → ${(newJson.length / 1024).toFixed(0)}KB`,
    );
    try {
      localStorage.setItem(key, newJson);
    } catch {
      for (const item of items) {
        if (typeof item.frontImage === "string" && item.frontImage.startsWith("data:")) delete item.frontImage;
        if (typeof item.ingredientsImage === "string" && item.ingredientsImage.startsWith("data:")) delete item.ingredientsImage;
        if (Array.isArray(item.ingredientsImages)) {
          item.ingredientsImages = item.ingredientsImages.filter(
            (img: string) => typeof img === "string" && !img.startsWith("data:"),
          );
        }
      }
      localStorage.setItem(key, JSON.stringify(items));
    }
  }
}

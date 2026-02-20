// src/lib/persist.ts
import { pushCollection } from "./sync";

export function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return safeParse<T>(localStorage.getItem(key), fallback);
}

const LS_TO_COLLECTION: Record<string, "user" | "supps" | "meds" | "exposure" | "scans" | "taken"> = {
  "veda.user.v1": "user",
  "veda.supps.v1": "supps",
  "veda.meds.v1": "meds",
  "veda.exposure.today.v1": "exposure",
  "veda.scans.today.v1": "scans",
  "veda.supps.taken.v1": "taken",
};

export function saveLS<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(value);
  try {
    localStorage.setItem(key, json);
  } catch (e: any) {
    if (e?.name === "QuotaExceededError" || /quota/i.test(e?.message || "")) {
      console.warn("[persist] Quota exceeded for", key, "— trying to free space");
      try {
        pruneLocalStorage();
        localStorage.setItem(key, json);
      } catch {
        console.error("[persist] Still over quota after prune. Stripping images.");
        try {
          const stripped = stripImagesFromValue(value);
          localStorage.setItem(key, JSON.stringify(stripped));
        } catch {
          console.error("[persist] Cannot save", key, "— localStorage is full");
        }
      }
    } else {
      throw e;
    }
  }

  const collection = LS_TO_COLLECTION[key];
  if (collection) {
    pushCollection(collection, value);
  }
}

function pruneLocalStorage() {
  const expendable = ["veda.scans.today.v1", "veda.exposure.today.v1"];
  for (const k of expendable) {
    try { localStorage.removeItem(k); } catch { /* noop */ }
  }
}

function isDataUrl(v: unknown): boolean {
  return typeof v === "string" && v.startsWith("data:");
}

function stripImagesFromValue<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== "object") return item;
      const c = { ...item };
      if (isDataUrl(c.frontImage)) delete c.frontImage;
      if (isDataUrl(c.ingredientsImage)) delete c.ingredientsImage;
      if (Array.isArray(c.ingredientsImages)) {
        c.ingredientsImages = c.ingredientsImages.filter((img: unknown) => !isDataUrl(img));
        if (c.ingredientsImages.length === 0) delete c.ingredientsImages;
      }
      return c;
    }) as T;
  }
  return value;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

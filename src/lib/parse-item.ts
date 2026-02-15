// src/lib/parse-item.ts
// Client helper — calls /api/parse-item and returns a ParsedItem.

import type { NutrientRow } from "../home/stubs";

export type { NutrientRow };

export type ParsedItem = {
  displayName: string;
  brand: string | null;
  form: "tablet" | "capsule" | "powder" | "liquid" | "other" | null;
  strengthPerUnit: number | null;
  strengthUnit: "mg" | "µg" | "g" | "IU" | "mL" | null;
  servingSizeText: string | null;
  rawTextHints: string[];
  confidence: number; // 0..1
  mode: "openai" | "stub";
  labelTranscription: string | null;
  nutrients: NutrientRow[];
  ingredientsDetected: string[];
};

function stubItem(kind: "med" | "supp", hint?: string): ParsedItem {
  return {
    displayName: kind === "med" ? "New medication" : "New supplement",
    brand: null,
    form: null,
    strengthPerUnit: null,
    strengthUnit: null,
    servingSizeText: null,
    rawTextHints: hint ? [hint] : ["local fallback – API server not reachable"],
    confidence: 0,
    mode: "stub",
    labelTranscription: null,
    nutrients: [],
    ingredientsDetected: [],
  };
}

/**
 * Send two captured label images to /api/parse-item and get structured fields back.
 * Falls back to a stub ParsedItem on any network / server error.
 */
export async function parseScannedItem(
  kind: "med" | "supp",
  frontDataUrl: string,
  ingredientsDataUrl: string
): Promise<ParsedItem> {
  try {
    const res = await fetch("/api/parse-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        frontImageDataUrl: frontDataUrl,
        ingredientsImageDataUrl: ingredientsDataUrl,
      }),
    });

    if (!res.ok) {
      console.warn(`[parse-item] HTTP ${res.status}`);
      return stubItem(kind, `HTTP ${res.status} from /api/parse-item`);
    }

    const json = await res.json();
    if (json?.ok && json?.item) {
      const item = json.item;
      // Ensure new fields have defaults for backward compat
      return {
        ...item,
        labelTranscription: item.labelTranscription ?? null,
        nutrients: Array.isArray(item.nutrients) ? item.nutrients : [],
        ingredientsDetected: Array.isArray(item.ingredientsDetected) ? item.ingredientsDetected : [],
      } as ParsedItem;
    }

    console.warn("[parse-item] unexpected response shape", json);
    return stubItem(kind, "unexpected response shape from API");
  } catch (err) {
    console.warn("[parse-item] fetch failed, using stub", err);
    return stubItem(kind, "fetch failed – dev mode without API server?");
  }
}

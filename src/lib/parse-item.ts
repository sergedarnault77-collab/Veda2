// src/lib/parse-item.ts
// Client helper — calls /api/analyze (unified vision pipeline) and maps the
// response into a ParsedItem for use by AddScannedItemModal / meds / supps.

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
 * Send two captured label images to /api/analyze (unified vision pipeline)
 * and map the response into a ParsedItem.
 * Falls back to a stub ParsedItem on any network / server error.
 */
export async function parseScannedItem(
  kind: "med" | "supp",
  frontDataUrl: string,
  ingredientsDataUrl: string
): Promise<ParsedItem> {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frontImageDataUrl: frontDataUrl,
        ingredientsImageDataUrl: ingredientsDataUrl,
      }),
    });

    if (!res.ok) {
      console.warn(`[parse-item] /api/analyze HTTP ${res.status}`);
      return stubItem(kind, `HTTP ${res.status} from /api/analyze`);
    }

    const json = await res.json();
    if (!json?.ok) {
      console.warn("[parse-item] analyze returned ok=false", json);
      return stubItem(kind, json?.error || "analyze returned error");
    }

    // Map /api/analyze response → ParsedItem
    const mode = json.meta?.mode === "openai" ? "openai" : "stub";
    const productName =
      typeof json.productName === "string" && json.productName.trim()
        ? json.productName.trim()
        : null;

    // Confidence: if mode is openai and we got entities, it's decent
    const entities: string[] = Array.isArray(json.normalized?.detectedEntities)
      ? json.normalized.detectedEntities
      : [];
    const confidence =
      mode === "openai"
        ? entities.length > 0 ? 0.8 : 0.4
        : 0;

    const nutrients: NutrientRow[] = Array.isArray(json.nutrients)
      ? json.nutrients.filter(
          (n: any) => n && typeof n.nutrientId === "string" && typeof n.amountToday === "number"
        )
      : [];

    const labelTranscription =
      typeof json.transcription === "string" && json.transcription.trim()
        ? json.transcription.trim()
        : null;

    // Build rawTextHints from first few detected entities (for debug visibility)
    const rawTextHints = entities.slice(0, 8);

    // If it's a stub, show the reason
    if (mode === "stub" && json.meta?.reason) {
      rawTextHints.unshift(json.meta.reason);
    }

    return {
      displayName: productName || (kind === "med" ? "New medication" : "New supplement"),
      brand: null, // analyze doesn't extract brand separately
      form: null,  // analyze doesn't extract form
      strengthPerUnit: null,
      strengthUnit: null,
      servingSizeText: null,
      rawTextHints,
      confidence,
      mode,
      labelTranscription,
      nutrients,
      ingredientsDetected: entities,
    };
  } catch (err) {
    console.warn("[parse-item] fetch failed, using stub", err);
    return stubItem(kind, "fetch failed – dev mode without API server?");
  }
}

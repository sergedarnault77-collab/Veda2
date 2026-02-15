// src/lib/parse-item.ts
// Client helper — calls /api/analyze (unified vision pipeline) and maps the
// response into a ParsedItem for use by AddScannedItemModal / meds / supps.

import type { NutrientRow } from "../home/stubs";

export type { NutrientRow };

export type ParsedItemMeta = {
  transcriptionConfidence: number;
  needsRescan: boolean;
  rescanHint: string | null;
};

export type ParsedItem = {
  displayName: string;
  brand: string | null;
  form: "tablet" | "capsule" | "powder" | "liquid" | "other" | null;
  strengthPerUnit: number | null;
  strengthUnit: "mg" | "µg" | "g" | "IU" | "mL" | null;
  servingSizeText: string | null;
  rawTextHints: string[];
  confidence: number;
  mode: "openai" | "stub";
  labelTranscription: string | null;
  nutrients: NutrientRow[];
  ingredientsDetected: string[];
  ingredientsList: string[];
  ingredientsCount: number;
  meta?: ParsedItemMeta;
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
    ingredientsList: [],
    ingredientsCount: 0,
    meta: {
      transcriptionConfidence: 0,
      needsRescan: true,
      rescanHint: hint || "Couldn't read the label reliably. Take a closer photo of the ingredients/nutrition panel.",
    },
  };
}

/**
 * Send front + ingredient images to /api/analyze and map the response.
 * Accepts a single ingredientsDataUrl (backward compat) or an array.
 */
export async function parseScannedItem(
  kind: "med" | "supp",
  frontDataUrl: string,
  ingredientsDataUrl: string | string[],
): Promise<ParsedItem> {
  const ingredientsArray = Array.isArray(ingredientsDataUrl)
    ? ingredientsDataUrl
    : [ingredientsDataUrl];

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frontImageDataUrl: frontDataUrl,
        ingredientsImageDataUrls: ingredientsArray,
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

    const mode = json.meta?.mode === "openai" ? "openai" : "stub";
    const productName =
      typeof json.productName === "string" && json.productName.trim()
        ? json.productName.trim()
        : null;

    const entities: string[] = Array.isArray(json.normalized?.detectedEntities)
      ? json.normalized.detectedEntities
      : [];

    const ingredientsList: string[] = Array.isArray(json.ingredientsList)
      ? json.ingredientsList.filter((x: any) => typeof x === "string" && x.trim())
      : [];

    const confidence =
      mode === "openai"
        ? entities.length > 0 || ingredientsList.length > 0 ? 0.8 : 0.4
        : 0;

    const nutrients: NutrientRow[] = Array.isArray(json.nutrients)
      ? json.nutrients.filter(
          (n: any) => n && typeof n.nutrientId === "string" && typeof n.amountToday === "number",
        )
      : [];

    const labelTranscription =
      typeof json.transcription === "string" && json.transcription.trim()
        ? json.transcription.trim()
        : null;

    const rawTextHints = entities.slice(0, 8);
    if (mode === "stub" && json.meta?.reason) {
      rawTextHints.unshift(json.meta.reason);
    }

    return {
      displayName: productName || (kind === "med" ? "New medication" : "New supplement"),
      brand: null,
      form: null,
      strengthPerUnit: null,
      strengthUnit: null,
      servingSizeText: null,
      rawTextHints,
      confidence,
      mode,
      labelTranscription,
      nutrients,
      ingredientsDetected: entities,
      ingredientsList,
      ingredientsCount: ingredientsList.length,
      meta: {
        transcriptionConfidence: typeof json.meta?.transcriptionConfidence === "number" ? json.meta.transcriptionConfidence : 0.5,
        needsRescan: json.meta?.needsRescan === true,
        rescanHint: typeof json.meta?.rescanHint === "string" ? json.meta.rescanHint : null,
      },
    };
  } catch (err) {
    console.warn("[parse-item] fetch failed, using stub", err);
    return stubItem(kind, "fetch failed – dev mode without API server?");
  }
}

// src/lib/parse-item.ts
// Client helper — calls /api/analyze (unified vision pipeline) and maps the
// response into a ParsedItem for use by AddScannedItemModal / meds / supps.

import type { NutrientRow } from "../home/stubs";
import { apiFetchSafe } from "./apiFetchSafe";

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
  servingSizeG: number | null;
  nutritionPer: string;
  rawTextHints: string[];
  confidence: number;
  mode: "openai" | "stub";
  labelTranscription: string | null;
  nutrients: NutrientRow[];
  nutrientsPer100g: NutrientRow[] | null;
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
    servingSizeG: null,
    nutritionPer: "unknown",
    rawTextHints: hint ? [hint] : ["local fallback – API server not reachable"],
    confidence: 0,
    mode: "stub",
    labelTranscription: null,
    nutrients: [],
    nutrientsPer100g: null,
    ingredientsDetected: [],
    ingredientsList: [],
    ingredientsCount: 0,
    meta: {
      transcriptionConfidence: 0,
      needsRescan: true,
      rescanHint: hint || "Couldn't read the label. Try with more light or a steadier hand.",
    },
  };
}

/**
 * Send front + ingredient images to /api/analyze and map the response.
 * Accepts a single ingredientsDataUrl (backward compat), an array, or
 * null/undefined/empty for front-only identification (no ingredients label).
 */
export async function parseScannedItem(
  kind: "med" | "supp",
  frontDataUrl: string,
  ingredientsDataUrl?: string | string[] | null,
): Promise<ParsedItem> {
  const ingredientsArray = !ingredientsDataUrl
    ? []
    : Array.isArray(ingredientsDataUrl)
      ? ingredientsDataUrl.filter(Boolean)
      : [ingredientsDataUrl];

  try {
    const res = await apiFetchSafe("/api/analyze", {
      method: "POST",
      json: {
        frontImageDataUrl: frontDataUrl,
        ingredientsImageDataUrls: ingredientsArray,
      },
      timeoutMs: 90_000,
    });

    if (!res.ok) {
      const code = res.error.code;
      const hint =
        code === "FETCH_FAILED" && res.error.message.includes("abort")
          ? "Request timed out — the server took too long. Try again in a moment."
          : res.status === 504 || res.status === 503
            ? "Request timed out — dense labels can take longer. Try a single close-up photo of just the nutrition panel."
            : res.status === 0
              ? `Connection failed: ${res.error.message || "check your network and try again."}`
              : `Server error (${res.status}). Try again in a moment.`;
      console.warn(`[parse-item] /api/analyze failed:`, res.error);
      return stubItem(kind, hint);
    }

    const json: any = res.data;

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

    const rawNutrients: NutrientRow[] = Array.isArray(json.nutrients)
      ? json.nutrients
          .map((n: any) => {
            if (!n || typeof n.nutrientId !== "string") return null;
            // Defensive: normalize EU comma if amountToday arrived as string
            if (typeof n.amountToday === "string") {
              n = { ...n, amountToday: Number(n.amountToday.replace(/,/g, ".")) };
            }
            if (typeof n.amountToday !== "number" || !isFinite(n.amountToday)) return null;
            // Normalize unit aliases
            if (typeof n.unit === "string") {
              const u = n.unit.toLowerCase();
              if (u === "ie") n = { ...n, unit: "IU" };
              else if (u === "mcg" || u === "μg") n = { ...n, unit: "µg" };
            }
            return n;
          })
          .filter(Boolean) as NutrientRow[]
      : [];

    const servingSizeG = typeof json.servingSizeG === "number" && json.servingSizeG > 0
      ? json.servingSizeG : null;
    const nutritionPer = typeof json.nutritionPer === "string" ? json.nutritionPer.toLowerCase() : "unknown";

    const isPer100g = nutritionPer === "100g";
    let nutrients: NutrientRow[];
    let nutrientsPer100g: NutrientRow[] | null = null;

    if (isPer100g && servingSizeG) {
      nutrientsPer100g = rawNutrients;
      const scale = servingSizeG / 100;
      nutrients = rawNutrients.map(n => ({
        ...n,
        amountToday: Math.round(n.amountToday * scale * 100) / 100,
      }));
    } else {
      nutrients = rawNutrients;
    }

    const labelTranscription =
      typeof json.transcription === "string" && json.transcription.trim()
        ? json.transcription.trim()
        : null;

    const rawTextHints = entities.slice(0, 8);
    if (mode === "stub" && json.meta?.reason) {
      rawTextHints.unshift(json.meta.reason);
    }

    const servingText = isPer100g && servingSizeG
      ? `${servingSizeG}g (per 100g on label)`
      : servingSizeG
        ? `${servingSizeG}g`
        : null;

    return {
      displayName: productName || (kind === "med" ? "New medication" : "New supplement"),
      brand: null,
      form: null,
      strengthPerUnit: null,
      strengthUnit: null,
      servingSizeText: servingText,
      servingSizeG,
      nutritionPer,
      rawTextHints,
      confidence,
      mode,
      labelTranscription,
      nutrients,
      nutrientsPer100g,
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

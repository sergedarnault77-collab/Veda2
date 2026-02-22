/**
 * Client-side helper for the product master-dataset lookup.
 * Tries barcode or text search before falling back to the LLM pipeline.
 */

import type { NutrientRow } from "../home/stubs";
import { apiFetchSafe } from "./apiFetchSafe";

export type LookupMatch = {
  source: string;
  sourceId: string;
  barcode: string | null;
  productName: string | null;
  brandName: string | null;
  form: string | null;
  servingSize: string | null;
  similarity?: string;
  nutrients: {
    name: string;
    amount: number | null;
    unit: string | null;
    per: string | null;
    pctDv: number | null;
  }[];
};

export type LookupResult =
  | { hit: true; match: LookupMatch }
  | { hit: false };

const UNIT_MAP: Record<string, NutrientRow["unit"]> = {
  mg: "mg", µg: "µg", mcg: "µg", ug: "µg",
  g: "g", iu: "IU", IU: "IU", ml: "mL", mL: "mL",
};

function normalizeUnit(u: string | null): NutrientRow["unit"] {
  if (!u) return "mg";
  return UNIT_MAP[u.toLowerCase()] || "mg";
}

function toNutrientId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

export function matchToNutrients(match: LookupMatch): NutrientRow[] {
  return match.nutrients
    .filter(n => n.amount != null && n.amount > 0)
    .map(n => ({
      nutrientId: toNutrientId(n.name),
      name: n.name,
      unit: normalizeUnit(n.unit),
      amountToday: n.amount!,
      dailyReference: 0,
      percentLabel: n.pctDv ?? null,
    }));
}

export async function lookupByBarcode(barcode: string): Promise<LookupResult> {
  try {
    const r = await apiFetchSafe<any>(`/api/lookup?barcode=${encodeURIComponent(barcode)}`);
    if (!r.ok) return { hit: false };
    const data = r.data;
    if (data?.ok && data.match) {
      return { hit: true, match: data.match };
    }
    return { hit: false };
  } catch {
    return { hit: false };
  }
}

export async function lookupByName(query: string): Promise<LookupResult> {
  if (!query || query.length < 3) return { hit: false };
  try {
    const r = await apiFetchSafe<any>(`/api/lookup?q=${encodeURIComponent(query)}`);
    if (!r.ok) return { hit: false };
    const data = r.data;
    if (data?.ok && Array.isArray(data.matches) && data.matches.length > 0) {
      const best = data.matches[0];
      if (Number(best.similarity) >= 0.3 && best.nutrients.length > 0) {
        return { hit: true, match: best };
      }
    }
    return { hit: false };
  } catch {
    return { hit: false };
  }
}

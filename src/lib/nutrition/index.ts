import refIntakesJson from "./ref_intakes.json";
import ulsJson from "./uls.json";
import dietQuickcheckJson from "./diet_quickcheck.json";
import type { Sex, AgeBucket } from "./types";

export { refIntakesJson, ulsJson, dietQuickcheckJson };

export type RefTarget = { target: number; ref_type: string };

export function getTarget(
  sex: "male" | "female",
  ageBucket: AgeBucket,
  nutrientId: string,
): RefTarget | null {
  const buckets = (refIntakesJson.reference_intakes as any)?.[sex];
  if (!buckets) return null;
  const bucket = buckets[ageBucket];
  if (!bucket) return null;
  const entry = bucket[nutrientId];
  if (!entry) return null;
  return { target: entry.target, ref_type: entry.ref_type };
}

export function getMidpointTarget(
  ageBucket: AgeBucket,
  nutrientId: string,
): RefTarget | null {
  const m = getTarget("male", ageBucket, nutrientId);
  const f = getTarget("female", ageBucket, nutrientId);
  if (m && f) return { target: (m.target + f.target) / 2, ref_type: m.ref_type };
  return m || f || null;
}

export function resolveTarget(
  sex: Sex,
  ageBucket: AgeBucket,
  nutrientId: string,
): RefTarget | null {
  if (sex === "male" || sex === "female") {
    return getTarget(sex, ageBucket, nutrientId);
  }
  return getMidpointTarget(ageBucket, nutrientId);
}

export type UlEntry = {
  ul: number | null;
  applies_to: string;
  notes: string[];
};

export function getUl(nutrientId: string): UlEntry | null {
  const entry = ulsJson.upper_limits.find((u: any) => u.id === nutrientId);
  if (!entry) return null;
  return { ul: entry.ul, applies_to: entry.applies_to, notes: entry.notes };
}

export function getNutrientMeta(nutrientId: string): {
  label: string;
  unit: "mg" | "ug";
  kind: "vitamin" | "mineral";
} | null {
  const n = refIntakesJson.nutrients.find((x: any) => x.id === nutrientId);
  if (!n) return null;
  return { label: n.label, unit: n.unit as "mg" | "ug", kind: n.kind as "vitamin" | "mineral" };
}

export function allNutrientIds(): string[] {
  return refIntakesJson.nutrients.map((n: any) => n.id);
}

export { computeDailyNutrients } from "./compute";
export { computeFoodCoverageLabel, hasEnoughDietAnswers } from "./diet";
export type * from "./types";

/* ── Bridge: convert existing Veda data shapes → nutrition engine inputs ── */

import type { AgeRange, BiologicalSex } from "../auth";
import type { IntakeLine } from "./types";

const UNIT_MAP: Record<string, "mg" | "ug"> = {
  mg: "mg",
  ug: "ug",
  "µg": "ug",
  mcg: "ug",
};

export function ageRangeToAgeBucket(ar: AgeRange | null): AgeBucket {
  if (!ar) return "18_50";
  if (ar === "56-65") return "51_65";
  if (ar === "65+") return "65_plus";
  if (ar === "46-55") return "51_65";
  return "18_50";
}

export function bioSexToSex(bs: BiologicalSex | null): Sex {
  if (bs === "male") return "male";
  if (bs === "female") return "female";
  return "unspecified";
}

/**
 * Convert NutrientRow[] (from scan/supplement storage) to IntakeLine[].
 * Skips rows with non-reference units (IU, g, mL, kcal) since the reference
 * tables only use mg/ug and we can't reliably convert IU without per-nutrient factors.
 */
export function nutrientRowsToIntakeLines(
  rows: Array<{ nutrientId: string; unit: string; amountToday: number }>,
  source: IntakeLine["source"] = "supplement",
): IntakeLine[] {
  const lines: IntakeLine[] = [];
  for (const r of rows) {
    const unit = UNIT_MAP[r.unit];
    if (!unit) continue;
    if (!r.nutrientId || r.amountToday <= 0) continue;
    lines.push({ nutrientId: r.nutrientId, amount: r.amountToday, unit, source });
  }
  return lines;
}

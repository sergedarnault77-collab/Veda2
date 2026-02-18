import { resolveTarget, getUl, getNutrientMeta, allNutrientIds } from "./index";
import { computeFoodCoverageLabel } from "./diet";
import type { Sex, AgeBucket, IntakeLine, DietAnswers, NutrientComputed } from "./types";

export function toUnit(amount: number, from: "mg" | "ug", to: "mg" | "ug"): number {
  if (from === to) return amount;
  if (from === "mg" && to === "ug") return amount * 1000;
  return amount / 1000; // ug → mg
}

type Accumulator = { amount: number; unit: "mg" | "ug"; sources: number };

export function computeDailyNutrients(
  user: { sex: Sex; ageBucket: AgeBucket },
  lines: IntakeLine[],
  dietAnswers?: DietAnswers,
): NutrientComputed[] {
  const supplementTotals = new Map<string, Accumulator>();

  for (const l of lines) {
    if (l.source !== "supplement") continue;
    const prev = supplementTotals.get(l.nutrientId);
    if (!prev) {
      supplementTotals.set(l.nutrientId, { amount: l.amount, unit: l.unit, sources: 1 });
    } else {
      prev.amount += toUnit(l.amount, l.unit, prev.unit);
      prev.sources += 1;
    }
  }

  const nutrientIds = new Set<string>([
    ...supplementTotals.keys(),
    ...allNutrientIds(),
  ]);

  const results: NutrientComputed[] = [];

  for (const nutrientId of nutrientIds) {
    const meta = getNutrientMeta(nutrientId);
    if (!meta) continue;

    const unit = meta.unit;
    const sup = supplementTotals.get(nutrientId);
    const supplementTotal = sup ? toUnit(sup.amount, sup.unit, unit) : 0;

    const targetObj = resolveTarget(user.sex, user.ageBucket, nutrientId);
    const target = targetObj?.target ?? undefined;
    const refType = (targetObj?.ref_type as NutrientComputed["refType"]) ?? undefined;

    const ulObj = getUl(nutrientId);
    const ul = ulObj?.ul ?? null;
    const ulAppliesTo = (ulObj?.applies_to ?? "no_ul") as NutrientComputed["ulAppliesTo"];

    const percentOfTargetFromSupps = target ? supplementTotal / target : undefined;

    // UL percent: only compute when UL applies to supplements
    let ulPercentFromSupps: number | undefined;
    if (ul != null && ulAppliesTo !== "no_ul") {
      ulPercentFromSupps = supplementTotal / ul;
    }

    const exceedsUl = ul != null && ulAppliesTo !== "no_ul" && supplementTotal > ul;
    const approachingUl = ul != null && ulAppliesTo !== "no_ul" && supplementTotal >= ul * 0.8;
    const redundantStacking = (sup?.sources ?? 0) >= 2 && supplementTotal > 0;

    const foodCoverage = dietAnswers
      ? computeFoodCoverageLabel(dietAnswers, nutrientId)
      : "unknown" as const;

    results.push({
      nutrientId,
      label: meta.label,
      unit,
      kind: meta.kind,
      target,
      refType,
      ul,
      ulAppliesTo,
      supplementTotal,
      percentOfTargetFromSupps,
      ulPercentFromSupps,
      flags: { exceedsUl, approachingUl, redundantStacking },
      foodCoverage,
    });
  }

  // Sort: flagged items first, then by kind (vitamins → minerals), then alphabetically
  results.sort((a, b) => {
    const aFlag = (a.flags.exceedsUl ? 2 : 0) + (a.flags.approachingUl ? 1 : 0);
    const bFlag = (b.flags.exceedsUl ? 2 : 0) + (b.flags.approachingUl ? 1 : 0);
    if (aFlag !== bFlag) return bFlag - aFlag;
    if (a.kind !== b.kind) return a.kind === "vitamin" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return results;
}

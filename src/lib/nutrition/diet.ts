import dietQuickcheck from "./diet_quickcheck.json";
import type { DietAnswers, FoodCoverage } from "./types";

const ALIASES: Record<string, string> =
  (dietQuickcheck as any).nutrient_id_aliases ?? {};

function resolveAlias(id: string): string {
  return ALIASES[id] ?? id;
}

export function computeFoodCoverageLabel(
  answers: DietAnswers,
  nutrientId: string,
): FoodCoverage {
  const id = resolveAlias(nutrientId);

  let score = 0;

  for (const q of dietQuickcheck.questions) {
    const selected = answers[q.id];
    if (!selected) continue;
    const opt = q.options.find((o) => o.id === selected);
    if (!opt || !("effects" in opt) || !Array.isArray(opt.effects)) continue;

    for (const eff of opt.effects) {
      const effId = resolveAlias(eff.nutrient_id);
      if (effId === id) score += eff.weight;
    }
  }

  // Global override: vitamin D hard to cover without fish or fortified dairy
  if (id === "vitamin_d") {
    const fish = answers["fish_per_week"];
    const dairy = answers["dairy_or_fortified_alt_milk"];
    const hasFish = fish === "once" || fish === "twice_plus";
    const hasDairy = dairy === "daily" || dairy === "few_times_week";
    if (!hasFish && !hasDairy) return "hard_to_cover_from_food";
  }

  if (score >= 2.0) return "likely_covered_by_food";
  if (score >= 1.0) return "maybe_covered";
  return "unknown";
}

export function hasEnoughDietAnswers(answers: DietAnswers | undefined): boolean {
  if (!answers) return false;
  return Object.keys(answers).length >= 3;
}

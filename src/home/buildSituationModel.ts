import { loadLS } from "../lib/persist";
import { loadUser } from "../lib/auth";
import {
  computeDailyNutrients,
  ageRangeToAgeBucket,
  bioSexToSex,
  nutrientRowsToIntakeLines,
} from "../lib/nutrition";
import type { NutrientComputed, IntakeLine } from "../lib/nutrition";
import type { HomeSituationModel, HomeInsight, InsightSeverity } from "../types/insights";
import type { ScanResult } from "./ScanSection";

const SUPPS_KEY = "veda.supps.v1";
const MEDS_KEY = "veda.meds.v1";
const TAKEN_KEY = "veda.supps.taken.v1";
const SCANS_KEY = "veda.scans.today.v1";

const HIGH_RISK = new Set([
  "vitamin_d", "vitamin_a", "iron", "zinc", "selenium", "b6", "calcium", "iodine",
]);

type ItemNutrients = {
  name: string;
  source: "supplement" | "med";
  nutrients: Array<{ nutrientId: string; name: string; unit: string; amountToday: number }>;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadTakenFlags(): Record<string, boolean> {
  const raw = localStorage.getItem(TAKEN_KEY);
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    if (typeof p?.date === "string") {
      return p.date === new Date().toISOString().slice(0, 10) ? p.flags || {} : {};
    }
    return p;
  } catch { return {}; }
}

function getScaledNutrients(item: any): any[] {
  const per100g = Array.isArray(item.nutrientsPer100g) ? item.nutrientsPer100g : null;
  const servingG = typeof item.servingSizeG === "number" ? item.servingSizeG : null;
  if (per100g && servingG) {
    const scale = servingG / 100;
    return per100g.map((n: any) => ({
      ...n,
      amountToday: typeof n.amountToday === "number"
        ? Math.round(n.amountToday * scale * 100) / 100
        : n.amountToday,
    }));
  }
  if (item.nutritionPer === "100g" && !servingG) return [];
  return Array.isArray(item.nutrients) ? item.nutrients : [];
}

function collectItems(): { lines: IntakeLine[]; suppNames: string[]; medNames: string[]; items: ItemNutrients[] } {
  const taken = loadTakenFlags();
  const supps = loadLS<any[]>(SUPPS_KEY, []).filter((s) => s?.id && taken[s.id]);
  const meds = loadLS<any[]>(MEDS_KEY, []);

  const lines: IntakeLine[] = [];
  const suppNames: string[] = [];
  const medNames: string[] = [];
  const items: ItemNutrients[] = [];

  for (const s of supps) {
    const name = s.displayName || "Supplement";
    suppNames.push(name);
    const nutrients = getScaledNutrients(s);
    if (nutrients.length > 0) {
      lines.push(...nutrientRowsToIntakeLines(nutrients, "supplement"));
      items.push({ name, source: "supplement", nutrients });
    }
  }

  for (const m of meds) {
    const name = m.displayName || "Medication";
    medNames.push(name);
    const nutrients = getScaledNutrients(m);
    if (nutrients.length > 0) {
      lines.push(...nutrientRowsToIntakeLines(nutrients, "med"));
      items.push({ name, source: "med", nutrients });
    }
  }

  const scansRaw = loadLS<any>(SCANS_KEY, null);
  if (scansRaw && scansRaw.date === todayStr() && Array.isArray(scansRaw.scans)) {
    for (const scan of scansRaw.scans) {
      if (!Array.isArray(scan.nutrients)) continue;
      lines.push(...nutrientRowsToIntakeLines(scan.nutrients, "supplement"));
      items.push({ name: scan.productName || "Scanned item", source: "supplement", nutrients: scan.nutrients });
    }
  }

  return { lines, suppNames, medNames, items };
}

function findContributors(items: ItemNutrients[], nutrientId: string): string[] {
  const names: string[] = [];
  for (const item of items) {
    for (const n of item.nutrients) {
      if (n.nutrientId === nutrientId && n.amountToday > 0) names.push(item.name);
    }
  }
  return [...new Set(names)];
}

function nutrientInsight(nc: NutrientComputed, items: ItemNutrients[], medNames: string[]): HomeInsight | null {
  const contributors = findContributors(items, nc.nutrientId);
  if (contributors.length === 0) return null;

  const isHighRisk = HIGH_RISK.has(nc.nutrientId);
  const pct = nc.ulPercentFromSupps ? Math.round(nc.ulPercentFromSupps * 100) : null;
  const hasOverlap = nc.flags.redundantStacking && medNames.length > 0;

  let severity: InsightSeverity = "ok";
  let title = "";

  if (nc.flags.exceedsUl) {
    severity = isHighRisk ? "attention" : "caution";
    title = `${nc.label} exceeds the tolerable upper limit`;
  } else if (nc.flags.approachingUl) {
    severity = "caution";
    title = `${nc.label} is approaching the upper limit`;
  } else if (hasOverlap) {
    severity = "caution";
    title = `${nc.label} overlaps across meds and supplements`;
  } else if (nc.flags.redundantStacking) {
    severity = "info";
    title = `${nc.label} appears in multiple items`;
  } else {
    return null;
  }

  const whatWeSee = contributors.map((c) => `You\u2019re taking ${c}`);

  const whyItMatters: string[] = [];
  if (nc.flags.exceedsUl && pct) {
    whyItMatters.push(`Your supplement intake is at ${pct}% of the upper limit`);
  } else if (nc.flags.approachingUl && pct) {
    whyItMatters.push(`Your supplement intake is at ${pct}% of the upper limit`);
  }
  if (hasOverlap) {
    whyItMatters.push(`${nc.label} appears across both supplements and medications`);
  }
  if (nc.flags.redundantStacking && !hasOverlap) {
    whyItMatters.push(`Multiple products in your stack contain ${nc.label}`);
  }
  if (isHighRisk) {
    whyItMatters.push(`${nc.label} is a nutrient where excess intake carries more risk`);
  }

  const meaning = {
    now: [] as string[],
    overTime: [] as string[],
  };

  if (nc.flags.exceedsUl || nc.flags.approachingUl) {
    meaning.now.push(`High ${nc.label} intake may cause side effects in some people`);
    meaning.now.push(`Watch for symptoms and adjust if needed`);
    meaning.overTime.push(`Chronic excess ${nc.label} may burden the body over time`);
    meaning.overTime.push(`Staying within the upper limit supports long-term safety`);
  } else if (hasOverlap) {
    meaning.now.push(`Combined sources may push your total ${nc.label} intake higher than expected`);
    meaning.overTime.push(`Review with a professional if you plan to continue this combination`);
  } else {
    meaning.now.push(`You\u2019re getting ${nc.label} from more than one source`);
    meaning.overTime.push(`Redundancy is usually fine unless total intake is high`);
  }

  const consider: string[] = [];
  if (nc.flags.exceedsUl) {
    consider.push(`Consider reducing one of the ${nc.label} sources`);
    if (nc.ul) consider.push(`The upper limit is ${nc.ul} ${nc.unit}/day`);
  } else if (nc.flags.approachingUl) {
    consider.push(`Be cautious about adding more ${nc.label} sources`);
  } else if (hasOverlap) {
    consider.push(`Mention this overlap to your healthcare provider`);
  }

  return {
    id: `nutrient-${nc.nutrientId}`,
    title,
    severity,
    step: { whatWeSee, whyItMatters, meaning, consider },
  };
}

function balancedInsight(suppNames: string[], medNames: string[]): HomeInsight {
  const whatWeSee: string[] = [];
  if (suppNames.length > 0) whatWeSee.push(`${suppNames.length} supplement${suppNames.length > 1 ? "s" : ""} active`);
  if (medNames.length > 0) whatWeSee.push(`${medNames.length} medication${medNames.length > 1 ? "s" : ""} logged`);

  return {
    id: "balanced",
    title: "Your stack is within normal range",
    severity: "ok",
    step: {
      whatWeSee: whatWeSee.length > 0 ? whatWeSee : ["No items tracked yet"],
      whyItMatters: ["No overlaps, excesses, or notable interactions detected"],
      meaning: {
        now: ["Everything looks balanced based on what you\u2019ve logged"],
        overTime: ["Consistent, moderate intake supports long-term wellbeing"],
      },
      consider: ["Keep logging new items to maintain visibility"],
    },
  };
}

export function buildCurrentModel(): HomeSituationModel {
  const user = loadUser();
  const sex = bioSexToSex(user?.sex ?? null);
  const ageBucket = ageRangeToAgeBucket(user?.ageRange ?? null);
  const { lines, suppNames, medNames, items } = collectItems();

  if (lines.length === 0 && suppNames.length === 0 && medNames.length === 0) {
    return { mode: "current", insights: [] };
  }

  const nutrients = computeDailyNutrients({ sex, ageBucket }, lines);

  const insights: HomeInsight[] = [];
  for (const nc of nutrients) {
    const insight = nutrientInsight(nc, items, medNames);
    if (insight) insights.push(insight);
  }

  const severityOrder: InsightSeverity[] = ["attention", "caution", "info", "ok"];
  insights.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

  if (insights.length === 0) {
    insights.push(balancedInsight(suppNames, medNames));
  }

  return { mode: "current", insights };
}

export function buildPreviewModel(scanResult: ScanResult): HomeSituationModel {
  const user = loadUser();
  const sex = bioSexToSex(user?.sex ?? null);
  const ageBucket = ageRangeToAgeBucket(user?.ageRange ?? null);
  const { lines: currentLines, suppNames, medNames, items } = collectItems();

  const previewNutrients = Array.isArray(scanResult.nutrients) ? scanResult.nutrients : [];
  const previewLines = nutrientRowsToIntakeLines(previewNutrients, "supplement");
  const allLines = [...currentLines, ...previewLines];
  const previewItems: ItemNutrients[] = [
    ...items,
    { name: scanResult.productName || "Scanned item", source: "supplement", nutrients: previewNutrients },
  ];

  const currentNutrients = computeDailyNutrients({ sex, ageBucket }, currentLines);
  const previewComputed = computeDailyNutrients({ sex, ageBucket }, allLines);

  const currentFlags = new Map<string, NutrientComputed>();
  for (const nc of currentNutrients) currentFlags.set(nc.nutrientId, nc);

  const insights: HomeInsight[] = [];

  for (const nc of previewComputed) {
    const insight = nutrientInsight(nc, previewItems, medNames);
    if (!insight) continue;

    const prev = currentFlags.get(nc.nutrientId);
    const isNew = !prev || (!prev.flags.exceedsUl && nc.flags.exceedsUl) ||
      (!prev.flags.approachingUl && nc.flags.approachingUl) ||
      (!prev.flags.redundantStacking && nc.flags.redundantStacking);

    if (isNew) {
      insight.delta = {
        newSignals: 1,
        summaryLines: [`Adding ${scanResult.productName} introduces additional ${nc.label}`],
      };
    }

    insights.push(insight);
  }

  const severityOrder: InsightSeverity[] = ["attention", "caution", "info", "ok"];
  insights.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

  if (insights.length === 0) {
    const balanced = balancedInsight([...suppNames, scanResult.productName], medNames);
    balanced.delta = { newSignals: 0, summaryLines: ["No new signals detected from adding this item"] };
    insights.push(balanced);
  }

  return {
    mode: "preview",
    previewLabel: `Preview: If you add ${scanResult.productName}`,
    insights,
  };
}

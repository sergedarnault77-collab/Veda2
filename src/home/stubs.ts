/* ── Veda 2.0 — Tiny stub data for home screen ──
   TODO: Replace with real data sources once persistence layer is wired. */

// ── Types ──

/** Multi-step scan flow: idle → front label capture → ingredients capture → result */
export type ScanStage = "idle" | "front" | "ingredients";

export interface NutrientRow {
  nutrientId: string;
  name: string;
  unit: "mg" | "µg" | "IU";
  amountToday: number;
  dailyReference: number;
}

export interface Supplement {
  id: string;
  name: string;
  nutrients: NutrientRow[];
}

export interface ExposureEntry {
  label: string;
  value: number;
  unit: string;
  color: string;
}

export type SignalType =
  | "timing_conflict"
  | "amplification"
  | "duplication"
  | "contraindication_flag"
  | "low_value"
  | "no_notable_interaction";

export interface Signal {
  type: SignalType;
  severity: "info" | "possible" | "likely";
  headline: string;
  explanation: string;
  confidence: "low" | "medium" | "high";
  related?: string[];
}

export interface AnalyzeResponse {
  ok: true;
  signals: Signal[];
  normalized: { detectedEntities: string[] };
  meta: { mode: "stub"; timestampISO: string };
}

export interface SignalExplanation {
  title: string;
  body: string;
}

// ── Stub supplements ──
// TODO: Pull from real user data + reference database.

export const STUB_SUPPLEMENTS: Supplement[] = [
  {
    id: "s1",
    name: "Magnesium Glycinate",
    nutrients: [
      { nutrientId: "mag", name: "Magnesium", unit: "mg", amountToday: 400, dailyReference: 420 },
      { nutrientId: "gly", name: "Glycine", unit: "mg", amountToday: 2000, dailyReference: 3000 },
    ],
  },
  {
    id: "s2",
    name: "Vitamin D3 + K2",
    nutrients: [
      { nutrientId: "vitd", name: "Vitamin D", unit: "IU", amountToday: 5000, dailyReference: 4000 },
      { nutrientId: "vitk2", name: "Vitamin K2", unit: "µg", amountToday: 100, dailyReference: 120 },
    ],
  },
  {
    id: "s3",
    name: "Omega-3 Fish Oil",
    nutrients: [
      { nutrientId: "epa", name: "EPA", unit: "mg", amountToday: 900, dailyReference: 500 },
      { nutrientId: "dha", name: "DHA", unit: "mg", amountToday: 600, dailyReference: 500 },
    ],
  },
];

// ── Stub exposure data (from scanned items today) ──

export const STUB_EXPOSURE: ExposureEntry[] = [
  { label: "Refined sugars", value: 18, unit: "g", color: "var(--bar-sugar)" },
  { label: "Artificial sweeteners", value: 2, unit: "items", color: "var(--bar-sweetener)" },
  { label: "Calories (scanned)", value: 340, unit: "kcal", color: "var(--bar-calorie)" },
  { label: "Caffeine", value: 180, unit: "mg", color: "var(--bar-caffeine)" },
];

// ── Stub analyze response (local fallback when API is unavailable) ──
// TODO: Remove once /api/analyze is live.

export const STUB_ANALYZE_RESPONSE: AnalyzeResponse = {
  ok: true,
  signals: [
    {
      type: "timing_conflict",
      severity: "likely",
      headline: "Timing consideration often flagged",
      explanation:
        "Magnesium taken close in time to certain antibiotics is commonly associated with reduced absorption. Some people separate timing to avoid overlap.",
      confidence: "medium",
      related: ["Magnesium", "Antibiotic (reported)"],
    },
  ],
  normalized: { detectedEntities: ["Magnesium"] },
  meta: { mode: "stub", timestampISO: new Date().toISOString() },
};

// ── Stub explaining signals ──

export const STUB_SIGNALS: SignalExplanation[] = [
  {
    title: "Vitamin D + K2 overlap",
    body: "These two compounds tend to appear together in many stacks. Vitamin K2 is commonly associated with helping direct calcium that Vitamin D tends to mobilise. Individual responses vary.",
  },
  {
    title: "Magnesium & sleep",
    body: "Magnesium glycinate is often flagged in connection with evening routines. Some individuals report it tends to promote relaxation, though responses are highly variable.",
  },
];

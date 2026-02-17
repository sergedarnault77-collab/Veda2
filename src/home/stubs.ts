/* ── Veda 2.0 — Tiny stub data for home screen ──
   TODO: Replace with real data sources once persistence layer is wired. */

// ── Types ──

/** Multi-step scan flow: idle → front label capture → ingredients capture → result */
export type ScanStage = "idle" | "front" | "ingredients";

export interface NutrientRow {
  nutrientId: string;
  name: string;
  unit: "mg" | "µg" | "IU" | "g" | "mL";
  amountToday: number;
  dailyReference: number | null;
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
  { label: "Added sugars (today)", value: 0, unit: "g", color: "var(--bar-sugar)" },
  { label: "Sweetener types detected", value: 0, unit: "items", color: "var(--bar-sweetener)" },
  { label: "Calories from scanned items", value: 0, unit: "kcal", color: "var(--bar-calorie)" },
  { label: "Caffeine exposure", value: 0, unit: "mg", color: "var(--bar-caffeine)" },
];

// ── Stub analyze response (local fallback when API is unavailable) ──
// TODO: Remove once /api/analyze is live.

export const STUB_ANALYZE_RESPONSE: AnalyzeResponse = {
  ok: true,
  signals: [
    {
      type: "no_notable_interaction",
      severity: "info",
      headline: "No notable patterns detected",
      explanation:
        "Based on the scanned text and your saved list, no common overlap or stacking pattern was observed. This is not exhaustive.",
      confidence: "low",
    },
  ],
  normalized: { detectedEntities: ["Caffeine", "Aspartame", "Acesulfame K"] },
  meta: { mode: "stub", timestampISO: new Date().toISOString() },
};

// ── Stub explaining signals ──

export const STUB_SIGNALS: SignalExplanation[] = [
  {
    title: "Vitamin D + K2 overlap",
    body: "These two compounds frequently appear together in supplement stacks. K2 is commonly observed alongside Vitamin D in formulations. Individual responses vary.",
  },
  {
    title: "Magnesium presence noted",
    body: "Magnesium glycinate is often present in evening-focused stacks. This is an observation, not a recommendation. Responses are highly variable.",
  },
];

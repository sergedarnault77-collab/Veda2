/* ── Veda 2.0 — Tiny stub data for home screen ──
   TODO: Replace with real data sources once persistence layer is wired. */

// ── Types ──

export interface Supplement {
  id: string;
  name: string;
  nutrients: Record<string, number>; // nutrient name → mg or IU
}

export interface ExposureEntry {
  label: string;
  value: number;
  unit: string;
  color: string;
}

export interface InteractionResult {
  kind:
    | "interaction_detected"
    | "amplification_likely"
    | "timing_conflict"
    | "no_notable_interaction";
  summary: string;
}

export interface SignalExplanation {
  title: string;
  body: string;
}

// ── Stub supplements ──

export const STUB_SUPPLEMENTS: Supplement[] = [
  {
    id: "s1",
    name: "Magnesium Glycinate",
    nutrients: { Magnesium: 400, Glycine: 2000 },
  },
  {
    id: "s2",
    name: "Vitamin D3 + K2",
    nutrients: { "Vitamin D": 5000, "Vitamin K2": 100 },
  },
  {
    id: "s3",
    name: "Omega-3 Fish Oil",
    nutrients: { EPA: 900, DHA: 600 },
  },
];

// ── Daily reference values (simplified) ──
// TODO: Pull from a real reference database.

export const DAILY_REFERENCE: Record<string, number> = {
  Magnesium: 420,
  Glycine: 3000,
  "Vitamin D": 4000,
  "Vitamin K2": 120,
  EPA: 500,
  DHA: 500,
};

// ── Stub exposure data (from scanned items today) ──

export const STUB_EXPOSURE: ExposureEntry[] = [
  { label: "Refined sugars", value: 18, unit: "g", color: "var(--bar-sugar)" },
  { label: "Artificial sweeteners", value: 2, unit: "items", color: "var(--bar-sweetener)" },
  { label: "Calories (scanned)", value: 340, unit: "kcal", color: "var(--bar-calorie)" },
  { label: "Caffeine", value: 180, unit: "mg", color: "var(--bar-caffeine)" },
];

// ── Stub interaction result ──
// TODO: Wire to AI reasoning engine.

export const STUB_INTERACTION: InteractionResult = {
  kind: "interaction_detected",
  summary:
    "Magnesium is commonly associated with reduced absorption of certain antibiotics when taken at the same time. This combination is often flagged for timing considerations.",
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

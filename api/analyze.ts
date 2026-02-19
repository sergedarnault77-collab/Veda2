import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

type CategoryKey =
  | "Sweeteners"
  | "Stimulants"
  | "Sugars"
  | "Calories"
  | "Vitamins"
  | "Minerals"
  | "Supplements"
  | "Other";

type SignalType =
  | "interaction_detected"
  | "amplification_likely"
  | "timing_conflict"
  | "no_notable_interaction"
  | "no_read";

type Signal = {
  type: SignalType;
  severity: "low" | "medium" | "high";
  confidence: number;
  headline: string;
  explanation: string;
  relatedEntities: string[];
};

type NutrientUnit = "mg" | "µg" | "IU" | "g" | "mL";
type RefSystem = "US_DV" | "EU_RI" | "UNKNOWN";

type NutrientRow = {
  nutrientId: string;
  name: string;
  unit: NutrientUnit;
  amountToday: number;
  dailyReference: number | null;
};

type AnalyzeResponse = {
  ok: true;
  productName: string | null;
  transcription: string | null;
  nutrients: NutrientRow[];
  ingredientsList: string[];
  ingredientsCount: number;
  normalized: {
    categories: Record<CategoryKey, string[]>;
    detectedEntities: string[];
  };
  signals: Signal[];
  meta: {
    mode: "openai" | "stub";
    reason?: string;
    refSystem: RefSystem;
    transcriptionConfidence: number;
    needsRescan: boolean;
    rescanHint: string | null;
    ingredientPhotosUsed: number;
  };
};

const CATEGORY_KEYS: CategoryKey[] = [
  "Sweeteners", "Stimulants", "Sugars", "Calories",
  "Vitamins", "Minerals", "Supplements", "Other",
];

/* ── Env ── */
function envOpenAIKey(): string | null {
  const p = (globalThis as any)?.process;
  return (p?.env?.OPENAI_API_KEY as string | undefined) ?? null;
}

/* ── Product database lookup (fast path) ── */
async function tryProductDbLookup(productName: string): Promise<AnalyzeResponse | null> {
  const p = (globalThis as any)?.process;
  const connStr = (p?.env?.DATABASE_URL || p?.env?.STORAGE_URL || "").trim();
  if (!connStr || !productName || productName.length < 3) return null;

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(connStr);

    const rows = await sql`
      SELECT p.id, p.product_name, p.brand_name, p.form, p.serving_size,
             similarity(
               lower(coalesce(p.product_name,'') || ' ' || coalesce(p.brand_name,'')),
               ${productName.toLowerCase()}
             ) AS sim
      FROM products p
      WHERE
        lower(coalesce(p.product_name,'') || ' ' || coalesce(p.brand_name,''))
        % ${productName.toLowerCase()}
      ORDER BY sim DESC
      LIMIT 1
    `;

    if (rows.length === 0 || Number(rows[0].sim) < 0.35) return null;

    const product = rows[0];
    const nutrients = await sql`
      SELECT ingredient_name, amount, unit, per, pct_dv
      FROM product_nutrients
      WHERE product_id = ${product.id}
      ORDER BY ingredient_name
    `;

    if (nutrients.length < 2) return null;

    const cats = emptyCategories();
    const entities: string[] = [];
    const nutrientRows: NutrientRow[] = [];

    for (const n of nutrients) {
      const name = String(n.ingredient_name || "");
      const id = name.toLowerCase().replace(/\s+/g, "_").slice(0, 40);
      const amount = n.amount != null ? Number(n.amount) : 0;
      if (amount <= 0) continue;

      const unit = (["mg", "µg", "IU", "g", "mL"].includes(n.unit) ? n.unit : "mg") as NutrientUnit;
      nutrientRows.push({ nutrientId: id, name, unit, amountToday: amount, dailyReference: null });
      entities.push(name);

      if (/vitamin/i.test(name)) cats.Vitamins.push(name);
      else if (/iron|zinc|magnesium|calcium|selenium|iodine|chromium|copper|manganese|potassium|phosphorus/i.test(name)) cats.Minerals.push(name);
      else cats.Supplements.push(name);
    }

    return {
      ok: true,
      productName: product.product_name,
      transcription: null,
      nutrients: nutrientRows,
      ingredientsList: entities,
      ingredientsCount: entities.length,
      normalized: { categories: cats, detectedEntities: entities },
      signals: [{
        type: "no_notable_interaction", severity: "low", confidence: 0.6,
        headline: "Matched from product database",
        explanation: `Found "${product.product_name}" in the Veda product database.`,
        relatedEntities: [],
      }],
      meta: {
        mode: "openai",
        refSystem: "UNKNOWN",
        transcriptionConfidence: 0.9,
        needsRescan: false,
        rescanHint: null,
        ingredientPhotosUsed: 0,
      },
    };
  } catch {
    return null;
  }
}

/* ── Image helpers ── */
function isDataImage(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("data:image/");
}

function approxBytesFromDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf("base64,");
  if (i === -1) return dataUrl.length;
  return Math.floor((dataUrl.length - i - 7) * 3 / 4);
}

/* ── Category helpers ── */
function emptyCategories(): Record<CategoryKey, string[]> {
  return {
    Sweeteners: [], Stimulants: [], Sugars: [], Calories: [],
    Vitamins: [], Minerals: [], Supplements: [], Other: [],
  };
}

/* ── Stub response ── */
function stub(reason: string): AnalyzeResponse {
  return {
    ok: true,
    productName: null,
    transcription: null,
    nutrients: [],
    ingredientsList: [],
    ingredientsCount: 0,
    normalized: { categories: emptyCategories(), detectedEntities: [] },
    signals: [{
      type: "no_read", severity: "low", confidence: 0.2,
      headline: "Couldn't read label reliably",
      explanation: "I couldn't read enough label text to classify this item reliably.",
      relatedEntities: [],
    }],
    meta: {
      mode: "stub", reason,
      refSystem: "UNKNOWN",
      transcriptionConfidence: 0,
      needsRescan: true,
      rescanHint: "Couldn't read the label reliably. Take a closer photo of the ingredients/nutrition panel.",
      ingredientPhotosUsed: 0,
    },
  };
}

/* ── Basic helpers ── */
function safeStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 50);
}

function clamp01(n: any): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normalizeCategories(raw: any): Record<CategoryKey, string[]> {
  const out = emptyCategories();
  const obj = raw && typeof raw === "object" ? raw : {};
  for (const k of CATEGORY_KEYS) {
    out[k] = safeStringArray((obj as any)[k]).slice(0, 30);
  }
  return out;
}

function dedupeCaseInsensitive(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════
   UNIT NORMALIZATION
   ══════════════════════════════════════════════════════════ */

function normalizeUnit(u: string): NutrientUnit | null {
  const s = u.trim().toLowerCase();
  if (s === "mg") return "mg";
  if (s === "µg" || s === "ug" || s === "mcg" || s === "μg") return "µg";
  if (s === "g") return "g";
  if (s === "iu") return "IU";
  if (s === "ml") return "mL";
  return null;
}

function convertReference(refAmount: number, refUnit: NutrientUnit, targetUnit: NutrientUnit): number | null {
  if (refUnit === targetUnit) return refAmount;
  // µg <-> mg
  if (refUnit === "µg" && targetUnit === "mg") return refAmount / 1000;
  if (refUnit === "mg" && targetUnit === "µg") return refAmount * 1000;
  // mg <-> g
  if (refUnit === "mg" && targetUnit === "g") return refAmount / 1000;
  if (refUnit === "g" && targetUnit === "mg") return refAmount * 1000;
  // µg <-> g
  if (refUnit === "µg" && targetUnit === "g") return refAmount / 1_000_000;
  if (refUnit === "g" && targetUnit === "µg") return refAmount * 1_000_000;
  return null; // can't convert IU generically
}

/* ══════════════════════════════════════════════════════════
   NUTRIENT SYNONYM MAP (NL/DE/common aliases)
   ══════════════════════════════════════════════════════════ */

const NUTRIENT_SYNONYMS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const add = (id: string, ...names: string[]) => {
    for (const n of names) map[n.toLowerCase()] = id;
  };
  add("vitamin_a", "vitamin a", "vitamine a", "retinol", "bèta-caroteen", "beta-carotene", "beta caroteen", "beta-carotin");
  add("vitamin_b1", "vitamin b1", "vitamine b1", "thiamin", "thiamine", "thiamine hcl", "thiamine hydrochloride");
  add("vitamin_b2", "vitamin b2", "vitamine b2", "riboflavin", "riboflavine", "riboflavin-5-fosfaat");
  add("vitamin_b3", "vitamin b3", "vitamine b3", "niacin", "niacine", "niacinamide", "nicotinamide");
  add("vitamin_b5", "vitamin b5", "vitamine b5", "pantothenic acid", "pantotheenzuur", "pantothenate", "calcium pantothenate", "calcium pantothenaat", "d-calcium pantothenaat");
  add("vitamin_b6", "vitamin b6", "vitamine b6", "pyridoxine", "pyridoxin", "pyridoxine hcl", "pyridoxal-5-fosfaat", "pyridoxal-5-phosphate", "p-5-p");
  add("vitamin_b12", "vitamin b12", "vitamine b12", "b12", "cobalamin", "cobalamine", "methylcobalamin", "methylcobalamine", "cyanocobalamin", "cyanocobalamine", "adenosylcobalamine");
  add("vitamin_c", "vitamin c", "vitamine c", "ascorbic acid", "ascorbinezuur", "ascorbinsäure", "l-ascorbinezuur", "calcium ascorbaat");
  add("vitamin_d", "vitamin d", "vitamine d", "vitamin d3", "vitamine d3", "cholecalciferol", "colecalciferol");
  add("vitamin_e", "vitamin e", "vitamine e", "tocopherol", "d-alpha-tocoferol", "d-alpha-tocopherol", "tocoferolen", "tocopheryl");
  add("vitamin_k", "vitamin k", "vitamine k", "vitamin k1", "vitamin k2", "vitamine k1", "vitamine k2", "phylloquinone", "menaquinone", "menachinon", "fytomenadion", "phytomenadione");
  add("folate", "folate", "folic acid", "foliumzuur", "folsäure", "methylfolaat", "methylfolate", "5-methyltetrahydrofolate", "5-mthf", "quatrefolic");
  add("biotin", "biotin", "biotine", "d-biotine");
  add("iron", "iron", "ijzer", "eisen", "fer", "ferrochloride", "fumaraat", "fumarate", "bisglycinaat", "bisglycinate", "ijzer(ii)fumaraat", "ferro fumaraat");
  add("magnesium", "magnesium", "magnesiumoxide", "magnesiumcitraat", "magnesium citrate", "magnesium oxide", "magnesiumbisglycinaat", "magnesium bisglycinate");
  add("zinc", "zinc", "zink", "zinkcitraat", "zinkbisglycinaat", "zinc citrate", "zinc bisglycinate", "zinc picolinate", "zinkpicolinaat");
  add("calcium", "calcium", "kalzium", "calciumcarbonaat", "calciumcitraat", "calcium carbonate", "calcium citrate");
  add("selenium", "selenium", "selen", "selenomethionine", "selenomethionine", "natriumseleniet", "sodium selenite", "l-selenomethionine");
  add("iodine", "iodine", "jodium", "jod", "kaliumjodide", "potassium iodide");
  add("chromium", "chromium", "chroom", "chroompicolinaat", "chromium picolinate");
  add("potassium", "potassium", "kalium");
  add("phosphorus", "phosphorus", "fosfor", "phosphor");
  add("molybdenum", "molybdenum", "molybdeen", "natriummolybdaat", "sodium molybdate");
  add("caffeine", "caffeine", "caféine", "cafeïne", "koffein", "koffeine");
  add("omega_3_epa", "omega-3 epa", "epa");
  add("omega_3_dha", "omega-3 dha", "dha");
  add("manganese", "manganese", "mangaan", "mangaanbisglycinaat", "manganese bisglycinate");
  add("copper", "copper", "koper", "kupfer", "koperbisglycinaat", "copper bisglycinate");
  add("choline", "choline", "choline", "choline bitartraat", "choline bitartrate");
  add("inositol", "inositol", "inositol", "myo-inositol");
  add("paba", "paba", "paba", "para-aminobenzoëzuur", "para-aminobenzoic acid");
  add("lutein", "lutein", "luteïne");
  add("lycopene", "lycopene", "lycopeen", "lycopin");
  add("coq10", "coenzyme q10", "co-enzym q10", "coq10", "ubiquinol", "ubiquinon");
  return map;
})();

/* ══════════════════════════════════════════════════════════
   DUAL REFERENCE TABLES: US DV + EU NRV/RI
   ══════════════════════════════════════════════════════════ */

type RefEntry = { amount: number; unit: NutrientUnit; iuEquiv?: number };

const US_DV_REF: Record<string, RefEntry> = {
  vitamin_a:    { amount: 900, unit: "µg", iuEquiv: 3000 },
  vitamin_b1:   { amount: 1.2, unit: "mg" },
  vitamin_b2:   { amount: 1.3, unit: "mg" },
  vitamin_b3:   { amount: 16, unit: "mg" },
  vitamin_b5:   { amount: 5, unit: "mg" },
  vitamin_b6:   { amount: 1.7, unit: "mg" },
  vitamin_b12:  { amount: 2.4, unit: "µg" },
  vitamin_c:    { amount: 90, unit: "mg" },
  vitamin_d:    { amount: 20, unit: "µg", iuEquiv: 800 },
  vitamin_e:    { amount: 15, unit: "mg", iuEquiv: 22.4 },
  vitamin_k:    { amount: 120, unit: "µg" },
  folate:       { amount: 400, unit: "µg" },
  biotin:       { amount: 30, unit: "µg" },
  iron:         { amount: 18, unit: "mg" },
  magnesium:    { amount: 420, unit: "mg" },
  zinc:         { amount: 11, unit: "mg" },
  calcium:      { amount: 1300, unit: "mg" },
  selenium:     { amount: 55, unit: "µg" },
  iodine:       { amount: 150, unit: "µg" },
  chromium:     { amount: 35, unit: "µg" },
  potassium:    { amount: 4700, unit: "mg" },
  phosphorus:   { amount: 1250, unit: "mg" },
  caffeine:     { amount: 400, unit: "mg" },
  omega_3_epa:  { amount: 500, unit: "mg" },
  omega_3_dha:  { amount: 500, unit: "mg" },
  manganese:    { amount: 2.3, unit: "mg" },
  copper:       { amount: 0.9, unit: "mg" },
};

const EU_RI_REF: Record<string, RefEntry> = {
  vitamin_a:    { amount: 800, unit: "µg", iuEquiv: 2664 },
  vitamin_b1:   { amount: 1.1, unit: "mg" },
  vitamin_b2:   { amount: 1.4, unit: "mg" },
  vitamin_b3:   { amount: 16, unit: "mg" },
  vitamin_b5:   { amount: 6, unit: "mg" },
  vitamin_b6:   { amount: 1.4, unit: "mg" },
  vitamin_b12:  { amount: 2.5, unit: "µg" },
  vitamin_c:    { amount: 80, unit: "mg" },
  vitamin_d:    { amount: 5, unit: "µg", iuEquiv: 200 },
  vitamin_e:    { amount: 12, unit: "mg", iuEquiv: 17.9 },
  vitamin_k:    { amount: 75, unit: "µg" },
  folate:       { amount: 200, unit: "µg" },
  biotin:       { amount: 50, unit: "µg" },
  iron:         { amount: 14, unit: "mg" },
  magnesium:    { amount: 375, unit: "mg" },
  zinc:         { amount: 10, unit: "mg" },
  calcium:      { amount: 800, unit: "mg" },
  selenium:     { amount: 55, unit: "µg" },
  iodine:       { amount: 150, unit: "µg" },
  chromium:     { amount: 40, unit: "µg" },
  potassium:    { amount: 2000, unit: "mg" },
  phosphorus:   { amount: 700, unit: "mg" },
  caffeine:     { amount: 400, unit: "mg" },
  omega_3_epa:  { amount: 500, unit: "mg" },
  omega_3_dha:  { amount: 500, unit: "mg" },
  manganese:    { amount: 2, unit: "mg" },
  copper:       { amount: 1, unit: "mg" },
};

function resolveNutrientId(name: string, rawId: string): string {
  const lId = rawId.toLowerCase().trim();
  if (US_DV_REF[lId]) return lId;
  const lName = name.toLowerCase().trim();
  if (NUTRIENT_SYNONYMS[lName]) return NUTRIENT_SYNONYMS[lName];
  if (NUTRIENT_SYNONYMS[lId]) return NUTRIENT_SYNONYMS[lId];
  const stripped = lName.replace(/^vitamin[e]?\s*/i, "").trim();
  if (stripped && NUTRIENT_SYNONYMS["vitamin " + stripped]) return NUTRIENT_SYNONYMS["vitamin " + stripped];
  return lId;
}

/* ══════════════════════════════════════════════════════════
   DETECT REFERENCE SYSTEM FROM TRANSCRIPTION
   ══════════════════════════════════════════════════════════ */

function detectRefSystem(transcription: string | null): RefSystem {
  if (!transcription) return "UNKNOWN";
  const t = transcription.toLowerCase();
  // EU markers
  if (/%\s*ri\b/i.test(t) || /\bri\s*\*/i.test(t) || /\*\s*ri\b/i.test(t) ||
      /referentie-inname/i.test(t) || /nutrient reference value/i.test(t) ||
      /\bnrv\b/i.test(t) || /referenzwert/i.test(t)) {
    return "EU_RI";
  }
  // US markers
  if (/%\s*dv\b/i.test(t) || /%\s*daily\s+value/i.test(t) || /daily\s+value/i.test(t)) {
    return "US_DV";
  }
  return "UNKNOWN";
}

/* ══════════════════════════════════════════════════════════
   coerceNutrients (with percentLabel, EU/US, unit normalization)
   ══════════════════════════════════════════════════════════ */

function coerceNutrients(v: any, transcriptionConfidence: number, refSystem: RefSystem): NutrientRow[] {
  if (!Array.isArray(v)) return [];
  const out: NutrientRow[] = [];
  const seen = new Set<string>();
  const refTable = refSystem === "EU_RI" ? EU_RI_REF : US_DV_REF;

  for (const n of v.slice(0, 40)) {
    if (!n || typeof n !== "object") continue;
    if (typeof n.name !== "string" || !n.name.trim()) continue;
    if (typeof n.amountToday !== "number" || n.amountToday <= 0) continue;

    const unit = normalizeUnit(typeof n.unit === "string" ? n.unit : "");
    if (!unit) continue;

    const nutrientId = resolveNutrientId(
      n.name,
      typeof n.nutrientId === "string" ? n.nutrientId : n.name,
    );

    if (seen.has(nutrientId)) continue;
    seen.add(nutrientId);

    // (3) Prefer label-provided percent as ground truth
    const percentLabel = typeof n.percentLabel === "number" && n.percentLabel >= 0.1 && n.percentLabel <= 50000
      ? n.percentLabel : null;

    let dailyReference: number | null = null;

    if (percentLabel !== null) {
      // Derive dailyReference from label's own percent: amount / (pct/100)
      dailyReference = n.amountToday / (percentLabel / 100);
    } else if (refSystem !== "UNKNOWN") {
      // Use our known reference table
      const knownRef = refTable[nutrientId];
      if (knownRef) {
        if (unit === "IU" && knownRef.iuEquiv) {
          dailyReference = knownRef.iuEquiv;
        } else {
          const converted = convertReference(knownRef.amount, knownRef.unit, unit);
          if (converted !== null && converted > 0) {
            dailyReference = converted;
          }
        }
      }
      // If not in our table, try model value as fallback
      if (dailyReference === null && typeof n.dailyReference === "number" && n.dailyReference > 0) {
        dailyReference = n.dailyReference;
      }
    }
    // If refSystem is UNKNOWN and no percentLabel: dailyReference stays null

    // Clamp absurd: if %DV > 20000 and low confidence, drop the nutrient
    if (dailyReference !== null && dailyReference > 0) {
      const impliedPct = (n.amountToday / dailyReference) * 100;
      if (impliedPct > 20000 && transcriptionConfidence < 0.8) continue;
    }

    out.push({
      nutrientId: nutrientId.slice(0, 40),
      name: n.name.trim().slice(0, 60),
      unit,
      amountToday: n.amountToday,
      dailyReference,
    });
  }
  return out;
}

/* ── Ingredient entity synonyms ── */
const INGREDIENT_SYNONYMS: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (canonical: string, ...aliases: string[]) => {
    for (const a of aliases) m[a.toLowerCase()] = canonical;
  };
  add("caffeine", "koffein", "koffeine", "cafeïne", "caféine", "coffein");
  add("cyclamate", "cyclamaat");
  add("acesulfame K", "acesulfaam k", "acesulfaam-k", "acesulfam k");
  add("aspartame", "aspartaam");
  add("saccharin", "saccharine");
  add("sucralose", "sucralose");
  add("stevia", "steviol", "steviolglycosiden");
  return m;
})();

function canonicalizeEntity(name: string): string {
  return INGREDIENT_SYNONYMS[name.toLowerCase().trim()] ?? name;
}

/* ── Ingredients list processing ── */
function coerceIngredientsList(v: any): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    let s = raw.trim();
    s = s.replace(/^(other\s+)?ingredients\s*[:;]\s*/i, "").trim();
    if (s.length < 2) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 80) break;
  }
  return out;
}

/* ── Signals ── */
function coerceSignals(v: any): Signal[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 6).map((s) => {
    const o = s && typeof s === "object" ? s : {};
    const type = (o as any).type as SignalType;
    const severity = (o as any).severity as "low" | "medium" | "high";
    return {
      type:
        type === "interaction_detected" || type === "amplification_likely" ||
        type === "timing_conflict" || type === "no_notable_interaction" || type === "no_read"
          ? type : "no_notable_interaction",
      severity: severity === "high" || severity === "medium" || severity === "low" ? severity : "low",
      confidence: clamp01((o as any).confidence),
      headline: typeof (o as any).headline === "string" ? (o as any).headline.slice(0, 90) : "Note",
      explanation: typeof (o as any).explanation === "string" ? (o as any).explanation.slice(0, 520)
        : "Interpretive pattern match based on the label text.",
      relatedEntities: safeStringArray((o as any).relatedEntities).slice(0, 12),
    };
  });
}

/* ── Transcription confidence ── */
function computeTranscriptionConfidence(
  openaiConfidence: number | undefined,
  transcription: string | null,
  entityCount: number,
  nutrientCount: number,
  ingredientPhotosUsed: number,
): { confidence: number; needsRescan: boolean; rescanHint: string | null } {
  const t = (transcription ?? "").trim();
  const len = t.length;
  const badMarks = (t.match(/[�?]{2,}/g) || []).length;
  const lineCount = t.split("\n").filter((l) => /[a-zA-Z0-9]/.test(l)).length;
  const tokenCount = t.split(/\s+/).filter(Boolean).length;

  let base = clamp01(typeof openaiConfidence === "number" ? openaiConfidence : 0.7);

  if (len < 60) base -= 0.25;
  else if (len < 120) base -= 0.1;
  if (lineCount < 3 && tokenCount < 15) base -= 0.1;
  if (badMarks >= 3) base -= 0.2;
  if (entityCount <= 1 && nutrientCount <= 1) base -= 0.1;

  // Positive signals — dense labels that successfully extracted data
  if (len >= 350 && lineCount >= 8) base += 0.1;
  if (nutrientCount >= 3) base += 0.15;
  if (nutrientCount >= 8) base += 0.15;  // multivitamin bonus
  if (nutrientCount >= 15) base += 0.1;  // dense multivitamin bonus
  if (entityCount >= 10) base += 0.1;
  if (ingredientPhotosUsed >= 2 && nutrientCount >= 5) base += 0.1;

  const confidence = clamp01(base);

  // If we successfully extracted 5+ nutrients, never flag as needing rescan
  const needsRescan = nutrientCount >= 5 ? false : confidence < 0.4;

  let rescanHint: string | null = null;
  if (needsRescan) {
    if (entityCount < 15 && nutrientCount < 8) {
      rescanHint = "This label looks split across columns. Take 2–3 close-up photos: left column, right column, and the minerals/vitamins panel. Avoid glare.";
    } else if (ingredientPhotosUsed > 1 && confidence < 0.4) {
      rescanHint = "Try closer + steadier shots; fill the frame with the text; reduce glare.";
    } else {
      rescanHint = "Label photo is hard to read. Take a closer photo of the ingredients/nutrition panel (fill the frame, avoid glare, steady your hand).";
    }
  }

  return { confidence, needsRescan, rescanHint };
}

/* ── Extract output text from OpenAI response ── */
function extractOutputText(resp: any): string | null {
  if (resp && typeof resp.output_text === "string" && resp.output_text.trim())
    return resp.output_text;
  const out = resp?.output;
  if (!Array.isArray(out)) return null;
  const chunks: string[] = [];
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string")
        chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim() || null;
}

/* ── JSON schema for structured output ── */
function buildJsonSchema() {
  return {
    name: "veda_analyze",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["productName", "transcription", "transcriptionConfidence", "nutrients", "ingredientsList", "categories", "detectedEntities", "signals"],
      properties: {
        productName: { type: ["string", "null"] },
        transcription: { type: ["string", "null"] },
        transcriptionConfidence: { type: "number" },
        nutrients: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["nutrientId", "name", "unit", "amountToday", "dailyReference", "percentLabel"],
            properties: {
              nutrientId: { type: "string" },
              name: { type: "string" },
              unit: { type: "string", enum: ["mg", "µg", "IU", "g", "mL", "kcal", "mcg"] },
              amountToday: { type: "number" },
              dailyReference: { type: ["number", "null"] },
              percentLabel: { type: ["number", "null"] },
            },
          },
        },
        ingredientsList: { type: "array", items: { type: "string" } },
        categories: {
          type: "object",
          additionalProperties: false,
          required: CATEGORY_KEYS as unknown as string[],
          properties: {
            Sweeteners: { type: "array", items: { type: "string" } },
            Stimulants: { type: "array", items: { type: "string" } },
            Sugars: { type: "array", items: { type: "string" } },
            Calories: { type: "array", items: { type: "string" } },
            Vitamins: { type: "array", items: { type: "string" } },
            Minerals: { type: "array", items: { type: "string" } },
            Supplements: { type: "array", items: { type: "string" } },
            Other: { type: "array", items: { type: "string" } },
          },
        },
        detectedEntities: { type: "array", items: { type: "string" } },
        signals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "severity", "confidence", "headline", "explanation", "relatedEntities"],
            properties: {
              type: { type: "string", enum: ["interaction_detected", "amplification_likely", "timing_conflict", "no_notable_interaction", "no_read"] },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              confidence: { type: "number" },
              headline: { type: "string" },
              explanation: { type: "string" },
              relatedEntities: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  };
}

/* ══════════════════════════════════════════════════════════
   HANDLER
   ══════════════════════════════════════════════════════════ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const result = await innerHandler(req.method ?? "GET", req.body);
    const json = await result.json();
    res.status(result.status).json(json);
  } catch (e: any) {
    console.error("[analyze] handler crash:", e);
    res.status(200).json(stub(`handler error: ${String(e?.message || e).slice(0, 120)}`));
  }
}

async function innerHandler(method: string, body: any): Promise<Response> {
  try {
    if (method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
        status: 405, headers: { "content-type": "application/json" },
      });
    }

    const apiKey = envOpenAIKey();
    if (!apiKey) {
      return new Response(JSON.stringify(stub("OPENAI_API_KEY missing")), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    const frontImageDataUrl = body?.frontImageDataUrl;

    let ingredientImages: string[] = [];
    if (Array.isArray(body?.ingredientsImageDataUrls)) {
      ingredientImages = body.ingredientsImageDataUrls.filter(isDataImage).slice(0, 4);
    }
    if (ingredientImages.length === 0 && isDataImage(body?.ingredientsImageDataUrl)) {
      ingredientImages = [body.ingredientsImageDataUrl];
    }

    if (!isDataImage(frontImageDataUrl)) {
      return new Response(JSON.stringify(stub("missing or invalid front image")), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    const frontOnly = ingredientImages.length === 0;

    const maxBytesPerImage = 1_400_000;
    if (approxBytesFromDataUrl(frontImageDataUrl) > maxBytesPerImage) {
      return new Response(JSON.stringify(stub("front image too large")), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    for (const img of ingredientImages) {
      if (approxBytesFromDataUrl(img) > maxBytesPerImage) {
        return new Response(JSON.stringify(stub("ingredient image too large")), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
    }

    const ingredientPhotosUsed = ingredientImages.length;

    /* ── FRONT-ONLY MODE ──
       No ingredients label available. Identify the product from the front photo
       and look up known details (active ingredients, nutrients, common uses)
       from general knowledge. */
    if (frontOnly) {
      const frontOnlySystem = [
        "You are Veda's product identifier. The user scanned ONLY the front of a product — no ingredients label is available.",
        "",
        "Your task:",
        "1. Identify the product from the front image (name, brand, form, strength/dosage if visible).",
        "2. Using your GENERAL KNOWLEDGE of this product, provide:",
        "   - Known active ingredients / composition",
        "   - Known nutrients with typical amounts per dose (if applicable)",
        "   - Category classification (medication, supplement, food/drink)",
        "",
        "MEDICATION-SPECIFIC RULES:",
        "- Medications often show: drug name, strength (e.g. '5 mg', '500 mg'), brand, manufacturer.",
        "- Read ALL visible text: drug name, dosage, 'mg', 'mcg', tablet count, brand name.",
        "- For a known medication (e.g. Tadalafil 5mg, Ibuprofen 400mg, Omeprazol 20mg):",
        "  * Set productName to the full name with strength (e.g. 'Tadalafil Sandoz 5 mg').",
        "  * In ingredientsList: list the active ingredient(s) and well-known excipients.",
        "  * In nutrients: include the active ingredient with its dose as amountToday.",
        "    Example: {nutrientId:'tadalafil', name:'Tadalafil', unit:'mg', amountToday:5, dailyReference:null}",
        "  * Classify under 'Other' category with the active ingredient name.",
        "- Do NOT provide dosing advice or medical recommendations.",
        "",
        "General rules:",
        "- Set transcription to null (no label was provided).",
        "- Set transcriptionConfidence to 0.3 (knowledge-based, not label-read).",
        "- For nutrients: only include well-known, widely-documented amounts. Use conservative estimates.",
        "- For percentLabel: always set to null (no label to read).",
        "- If you cannot identify the product, return minimal data with productName = null.",
        "- Descriptive language only. No medical advice.",
        "- Return JSON matching the schema.",
      ].join("\n");

      /* Use Chat Completions with low-detail image (faster for product identification) */
      const frontAC = new AbortController();
      const frontTimer = setTimeout(() => frontAC.abort(), 30_000);
      let frontR: Response;
      try {
        frontR = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: frontOnlySystem },
              { role: "user", content: [
                { type: "text", text: "Identify this product from the front photo. Return JSON with: productName, transcription (null), transcriptionConfidence (0.3), nutrients [{nutrientId, name, unit, amountToday, dailyReference}], ingredientsList [strings], categories {Sweeteners,Stimulants,Sugars,Calories,Vitamins,Minerals,Supplements,Other}, detectedEntities [strings], signals [{type,severity,confidence,headline,explanation,relatedEntities}]." },
                { type: "image_url", image_url: { url: frontImageDataUrl, detail: "low" } },
              ]},
            ],
            response_format: { type: "json_object" },
            temperature: 0.15,
            max_tokens: 1200,
          }),
          signal: frontAC.signal,
        });
      } catch (abortErr: any) {
        clearTimeout(frontTimer);
        return new Response(
          JSON.stringify(stub("OpenAI request timed out (front-only). Try a clearer photo.")),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      clearTimeout(frontTimer);

      if (!frontR.ok) {
        const errText = await frontR.text().catch(() => "");
        return new Response(
          JSON.stringify(stub(`OpenAI error ${frontR.status}: ${errText.slice(0, 140)}`)),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      const frontResp = await frontR.json().catch(() => null);
      const frontOutText = frontResp?.choices?.[0]?.message?.content;
      if (!frontOutText) {
        return new Response(JSON.stringify(stub("OpenAI: no output (front-only)")), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }

      let frontParsed: any = null;
      try { frontParsed = JSON.parse(frontOutText); } catch {
        return new Response(JSON.stringify(stub("OpenAI: invalid JSON (front-only)")), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }

      const fpName = typeof frontParsed?.productName === "string" && frontParsed.productName.trim()
        ? frontParsed.productName.trim().slice(0, 70) : null;

      /* Try DB lookup before returning LLM-only result */
      if (fpName) {
        const dbResult = await tryProductDbLookup(fpName);
        if (dbResult && dbResult.nutrients.length > 0) {
          return new Response(JSON.stringify(dbResult), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }
      }

      const fpCategories = normalizeCategories(frontParsed?.categories);
      const fpEntities = dedupeCaseInsensitive(
        CATEGORY_KEYS.flatMap((k) => fpCategories[k]),
      ).slice(0, 50).map(canonicalizeEntity);

      const fpNutrients = coerceNutrients(frontParsed?.nutrients, 0.3, "UNKNOWN");
      const fpIngredients = coerceIngredientsList(frontParsed?.ingredientsList);
      const fpSignals = coerceSignals(frontParsed?.signals);

      const frontOnlyResp: AnalyzeResponse = {
        ok: true,
        productName: fpName,
        transcription: null,
        nutrients: fpNutrients,
        ingredientsList: fpIngredients,
        ingredientsCount: fpIngredients.length,
        normalized: { categories: fpCategories, detectedEntities: dedupeCaseInsensitive(fpEntities) },
        signals: fpSignals.length > 0 ? fpSignals : [{
          type: "no_notable_interaction", severity: "low", confidence: 0.3,
          headline: "Identified from front photo",
          explanation: "Details are based on general product knowledge — no ingredients label was scanned. Scan the ingredients label for more accurate results.",
          relatedEntities: fpEntities.slice(0, 6),
        }],
        meta: {
          mode: "openai",
          reason: "front-only identification",
          refSystem: "UNKNOWN",
          transcriptionConfidence: 0.3,
          needsRescan: false,
          rescanHint: null,
          ingredientPhotosUsed: 0,
        },
      };

      return new Response(JSON.stringify(frontOnlyResp), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    /* ── FULL MODE (front + ingredients) — two-step pipeline ──
       Step 1: Transcribe each ingredient image in PARALLEL (fast, no schema)
       Step 2: Extract structured data from combined text + front image (no heavy images) */

    const schema = buildJsonSchema();

    /* ── Step 1: parallel transcription ── */

    const transcribeSystem = [
      "Transcribe ALL text visible in this label/nutrition panel image.",
      "Include every word, number, unit, symbol, and percentage you can read.",
      "",
      "CRITICAL for vitamin/mineral/supplement tables:",
      "- Read EVERY ROW of the nutrition table — vitamins, minerals, and other ingredients.",
      "- For each row transcribe: ingredient name, amount, unit (mg, µg, mcg, IU), and % value (RI, DV, NRV) if shown.",
      "- Multivitamins may have 20-30+ rows — transcribe ALL of them, do not skip any.",
      "- If the table spans multiple columns, read left column top-to-bottom, then right column top-to-bottom.",
      "- Watch for small print rows at the bottom (e.g. chromium, molybdenum, selenium).",
      "",
      "Read ALL columns: left, center, right — top to bottom.",
      "Preserve casing, punctuation, symbols (µg, mcg, mg, %, RI, DV, kcal).",
      "Preserve non-English text exactly as written (Dutch, German, French, etc.).",
      "Output ONLY the transcribed text. No commentary, no JSON.",
    ].join("\n");

    const transcriptionResults = await Promise.all(
      ingredientImages.map(async (img, i) => {
        const tAC = new AbortController();
        const tTimer = setTimeout(() => tAC.abort(), 30_000);
        try {
          const tR = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: transcribeSystem },
                { role: "user", content: [
                  { type: "text", text: `Label photo ${i + 1} of ${ingredientImages.length}. Transcribe EVERY row of any nutrition/vitamin/mineral table — do not skip any.` },
                  { type: "image_url", image_url: { url: img, detail: "high" } },
                ]},
              ],
              max_tokens: 4000,
            }),
            signal: tAC.signal,
          });
          clearTimeout(tTimer);
          if (!tR.ok) return `[Photo ${i + 1}: server error ${tR.status}]`;
          const tResp = await tR.json().catch(() => null);
          return tResp?.choices?.[0]?.message?.content || `[Photo ${i + 1}: no text extracted]`;
        } catch {
          clearTimeout(tTimer);
          return `[Photo ${i + 1}: timed out]`;
        }
      }),
    );

    const combinedTranscription = transcriptionResults.join("\n\n--- next photo ---\n\n");
    const anyTranscribed = transcriptionResults.some((t) => !t.startsWith("[Photo"));

    if (!anyTranscribed) {
      return new Response(
        JSON.stringify(stub("Could not read any of the label photos. Try closer, steadier shots with good lighting.")),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    /* ── Step 2: extract structured data from transcription text + front image ── */

    const extractSystem = [
      "You are Veda's label extractor. You are given:",
      "1. A front-of-product image (for product name / brand only).",
      "2. A COMPLETE TEXT TRANSCRIPTION of the ingredients/nutrition label (already transcribed from photos).",
      "",
      "Your job: extract structured data from the transcription text. Do NOT re-read images for ingredients.",
      "",
      "Set the 'transcription' field to the transcription text provided.",
      "Set 'transcriptionConfidence' based on how complete/coherent the transcription looks (0..1).",
      "",
      "Nutrients guidance (populate 'nutrients' array):",
      "• CRITICAL: Extract EVERY nutrient row from the transcription. Multivitamins may have 20-30+ nutrients — include ALL of them.",
      "• Only include a nutrient if the transcription explicitly states BOTH the nutrient name AND a numeric amount.",
      "• nutrientId: snake_case canonical English id (vitamin_d, iron, magnesium, caffeine, omega_3_epa)",
      "• Map non-English names: IJzer→iron, Zink→zinc, Foliumzuur→folate, Vitamine B12→vitamin_b12, Jodium→iodine, Koper→copper, Chroom→chromium, Kalium→potassium, Mangaan→manganese, Selenium→selenium, Fosfor→phosphorus, Molybdeen→molybdenum, Biotine→biotin, Pantotheenzuur→vitamin_b5, Niacine→vitamin_b3, Riboflavine→vitamin_b2, Thiamine→vitamin_b1, Eisen→iron, Folsäure→folate, Jod→iodine",
      "• unit: use EXACTLY what the label says. µg/mcg→µg, mg→mg, g→g, IU→IU.",
      "• dailyReference: standard adult daily reference IN THE SAME UNIT as amountToday.",
      "• percentLabel: if the transcription shows an explicit % (e.g. '1250%' or '14% RI'), extract that number. Null if none.",
      "• CRITICAL: if label amount is in µg, dailyReference MUST also be in µg.",
      "• If you don't know the reference, set dailyReference to 0.",
      "• Do NOT hallucinate amounts not in the transcription.",
      "",
      "Categories: Sweeteners, Stimulants, Sugars, Calories, Vitamins, Minerals, Supplements, Other.",
      "Only include entities explicitly mentioned in the transcription.",
      "",
      "Ingredients list: split 'Ingredients:' or 'Other ingredients:' section by commas/semicolons. Up to 80 items. Preserve original casing.",
      "",
      "Signals: 1–2 short signals. no_notable_interaction if nothing stands out.",
      "  signal types: interaction_detected, amplification_likely, timing_conflict, no_notable_interaction, no_read",
      "  severity: low, medium, high",
      "",
      "Return JSON with these exact fields: productName (string|null), transcription (string|null), transcriptionConfidence (number 0-1),",
      "nutrients (array of {nutrientId, name, unit, amountToday, dailyReference, percentLabel}),",
      "ingredientsList (string array), categories ({Sweeteners,Stimulants,Sugars,Calories,Vitamins,Minerals,Supplements,Other} each string array),",
      "detectedEntities (string array), signals (array of {type,severity,confidence,headline,explanation,relatedEntities}).",
      "",
      "Rules: No medical advice. Descriptive language only.",
    ].join("\n");

    const extractPayload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: extractSystem },
        { role: "user", content: [
          { type: "text", text: "Front of product (read product name / brand):" },
          { type: "image_url", image_url: { url: frontImageDataUrl, detail: "low" as const } },
          { type: "text", text: `Complete label transcription from ${ingredientImages.length} photo(s):\n\n${combinedTranscription}` },
        ]},
      ],
      response_format: { type: "json_object" as const },
      temperature: 0.15,
      max_tokens: 5000,
    };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 50_000);
    let r: Response;
    try {
      r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(extractPayload),
        signal: ac.signal,
      });
    } catch (abortErr: any) {
      clearTimeout(timer);
      return new Response(
        JSON.stringify(stub("Extraction timed out. The label was transcribed but processing took too long.")),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    clearTimeout(timer);

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return new Response(
        JSON.stringify(stub(`OpenAI error ${r.status}: ${errText.slice(0, 140)}`)),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const resp = await r.json().catch(() => null);
    const outText = resp?.choices?.[0]?.message?.content || extractOutputText(resp);
    if (!outText) {
      return new Response(JSON.stringify(stub("OpenAI: no output")), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    let parsed: any = null;
    try { parsed = JSON.parse(outText); } catch {
      return new Response(JSON.stringify(stub("OpenAI: invalid JSON output")), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    const productName = typeof parsed?.productName === "string" && parsed.productName.trim()
      ? parsed.productName.trim().slice(0, 70) : null;

    const transcription = typeof parsed?.transcription === "string" && parsed.transcription.trim()
      ? parsed.transcription.trim().slice(0, 4000) : null;

    const openaiConf = typeof parsed?.transcriptionConfidence === "number" ? parsed.transcriptionConfidence : undefined;

    const categories = normalizeCategories(parsed?.categories);
    const detectedEntitiesFromCategories = dedupeCaseInsensitive(
      CATEGORY_KEYS.flatMap((k) => categories[k]),
    );
    const rawEntities = dedupeCaseInsensitive([
      ...safeStringArray(parsed?.detectedEntities),
      ...detectedEntitiesFromCategories,
    ]).slice(0, 80);
    const detectedEntities = dedupeCaseInsensitive(rawEntities.map(canonicalizeEntity));

    const confResult = computeTranscriptionConfidence(
      openaiConf, transcription,
      detectedEntities.length, 0,
      ingredientPhotosUsed,
    );

    // Detect EU vs US reference system from transcription
    const refSystem = detectRefSystem(transcription);

    const nutrients = coerceNutrients(parsed?.nutrients, confResult.confidence, refSystem);
    const ingredientsList = coerceIngredientsList(parsed?.ingredientsList);

    const confFinal = computeTranscriptionConfidence(
      openaiConf, transcription,
      detectedEntities.length, nutrients.length,
      ingredientPhotosUsed,
    );

    const signals = coerceSignals(parsed?.signals);

    const okResp: AnalyzeResponse = {
      ok: true,
      productName,
      transcription,
      nutrients,
      ingredientsList,
      ingredientsCount: ingredientsList.length,
      normalized: { categories, detectedEntities },
      signals: signals.length > 0 ? signals : [{
        type: "no_notable_interaction", severity: "low", confidence: 0.5,
        headline: "No notable interaction pattern found",
        explanation: "Based on the label text provided, no common interaction pattern was flagged. This is not exhaustive and depends on dose and timing.",
        relatedEntities: detectedEntities.slice(0, 6),
      }],
      meta: {
        mode: "openai",
        refSystem,
        transcriptionConfidence: confFinal.confidence,
        needsRescan: confFinal.needsRescan,
        rescanHint: confFinal.rescanHint,
        ingredientPhotosUsed,
      },
    };

    return new Response(JSON.stringify(okResp), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify(stub(`exception: ${String(e?.message || e).slice(0, 140)}`)),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
}

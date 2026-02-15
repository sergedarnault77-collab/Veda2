export const config = { runtime: "edge" };

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
  confidence: number; // 0..1
  headline: string;
  explanation: string;
  relatedEntities: string[];
};

type NutrientUnit = "mg" | "µg" | "IU" | "g" | "mL";

type NutrientRow = {
  nutrientId: string;
  name: string;
  unit: NutrientUnit;
  amountToday: number;
  dailyReference: number;
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
    transcriptionConfidence: number;
    needsRescan: boolean;
    rescanHint: string | null;
  };
};

const CATEGORY_KEYS: CategoryKey[] = [
  "Sweeteners",
  "Stimulants",
  "Sugars",
  "Calories",
  "Vitamins",
  "Minerals",
  "Supplements",
  "Other",
];

function envOpenAIKey(): string | null {
  // Edge-safe env access
  const p = (globalThis as any)?.process;
  return (p?.env?.OPENAI_API_KEY as string | undefined) ?? null;
}

function isDataImage(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("data:image/");
}

function approxBytesFromDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf("base64,");
  if (i === -1) return dataUrl.length;
  const b64 = dataUrl.slice(i + "base64,".length);
  return Math.floor((b64.length * 3) / 4);
}

function emptyCategories(): Record<CategoryKey, string[]> {
  return {
    Sweeteners: [],
    Stimulants: [],
    Sugars: [],
    Calories: [],
    Vitamins: [],
    Minerals: [],
    Supplements: [],
    Other: [],
  };
}

function stub(reason: string): AnalyzeResponse {
  return {
    ok: true,
    productName: null,
    transcription: null,
    nutrients: [],
    ingredientsList: [],
    ingredientsCount: 0,
    normalized: { categories: emptyCategories(), detectedEntities: [] },
    signals: [
      {
        type: "no_read",
        severity: "low",
        confidence: 0.2,
        headline: "Couldn't read label reliably",
        explanation:
          "I couldn't read enough label text to classify this item reliably. This is interpretive and depends on dose, timing, and individual variability.",
        relatedEntities: [],
      },
    ],
    meta: {
      mode: "stub",
      reason,
      transcriptionConfidence: 0,
      needsRescan: true,
      rescanHint: "Couldn't read the label reliably. Take a closer photo of the ingredients/nutrition panel.",
    },
  };
}

function safeStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
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

const VALID_NUTRIENT_UNITS: NutrientUnit[] = ["mg", "µg", "IU", "g", "mL"];

function coerceNutrients(v: any): NutrientRow[] {
  if (!Array.isArray(v)) return [];
  const out: NutrientRow[] = [];
  for (const n of v.slice(0, 30)) {
    if (!n || typeof n !== "object") continue;
    if (typeof n.nutrientId !== "string" || !n.nutrientId) continue;
    if (typeof n.amountToday !== "number" || n.amountToday <= 0) continue;
    if (typeof n.dailyReference !== "number" || n.dailyReference <= 0) continue;
    if (!VALID_NUTRIENT_UNITS.includes(n.unit)) continue;
    out.push({
      nutrientId: n.nutrientId.slice(0, 40),
      name: typeof n.name === "string" ? n.name.slice(0, 60) : n.nutrientId,
      unit: n.unit,
      amountToday: n.amountToday,
      dailyReference: n.dailyReference,
    });
  }
  return out;
}

function coerceIngredientsList(v: any): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    let s = raw.trim();
    // Strip leading "Ingredients:" style prefixes
    s = s.replace(/^(other\s+)?ingredients\s*[:;]\s*/i, "").trim();
    if (s.length < 2) continue; // filter junk
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 80) break;
  }
  return out;
}

function coerceSignals(v: any): Signal[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 6).map((s) => {
    const o = s && typeof s === "object" ? s : {};
    const type = (o as any).type as SignalType;
    const severity = (o as any).severity as "low" | "medium" | "high";
    return {
      type:
        type === "interaction_detected" ||
        type === "amplification_likely" ||
        type === "timing_conflict" ||
        type === "no_notable_interaction" ||
        type === "no_read"
          ? type
          : "no_notable_interaction",
      severity:
        severity === "high" || severity === "medium" || severity === "low"
          ? severity
          : "low",
      confidence: clamp01((o as any).confidence),
      headline:
        typeof (o as any).headline === "string"
          ? (o as any).headline.slice(0, 90)
          : "Note",
      explanation:
        typeof (o as any).explanation === "string"
          ? (o as any).explanation.slice(0, 520)
          : "Interpretive pattern match based on the label text.",
      relatedEntities: safeStringArray((o as any).relatedEntities).slice(0, 12),
    };
  });
}

function computeTranscriptionConfidence(
  openaiConfidence: number | undefined,
  transcription: string | null,
  entityCount: number,
  nutrientCount: number,
): { confidence: number; needsRescan: boolean; rescanHint: string | null } {
  const t = (transcription ?? "").trim();
  const len = t.length;
  // Count garbled characters
  const badMarks = (t.match(/[�?]{2,}/g) || []).length;
  // Lines with at least one alphanumeric character
  const lineCount = t.split("\n").filter((l) => /[a-zA-Z0-9]/.test(l)).length;
  const tokenCount = t.split(/\s+/).filter(Boolean).length;

  let base = clamp01(typeof openaiConfidence === "number" ? openaiConfidence : 0.7);

  if (len < 120) base -= 0.35;
  if (lineCount < 4) base -= 0.2;
  if (tokenCount < 25) base -= 0.2;
  if (badMarks >= 3) base -= 0.25;
  if (entityCount <= 1 && nutrientCount <= 1) base -= 0.15;
  if (len >= 350 && lineCount >= 8) base += 0.1;

  const confidence = clamp01(base);
  const needsRescan = confidence < 0.55;
  const rescanHint = needsRescan
    ? "Label photo is hard to read. Take a closer photo of the ingredients/nutrition panel (fill the frame, avoid glare, steady your hand)."
    : null;

  return { confidence, needsRescan, rescanHint };
}

function extractOutputText(resp: any): string | null {
  // Prefer convenience field if present
  if (resp && typeof resp.output_text === "string" && resp.output_text.trim())
    return resp.output_text;

  // Otherwise traverse output items
  const out = resp?.output;
  if (!Array.isArray(out)) return null;

  const chunks: string[] = [];
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
      if (c?.type === "text" && typeof c?.text === "string") chunks.push(c.text);
    }
  }
  const joined = chunks.join("\n").trim();
  return joined || null;
}

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
            required: ["nutrientId", "name", "unit", "amountToday", "dailyReference"],
            properties: {
              nutrientId: { type: "string" },
              name: { type: "string" },
              unit: { type: "string", enum: ["mg", "µg", "IU", "g", "mL"] },
              amountToday: { type: "number" },
              dailyReference: { type: "number" },
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
            required: [
              "type",
              "severity",
              "confidence",
              "headline",
              "explanation",
              "relatedEntities",
            ],
            properties: {
              type: {
                type: "string",
                enum: [
                  "interaction_detected",
                  "amplification_likely",
                  "timing_conflict",
                  "no_notable_interaction",
                  "no_read",
                ],
              },
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

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }

    const apiKey = envOpenAIKey();
    if (!apiKey) {
      return new Response(JSON.stringify(stub("OPENAI_API_KEY missing")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const frontImageDataUrl = body?.frontImageDataUrl;
    const ingredientsImageDataUrl = body?.ingredientsImageDataUrl;

    if (!isDataImage(frontImageDataUrl) || !isDataImage(ingredientsImageDataUrl)) {
      return new Response(JSON.stringify(stub("missing or invalid images")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Guard payload size (Edge / browser / Vercel limits)
    const maxBytesPerImage = 1_400_000;
    const frontBytes = approxBytesFromDataUrl(frontImageDataUrl);
    const ingBytes = approxBytesFromDataUrl(ingredientsImageDataUrl);
    if (frontBytes > maxBytesPerImage || ingBytes > maxBytesPerImage) {
      return new Response(JSON.stringify(stub("images too large (compress more)")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const system = [
      "You are Veda's label reader. You follow a strict two-step process.",
      "",
      "Step 1 — TRANSCRIPTION (strict):",
      "Read the ingredients label image and transcribe the text exactly as written.",
      "• Preserve casing and punctuation",
      "• Do NOT interpret or infer",
      "• Put the full transcription in the 'transcription' field",
      "• If text is unreadable, set transcription to null",
      "",
      "Also set 'transcriptionConfidence' (0..1):",
      "• 0.9–1.0 if the label text is clear, complete, and you transcribed most/all of it.",
      "• 0.6–0.8 if the text is partially readable but some parts are blurry or cut off.",
      "• 0.2–0.5 if most text is illegible, very short, or heavily obscured.",
      "• 0.0–0.1 if you cannot read the label at all.",
      "",
      "Step 2 — EXTRACTION:",
      "Using ONLY the transcribed text from Step 1:",
      "• Detect sweeteners, caffeine, sugars, calories, vitamins, minerals",
      "• Do NOT add anything not explicitly present in the transcription",
      "• Use the front image only for productName / brand",
      "",
      "Categories guidance (use these keys):",
      "- Sweeteners: aspartame, sucralose, acesulfame K, stevia, cyclamate, saccharin, etc.",
      "- Stimulants: caffeine, taurine, guarana — only if the word appears in transcription.",
      "- Sugars: sugar, glucose, fructose, syrup; include grams if stated.",
      "- Calories: include kcal string if stated.",
      "- Vitamins/Minerals: ONLY if the nutrient name appears in the transcribed text.",
      "- Supplements: amino acids / herb extracts / etc — only if present.",
      "- Other: anything notable not covered above.",
      "",
      "Nutrients guidance (populate 'nutrients' array):",
      "• Only include a nutrient if the transcription explicitly states BOTH the nutrient name AND a numeric amount.",
      "• nutrientId: use snake_case canonical id (e.g. vitamin_d, magnesium, caffeine, omega_3_epa)",
      "• dailyReference: use standard adult daily reference (US DV or EU NRV). Common values:",
      "  Vitamin A=900µg, Vitamin C=90mg, Vitamin D=20µg(=800IU), Vitamin E=15mg,",
      "  Vitamin K=120µg, Thiamin(B1)=1.2mg, Riboflavin(B2)=1.3mg, Niacin(B3)=16mg,",
      "  Vitamin B6=1.7mg, Folate=400µg, Vitamin B12=2.4µg, Biotin=30µg,",
      "  Calcium=1300mg, Iron=18mg, Magnesium=420mg, Zinc=11mg, Selenium=55µg,",
      "  Iodine=150µg, Chromium=35µg, Potassium=4700mg, Phosphorus=1250mg,",
      "  Omega-3 EPA=500mg, Omega-3 DHA=500mg, Caffeine=400mg",
      "• If you don't know the standard reference for a nutrient, OMIT that row entirely.",
      "• Do NOT hallucinate amounts. If the label doesn't state a number, omit the nutrient.",
      "",
      "Ingredients list guidance (populate 'ingredientsList' array):",
      "• Read the 'Ingredients:' or 'Other ingredients:' section from the transcription.",
      "• Split by commas, semicolons, or periods into individual ingredient names.",
      "• Strip leading labels like 'Ingredients:', 'Other ingredients:', etc.",
      "• Include ALL ingredients found — up to 80 items.",
      "• Only include an ingredient if its name appears in the transcription. Do NOT invent.",
      "• Preserve original casing. Trim whitespace.",
      "",
      "Signals guidance (1–2 short signals):",
      "- no_notable_interaction: if nothing stands out.",
      "- timing_conflict / interaction_detected / amplification_likely: only if label text suggests something obvious.",
      "- no_read: if you cannot read the label at all.",
      "",
      "Rules:",
      "- No medical advice. Avoid: should, stop, causes, treats.",
      "- Use interpretive language: tends to, commonly associated with, often flagged.",
      "- If you cannot read the label, set productName=null, transcription=null, leave categories/nutrients empty, use signal type 'no_read'.",
      "- Return JSON only matching the schema.",
    ].join("\n");

    const schema = buildJsonSchema();

    const payload = {
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: system }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Front of product (read product name / brand):" },
            { type: "input_image", image_url: frontImageDataUrl, detail: "low" as const },
            {
              type: "input_text",
              text: "Ingredients / nutrition label (transcribe text exactly, then extract entities from transcription only):",
            },
            { type: "input_image", image_url: ingredientsImageDataUrl, detail: "high" as const },
          ],
        },
      ],
      // Responses API structured output: name/strict/schema are flat inside format
      // (NOT nested under a json_schema key — that's the Chat Completions format)
      text: {
        format: {
          type: "json_schema" as const,
          ...schema,
        },
      },
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return new Response(
        JSON.stringify(stub(`OpenAI error ${r.status}: ${errText.slice(0, 140)}`)),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const resp = await r.json().catch(() => null);
    const outText = extractOutputText(resp);
    if (!outText) {
      return new Response(JSON.stringify(stub("OpenAI: no output_text")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(outText);
    } catch {
      return new Response(JSON.stringify(stub("OpenAI: invalid JSON output")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const productNameRaw = parsed?.productName;
    const productName =
      typeof productNameRaw === "string" && productNameRaw.trim()
        ? productNameRaw.trim().slice(0, 70)
        : null;

    const transcriptionRaw = parsed?.transcription;
    const transcription =
      typeof transcriptionRaw === "string" && transcriptionRaw.trim()
        ? transcriptionRaw.trim().slice(0, 3000)
        : null;

    const nutrients = coerceNutrients(parsed?.nutrients);
    const ingredientsList = coerceIngredientsList(parsed?.ingredientsList);

    const categories = normalizeCategories(parsed?.categories);
    const detectedEntitiesFromCategories = dedupeCaseInsensitive(
      CATEGORY_KEYS.flatMap((k) => categories[k]),
    );

    const detectedEntities = dedupeCaseInsensitive([
      ...safeStringArray(parsed?.detectedEntities),
      ...detectedEntitiesFromCategories,
    ]).slice(0, 80);

    const signals = coerceSignals(parsed?.signals);

    // Compute transcription confidence heuristic
    const openaiConf =
      typeof parsed?.transcriptionConfidence === "number"
        ? parsed.transcriptionConfidence
        : undefined;
    const confResult = computeTranscriptionConfidence(
      openaiConf,
      transcription,
      detectedEntities.length,
      nutrients.length,
    );

    const okResp: AnalyzeResponse = {
      ok: true,
      productName,
      transcription,
      nutrients,
      ingredientsList,
      ingredientsCount: ingredientsList.length,
      normalized: { categories, detectedEntities },
      signals:
        signals.length > 0
          ? signals
          : [
              {
                type: "no_notable_interaction",
                severity: "low",
                confidence: 0.5,
                headline: "No notable interaction pattern found",
                explanation:
                  "Based on the label text provided and your saved list, no common interaction pattern was flagged. This is not exhaustive and depends on dose and timing.",
                relatedEntities: detectedEntities.slice(0, 6),
              },
            ],
      meta: {
        mode: "openai",
        transcriptionConfidence: confResult.confidence,
        needsRescan: confResult.needsRescan,
        rescanHint: confResult.rescanHint,
      },
    };

    return new Response(JSON.stringify(okResp), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify(stub(`exception: ${String(e?.message || e).slice(0, 140)}`)),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
}

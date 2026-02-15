export const config = { runtime: "edge" };

/* ── Types ── */

type NutrientUnit = "mg" | "µg" | "IU" | "g" | "mL";

type NutrientRow = {
  nutrientId: string;
  name: string;
  unit: NutrientUnit;
  amountToday: number;
  dailyReference: number;
};

type ParsedItem = {
  displayName: string;
  brand: string | null;
  form: "tablet" | "capsule" | "powder" | "liquid" | "other" | null;
  strengthPerUnit: number | null;
  strengthUnit: NutrientUnit | null;
  servingSizeText: string | null;
  labelTranscription: string | null;
  ingredientsDetected: string[];
  nutrients: NutrientRow[];
  rawTextHints: string[];
  confidence: number;
  mode: "openai" | "stub";
};

/* ── Helpers ── */

function envOpenAIKey(): string | null {
  const p = (globalThis as any)?.process;
  return (p?.env?.OPENAI_API_KEY as string | undefined) ?? null;
}

function isDataImage(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("data:image/");
}

function approxBytes(dataUrl: string): number {
  const i = dataUrl.indexOf("base64,");
  if (i === -1) return dataUrl.length;
  return Math.floor((dataUrl.length - i - 7) * 3 / 4);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clamp01(n: any): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

function safeStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 50);
}

function stubItem(kind: string, hints?: string[]): ParsedItem {
  return {
    displayName: kind === "med" ? "New medication" : "New supplement",
    brand: null,
    form: null,
    strengthPerUnit: null,
    strengthUnit: null,
    servingSizeText: null,
    labelTranscription: null,
    ingredientsDetected: [],
    nutrients: [],
    rawTextHints: hints ?? [],
    confidence: 0,
    mode: "stub",
  };
}

/* ── Output text extraction (same as analyze.ts) ── */

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
      if (typeof c?.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim() || null;
}

/* ── JSON Schema for structured output ── */

function buildSchema() {
  return {
    name: "veda_parse_item",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "displayName", "brand", "form", "strengthPerUnit", "strengthUnit",
        "servingSizeText", "labelTranscription", "ingredientsDetected", "nutrients",
        "rawTextHints", "confidence",
      ],
      properties: {
        displayName: { type: "string" },
        brand: { type: ["string", "null"] },
        form: {
          type: ["string", "null"],
          enum: ["tablet", "capsule", "powder", "liquid", "other", null],
        },
        strengthPerUnit: { type: ["number", "null"] },
        strengthUnit: {
          type: ["string", "null"],
          enum: ["mg", "µg", "g", "IU", "mL", null],
        },
        servingSizeText: { type: ["string", "null"] },
        labelTranscription: { type: ["string", "null"] },
        ingredientsDetected: { type: "array", items: { type: "string" } },
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
        rawTextHints: { type: "array", items: { type: "string" } },
        confidence: { type: "number" },
      },
    },
  };
}

/* ── Coerce parsed output into safe ParsedItem ── */

function coerceItem(raw: any): ParsedItem {
  const VALID_FORMS = ["tablet", "capsule", "powder", "liquid", "other"];
  const VALID_UNITS = ["mg", "µg", "g", "IU", "mL"];

  const form = VALID_FORMS.includes(raw?.form) ? raw.form : null;
  const strengthUnit = VALID_UNITS.includes(raw?.strengthUnit) ? raw.strengthUnit : null;

  const nutrients: NutrientRow[] = [];
  if (Array.isArray(raw?.nutrients)) {
    for (const n of raw.nutrients.slice(0, 30)) {
      if (!n || typeof n !== "object") continue;
      if (typeof n.nutrientId !== "string" || !n.nutrientId) continue;
      if (typeof n.amountToday !== "number" || n.amountToday <= 0) continue;
      if (typeof n.dailyReference !== "number" || n.dailyReference <= 0) continue;
      if (!VALID_UNITS.includes(n.unit)) continue;
      nutrients.push({
        nutrientId: n.nutrientId.slice(0, 40),
        name: typeof n.name === "string" ? n.name.slice(0, 60) : n.nutrientId,
        unit: n.unit,
        amountToday: n.amountToday,
        dailyReference: n.dailyReference,
      });
    }
  }

  return {
    displayName: typeof raw?.displayName === "string" && raw.displayName.trim()
      ? raw.displayName.trim().slice(0, 80)
      : "Unknown product",
    brand: typeof raw?.brand === "string" && raw.brand.trim() ? raw.brand.trim().slice(0, 60) : null,
    form,
    strengthPerUnit: typeof raw?.strengthPerUnit === "number" ? raw.strengthPerUnit : null,
    strengthUnit,
    servingSizeText: typeof raw?.servingSizeText === "string" && raw.servingSizeText.trim()
      ? raw.servingSizeText.trim().slice(0, 60)
      : null,
    labelTranscription: typeof raw?.labelTranscription === "string" && raw.labelTranscription.trim()
      ? raw.labelTranscription.trim().slice(0, 2000)
      : null,
    ingredientsDetected: safeStringArray(raw?.ingredientsDetected).slice(0, 40),
    nutrients,
    rawTextHints: safeStringArray(raw?.rawTextHints).slice(0, 8),
    confidence: clamp01(raw?.confidence),
    mode: "openai",
  };
}

/* ── Handler ── */

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    const apiKey = envOpenAIKey();
    if (!apiKey) return json({ ok: true, item: stubItem("supp", ["OPENAI_API_KEY missing"]) });

    const body = await req.json().catch(() => null);
    const kind = body?.kind;
    const front = body?.frontImageDataUrl;
    const ingr = body?.ingredientsImageDataUrl;

    if (!isDataImage(front) || !isDataImage(ingr)) {
      return json({ ok: true, item: stubItem(kind || "supp", ["missing or invalid images"]) });
    }

    const maxBytes = 1_800_000;
    if (approxBytes(front) > maxBytes || approxBytes(ingr) > maxBytes) {
      return json({ ok: true, item: stubItem(kind || "supp", ["images too large"]) });
    }

    const system = [
      "You are Veda's label reader for medications and supplements.",
      "You follow a strict two-step process.",
      "",
      "Step 1 — TRANSCRIPTION (strict):",
      "Read the ingredients/supplement-facts label image and transcribe the text exactly as written.",
      "• Preserve casing and punctuation",
      "• Do NOT interpret or infer",
      "• Put the full transcription in the labelTranscription field",
      "",
      "Step 2 — EXTRACTION:",
      "Using ONLY the transcribed text from Step 1 and the front image:",
      "• displayName: product name from front image",
      "• brand: brand name if visible on front",
      "• form: tablet/capsule/powder/liquid/other or null",
      "• strengthPerUnit + strengthUnit: primary active per serving if stated",
      "• servingSizeText: e.g. '1 capsule', '2 tablets'",
      "• ingredientsDetected: list of ingredient names found in transcription",
      "• nutrients: array of nutrient rows with amounts AND standard daily reference values",
      "",
      "Nutrients rules:",
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
      "General rules:",
      "• No medical advice. Avoid: should, stop, causes, treats.",
      "• confidence: 0–1 reflecting how readable the label was.",
      "• rawTextHints: up to 8 short text snippets from the label for debugging.",
      "• Return JSON only matching the schema.",
    ].join("\n");

    const schema = buildSchema();

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          {
            role: "user",
            content: [
              { type: "input_text", text: "Front of product (read product name / brand):" },
              { type: "input_image", image_url: front, detail: "low" as const },
              {
                type: "input_text",
                text: "Ingredients / supplement facts label (transcribe text exactly, then extract nutrients from transcription only):",
              },
              { type: "input_image", image_url: ingr, detail: "high" as const },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema" as const,
            ...schema,
          },
        },
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.log("[parse-item] OpenAI HTTP", r.status, errText.slice(0, 300));
      return json({ ok: true, item: stubItem(kind || "supp", [`OpenAI error ${r.status}: ${errText.slice(0, 100)}`]) });
    }

    const resp = await r.json().catch(() => null);
    const outText = extractOutputText(resp);
    if (!outText) {
      return json({ ok: true, item: stubItem(kind || "supp", ["OpenAI: no output_text"]) });
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(outText);
    } catch {
      return json({ ok: true, item: stubItem(kind || "supp", ["OpenAI: invalid JSON"]) });
    }

    const item = coerceItem(parsed);
    console.log(
      "[parse-item] mode=openai name=%s nutrients=%d ingredients=%d confidence=%s",
      item.displayName, item.nutrients.length, item.ingredientsDetected.length, item.confidence,
    );
    return json({ ok: true, item });
  } catch (e: any) {
    console.error("[parse-item] exception:", e?.message || e);
    return json({ ok: true, item: stubItem("supp", [`exception: ${String(e?.message || e).slice(0, 100)}`]) });
  }
}

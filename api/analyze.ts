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

type AnalyzeResponse = {
  ok: true;
  productName: string | null;
  normalized: {
    categories: Record<CategoryKey, string[]>;
    detectedEntities: string[];
  };
  signals: Signal[];
  meta: { mode: "openai" | "stub"; reason?: string };
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
    meta: { mode: "stub", reason },
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
      required: ["productName", "categories", "detectedEntities", "signals"],
      properties: {
        productName: { type: ["string", "null"] },
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
      "You are Veda. You read a product front photo and an ingredients/nutrition label photo.",
      "Return JSON only matching the schema exactly.",
      "Do NOT invent nutrients or ingredients. Only include entities you can read or strongly infer from label text (e.g., 'caffeine' on ingredients; 'aspartame' on ingredients).",
      "If you cannot read reliably, set productName=null, leave categories empty, and include one signal of type 'no_read'.",
      "No medical advice. Avoid words: should, stop, causes, treats. Use interpretive language: tends to, commonly associated with, often flagged.",
      "Categories guidance:",
      "- Sweeteners: aspartame, sucralose, acesulfame K, stevia, cyclamate, saccharin, etc.",
      "- Stimulants: caffeine, taurine (if present), guarana (if present).",
      "- Sugars: sugar, glucose, fructose, syrup; also include grams if explicitly stated.",
      "- Calories: include kcal if explicitly stated.",
      "- Vitamins/Minerals: include only if explicitly present.",
      "- Supplements: amino acids/herb extracts/etc (only if present).",
      "Signals guidance (keep it short):",
      "- no_notable_interaction: if nothing stands out.",
      "- timing_conflict / interaction_detected / amplification_likely: only if label suggests something obvious (e.g., caffeine + stimulant stack).",
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
            {
              type: "input_text",
              text: "Extract productName, categorized detected entities (Sweeteners/Stimulants/Sugars/Calories/Vitamins/Minerals/Supplements/Other), and 1–2 short interpretive signals. Use the ingredients label as primary truth.",
            },
            { type: "input_image", image_url: frontImageDataUrl, detail: "low" as const },
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

    const categories = normalizeCategories(parsed?.categories);
    const detectedEntitiesFromCategories = dedupeCaseInsensitive(
      CATEGORY_KEYS.flatMap((k) => categories[k]),
    );

    const detectedEntities = dedupeCaseInsensitive([
      ...safeStringArray(parsed?.detectedEntities),
      ...detectedEntitiesFromCategories,
    ]).slice(0, 80);

    const signals = coerceSignals(parsed?.signals);
    const okResp: AnalyzeResponse = {
      ok: true,
      productName,
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
      meta: { mode: "openai" },
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

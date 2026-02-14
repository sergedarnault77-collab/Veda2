export const config = { runtime: "edge" };

type AnalyzeRequest = {
  frontImageDataUrl: string;
  ingredientsImageDataUrl: string;
};

type AnalyzeResponse = {
  ok: true;
  productName: string | null;
  normalized: {
    detectedEntities: string[];
    categories: Record<string, string[]>;
  };
  signals: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    headline: string;
    explanation: string;
    confidence: number; // 0..1
    relatedEntities: string[];
  }>;
  meta: { mode: "openai" | "stub"; reason?: string };
};

const MAX_IMAGE_BYTES = 1_450_000; // ~1.4MB
const OPENAI_URL = "https://api.openai.com/v1/responses";

function json(content: unknown, status = 200) {
  return new Response(JSON.stringify(content), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function approxBytesFromDataUrl(dataUrl: string) {
  const idx = dataUrl.indexOf(",");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

function isDataImage(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:image/");
}

/**
 * Responses API can return output_text at the top level (convenience helper)
 * or nested inside output[].content[].text. Handle both.
 */
function extractOutputText(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }
  const out = resp?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text;
          if (typeof t === "string" && t.trim()) return t.trim();
        }
      }
    }
  }
  throw new Error("No output_text found in Responses API response");
}

/* ── JSON Schema (strict-mode compatible: all objects have additionalProperties:false) ── */

const SCHEMA = {
  name: "veda_scan_analyze",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      productName: { type: ["string", "null"] },
      categories: {
        type: "object",
        additionalProperties: false,
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
        required: [
          "Sweeteners", "Stimulants", "Sugars", "Calories",
          "Vitamins", "Minerals", "Supplements", "Other",
        ],
      },
      detectedEntities: { type: "array", items: { type: "string" } },
      signals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            headline: { type: "string" },
            explanation: { type: "string" },
            confidence: { type: "number" },
            relatedEntities: { type: "array", items: { type: "string" } },
          },
          required: ["type", "severity", "headline", "explanation", "confidence", "relatedEntities"],
        },
      },
    },
    required: ["productName", "categories", "detectedEntities", "signals"],
  },
};

/* ── Stub response ── */

function stub(reason: string): AnalyzeResponse {
  console.log("[analyze] stub:", reason);
  return {
    ok: true,
    productName: null,
    normalized: { detectedEntities: [], categories: {} },
    signals: [
      {
        type: "no_read",
        severity: "low",
        headline: "Couldn't read label reliably",
        explanation:
          "I couldn't read enough label text to classify this item reliably. " +
          "This is interpretive and depends on dose, timing, and individual variability.",
        confidence: 0.1,
        relatedEntities: [],
      },
    ],
    meta: { mode: "stub", reason },
  };
}

/* ── Handler ── */

export default async function handler(req: Request) {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

  let body: AnalyzeRequest | null = null;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const front = body?.frontImageDataUrl;
  const ingr = body?.ingredientsImageDataUrl;

  if (!isDataImage(front) || !isDataImage(ingr)) {
    return json({ ok: false, error: "Both images must be data:image/* URLs" }, 400);
  }

  if (approxBytesFromDataUrl(front) > MAX_IMAGE_BYTES || approxBytesFromDataUrl(ingr) > MAX_IMAGE_BYTES) {
    return json({ ok: false, error: "Images too large (client should compress)" }, 413);
  }

  const apiKey = ((globalThis as any)?.process?.env?.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return json(stub("OPENAI_API_KEY missing"), 200);

  /* ── Prompts ── */

  const system = [
    "You are Veda's label reader.",
    "",
    "Goal:",
    "- Identify the PRODUCT NAME from the front image.",
    "- Read INGREDIENTS/NUTRITION info from the ingredients label image.",
    "- Return evidence-based entities grouped into categories.",
    "- Do NOT hallucinate vitamins/minerals. Only include if explicitly present on the label text.",
    "",
    "Categories to use (keys):",
    "Sweeteners, Stimulants, Sugars, Calories, Vitamins, Minerals, Supplements, Other",
    "",
    "Rules:",
    "- Interpretive language only. No medical advice.",
    "- Avoid: 'stop', 'should', 'causes', 'treats'.",
    "- If uncertain, omit the entity rather than guessing.",
    "- Sweeteners: list every artificial/non-caloric sweetener found (e.g. Aspartame, Acesulfame K, Sucralose, Stevia).",
    "- Stimulants: include caffeine if present on the label.",
    "- Vitamins/Minerals: ONLY include if explicitly printed on the ingredients or nutrition panel. Do NOT infer from product type.",
    "- Calories: include calorie amount string if visible (e.g. '0 kcal', '140 kcal').",
    "- Sugars: include sugar amount string if visible (e.g. '0g sugar', '39g sugar').",
    "- If the item is a beverage like Coke Zero, it should typically surface sweeteners and caffeine, NOT magnesium/vitamin D unless explicitly on label.",
  ].join("\n");

  const userText = [
    "Return JSON matching the schema exactly.",
    "",
    "Return:",
    "- productName: as printed on the front, or null if unreadable",
    "- categories: group entities into the 8 category keys (empty array if none)",
    "- detectedEntities: flat list of all entity names found",
    "- signals: 1–3 interpretive signals. For a plain beverage use severity 'low'. Include confidence 0–1.",
    "",
    "CRITICAL: Do NOT include Vitamins or Minerals unless the label explicitly names them.",
  ].join("\n");

  /* ── Call OpenAI Responses API ── */

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: system }],
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: "Front image:" },
              { type: "input_image", image_url: front, detail: "low" },
              { type: "input_text", text: "Ingredients/Nutrition label image:" },
              { type: "input_image", image_url: ingr, detail: "high" },
              { type: "input_text", text: userText },
            ],
          },
        ],
        // Responses API: structured output goes in text.format, NOT response_format
        text: {
          format: {
            type: "json_schema",
            json_schema: SCHEMA,
          },
        },
      }),
    });

    const raw = await res.text();

    if (!res.ok) {
      console.log("[analyze] OpenAI HTTP", res.status, raw.slice(0, 500));
      return json(stub(`OpenAI HTTP ${res.status}`), 200);
    }

    const parsedResp = JSON.parse(raw);
    const outText = extractOutputText(parsedResp);
    const obj = JSON.parse(outText);

    /* ── Normalize ── */

    // Build categories: only keep non-empty arrays
    const categories: Record<string, string[]> = {};
    if (obj.categories && typeof obj.categories === "object") {
      for (const [k, v] of Object.entries(obj.categories)) {
        if (Array.isArray(v) && v.length > 0) categories[k] = v.map(String);
      }
    }

    // Build detectedEntities; ensure every category item is represented
    const detectedEntities: string[] = Array.isArray(obj.detectedEntities)
      ? obj.detectedEntities.map(String)
      : [];
    const entitySet = new Set(detectedEntities.map((s) => s.toLowerCase()));
    for (const arr of Object.values(categories)) {
      for (const name of arr) {
        if (!entitySet.has(name.toLowerCase())) {
          detectedEntities.push(name);
          entitySet.add(name.toLowerCase());
        }
      }
    }

    // Clean productName
    const productName =
      typeof obj.productName === "string" && obj.productName.trim()
        ? obj.productName.trim()
        : null;

    const result: AnalyzeResponse = {
      ok: true,
      productName,
      normalized: { detectedEntities, categories },
      signals: Array.isArray(obj.signals) ? obj.signals : [],
      meta: { mode: "openai" },
    };

    console.log(
      "[analyze] mode=openai product=%s cats=%s entities=%d signals=%d",
      result.productName,
      Object.keys(categories).join(","),
      detectedEntities.length,
      result.signals.length,
    );

    return json(result);
  } catch (err: any) {
    console.error("[analyze] error:", err?.message || err);
    return json(stub(`Error: ${String(err?.message || err).slice(0, 120)}`));
  }
}

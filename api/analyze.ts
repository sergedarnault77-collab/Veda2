export const config = {
  runtime: "edge",
};

/* ── Types ── */

type Severity = "low" | "medium" | "high";
type ProductKind = "supplement" | "medication" | "food_drink" | "unknown";
type EntityCategory = "Sweeteners" | "Stimulants" | "Sugars" | "Vitamins" | "Minerals" | "Other";

export interface EntityItem {
  name: string;
  category: EntityCategory;
  confidence: number;
  evidence: string[];
}

export interface NutritionFacts {
  calories: number | null;
  sugar_g: number | null;
  caffeine_mg: number | null;
}

export interface Additives {
  sweeteners: string[];
  preservatives: string[];
  acids: string[];
}

export interface AnalyzeSignal {
  severity: Severity;
  headline: string;
  explanation: string;
  related: string[];
}

export interface AnalyzeResponse {
  ok: true;
  productName: string | null;
  kind: ProductKind;
  detectedEntities: EntityItem[];
  nutritionFacts: NutritionFacts;
  additives: Additives;
  signals: AnalyzeSignal[];
  meta: { mode: "openai" | "stub"; notes: string[] };
}

/* ── Helpers ── */

function isDataImage(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("data:image/");
}

function b64SizeBytes(dataUrl: string): number {
  const i = dataUrl.indexOf("base64,");
  if (i === -1) return dataUrl.length;
  const b64 = dataUrl.slice(i + 7);
  return Math.floor((b64.length * 3) / 4);
}

function stub(msg: string): AnalyzeResponse {
  console.log("[analyze] stub:", msg);
  return {
    ok: true,
    productName: null,
    kind: "unknown",
    detectedEntities: [],
    nutritionFacts: { calories: null, sugar_g: null, caffeine_mg: null },
    additives: { sweeteners: [], preservatives: [], acids: [] },
    signals: [
      {
        severity: "low",
        headline: "NO NOTABLE INTERACTION PATTERN FOUND",
        explanation:
          "I couldn't read enough label text to classify this item reliably. " +
          "This is interpretive and depends on dose, timing, and individual variability.",
        related: [],
      },
    ],
    meta: { mode: "stub", notes: [msg] },
  };
}

/* ── Post-processor: strip hallucinated vitamins/minerals, sync sweeteners ── */

function postProcess(raw: any): void {
  // 1. Strip vitamins/minerals whose evidence[] is empty or doesn't mention the nutrient
  if (Array.isArray(raw.detectedEntities)) {
    raw.detectedEntities = raw.detectedEntities.filter((e: any) => {
      if (e.category !== "Vitamins" && e.category !== "Minerals") return true;
      const ev = Array.isArray(e.evidence) ? e.evidence : [];
      if (ev.length === 0) return false;
      const name = String(e.name || "").toLowerCase();
      if (!name) return false;
      return ev.some((s: string) => String(s).toLowerCase().includes(name));
    });
  }

  // 2. If additives.sweeteners has entries that aren't in detectedEntities, inject them
  const sweeteners: string[] = Array.isArray(raw.additives?.sweeteners) ? raw.additives.sweeteners : [];
  const entityNames = new Set(
    (raw.detectedEntities || []).map((e: any) => String(e.name).toLowerCase()),
  );
  for (const sw of sweeteners) {
    if (!entityNames.has(String(sw).toLowerCase())) {
      raw.detectedEntities = raw.detectedEntities || [];
      raw.detectedEntities.push({
        name: sw,
        category: "Sweeteners",
        confidence: 0.85,
        evidence: ["ingredients label indicates sweetener"],
      });
    }
  }

  // 3. Null out empty / whitespace-only productName
  if (typeof raw.productName === "string" && !raw.productName.trim()) {
    raw.productName = null;
  }
}

/* ── Handler ── */

export default async function handler(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body: any = null;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const frontImageDataUrl = body?.frontImageDataUrl;
  const ingredientsImageDataUrl = body?.ingredientsImageDataUrl;

  if (!isDataImage(frontImageDataUrl) || !isDataImage(ingredientsImageDataUrl)) {
    return json({ ok: false, error: "Both images required (data:image/...)" }, 400);
  }

  const maxBytes = 1_400_000;
  if (b64SizeBytes(frontImageDataUrl) > maxBytes || b64SizeBytes(ingredientsImageDataUrl) > maxBytes) {
    return json({ ok: false, error: "Images too large (compress more)" }, 413);
  }

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return json(stub("OPENAI_API_KEY missing"));

  /* ── JSON schema for structured output ── */

  const schema = {
    name: "VedaAnalyzeResponse",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        productName: { type: ["string", "null"] },
        kind: { type: "string", enum: ["supplement", "medication", "food_drink", "unknown"] },
        detectedEntities: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              category: { type: "string", enum: ["Sweeteners", "Stimulants", "Sugars", "Vitamins", "Minerals", "Other"] },
              confidence: { type: "number" },
              evidence: { type: "array", items: { type: "string" } },
            },
            required: ["name", "category", "confidence", "evidence"],
          },
        },
        nutritionFacts: {
          type: "object",
          additionalProperties: false,
          properties: {
            calories: { type: ["number", "null"] },
            sugar_g: { type: ["number", "null"] },
            caffeine_mg: { type: ["number", "null"] },
          },
          required: ["calories", "sugar_g", "caffeine_mg"],
        },
        additives: {
          type: "object",
          additionalProperties: false,
          properties: {
            sweeteners: { type: "array", items: { type: "string" } },
            preservatives: { type: "array", items: { type: "string" } },
            acids: { type: "array", items: { type: "string" } },
          },
          required: ["sweeteners", "preservatives", "acids"],
        },
        signals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              severity: { type: "string", enum: ["low", "medium", "high"] },
              headline: { type: "string" },
              explanation: { type: "string" },
              related: { type: "array", items: { type: "string" } },
            },
            required: ["severity", "headline", "explanation", "related"],
          },
        },
      },
      required: ["productName", "kind", "detectedEntities", "nutritionFacts", "additives", "signals"],
    },
  };

  /* ── System + user prompt ── */

  const input = [
    {
      role: "system",
      content: [
        "You are Veda. Extract facts from product label photos. Output MUST be valid JSON matching the schema.",
        "",
        "STRICT RULES:",
        "1. No medical advice. No diagnosis. Never use 'stop', 'should', 'causes', or 'treats'. Use interpretive language: 'commonly associated with', 'tends to', 'often flagged'.",
        "2. Do NOT invent vitamins or minerals. Only include category='Vitamins' or 'Minerals' if the nutrient is EXPLICITLY printed on the ingredients or nutrition facts panel. For each such entity you MUST include at least one evidence string that contains the nutrient name verbatim (e.g. evidence: ['Vitamin D 0.75µg per 100ml']).",
        "3. If the product is a soft drink / beverage and the label lists sweeteners or caffeine, PRIORITISE those in detectedEntities and mention them in signals.",
        "4. If you are unsure about an entity, OMIT it rather than guess. For weak reads use confidence < 0.5 and still provide evidence strings.",
        "5. Prefer the INGREDIENTS image for additives, detectedEntities, and acids. Prefer the FRONT image for productName / brand. Prefer the nutrition facts panel for caffeine_mg, sugar_g, and calories.",
        "6. productName: the product name as printed on the front label. If you cannot read it clearly, return null. Do not guess or hallucinate a name.",
        "7. kind: classify as 'supplement', 'medication', 'food_drink', or 'unknown'.",
        "8. additives.sweeteners: list every artificial/non-caloric sweetener found on the ingredients list (e.g. Aspartame, Acesulfame K, Sucralose, Stevia).",
        "9. Return JSON only. No markdown fences. No extra keys.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Front of product (read product name / brand):" },
        { type: "image_url", image_url: { url: frontImageDataUrl } },
        { type: "text", text: "Ingredients / nutrition label (extract ingredients, amounts, additives):" },
        { type: "image_url", image_url: { url: ingredientsImageDataUrl } },
        {
          type: "text",
          text: [
            "Return:",
            "- productName: as printed on front, or null",
            "- kind: supplement | medication | food_drink | unknown",
            "- detectedEntities: key entities with category, confidence 0–1, and evidence snippets copied from label text",
            "- nutritionFacts: { calories, sugar_g, caffeine_mg } — null if not on label",
            "- additives: { sweeteners[], preservatives[], acids[] } from ingredients list",
            "- signals: 1–3 interpretive signals (severity + headline + explanation). For a plain beverage use severity 'low'.",
            "",
            "CRITICAL: For Vitamins/Minerals, each evidence[] MUST contain a snippet with the nutrient name. If no such snippet exists on the label, do NOT include that entity.",
          ].join("\n"),
        },
      ],
    },
  ];

  /* ── Call OpenAI ── */

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input,
        response_format: { type: "json_schema", json_schema: schema },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("[analyze] OpenAI error:", r.status, t.slice(0, 200));
      return json(stub(`OpenAI error: ${r.status} ${t.slice(0, 120)}`));
    }

    const data = await r.json();
    const text = data?.output?.[0]?.content?.[0]?.text;
    if (typeof text !== "string") {
      console.error("[analyze] Unexpected response shape:", JSON.stringify(data).slice(0, 300));
      return json(stub("Unexpected OpenAI response shape"));
    }

    const parsed = JSON.parse(text);

    // Run anti-hallucination post-processor
    postProcess(parsed);

    const resp: AnalyzeResponse = {
      ok: true,
      productName: typeof parsed.productName === "string" ? parsed.productName : null,
      kind: ["supplement", "medication", "food_drink", "unknown"].includes(parsed.kind) ? parsed.kind : "unknown",
      detectedEntities: Array.isArray(parsed.detectedEntities) ? parsed.detectedEntities : [],
      nutritionFacts: {
        calories: typeof parsed.nutritionFacts?.calories === "number" ? parsed.nutritionFacts.calories : null,
        sugar_g: typeof parsed.nutritionFacts?.sugar_g === "number" ? parsed.nutritionFacts.sugar_g : null,
        caffeine_mg: typeof parsed.nutritionFacts?.caffeine_mg === "number" ? parsed.nutritionFacts.caffeine_mg : null,
      },
      additives: {
        sweeteners: Array.isArray(parsed.additives?.sweeteners) ? parsed.additives.sweeteners.map(String) : [],
        preservatives: Array.isArray(parsed.additives?.preservatives) ? parsed.additives.preservatives.map(String) : [],
        acids: Array.isArray(parsed.additives?.acids) ? parsed.additives.acids.map(String) : [],
      },
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      meta: { mode: "openai", notes: [] },
    };

    console.log(
      "[analyze] mode=openai product=%s kind=%s entities=%d sweeteners=%d signals=%d",
      resp.productName,
      resp.kind,
      resp.detectedEntities.length,
      resp.additives.sweeteners.length,
      resp.signals.length,
    );
    return json(resp);
  } catch (e: any) {
    console.error("[analyze] exception:", e?.message || e);
    return json(stub(`Exception: ${String(e?.message || e)}`));
  }
}

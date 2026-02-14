export const config = {
  runtime: "edge",
};

type Severity = "low" | "medium" | "high";
type ConfidenceBand = "low" | "medium" | "high";

export type SignalType =
  | "interaction_detected"
  | "amplification_likely"
  | "timing_conflict"
  | "no_notable_interaction";

export interface Signal {
  type: SignalType;
  severity: Severity;
  confidence: ConfidenceBand;
  headline: string;
  explanation: string;
  related: string[];
}

export interface AnalyzeResponse {
  ok: true;
  productName: string | null;
  normalized: {
    detectedEntities: string[];
    categories: Record<string, string[]>;
  };
  signals: Signal[];
  meta: {
    mode: "openai" | "stub";
  };
}

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
    normalized: { detectedEntities: [], categories: {} },
    signals: [
      {
        type: "no_notable_interaction",
        severity: "low",
        confidence: "low",
        headline: "NO NOTABLE INTERACTION PATTERN FOUND",
        explanation:
          "I couldn't read enough label text to classify this item reliably. This is interpretive and depends on dose, timing, and individual variability.",
        related: [],
      },
    ],
    meta: { mode: "stub" },
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const frontImageDataUrl = body?.frontImageDataUrl;
  const ingredientsImageDataUrl = body?.ingredientsImageDataUrl;

  if (!isDataImage(frontImageDataUrl) || !isDataImage(ingredientsImageDataUrl)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Both images required (data:image/...)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Guard payload size to avoid 413s and edge limits
  const maxBytes = 1_400_000;
  if (b64SizeBytes(frontImageDataUrl) > maxBytes || b64SizeBytes(ingredientsImageDataUrl) > maxBytes) {
    return new Response(
      JSON.stringify({ ok: false, error: "Images too large (compress more)" }),
      { status: 413, headers: { "content-type": "application/json" } }
    );
  }

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return new Response(JSON.stringify(stub("OPENAI_API_KEY missing")), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const schema = {
    name: "VedaAnalyzeResponse",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        productName: { type: ["string", "null"] },
        detectedEntities: { type: "array", items: { type: "string" } },
        categories: {
          type: "object",
          additionalProperties: { type: "array", items: { type: "string" } },
        },
        signals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string" },
              severity: { type: "string" },
              confidence: { type: "string" },
              headline: { type: "string" },
              explanation: { type: "string" },
              related: { type: "array", items: { type: "string" } },
            },
            required: ["type", "severity", "confidence", "headline", "explanation", "related"],
          },
        },
      },
      required: ["productName", "detectedEntities", "categories", "signals"],
    },
  };

  const input = [
    {
      role: "system",
      content:
        "You are Veda. Extract facts from product photos. Output MUST be valid JSON matching the provided schema.\n" +
        "Rules:\n" +
        "- No medical advice. No diagnosis. No instructions to stop/avoid/treat.\n" +
        "- Use interpretive language: 'commonly associated with', 'tends to', 'often flagged'.\n" +
        "- Prefer ingredients label for entities. The front is mostly for product name.\n" +
        "- Detect and categorize: sweeteners (aspartame, acesulfame K, sucralose, stevia, etc.), stimulants (caffeine), sugars/syrups, calories, common vitamins/minerals.\n" +
        "- If an entity is not clearly present, do NOT invent it.\n",
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Front of product (identify product name/brand if possible):" },
        { type: "image_url", image_url: { url: frontImageDataUrl } },
        { type: "text", text: "Ingredients / nutrition label (extract ingredients + key amounts if visible):" },
        { type: "image_url", image_url: { url: ingredientsImageDataUrl } },
        {
          type: "text",
          text:
            "Return:\n" +
            "- productName: best-guess label name (or null)\n" +
            "- detectedEntities: unique list of key entities found (e.g. caffeine, aspartame)\n" +
            "- categories: group entities into Sweeteners/Stimulants/Sugars/Vitamins/Minerals/Other\n" +
            "- signals: 1–3 interpretive signals. If it's just a beverage, likely 'no_notable_interaction' with low severity.\n" +
            "Remember: do not invent vitamins/minerals if not on label.\n",
        },
      ],
    },
  ];

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
      return new Response(JSON.stringify(stub(`OpenAI error: ${r.status} ${t.slice(0, 120)}`)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const data = await r.json();
    const text = data?.output?.[0]?.content?.[0]?.text;
    if (typeof text !== "string") {
      console.error("[analyze] Unexpected response shape:", JSON.stringify(data).slice(0, 300));
      return new Response(JSON.stringify(stub("Unexpected OpenAI response shape")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const parsed = JSON.parse(text);

    const resp: AnalyzeResponse = {
      ok: true,
      productName: typeof parsed.productName === "string" ? parsed.productName : null,
      normalized: {
        detectedEntities: Array.isArray(parsed.detectedEntities)
          ? parsed.detectedEntities.map(String).slice(0, 50)
          : [],
        categories:
          parsed.categories && typeof parsed.categories === "object"
            ? parsed.categories
            : {},
      },
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      meta: { mode: "openai" },
    };

    console.log("[analyze] mode=openai entities=%d signals=%d", resp.normalized.detectedEntities.length, resp.signals.length);
    return new Response(JSON.stringify(resp), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("[analyze] exception:", e?.message || e);
    return new Response(JSON.stringify(stub(`Exception: ${String(e?.message || e)}`)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

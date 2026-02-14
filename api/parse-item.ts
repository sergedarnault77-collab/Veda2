// api/parse-item.ts
// Vercel Serverless Function (Node runtime)
//
// Purpose:
// - Accept two base64 data-URL images (front + ingredients) of a med or supp
// - Call OpenAI vision to extract structured product info
// - If OPENAI_API_KEY is missing, return best-effort stub
// - NEVER return medical advice; interpretive language only

type ParseItemRequest = {
  kind: "med" | "supp";
  frontImageDataUrl: string;
  ingredientsImageDataUrl: string;
};

export type ParsedItem = {
  displayName: string;
  brand: string | null;
  form: "tablet" | "capsule" | "powder" | "liquid" | "other" | null;
  strengthPerUnit: number | null;
  strengthUnit: "mg" | "µg" | "g" | "IU" | "mL" | null;
  servingSizeText: string | null;
  rawTextHints: string[];
  confidence: number; // 0..1
  mode: "openai" | "stub";
};

type ParseItemResponse =
  | { ok: true; item: ParsedItem }
  | { ok: false; error: string };

// ── Helpers ──

function safeJson(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify({ ok: false, error: "Failed to serialize response" });
  }
}

function send(res: any, status: number, body: ParseItemResponse) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(safeJson(body));
}

/** Rough byte-length of a data URL (strips the header, decodes base64 size). */
function dataUrlByteLength(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return 0;
  const b64 = dataUrl.slice(commaIdx + 1);
  // base64 encodes 3 bytes per 4 chars; padding '=' trims
  const padding = (b64.match(/=+$/) ?? [""])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

// ── Stub fallback (no API key) ──

function stubParse(kind: string, hints?: string[]): ParsedItem {
  return {
    displayName: kind === "med" ? "New medication" : "New supplement",
    brand: null,
    form: null,
    strengthPerUnit: null,
    strengthUnit: null,
    servingSizeText: null,
    rawTextHints: hints ?? [],
    confidence: 0,
    mode: "stub",
  };
}

// ── OpenAI vision call ──

const SYSTEM_PROMPT = `You are a product label reader. The user will send two photos of a medication or supplement: the product front, and the ingredients/supplement-facts label on the back.

Return ONLY valid JSON with these exact fields:
{
  "displayName": "string — product name as shown on the front",
  "brand": "string|null — brand name if visible",
  "form": "tablet|capsule|powder|liquid|other|null",
  "strengthPerUnit": "number|null — primary active amount per serving",
  "strengthUnit": "mg|µg|g|IU|mL|null",
  "servingSizeText": "string|null — e.g. '1 capsule', '2 tablets'",
  "rawTextHints": ["short extracted text snippets from the label, max 8"],
  "confidence": "number 0..1 — how confident you are in the extraction"
}

Rules:
- Extract only what is visible on the labels.
- If a field is not visible or unclear, use null.
- Do NOT provide medical advice, dosage recommendations, or health claims.
- Do NOT use words like "should", "stop", "causes", "treats".
- Return valid JSON only. No markdown, no explanation outside JSON.`;

async function callOpenAI(
  frontDataUrl: string,
  ingredientsDataUrl: string
): Promise<ParsedItem> {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log("[parse-item] OPENAI_API_KEY present:", !!apiKey);
  if (!apiKey) throw new Error("NO_KEY");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: frontDataUrl, detail: "low" },
            },
            {
              type: "image_url",
              image_url: { url: ingredientsDataUrl, detail: "high" },
            },
            {
              type: "text",
              text: "Extract the product info from these two label photos. Return JSON only.",
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  const raw = json?.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(raw);

  return {
    displayName: String(parsed.displayName ?? "Unknown product"),
    brand: parsed.brand ?? null,
    form: parsed.form ?? null,
    strengthPerUnit:
      typeof parsed.strengthPerUnit === "number" ? parsed.strengthPerUnit : null,
    strengthUnit: parsed.strengthUnit ?? null,
    servingSizeText: parsed.servingSizeText ?? null,
    rawTextHints: Array.isArray(parsed.rawTextHints)
      ? parsed.rawTextHints.map(String).slice(0, 8)
      : [],
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    mode: "openai",
  };
}

// ── Handler ──

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return send(res, 405, { ok: false, error: "Method not allowed" });
    }

    const body = (
      typeof req.body === "string" ? JSON.parse(req.body) : req.body
    ) as ParseItemRequest;

    const kind = body?.kind;
    if (kind !== "med" && kind !== "supp") {
      return send(res, 400, { ok: false, error: 'kind must be "med" or "supp"' });
    }

    const front = body?.frontImageDataUrl ?? "";
    const ing = body?.ingredientsImageDataUrl ?? "";

    if (!front || !ing) {
      return send(res, 400, {
        ok: false,
        error: "Both frontImageDataUrl and ingredientsImageDataUrl are required",
      });
    }

    if (
      !front.startsWith("data:image/") ||
      !ing.startsWith("data:image/")
    ) {
      return send(res, 400, {
        ok: false,
        error: "Images must be base64 data URLs (data:image/…)",
      });
    }

    if (dataUrlByteLength(front) > MAX_IMAGE_BYTES) {
      return send(res, 400, { ok: false, error: "Front image exceeds 2 MB" });
    }
    if (dataUrlByteLength(ing) > MAX_IMAGE_BYTES) {
      return send(res, 400, {
        ok: false,
        error: "Ingredients image exceeds 2 MB",
      });
    }

    // Try OpenAI; fall back to stub with diagnostic rawTextHints
    let item: ParsedItem;
    try {
      item = await callOpenAI(front, ing);
    } catch (e: any) {
      if (e?.message === "NO_KEY") {
        console.log("[parse-item] OPENAI_API_KEY missing, returning stub");
        item = stubParse(kind, ["OPENAI_API_KEY missing"]);
      } else {
        console.error("[parse-item] OpenAI error:", e?.message ?? e);
        item = stubParse(kind, [`OpenAI error: ${String(e?.message ?? "unknown").slice(0, 120)}`]);
      }
    }

    console.log("[parse-item] mode=%s confidence=%s", item.mode, item.confidence);
    return send(res, 200, { ok: true, item });
  } catch (e: any) {
    return send(res, 500, { ok: false, error: e?.message ?? "Server error" });
  }
}

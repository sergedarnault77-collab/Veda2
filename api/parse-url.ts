export const config = { maxDuration: 45 };

function envOpenAIKey(): string | null {
  const p = (globalThis as any)?.process;
  return (p?.env?.OPENAI_API_KEY as string | undefined) ?? null;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

function buildSchema() {
  return {
    name: "veda_parse_url",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "productName",
        "brand",
        "form",
        "servingSizeText",
        "nutrients",
        "ingredientsList",
      ],
      properties: {
        productName: { type: ["string", "null"] },
        brand: { type: ["string", "null"] },
        form: {
          type: ["string", "null"],
          enum: ["tablet", "capsule", "powder", "liquid", "other", null],
        },
        servingSizeText: { type: ["string", "null"] },
        nutrients: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["nutrientId", "name", "unit", "amountToday", "dailyReference", "percentLabel"],
            properties: {
              nutrientId: { type: "string" },
              name: { type: "string" },
              unit: { type: "string", enum: ["mg", "µg", "IU", "g", "mL"] },
              amountToday: { type: "number" },
              dailyReference: { type: "number" },
              percentLabel: { type: ["number", "null"] },
            },
          },
        },
        ingredientsList: { type: "array", items: { type: "string" } },
      },
    },
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  const apiKey = envOpenAIKey();
  if (!apiKey) {
    return json({ ok: false, error: "OPENAI_API_KEY not configured" }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return json({ ok: false, error: "A valid URL starting with http(s):// is required" }, 400);
  }

  /* ── Step 1: Fetch the page ── */
  let pageText: string;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12_000);
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VedaBot/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ac.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!pageRes.ok) {
      return json({ ok: false, error: `Could not fetch URL (HTTP ${pageRes.status})` }, 200);
    }

    const html = await pageRes.text();
    pageText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000);
  } catch (e: any) {
    const msg = e?.name === "AbortError"
      ? "URL took too long to respond"
      : "Could not fetch the URL. Check that it's accessible.";
    return json({ ok: false, error: msg }, 200);
  }

  if (pageText.length < 50) {
    return json({ ok: false, error: "Page returned very little text. Try a different URL." }, 200);
  }

  /* ── Step 2: Extract supplement data with OpenAI ── */
  const systemPrompt = [
    "You extract supplement / medication product data from webpage text.",
    "",
    "Given the raw text content of a product page, extract:",
    "- productName: the product's full name",
    "- brand: manufacturer or brand name",
    "- form: tablet, capsule, powder, liquid, or other",
    "- servingSizeText: serving size as written on the page",
    "- nutrients: array of nutrients with amounts per serving",
    "  - nutrientId: snake_case English id (vitamin_d, iron, magnesium, etc.)",
    "  - name: human-readable name",
    "  - unit: mg, µg, IU, g, or mL",
    "  - amountToday: amount per serving",
    "  - dailyReference: standard adult daily reference in the same unit (0 if unknown)",
    "  - percentLabel: % DV if shown on the page, else null",
    "- ingredientsList: array of all ingredient names",
    "",
    "Rules:",
    "- Only extract data explicitly stated on the page.",
    "- Do NOT invent or hallucinate nutrient amounts.",
    "- Map non-English names to English where possible.",
    "- If a field is not found, set it to null or empty array.",
    "- Return JSON matching the schema.",
  ].join("\n");

  const ac2 = new AbortController();
  const timer2 = setTimeout(() => ac2.abort(), 25_000);

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Extract supplement data from this product page:\n\nURL: ${url}\n\nPage text:\n${pageText}`,
              },
            ],
          },
        ],
        text: {
          format: { type: "json_schema" as const, ...buildSchema() },
        },
      }),
      signal: ac2.signal,
    });
    clearTimeout(timer2);

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return json({ ok: false, error: `AI processing failed (${r.status}): ${errText.slice(0, 100)}` }, 200);
    }

    const resp = await r.json().catch(() => null);
    const outText = extractOutputText(resp);
    if (!outText) {
      return json({ ok: false, error: "AI returned no output" }, 200);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(outText);
    } catch {
      return json({ ok: false, error: "AI returned invalid JSON" }, 200);
    }

    return json({
      ok: true,
      productName: parsed.productName || null,
      brand: parsed.brand || null,
      form: parsed.form || null,
      servingSizeText: parsed.servingSizeText || null,
      nutrients: Array.isArray(parsed.nutrients) ? parsed.nutrients : [],
      ingredientsList: Array.isArray(parsed.ingredientsList) ? parsed.ingredientsList : [],
      sourceUrl: url,
    });
  } catch (e: any) {
    clearTimeout(timer2);
    const msg = e?.name === "AbortError"
      ? "AI processing timed out"
      : `Processing error: ${String(e?.message || e).slice(0, 100)}`;
    return json({ ok: false, error: msg }, 200);
  }
}

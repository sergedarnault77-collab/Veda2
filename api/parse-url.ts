export const config = { runtime: "edge" };

function envOpenAIKey(): string | null {
  const p = (globalThis as any)?.process;
  return (p?.env?.OPENAI_API_KEY as string | undefined) ?? null;
}

function jsonResp(data: any, status = 200) {
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
      required: ["productName", "brand", "form", "servingSizeText", "nutrients", "ingredientsList"],
      properties: {
        productName: { type: ["string", "null"] },
        brand: { type: ["string", "null"] },
        form: { type: ["string", "null"], enum: ["tablet", "capsule", "powder", "liquid", "other", null] },
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

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract just the product-relevant section from full page text. */
function extractProductSection(fullText: string): string {
  const markers = [
    /samenstelling/i, /supplement\s*facts/i, /nutrition\s*facts/i,
    /ingredients/i, /ingredi[eë]nten/i, /productinformatie/i,
    /beschrijving/i, /composition/i, /zusammensetzung/i,
    /per\s+(?:dag)?dosering/i, /per\s+serving/i, /% RI/i, /% DV/i,
  ];

  let bestIdx = -1;
  for (const re of markers) {
    const m = fullText.search(re);
    if (m !== -1 && (bestIdx === -1 || m < bestIdx)) {
      bestIdx = m;
    }
  }

  // Take product name from the beginning (first ~400 chars) + the nutrition section
  const header = fullText.slice(0, 400);

  if (bestIdx !== -1) {
    const start = Math.max(0, bestIdx - 100);
    const section = fullText.slice(start, start + 3000);
    return (header + "\n\n" + section).slice(0, 3500);
  }

  // No markers found — send the first 3500 chars
  return fullText.slice(0, 3500);
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return jsonResp({ ok: false, error: "POST only" }, 405);
    }

    const apiKey = envOpenAIKey();
    if (!apiKey) {
      return jsonResp({ ok: false, error: "OPENAI_API_KEY not configured" });
    }

    let body: any;
    try { body = await req.json(); } catch {
      return jsonResp({ ok: false, error: "Invalid request body" });
    }

    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return jsonResp({ ok: false, error: "A valid URL starting with http(s):// is required" });
    }

    /* ── Step 1: Fetch the page (max 6s) ── */
    let pageText: string;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 6_000);
      const pageRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,nl;q=0.8",
        },
        signal: ac.signal,
        redirect: "follow",
      });
      clearTimeout(timer);

      if (!pageRes.ok) {
        return jsonResp({ ok: false, error: `Website returned HTTP ${pageRes.status}.` });
      }

      const html = await pageRes.text();
      const fullText = stripHtml(html);
      pageText = extractProductSection(fullText);
    } catch (e: any) {
      return jsonResp({
        ok: false,
        error: e?.name === "AbortError"
          ? "Website took too long to respond."
          : `Could not reach website: ${String(e?.message || "").slice(0, 60)}`,
      });
    }

    if (pageText.length < 40) {
      return jsonResp({ ok: false, error: "Page returned very little text." });
    }

    /* ── Step 2: Extract with OpenAI (max 16s) ── */
    const system = [
      "Extract supplement data from webpage text. Return JSON matching the schema.",
      "Map Dutch/German: IJzer=Iron, Zink=Zinc, Foliumzuur=Folate, Jodium=Iodine, Koper=Copper, Chroom=Chromium, Seleen/Selenium=Selenium, Mangaan=Manganese, Kalium=Potassium, Biotine=Biotin, Vitamine=Vitamin. mcg→µg.",
      "Only extract data explicitly on the page. Do NOT invent amounts.",
    ].join("\n");

    const ac2 = new AbortController();
    const timer2 = setTimeout(() => ac2.abort(), 16_000);
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: `URL: ${url}\n\n${pageText}` }] },
          ],
          text: { format: { type: "json_schema" as const, ...buildSchema() } },
        }),
        signal: ac2.signal,
      });
      clearTimeout(timer2);

      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        return jsonResp({ ok: false, error: `AI error (${r.status}): ${errText.slice(0, 80)}` });
      }

      const resp = await r.json().catch(() => null);
      const outText = extractOutputText(resp);
      if (!outText) return jsonResp({ ok: false, error: "AI returned no output" });

      let parsed: any;
      try { parsed = JSON.parse(outText); } catch {
        return jsonResp({ ok: false, error: "AI returned invalid JSON" });
      }

      return jsonResp({
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
      return jsonResp({
        ok: false,
        error: e?.name === "AbortError" ? "AI processing timed out." : `Error: ${String(e?.message || e).slice(0, 80)}`,
      });
    }
  } catch (topErr: any) {
    return jsonResp({ ok: false, error: `Unexpected: ${String(topErr?.message || topErr).slice(0, 100)}` });
  }
}

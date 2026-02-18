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

  const header = fullText.slice(0, 300);

  if (bestIdx !== -1) {
    const start = Math.max(0, bestIdx - 50);
    const section = fullText.slice(start, start + 2500);
    return (header + "\n\n" + section).slice(0, 3000);
  }

  return fullText.slice(0, 3000);
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
      pageText = extractProductSection(stripHtml(html));
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

    /* ── Step 2: Extract with OpenAI Chat Completions (max 17s) ── */
    const systemMsg = [
      "Extract supplement data from this webpage text. Return a JSON object with these fields:",
      '- productName (string or null)',
      '- brand (string or null)',
      '- form ("tablet"|"capsule"|"powder"|"liquid"|"other"|null)',
      '- servingSizeText (string or null)',
      '- nutrients: array of {nutrientId, name, unit, amountToday, dailyReference, percentLabel}',
      '  nutrientId=snake_case English (vitamin_d, iron, etc). unit=mg/µg/IU/g/mL. mcg→µg.',
      '  dailyReference=adult daily ref in same unit (0 if unknown). percentLabel=% from page or null.',
      '- ingredientsList: array of ingredient name strings',
      "",
      "Dutch→English: IJzer=Iron, Zink=Zinc, Foliumzuur=Folate, Jodium=Iodine, Koper=Copper,",
      "Chroom=Chromium, Seleen=Selenium, Mangaan=Manganese, Kalium=Potassium, Biotine=Biotin,",
      "Vitamine=Vitamin, Molybdeen=Molybdenum. Only extract data on the page. Do NOT invent.",
    ].join("\n");

    const ac2 = new AbortController();
    const timer2 = setTimeout(() => ac2.abort(), 17_000);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: pageText },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
        signal: ac2.signal,
      });
      clearTimeout(timer2);

      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        return jsonResp({ ok: false, error: `AI error (${r.status}): ${errText.slice(0, 80)}` });
      }

      const resp = await r.json().catch(() => null);
      const content = resp?.choices?.[0]?.message?.content;
      if (!content) return jsonResp({ ok: false, error: "AI returned no output" });

      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        return jsonResp({ ok: false, error: "AI returned invalid JSON" });
      }

      const nutrients = Array.isArray(parsed.nutrients)
        ? parsed.nutrients.filter((n: any) =>
            n && typeof n.name === "string" && typeof n.amountToday === "number" && n.amountToday > 0
          ).map((n: any) => ({
            nutrientId: String(n.nutrientId || n.name || "").toLowerCase().replace(/\s+/g, "_").slice(0, 40),
            name: String(n.name).slice(0, 60),
            unit: (["mg", "µg", "IU", "g", "mL"].includes(n.unit) ? n.unit : "mg"),
            amountToday: Number(n.amountToday),
            dailyReference: typeof n.dailyReference === "number" ? n.dailyReference : 0,
            percentLabel: typeof n.percentLabel === "number" ? n.percentLabel : null,
          }))
        : [];

      const ingredientsList = Array.isArray(parsed.ingredientsList)
        ? parsed.ingredientsList.filter((s: any) => typeof s === "string" && s.trim()).map((s: any) => String(s).trim())
        : [];

      return jsonResp({
        ok: true,
        productName: typeof parsed.productName === "string" ? parsed.productName : null,
        brand: typeof parsed.brand === "string" ? parsed.brand : null,
        form: typeof parsed.form === "string" ? parsed.form : null,
        servingSizeText: typeof parsed.servingSizeText === "string" ? parsed.servingSizeText : null,
        nutrients,
        ingredientsList,
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

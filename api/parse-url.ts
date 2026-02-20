export const config = { maxDuration: 60 };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { requireAuth } from "./lib/auth";

function envOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

function getDb() {
  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return null;
  return neon(connStr);
}

async function tryDbLookup(productHint: string) {
  const sql = getDb();
  if (!sql || !productHint || productHint.length < 3) return null;

  try {
    const rows = await sql`
      SELECT p.id, p.source, p.source_id, p.barcode, p.product_name, p.brand_name,
             p.form, p.serving_size,
             similarity(
               lower(coalesce(p.product_name,'') || ' ' || coalesce(p.brand_name,'')),
               ${productHint.toLowerCase()}
             ) AS sim
      FROM products p
      WHERE
        lower(coalesce(p.product_name,'') || ' ' || coalesce(p.brand_name,''))
        % ${productHint.toLowerCase()}
      ORDER BY sim DESC
      LIMIT 1
    `;

    if (rows.length === 0 || Number(rows[0].sim) < 0.3) return null;

    const product = rows[0];
    const nutrients = await sql`
      SELECT ingredient_name, amount, unit, per, pct_dv
      FROM product_nutrients
      WHERE product_id = ${product.id}
      ORDER BY ingredient_name
    `;

    if (nutrients.length === 0) return null;

    return {
      productName: product.product_name,
      brand: product.brand_name,
      form: product.form,
      servingSizeText: product.serving_size,
      nutrients: nutrients.map((n: any) => ({
        nutrientId: String(n.ingredient_name || "").toLowerCase().replace(/\s+/g, "_").slice(0, 40),
        name: n.ingredient_name,
        unit: n.unit || "mg",
        amountToday: n.amount != null ? Number(n.amount) : 0,
        dailyReference: 0,
        percentLabel: n.pct_dv != null ? Number(n.pct_dv) : null,
      })),
      ingredientsList: nutrients.map((n: any) => String(n.ingredient_name)),
      source: "db",
    };
  } catch {
    return null;
  }
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "POST only" });
    }

    const authUser = await requireAuth(req as any);
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }

    const apiKey = envOpenAIKey();
    if (!apiKey) {
      return res.json({ ok: false, error: "OPENAI_API_KEY not configured" });
    }

    const body = req.body;
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return res.json({ ok: false, error: "A valid URL starting with http(s):// is required" });
    }

    /* ── Step 1: Fetch the page (max 10s) ── */
    let pageText: string;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10_000);
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
        return res.json({ ok: false, error: `Website returned HTTP ${pageRes.status}.` });
      }

      const html = await pageRes.text();
      pageText = extractProductSection(stripHtml(html));
    } catch (e: any) {
      return res.json({
        ok: false,
        error: e?.name === "AbortError"
          ? "Website took too long to respond."
          : `Could not reach website: ${String(e?.message || "").slice(0, 60)}`,
      });
    }

    if (pageText.length < 40) {
      return res.json({ ok: false, error: "Page returned very little text." });
    }

    /* ── Step 2: Try database lookup first (fast path) ── */
    const titleMatch = pageText.slice(0, 300).match(/^[\s]*([^\n.]{5,80})/);
    const productHint = titleMatch?.[1]?.trim() || "";
    if (productHint) {
      const cached = await tryDbLookup(productHint);
      if (cached && cached.nutrients.length > 0) {
        return res.json({ ok: true, ...cached, sourceUrl: url });
      }
    }

    /* ── Step 3: Extract with OpenAI Chat Completions (max 45s) ── */
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
    const timer2 = setTimeout(() => ac2.abort(), 45_000);
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
          max_tokens: 2000,
        }),
        signal: ac2.signal,
      });
      clearTimeout(timer2);

      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        return res.json({ ok: false, error: `AI error (${r.status}): ${errText.slice(0, 80)}` });
      }

      const resp = await r.json().catch(() => null);
      const content = resp?.choices?.[0]?.message?.content;
      if (!content) return res.json({ ok: false, error: "AI returned no output" });

      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        return res.json({ ok: false, error: "AI returned invalid JSON" });
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

      return res.json({
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
      return res.json({
        ok: false,
        error: e?.name === "AbortError" ? "AI processing timed out." : `Error: ${String(e?.message || e).slice(0, 80)}`,
      });
    }
  } catch (topErr: any) {
    return res.status(500).json({ ok: false, error: `Unexpected: ${String(topErr?.message || topErr).slice(0, 100)}` });
  }
}

export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setTraceHeaders } from "./_lib/traceHeaders";

type OverlapRisk = "low" | "medium" | "high";

type Overlap = {
  key: string;
  what: string;
  whyItMatters: string;
  risk: OverlapRisk;
  related: string[];
};

type AdviseResponse = {
  ok: true;
  summary: string;
  overlaps: Overlap[];
  notes: string[];
};

function envOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

function stubResponse(reason: string): AdviseResponse {
  return { ok: true, summary: "", overlaps: [], notes: [reason] };
}

function buildSchema() {
  return {
    name: "veda_advise",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "overlaps", "notes"],
      properties: {
        summary: { type: "string" },
        overlaps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "what", "whyItMatters", "risk", "related"],
            properties: {
              key: { type: "string" },
              what: { type: "string" },
              whyItMatters: { type: "string" },
              risk: { type: "string", enum: ["low", "medium", "high"] },
              related: { type: "array", items: { type: "string" } },
            },
          },
        },
        notes: { type: "array", items: { type: "string" } },
      },
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setTraceHeaders(req, res);
  console.log("[advise] handler entered", { method: req.method, url: req.url, rid: req.headers["x-veda-request-id"] });
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

    try { const { requireAuth } = await import("./_lib/auth"); await requireAuth(req); } catch { /* best-effort */ }

    const apiKey = envOpenAIKey();
    if (!apiKey) return res.status(200).json(stubResponse("OPENAI_API_KEY missing"));

    const body = req.body || {};
    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(200).json(stubResponse("No items provided"));
    }

    const itemDescriptions = items
      .slice(0, 10)
      .map((it: any, i: number) => {
        const parts: string[] = [];
        parts.push(`Item ${i + 1}: ${it.displayName || "Unknown"}`);
        if (it.labelTranscription) {
          parts.push(`  Transcription (first 600 chars): ${String(it.labelTranscription).slice(0, 600)}`);
        }
        if (Array.isArray(it.nutrients) && it.nutrients.length > 0) {
          const nList = it.nutrients.slice(0, 30).map((n: any) => `${n.name} ${n.amountToday}${n.unit}`).join(", ");
          parts.push(`  Nutrients: ${nList}`);
        }
        if (Array.isArray(it.ingredientsList) && it.ingredientsList.length > 0) {
          parts.push(`  Ingredients (${it.ingredientsList.length}): ${it.ingredientsList.slice(0, 40).join(", ")}`);
        }
        return parts.join("\n");
      })
      .join("\n\n");

    const system = [
      "You are Veda's supplement/medication advisor. Provide SHORT, grounded insights about the items below.",
      "",
      "Rules:",
      "- ONLY use the transcription, nutrients, and ingredients data provided. Do NOT guess or add external knowledge.",
      "- 'summary' must be 1–2 sentences, max 200 characters. Summarize the stack briefly.",
      "- 'overlaps': Identify nutrient or ingredient overlaps, high doses relative to daily values, or notable combinations.",
      "  - Even for a single item, flag high %DV nutrients or noteworthy ingredients.",
      "  - Keep 'what' and 'whyItMatters' short (under 80 chars each).",
      "  - 'risk' = low / medium / high based on how notable the overlap or dose is.",
      "- 'notes': Up to 3 short bullets (under 100 chars each). Practical, neutral observations.",
      "- NEVER give medical advice. NEVER say 'stop', 'do not take', 'causes', 'treats'.",
      "- Use neutral language: 'may', 'consider', 'if you're sensitive', 'commonly associated with'.",
      "- If nothing stands out, return an empty overlaps array and a note saying 'No notable overlaps detected.'",
      "",
      "Return JSON matching the schema exactly.",
    ].join("\n");

    const schema = buildSchema();

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: `Analyze these items and provide insights:\n\n${itemDescriptions}` }] },
        ],
        text: { format: { type: "json_schema" as const, ...schema } },
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(200).json(stubResponse(`OpenAI error ${r.status}: ${errText.slice(0, 100)}`));
    }

    const resp = await r.json().catch(() => null);

    let outText: string | null = null;
    if (resp && typeof resp.output_text === "string") {
      outText = resp.output_text;
    } else if (Array.isArray(resp?.output)) {
      const chunks: string[] = [];
      for (const item of resp.output) {
        if (!Array.isArray(item?.content)) continue;
        for (const c of item.content) {
          if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") chunks.push(c.text);
        }
      }
      outText = chunks.join("\n").trim() || null;
    }

    if (!outText) return res.status(200).json(stubResponse("OpenAI: no output_text"));

    let parsed: any = null;
    try { parsed = JSON.parse(outText); } catch { return res.status(200).json(stubResponse("OpenAI: invalid JSON output")); }

    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 250) : "";

    const overlaps: Overlap[] = Array.isArray(parsed.overlaps)
      ? parsed.overlaps.slice(0, 8).map((o: any) => ({
          key: typeof o.key === "string" ? o.key.slice(0, 40) : "",
          what: typeof o.what === "string" ? o.what.slice(0, 120) : "",
          whyItMatters: typeof o.whyItMatters === "string" ? o.whyItMatters.slice(0, 160) : "",
          risk: o.risk === "high" || o.risk === "medium" || o.risk === "low" ? o.risk : "low",
          related: Array.isArray(o.related) ? o.related.filter((x: any) => typeof x === "string").slice(0, 10) : [],
        }))
      : [];

    const notes: string[] = Array.isArray(parsed.notes)
      ? parsed.notes.filter((n: any) => typeof n === "string").map((n: string) => n.slice(0, 150)).slice(0, 3)
      : [];

    return res.status(200).json({ ok: true, summary, overlaps, notes } as AdviseResponse);
  } catch (e: any) {
    return res.status(200).json(stubResponse(`exception: ${String(e?.message || e).slice(0, 100)}`));
  }
}

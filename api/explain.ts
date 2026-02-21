export const config = { runtime: "edge" };

import { requireAuth, unauthorized } from "./lib/auth";

/**
 * /api/explain — Contextual guidance for a detected signal.
 *
 * Returns 4 structured sections:
 *  1. whatWasDetected  — fact-based observation
 *  2. whyItMatters     — educational context
 *  3. whatPeopleDo     — non-directive, third-person patterns
 *  4. disclaimer       — always present
 *
 * NEVER returns medical advice, directives, or diagnosis.
 */

interface ExplainResponse {
  ok: true;
  whatWasDetected: string[];
  whyItMatters: string[];
  whatPeopleDo: string[];
  disclaimer: string;
}

function envKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fallback(signal: any): ExplainResponse {
  const kind = String(signal?.kind || "signal");
  const label = String(signal?.label || "this item");
  const detail = String(signal?.detail || "");

  return {
    ok: true,
    whatWasDetected: [detail || `${label} was flagged as ${kind}.`],
    whyItMatters: ["Context depends on dose, timing, and individual factors."],
    whatPeopleDo: ["Some people review overlapping sources when flagged."],
    disclaimer:
      "This is not medical advice. Veda does not diagnose or recommend treatment. For personal health decisions, consult a professional.",
  };
}

function buildSchema() {
  return {
    name: "veda_explain",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["whatWasDetected", "whyItMatters", "whatPeopleDo"],
      properties: {
        whatWasDetected: {
          type: "array",
          items: { type: "string" },
        },
        whyItMatters: {
          type: "array",
          items: { type: "string" },
        },
        whatPeopleDo: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  const authUser = await requireAuth(req);
  if (!authUser) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const signal = body?.signal;
  if (!signal) {
    return json({ ok: false, error: "signal required" }, 400);
  }

  const apiKey = envKey();
  if (!apiKey) {
    return json(fallback(signal));
  }

  const kind = String(signal.kind || "flag");
  const label = String(signal.label || "Unknown");
  const detail = String(signal.detail || "");
  const sources = Array.isArray(signal.sources) ? signal.sources.slice(0, 10).map(String) : [];
  const nutrients = Array.isArray(signal.nutrients)
    ? signal.nutrients.slice(0, 20).map((n: any) => `${n.name} ${n.amountToday}${n.unit}`)
    : [];

  const systemPrompt = [
    "You are Veda's contextual guidance engine. You explain detected signals clearly and neutrally.",
    "",
    "You MUST return JSON with exactly 3 arrays of short strings:",
    "",
    "1. whatWasDetected (1-3 items): Pure facts about what was observed.",
    "   Example: \"You're currently at ~1250% of the daily reference intake for Vitamin C\"",
    "   Example: \"This amount comes from 3 sources you scanned today\"",
    "",
    "2. whyItMatters (1-3 items): Educational context. Why this is notable.",
    "   Example: \"Vitamin C absorption saturates quickly — amounts above ~200mg are commonly excreted\"",
    "   Example: \"High doses may cause GI discomfort in some people\"",
    "   Use language like: 'commonly', 'tends to', 'may', 'in some people', 'is often associated with'",
    "",
    "3. whatPeopleDo (1-3 items): Non-directive, third-person patterns. What others typically do.",
    "   Example: \"Some people reduce overlapping supplements when redundancy is detected\"",
    "   Example: \"Others space doses across the day\"",
    "   NEVER use 'you should', 'stop taking', 'we recommend'. Always third-person: 'some people', 'many', 'others'.",
    "",
    "ABSOLUTE RULES:",
    "- NEVER give medical advice, diagnosis, or treatment recommendations",
    "- NEVER say 'you should', 'stop', 'avoid', 'do not take', 'unsafe', 'dangerous', 'will cause harm'",
    "- NEVER recommend specific doses for the user",
    "- Keep each bullet under 120 characters",
    "- Be grounded in the data provided — do not invent facts",
    "- If you don't have enough data, say so honestly",
  ].join("\n");

  const userPrompt = [
    `Signal type: ${kind}`,
    `Nutrient/ingredient: ${label}`,
    `Detail: ${detail}`,
    sources.length > 0 ? `Sources: ${sources.join(", ")}` : "",
    nutrients.length > 0 ? `Nutrient data: ${nutrients.join("; ")}` : "",
    "",
    "Provide contextual guidance for this signal.",
  ]
    .filter(Boolean)
    .join("\n");

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
          { role: "user", content: [{ type: "input_text", text: userPrompt }] },
        ],
        text: { format: { type: "json_schema", ...buildSchema() } },
      }),
    });

    if (!r.ok) {
      return json(fallback(signal));
    }

    const resp = await r.json();
    let outText: string | null = null;
    if (typeof resp.output_text === "string") {
      outText = resp.output_text;
    } else if (Array.isArray(resp?.output)) {
      for (const item of resp.output) {
        if (!Array.isArray(item?.content)) continue;
        for (const c of item.content) {
          if (typeof c?.text === "string") {
            outText = c.text;
            break;
          }
        }
        if (outText) break;
      }
    }

    if (!outText) return json(fallback(signal));

    const parsed = JSON.parse(outText);

    const cap = (arr: any[], max: number) =>
      Array.isArray(arr) ? arr.filter((s: any) => typeof s === "string").slice(0, max).map((s: string) => s.slice(0, 200)) : [];

    const result: ExplainResponse = {
      ok: true,
      whatWasDetected: cap(parsed.whatWasDetected, 3),
      whyItMatters: cap(parsed.whyItMatters, 3),
      whatPeopleDo: cap(parsed.whatPeopleDo, 3),
      disclaimer:
        "This is not medical advice. Veda does not diagnose or recommend treatment. For personal health decisions, consult a professional.",
    };

    return json(result);
  } catch {
    return json(fallback(signal));
  }
}

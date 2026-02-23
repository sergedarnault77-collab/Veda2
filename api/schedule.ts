export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setTraceHeaders } from "./lib/traceHeaders";

type TimeSlot = "morning" | "afternoon" | "evening" | "night";

type ScheduleItem = {
  id: string;
  name: string;
  recommended: TimeSlot;
  reason: string;
};

type ScheduleResponse = {
  ok: true;
  items: ScheduleItem[];
  generalAdvice: string;
  disclaimer: string;
};

function envOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setTraceHeaders(req, res);
  console.log("[schedule] handler entered", { method: req.method, url: req.url, rid: req.headers["x-veda-request-id"] });

  try { const { requireAuth } = await import("./lib/auth"); await requireAuth(req); } catch { /* best-effort */ }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const apiKey = envOpenAIKey();
  if (!apiKey) return res.status(500).json({ ok: false, error: "API key missing" });

  const body = req.body || {};

  const supplements: any[] = Array.isArray(body?.supplements) ? body.supplements : [];
  const medications: any[] = Array.isArray(body?.medications) ? body.medications : [];

  if (supplements.length === 0 && medications.length === 0) {
    return res.status(200).json({
      ok: true,
      items: [],
      generalAdvice: "Add supplements or medications first, then I can recommend optimal timing.",
      disclaimer: "This is general information, not medical advice.",
    });
  }

  const itemList = [
    ...supplements.map((s: any) => ({
      id: s.id,
      name: s.displayName || "Unknown supplement",
      type: "supplement",
      nutrients: Array.isArray(s.nutrients)
        ? s.nutrients.slice(0, 10).map((n: any) => `${n.name} ${n.amountToday}${n.unit}`).join(", ")
        : "",
      ingredients: Array.isArray(s.ingredientsList)
        ? s.ingredientsList.slice(0, 8).join(", ")
        : "",
    })),
    ...medications.map((m: any) => ({
      id: m.id,
      name: m.displayName || "Unknown medication",
      type: "medication",
      nutrients: Array.isArray(m.nutrients)
        ? m.nutrients.slice(0, 5).map((n: any) => `${n.name} ${n.amountToday}${n.unit}`).join(", ")
        : "",
      ingredients: Array.isArray(m.ingredientsList)
        ? m.ingredientsList.slice(0, 8).join(", ")
        : "",
    })),
  ];

  const itemDescriptions = itemList.map((item, i) =>
    `${i + 1}. [${item.type}] "${item.name}"${item.nutrients ? ` — contains: ${item.nutrients}` : ""}${item.ingredients ? ` — ingredients: ${item.ingredients}` : ""}`
  ).join("\n");

  const systemPrompt = [
    "You are Veda's supplement scheduling advisor. The user wants to know the OPTIMAL time of day to take each of their supplements and medications for best absorption and results.",
    "",
    "For each item, recommend ONE time slot: morning, afternoon, evening, or night.",
    "",
    "Key scheduling principles:",
    "• Fat-soluble vitamins (A, D, E, K) → take with meals containing fat (morning or evening with food)",
    "• Iron → morning on empty stomach, SEPARATE from calcium/zinc/coffee by 2+ hours",
    "• Calcium → evening (aids sleep, separate from iron)",
    "• Magnesium → evening or night (aids sleep and recovery)",
    "• B vitamins → morning (energy, may disrupt sleep if taken late)",
    "• Vitamin C → morning or afternoon (energy, aids iron absorption if paired)",
    "• Zinc → evening with food (separate from iron)",
    "• Omega-3 / fish oil → with meals (morning or evening)",
    "• Probiotics → morning on empty stomach",
    "• Melatonin → night (30-60 min before bed)",
    "• Caffeine → morning only (not after 2 PM)",
    "• Medications → follow prescriber guidance; if unknown, morning with food is safest default",
    "",
    "Return JSON with: items (array of {id, name, recommended, reason}), generalAdvice (string), disclaimer (string).",
    "",
    "Rules:",
    "- Return a recommendation for EVERY item",
    "- Use the exact item IDs provided",
    "- Descriptive language only, no prescriptive medical advice",
  ].join("\n");

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25_000);

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here are my supplements and medications. Please recommend the best time of day for each:\n\n${itemDescriptions}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1500,
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!r.ok) return res.status(200).json({ ok: false, error: `AI error: ${r.status}` });

    const resp = await r.json();
    const text = resp?.choices?.[0]?.message?.content;
    if (!text) return res.status(200).json({ ok: false, error: "No AI response" });

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return res.status(200).json({ ok: false, error: "Invalid AI response" }); }

    const validSlots = new Set(["morning", "afternoon", "evening", "night"]);
    const items: ScheduleItem[] = [];

    if (Array.isArray(parsed?.items)) {
      for (const item of parsed.items) {
        if (!item?.id || !item?.name) continue;
        const slot = validSlots.has(item.recommended) ? item.recommended : "morning";
        items.push({
          id: String(item.id),
          name: String(item.name).slice(0, 80),
          recommended: slot as TimeSlot,
          reason: typeof item.reason === "string" ? item.reason.slice(0, 200) : "",
        });
      }
    }

    const result: ScheduleResponse = {
      ok: true,
      items,
      generalAdvice: typeof parsed?.generalAdvice === "string" ? parsed.generalAdvice.slice(0, 500) : "",
      disclaimer: typeof parsed?.disclaimer === "string"
        ? parsed.disclaimer.slice(0, 300)
        : "This is general information, not medical advice. Consult a healthcare professional for personalized recommendations.",
    };

    return res.status(200).json(result);
  } catch (err: any) {
    if (err?.name === "AbortError") return res.status(200).json({ ok: false, error: "Request timed out" });
    return res.status(500).json({ ok: false, error: "Unexpected error" });
  }
}

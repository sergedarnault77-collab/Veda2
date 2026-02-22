export const config = { runtime: "edge" };

import { requireAuth, unauthorized } from "./lib/auth";

function envOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SYSTEM_PROMPT = [
  "You are Veda, a non-medical wellness assistant.",
  "You explain supplement and ingredient information factually.",
  "You do NOT give medical advice, diagnoses, or treatment recommendations.",
  "You explain WHY something may be flagged and provide neutral context.",
  "If a question involves medication interaction, explain known general mechanisms and advise consulting a professional.",
  "Use calm, non-alarming language. Never say 'stop taking', 'do not use', or 'dangerous'.",
  "",
  "ALWAYS respond with valid JSON matching this exact structure:",
  "{",
  '  "shortAnswer": "1-2 sentence direct answer",',
  '  "explanation": "2-4 sentence factual explanation with mechanism if relevant",',
  '  "whyFlagged": "only if the question is about a flag/warning — explain why, otherwise omit or set to null",',
  '  "practicalNotes": ["optional array of 1-3 practical tips like timing, spacing, food pairing"],',
  '  "disclaimer": "This is general information, not medical advice."',
  "}",
].join("\n");

function buildUserPrompt(
  question: string,
  scanContext: any,
): string {
  const parts: string[] = [];
  const hasScan = Boolean(scanContext.productName);

  if (hasScan) {
    parts.push("=== SCANNED PRODUCT ===");
    parts.push(`Product: ${scanContext.productName}`);

    if (Array.isArray(scanContext.ingredients) && scanContext.ingredients.length > 0) {
      parts.push("\nIngredients/nutrients detected:");
      for (const ing of scanContext.ingredients.slice(0, 30)) {
        const line = `- ${ing.name}: ${ing.amount}${ing.unit}${ing.percentDailyValue ? ` (${ing.percentDailyValue}% DV)` : ""}`;
        parts.push(line);
      }
    }

    if (Array.isArray(scanContext.flags) && scanContext.flags.length > 0) {
      parts.push(`\nFlags: ${scanContext.flags.join(", ")}`);
    }
  }

  if (scanContext.userContext) {
    const uc = scanContext.userContext;
    if (Array.isArray(uc.activeMedications) && uc.activeMedications.length > 0) {
      parts.push(`\n=== USER'S CURRENT MEDICATIONS ===\n${uc.activeMedications.join(", ")}`);
    }
    if (Array.isArray(uc.recentSupplements) && uc.recentSupplements.length > 0) {
      parts.push(`\n=== USER'S CURRENT SUPPLEMENTS ===\n${uc.recentSupplements.join(", ")}`);
    }
  }

  parts.push(`\n=== USER QUESTION ===\n"${question}"`);
  parts.push(hasScan
    ? "\nAnswer the question clearly and concisely using the scan context and user profile above."
    : "\nAnswer the question clearly and concisely using the user's supplement and medication context above."
  );

  return parts.join("\n");
}

export default async function handler(req: Request): Promise<Response> {
  console.log("[ask-scan] handler entered", req.method);
  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    let authUser: any = null;
    try { authUser = await requireAuth(req); } catch { /* best-effort */ }

    const apiKey = envOpenAIKey();
    if (!apiKey) return json({ ok: false, error: "Service unavailable" }, 503);

    const body = await req.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const scanContext = body?.scanContext;

    if (!question) return json({ ok: false, error: "No question provided" }, 400);
    if (question.length > 500) return json({ ok: false, error: "Question too long" }, 400);

    const userMsg = buildUserPrompt(question, scanContext ?? {});

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          max_tokens: 600,
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMsg },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!r.ok) {
        return json({ ok: false, error: "AI service error" }, 502);
      }

      const resp = await r.json();
      const raw = resp?.choices?.[0]?.message?.content;
      if (!raw) return json({ ok: false, error: "Empty response" }, 502);

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json({ ok: false, error: "Unparseable response" }, 502);
      }

      return json({
        ok: true,
        answer: {
          shortAnswer: typeof parsed.shortAnswer === "string" ? parsed.shortAnswer : "",
          explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
          whyFlagged: typeof parsed.whyFlagged === "string" ? parsed.whyFlagged : null,
          practicalNotes: Array.isArray(parsed.practicalNotes)
            ? parsed.practicalNotes.filter((n: any) => typeof n === "string").slice(0, 5)
            : [],
          disclaimer: "This is general information, not medical advice.",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return json({ ok: false, error: "Request timed out" }, 504);
    }
    return json({ ok: false, error: "Internal error" }, 500);
  }
}

// api/analyze.ts
// Vercel Serverless Function (Node runtime)
//
// Purpose (MVP):
// - Accept extracted label text + current user context (meds/supps)
// - Return structured, interpretive "signals" (NO medical advice)
// - This is a STUB: it returns demo output until we wire real OCR + OpenAI

type AnalyzeRequest = {
  inputText: string; // ingredients/label text the user scanned or pasted
  context?: {
    medications?: Array<{ name: string }>;
    supplements?: Array<{ name: string }>;
  };
};

type SignalType =
  | "timing_conflict"
  | "amplification"
  | "duplication"
  | "contraindication_flag"
  | "low_value"
  | "no_notable_interaction";

type Signal = {
  type: SignalType;
  severity: "info" | "possible" | "likely";
  headline: string; // short, user-visible
  explanation: string; // interpretive text only
  confidence: "low" | "medium" | "high";
  related?: string[]; // entity names (optional)
};

type AnalyzeResponse = {
  ok: true;
  signals: Signal[];
  normalized: {
    detectedEntities: string[]; // what we think is present in inputText
  };
  meta: {
    mode: "stub";
    timestampISO: string;
  };
};

function safeJson(res: any) {
  try {
    return JSON.stringify(res);
  } catch {
    return JSON.stringify({ ok: false, error: "Failed to serialize response" });
  }
}

function detectEntities(inputText: string): string[] {
  const t = inputText.toLowerCase();
  const hits: string[] = [];
  const rules: Array<[string, string]> = [
    ["magnesium", "Magnesium"],
    ["caffeine", "Caffeine"],
    ["vitamin d", "Vitamin D"],
    ["melatonin", "Melatonin"],
    ["zinc", "Zinc"],
    ["iron", "Iron"],
    ["ashwagandha", "Ashwagandha"],
    ["st john", "St. John's wort"],
    ["omega", "Omega-3"],
  ];
  for (const [needle, label] of rules) {
    if (t.includes(needle)) hits.push(label);
  }
  return Array.from(new Set(hits));
}

function makeStubSignals(entities: string[], req: AnalyzeRequest): Signal[] {
  // IMPORTANT: interpretive language only; no "stop / should / treat / causes".
  // We'll upgrade these later using OpenAI + a curated taxonomy.

  const meds = (req.context?.medications ?? []).map(m => m.name.toLowerCase());
  const supps = (req.context?.supplements ?? []).map(s => s.name.toLowerCase());

  const signals: Signal[] = [];

  // Example: magnesium + certain antibiotics (demo)
  if (entities.includes("Magnesium") && meds.some(m => m.includes("antibi"))) {
    signals.push({
      type: "timing_conflict",
      severity: "likely",
      headline: "Timing consideration often flagged",
      explanation:
        "Magnesium taken close in time to certain antibiotics is commonly associated with reduced absorption. Some people separate timing to avoid overlap.",
      confidence: "medium",
      related: ["Magnesium", "Antibiotic (reported)"],
    });
  }

  // Caffeine stacking demo
  if (entities.includes("Caffeine") && (supps.join(" ").includes("prework") || meds.join(" ").includes("stimul"))) {
    signals.push({
      type: "amplification",
      severity: "possible",
      headline: "Stimulation may stack",
      explanation:
        "Caffeine combined with other stimulating inputs tends to increase alertness for some people. If you felt wired, this pattern is often mentioned.",
      confidence: "low",
      related: ["Caffeine", "Other stimulant inputs"],
    });
  }

  // Duplication demo (Vitamin D)
  if (entities.includes("Vitamin D") && supps.some(s => s.includes("vitamin d"))) {
    signals.push({
      type: "duplication",
      severity: "possible",
      headline: "Overlap detected in your stack",
      explanation:
        "Vitamin D appears in what you scanned and also in your saved supplements. Overlap can increase totals and reduce incremental value for some people.",
      confidence: "medium",
      related: ["Vitamin D"],
    });
  }

  if (signals.length === 0) {
    signals.push({
      type: "no_notable_interaction",
      severity: "info",
      headline: "No notable interaction pattern found",
      explanation:
        "Based on the text provided and your saved list, no common interaction pattern was flagged. This is not exhaustive and depends on dose and timing.",
      confidence: "low",
    });
  }

  return signals;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).setHeader("Content-Type", "application/json");
      return res.end(safeJson({ ok: false, error: "Method not allowed" }));
    }

    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as AnalyzeRequest;
    const inputText = (body?.inputText ?? "").trim();

    if (!inputText) {
      res.status(400).setHeader("Content-Type", "application/json");
      return res.end(safeJson({ ok: false, error: "inputText is required" }));
    }

    if (inputText.length > 12000) {
      res.status(400).setHeader("Content-Type", "application/json");
      return res.end(safeJson({ ok: false, error: "inputText too long" }));
    }

    const entities = detectEntities(inputText);
    const signals = makeStubSignals(entities, body);

    const out: AnalyzeResponse = {
      ok: true,
      signals,
      normalized: { detectedEntities: entities },
      meta: { mode: "stub", timestampISO: new Date().toISOString() },
    };

    res.status(200).setHeader("Content-Type", "application/json");
    return res.end(safeJson(out));
  } catch (e: any) {
    res.status(500).setHeader("Content-Type", "application/json");
    return res.end(safeJson({ ok: false, error: e?.message ?? "Server error" }));
  }
}

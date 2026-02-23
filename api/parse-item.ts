export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
function setTraceHeaders(req: any, res: any) {
  const rid = (req.headers?.["x-veda-request-id"] as string) || "";
  if (rid) res.setHeader("x-veda-request-id", rid);
  res.setHeader("x-veda-handler-entered", "1");
  res.setHeader("content-type", "application/json; charset=utf-8");
}

type AnalyzeResponse = {
  ok: boolean;
  productName: string | null;
  transcription: string | null;
  nutrients: Array<{
    nutrientId: string;
    name: string;
    unit: "mg" | "µg" | "IU" | "g" | "mL";
    amountToday: number;
    dailyReference: number;
  }>;
  normalized: {
    detectedEntities: string[];
    categories: Record<string, string[]>;
  };
  meta: { mode: "openai" | "stub"; reason?: string };
};

type ParsedItem = {
  displayName: string;
  brand: string | null;
  form: "tablet" | "capsule" | "powder" | "liquid" | "other" | null;
  strengthPerUnit: number | null;
  strengthUnit: "mg" | "µg" | "g" | "IU" | "mL" | null;
  servingSizeText: string | null;
  rawTextHints: string[];
  confidence: number;
  mode: "openai" | "stub";
  labelTranscription: string | null;
  nutrients: AnalyzeResponse["nutrients"];
  ingredientsDetected: string[];
};

function stubItem(reason: string): ParsedItem {
  return {
    displayName: "Unrecognized item",
    brand: null,
    form: null,
    strengthPerUnit: null,
    strengthUnit: null,
    servingSizeText: null,
    rawTextHints: [reason].slice(0, 8),
    confidence: 0,
    mode: "stub",
    labelTranscription: null,
    nutrients: [],
    ingredientsDetected: [],
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setTraceHeaders(req, res);
  console.log("[parse-item] handler entered", { method: req.method, url: req.url, rid: req.headers["x-veda-request-id"] });
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

    try { const { requireAuth } = await import("./_lib/auth"); await requireAuth(req); } catch { /* best-effort */ }

    const body = req.body || {};
    if (!body) return res.status(200).json({ ok: true, item: stubItem("Invalid JSON") });

    const kind = body.kind;
    const frontImageDataUrl = body.frontImageDataUrl;
    const ingredientsImageDataUrl = body.ingredientsImageDataUrl;

    if (kind !== "med" && kind !== "supp") {
      return res.status(200).json({ ok: true, item: stubItem("Invalid kind") });
    }
    if (
      typeof frontImageDataUrl !== "string" ||
      typeof ingredientsImageDataUrl !== "string" ||
      !frontImageDataUrl.startsWith("data:image/") ||
      !ingredientsImageDataUrl.startsWith("data:image/")
    ) {
      return res.status(200).json({ ok: true, item: stubItem("Missing or invalid images") });
    }

    let origin: string;
    try {
      origin = `https://${req.headers.host}`;
    } catch {
      origin = "";
    }
    const r = await fetch(`${origin}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frontImageDataUrl, ingredientsImageDataUrl }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(200).json({ ok: true, item: stubItem(`analyze HTTP ${r.status}: ${t.slice(0, 140)}`) });
    }

    const a = (await r.json().catch(() => null)) as AnalyzeResponse | null;
    if (!a || a.ok !== true) {
      return res.status(200).json({ ok: true, item: stubItem("Unexpected analyze response") });
    }

    const mode = a.meta?.mode === "openai" ? "openai" : "stub";
    const entities = Array.isArray(a.normalized?.detectedEntities) ? a.normalized.detectedEntities : [];
    const confidence =
      mode === "openai"
        ? entities.length > 0 || (a.nutrients?.length ?? 0) > 0 ? 0.8 : 0.4
        : 0;

    const item: ParsedItem = {
      displayName: a.productName?.trim() ? a.productName.trim() : kind === "med" ? "New medication" : "New supplement",
      brand: null,
      form: null,
      strengthPerUnit: null,
      strengthUnit: null,
      servingSizeText: null,
      rawTextHints: [
        ...(a.meta?.reason ? [a.meta.reason] : []),
        ...(a.transcription ? ["label transcribed"] : ["no transcription"]),
      ].slice(0, 8),
      confidence,
      mode,
      labelTranscription: a.transcription ?? null,
      nutrients: Array.isArray(a.nutrients) ? a.nutrients : [],
      ingredientsDetected: entities,
    };

    return res.status(200).json({ ok: true, item });
  } catch (e: any) {
    return res.status(200).json({ ok: true, item: stubItem(`Exception: ${String(e?.message ?? e).slice(0, 140)}`) });
  }
}

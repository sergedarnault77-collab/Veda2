// api/parse-item.ts
// Backwards-compat wrapper: old clients still calling /api/parse-item
// are transparently served by the new /api/analyze pipeline.

export const config = { runtime: "nodejs" };

import { requireAuth } from "./lib/auth";
import { traceHeadersEdge } from "./lib/traceHeaders";

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
  confidence: number; // 0..1
  mode: "openai" | "stub";
  // new fields used by the UI
  labelTranscription: string | null;
  nutrients: AnalyzeResponse["nutrients"];
  ingredientsDetected: string[];
};

let _traceH: Record<string, string> = {};
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ..._traceH, "content-type": "application/json; charset=utf-8" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  _traceH = traceHeadersEdge(req);
  console.log("[parse-item] handler entered", { method: req.method, url: req.url, rid: req.headers.get("x-veda-request-id") });
  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "POST only" }, 405);
    }

    let authUser: any = null;
    try { authUser = await requireAuth(req); } catch { /* best-effort */ }

    const body = (await req.json().catch(() => null)) as any;
    if (!body) return json({ ok: true, item: stubItem("Invalid JSON") });

    const kind = body.kind;
    const frontImageDataUrl = body.frontImageDataUrl;
    const ingredientsImageDataUrl = body.ingredientsImageDataUrl;

    if (kind !== "med" && kind !== "supp") {
      return json({ ok: true, item: stubItem("Invalid kind") });
    }
    if (
      typeof frontImageDataUrl !== "string" ||
      typeof ingredientsImageDataUrl !== "string" ||
      !frontImageDataUrl.startsWith("data:image/") ||
      !ingredientsImageDataUrl.startsWith("data:image/")
    ) {
      return json({ ok: true, item: stubItem("Missing or invalid images") });
    }

    // Call the new pipeline on the same origin
    let origin: string;
    try {
      origin = new URL(req.url).origin;
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
      return json({ ok: true, item: stubItem(`analyze HTTP ${r.status}: ${t.slice(0, 140)}`) });
    }

    const a = (await r.json().catch(() => null)) as AnalyzeResponse | null;
    if (!a || a.ok !== true) {
      return json({ ok: true, item: stubItem("Unexpected analyze response") });
    }

    const mode = a.meta?.mode === "openai" ? "openai" : "stub";
    const entities = Array.isArray(a.normalized?.detectedEntities) ? a.normalized.detectedEntities : [];
    const confidence =
      mode === "openai"
        ? entities.length > 0 || (a.nutrients?.length ?? 0) > 0
          ? 0.8
          : 0.4
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

    return json({ ok: true, item });
  } catch (e: any) {
    return json({ ok: true, item: stubItem(`Exception: ${String(e?.message ?? e).slice(0, 140)}`) });
  }
}

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

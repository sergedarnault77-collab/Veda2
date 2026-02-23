export const VEDA_BUILD_ID =
  (import.meta as any)?.env?.VITE_VEDA_BUILD_ID ||
  (globalThis as any).__VEDA_BUILD_ID__ ||
  "dev";

export function isWebKit(): boolean {
  const ua = navigator.userAgent || "";
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
}

export function shortRid(): string {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

export function withCacheBust(path: string): string {
  const u = new URL(path, location.origin);
  u.searchParams.set("__b", VEDA_BUILD_ID);
  return u.pathname + u.search;
}

export function headersToLowerRecord(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  try { h.forEach((v, k) => (out[k.toLowerCase()] = v)); } catch {}
  return out;
}

export async function safeParseResponse(resp: Response): Promise<{ kind: "json"; json: any } | { kind: "text"; text: string }> {
  const ct = resp.headers.get("content-type")?.toLowerCase() || "";
  if (ct.includes("application/json")) {
    try { return { kind: "json", json: await resp.json() }; } catch {}
  }
  try { return { kind: "text", text: await resp.text() }; } catch { return { kind: "text", text: "" }; }
}

export type ScanTrace = {
  ts: number;
  endpoint: string;
  url: string;
  status: number;
  rid: string;
  build: string;
  webkit: "1" | "0";
  handler?: string;
  vercel?: string;
  ct?: string | null;
  msg?: string;
};

export function formatTrace(t: ScanTrace): string {
  return [
    `build=${t.build}`,
    `webkit=${t.webkit}`,
    `endpoint=${t.endpoint}`,
    `status=${t.status}`,
    `rid=${t.rid}`,
    `handler=${t.handler || "?"}`,
    `vercel=${t.vercel || "?"}`,
    `ct=${t.ct || "?"}`,
    `url=${t.url}`,
    t.msg ? `msg=${t.msg}` : "",
  ].filter(Boolean).join(" | ");
}

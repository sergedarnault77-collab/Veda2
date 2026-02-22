import { shortId, VEDA_BUILD_ID } from "./debugBuild";

export type ApiOk<T> = {
  ok: true;
  status: number;
  data: T;
  headers: Record<string, string>;
  requestId: string;
  url: string;
};
export type ApiErr = {
  ok: false;
  status: number;
  error: {
    code: string;
    message: string;
    details?: any;
    contentType?: string | null;
    rawTextSnippet?: string;
  };
  headers: Record<string, string>;
  requestId: string;
  url: string;
};
export type ApiResult<T> = ApiOk<T> | ApiErr;

function headersToRecord(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  try { h.forEach((v, k) => (out[k.toLowerCase()] = v)); } catch {}
  return out;
}

export function readAccessTokenFromStorage(): string | null {
  try {
    const direct = localStorage.getItem("access_token") || localStorage.getItem("sb-access-token");
    if (direct && direct.length > 10) return direct;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.includes("auth") && !k.includes("sb-")) continue;
      const raw = localStorage.getItem(k);
      if (!raw || raw.length < 20) continue;

      try {
        const j = JSON.parse(raw);
        const token =
          j?.access_token ||
          j?.currentSession?.access_token ||
          j?.session?.access_token ||
          j?.data?.session?.access_token;
        if (typeof token === "string" && token.length > 10) return token;
      } catch {
        const m = raw.match(/"access_token"\s*:\s*"([^"]+)"/);
        if (m?.[1] && m[1].length > 10) return m[1];
      }
    }
  } catch {}
  return null;
}

async function safeParse(resp: Response): Promise<{ kind: "json"; json: any } | { kind: "text"; text: string }> {
  const ct = resp.headers.get("content-type")?.toLowerCase() || "";
  if (ct.includes("application/json")) {
    try { return { kind: "json", json: await resp.json() }; } catch {}
  }
  try { return { kind: "text", text: await resp.text() }; } catch { return { kind: "text", text: "" }; }
}

function withCacheBust(path: string, key: string): string {
  const u = new URL(path, location.origin);
  u.searchParams.set("__b", key);
  return u.pathname + u.search;
}

export async function apiFetchSafe<T = any>(
  path: string,
  init?: RequestInit & { json?: any; timeoutMs?: number; cacheBustKey?: string }
): Promise<ApiResult<T>> {
  const requestId = shortId();
  const timeoutMs = init?.timeoutMs ?? 30000;
  const cacheKey = init?.cacheBustKey || VEDA_BUILD_ID;
  const url = withCacheBust(path, cacheKey);

  const headers = new Headers(init?.headers || {});
  if (!headers.has("accept")) headers.set("accept", "application/json");
  headers.set("x-veda-request-id", requestId);
  headers.set("x-veda-build-id", VEDA_BUILD_ID);

  const token = readAccessTokenFromStorage();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);

  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, { ...init, headers, body, signal: controller.signal });
  } catch (e: any) {
    clearTimeout(t);
    return {
      ok: false,
      status: 0,
      requestId,
      url,
      headers: {},
      error: { code: "FETCH_FAILED", message: String(e?.message || e), details: { name: e?.name, stack: e?.stack } },
    };
  } finally {
    clearTimeout(t);
  }

  const hdrs = headersToRecord(resp.headers);
  const parsed = await safeParse(resp);

  if (resp.ok && parsed.kind === "json") {
    return { ok: true, status: resp.status, data: parsed.json as T, headers: hdrs, requestId, url };
  }

  if (!resp.ok && parsed.kind === "json") {
    const j: any = parsed.json;
    return {
      ok: false,
      status: resp.status,
      headers: hdrs,
      requestId,
      url,
      error: {
        code: j?.error?.code || j?.code || "HTTP_ERROR",
        message: j?.error?.message || j?.message || j?.error || `HTTP ${resp.status}`,
        details: j?.error?.details || j?.details || j,
        contentType: resp.headers.get("content-type"),
      },
    };
  }

  const text = parsed.kind === "text" ? parsed.text : "";
  const ct = resp.headers.get("content-type");
  return {
    ok: false,
    status: resp.status,
    headers: hdrs,
    requestId,
    url,
    error: {
      code: resp.ok ? "NON_JSON_SUCCESS" : "NON_JSON_ERROR",
      message: resp.ok ? "Server returned non-JSON success response." : `HTTP ${resp.status} — Non-JSON response`,
      contentType: ct,
      rawTextSnippet: text.slice(0, 300),
    },
  };
}

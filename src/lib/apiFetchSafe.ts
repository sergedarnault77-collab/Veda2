export type ApiOk<T> = { ok: true; status: number; data: T; headers?: Record<string, string> };
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
  headers?: Record<string, string>;
};
export type ApiResult<T> = ApiOk<T> | ApiErr;

function getHeadersRecord(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    h.forEach((v, k) => (out[k.toLowerCase()] = v));
  } catch {}
  return out;
}

/**
 * Best-effort token reader that avoids calling Supabase SDK in WebKit.
 * We look for any stored access token in common locations.
 */
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
          j?.data?.session?.access_token ||
          j?.user?.access_token;
        if (typeof token === "string" && token.length > 10) return token;
      } catch {
        if (raw.includes("access_token")) {
          const m = raw.match(/"access_token"\s*:\s*"([^"]+)"/);
          if (m?.[1] && m[1].length > 10) return m[1];
        }
      }
    }
  } catch {}
  return null;
}

async function safeParseJson(resp: Response): Promise<{ ok: true; json: any } | { ok: false; text: string }> {
  const ct = resp.headers.get("content-type");
  if (ct && ct.toLowerCase().includes("application/json")) {
    try {
      const json = await resp.json();
      return { ok: true, json };
    } catch {
      // fallthrough to text
    }
  }
  try {
    const text = await resp.text();
    return { ok: false, text };
  } catch {
    return { ok: false, text: "" };
  }
}

export async function apiFetchSafe<T = any>(
  path: string,
  init?: RequestInit & { json?: any; timeoutMs?: number }
): Promise<ApiResult<T>> {
  const timeoutMs = init?.timeoutMs ?? 30000;

  const headers = new Headers(init?.headers || {});
  if (!headers.has("accept")) headers.set("accept", "application/json");

  const token = readAccessTokenFromStorage();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);

  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response | null = null;
  try {
    resp = await fetch(path, {
      ...init,
      body,
      headers,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(t);
    const msg = String(e?.message || e);
    return {
      ok: false,
      status: 0,
      error: {
        code: "FETCH_FAILED",
        message: msg,
        details: { name: e?.name, stack: e?.stack },
      },
    };
  } finally {
    clearTimeout(t);
  }

  const headersRec = getHeadersRecord(resp.headers);
  const parsed = await safeParseJson(resp);

  if (resp.ok) {
    if (parsed.ok) {
      return { ok: true, status: resp.status, data: parsed.json as T, headers: headersRec };
    }
    return {
      ok: false,
      status: resp.status,
      error: {
        code: "NON_JSON_SUCCESS",
        message: "Server returned non-JSON response.",
        contentType: resp.headers.get("content-type"),
        rawTextSnippet: (parsed as any).text?.slice(0, 300),
      },
      headers: headersRec,
    };
  }

  if (parsed.ok) {
    const j: any = parsed.json;
    return {
      ok: false,
      status: resp.status,
      error: {
        code: j?.error?.code || j?.code || "HTTP_ERROR",
        message: j?.error?.message || j?.message || j?.error || `HTTP ${resp.status}`,
        details: j?.error?.details || j?.details || j,
        contentType: resp.headers.get("content-type"),
      },
      headers: headersRec,
    };
  }

  return {
    ok: false,
    status: resp.status,
    error: {
      code: "NON_JSON_ERROR",
      message: `HTTP ${resp.status} — Non-JSON response`,
      contentType: resp.headers.get("content-type"),
      rawTextSnippet: (parsed as any).text?.slice(0, 300),
    },
    headers: headersRec,
  };
}

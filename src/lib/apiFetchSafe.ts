import { headersToLowerRecord, safeParseResponse, shortRid, withCacheBust, VEDA_BUILD_ID } from "./scan-proof";

export type ApiResult<T> =
  | { ok: true; status: number; data: T; headers: Record<string,string>; rid: string; url: string }
  | { ok: false; status: number; error: { code: string; message: string; details?: any; ct?: string|null; snippet?: string }; headers: Record<string,string>; rid: string; url: string };

function readTokenFromStorage(): string | null {
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

export async function apiFetchSafe<T=any>(
  path: string,
  init?: RequestInit & { json?: any; timeoutMs?: number; endpointName?: string }
): Promise<ApiResult<T>> {
  const rid = shortRid();
  const url = withCacheBust(path);

  const headers = new Headers(init?.headers || {});
  headers.set("accept", "application/json");
  headers.set("x-veda-request-id", rid);
  headers.set("x-veda-build-id", VEDA_BUILD_ID);

  const token = readTokenFromStorage();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);

  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init?.timeoutMs ?? 60000);

  let resp: Response;
  try {
    resp = await fetch(url, { ...init, headers, body, signal: controller.signal });
  } catch (e:any) {
    clearTimeout(t);
    return { ok:false, status:0, rid, url, headers:{}, error:{ code:"FETCH_FAILED", message:String(e?.message||e), details:{ name:e?.name, stack:e?.stack } } };
  } finally {
    clearTimeout(t);
  }

  const hdrs = headersToLowerRecord(resp.headers);
  const parsed = await safeParseResponse(resp);
  const ct = resp.headers.get("content-type");

  if (resp.ok && parsed.kind === "json") {
    return { ok:true, status:resp.status, data:parsed.json as T, headers:hdrs, rid, url };
  }

  if (!resp.ok && parsed.kind === "json") {
    const j:any = parsed.json;
    return {
      ok:false, status:resp.status, rid, url, headers:hdrs,
      error:{ code:j?.error?.code || j?.code || "HTTP_ERROR", message:j?.error?.message || j?.message || `HTTP ${resp.status}`, details:j?.error?.details || j?.details || j, ct }
    };
  }

  const text = parsed.kind === "text" ? parsed.text : "";
  return {
    ok:false, status:resp.status, rid, url, headers:hdrs,
    error:{ code: resp.ok ? "NON_JSON_SUCCESS" : "NON_JSON_ERROR", message: resp.ok ? "Non-JSON success response" : `HTTP ${resp.status} — Non-JSON response`, ct, snippet:text.slice(0,300) }
  };
}

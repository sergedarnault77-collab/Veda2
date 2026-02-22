/**
 * SDK-free auth + request layer.
 *
 * Uses XMLHttpRequest exclusively to avoid the Safari/WebKit bug where
 * fetch()'s internal Request constructor throws "The string did not
 * match the expected pattern" for large string bodies.
 * XHR uses a completely different WebKit code path and is not affected.
 */

const SUPABASE_URL = (
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL) || ""
).trim();
const SUPABASE_ANON_KEY = (
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || ""
).trim();

function findAuthStorageKey(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return key;
    }
  } catch {}
  return null;
}

function readSession(): { access_token: string; refresh_token: string } | null {
  try {
    const key = findAuthStorageKey();
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const access = parsed?.access_token ?? parsed?.currentSession?.access_token;
    const refresh = parsed?.refresh_token ?? parsed?.currentSession?.refresh_token;
    if (typeof access === "string" && access) return { access_token: access, refresh_token: refresh ?? "" };
  } catch {}
  return null;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 < Date.now() - 30_000;
  } catch {
    return false;
  }
}

async function refreshTokenDirect(): Promise<string | null> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    const session = readSession();
    if (!session?.refresh_token) return null;

    const resp = await xhrRequest(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      "POST",
      {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      JSON.stringify({ refresh_token: session.refresh_token }),
    );

    if (resp.status < 200 || resp.status >= 300) return null;
    const data = JSON.parse(resp.body);
    if (!data?.access_token) return null;

    const storageKey = findAuthStorageKey();
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
    }
    return data.access_token as string;
  } catch {
    return null;
  }
}

function collectHeaders(init: RequestInit | undefined, token: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const src = init?.headers;
  if (src) {
    if (src instanceof Headers) {
      src.forEach((v, k) => { out[k] = v; });
    } else if (Array.isArray(src)) {
      for (const [k, v] of src) out[k] = v;
    } else {
      Object.assign(out, src);
    }
  }
  if (token && !out["Authorization"] && !out["authorization"]) {
    out["Authorization"] = `Bearer ${token}`;
  }
  return out;
}

interface XhrResult { status: number; body: string; contentType: string }

/**
 * Pure XMLHttpRequest — avoids fetch() entirely.
 */
function xhrRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string | null,
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) {
      try { xhr.setRequestHeader(k, v); } catch {}
    }
    xhr.timeout = 120_000;
    xhr.onload = () => {
      resolve({
        status: xhr.status,
        body: xhr.responseText,
        contentType: xhr.getResponseHeader("content-type") || "",
      });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error("Request timed out (120s)"));
    xhr.send(body ?? null);
  });
}

/**
 * Wrapper that injects the Supabase auth token and sends via XHR.
 * Drop-in replacement for fetch() — returns a standard Response object.
 */
export async function apiFetch(
  input: string | URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  let session = readSession();
  let token = session?.access_token ?? null;

  if (token && isTokenExpired(token)) {
    token = await refreshTokenDirect() ?? token;
  }

  const url = typeof input === "string" ? input : String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? init.body : null;
  const headers = collectHeaders(init, token);

  let result = await xhrRequest(url, method, headers, body);

  if (result.status === 401 && token) {
    const fresh = await refreshTokenDirect();
    if (fresh && fresh !== token) {
      const freshHeaders = collectHeaders(init, fresh);
      result = await xhrRequest(url, method, freshHeaders, body);
    }
  }

  return new Response(result.body, {
    status: result.status,
    headers: { "content-type": result.contentType },
  });
}

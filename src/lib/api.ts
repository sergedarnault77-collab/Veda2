/**
 * SDK-free auth token management + Safari-safe fetch.
 *
 * Safari/WebKit bug: fetch() throws "The string did not match the
 * expected pattern" when the Request body is a large string.
 * Fix: always send Blob bodies; fall back to XMLHttpRequest if fetch fails.
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

    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.access_token) return null;

    const storageKey = findAuthStorageKey();
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {}
    }
    return data.access_token as string;
  } catch {
    return null;
  }
}

function buildHeaders(init: RequestInit | undefined, token: string | null): Record<string, string> {
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

/**
 * XMLHttpRequest fallback: avoids Safari's fetch() body-parsing bug entirely.
 */
function xhrFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: Blob | string | null,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.onload = () => {
      resolve(new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: { "content-type": xhr.getResponseHeader("content-type") || "" },
      }));
    };
    xhr.onerror = () => reject(new Error(`XHR network error`));
    xhr.ontimeout = () => reject(new Error(`XHR timeout`));
    xhr.timeout = 120_000;
    xhr.send(body ?? null);
  });
}

/**
 * Safari-safe request: try fetch with Blob body first, fall back to XHR.
 */
async function safeFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string | null,
): Promise<Response> {
  const blobBody = body ? new Blob([body], { type: headers["content-type"] || headers["Content-Type"] || "application/json" }) : undefined;

  try {
    return await fetch(url, { method, headers, body: blobBody });
  } catch (fetchErr: any) {
    console.warn("[apiFetch] fetch() failed, falling back to XHR:", fetchErr?.message);
    return xhrFetch(url, method, headers, blobBody ?? body);
  }
}

/**
 * Wrapper around fetch() that injects Supabase auth token.
 * Uses Blob bodies + XHR fallback to work around Safari bugs.
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
  const headers = buildHeaders(init, token);

  const res = await safeFetch(url, method, headers, body);

  if (res.status === 401 && token) {
    const fresh = await refreshTokenDirect();
    if (fresh && fresh !== token) {
      const freshHeaders = buildHeaders(init, fresh);
      return safeFetch(url, method, freshHeaders, body);
    }
  }

  return res;
}

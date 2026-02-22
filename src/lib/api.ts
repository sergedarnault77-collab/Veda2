/**
 * SDK-free auth token management.
 *
 * Safari/WebKit bugs addressed:
 * 1. Supabase SDK uses `new URL()` internally → lazy-loaded in supabase.ts
 * 2. Safari's `fetch()` Request constructor throws "The string did not
 *    match the expected pattern" on large string bodies (>~500KB).
 *    Fix: convert body strings to Blob before calling fetch().
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

/**
 * Refresh the session by calling Supabase's token endpoint directly.
 * No SDK involved -- just a plain HTTP POST.
 */
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

function buildHeaders(init: RequestInit | undefined, token: string | null): Headers {
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

/**
 * Safari-safe fetch: convert string bodies to Blob to avoid the
 * "The string did not match the expected pattern" error that Safari
 * throws in its Request constructor for large string payloads.
 */
function safeFetch(input: string | URL | RequestInfo, init?: RequestInit): Promise<Response> {
  if (init?.body && typeof init.body === "string" && init.body.length > 50_000) {
    const contentType =
      new Headers(init.headers).get("content-type") || "application/json";
    const blob = new Blob([init.body], { type: contentType });
    const { body: _, ...rest } = init;
    return fetch(input, { ...rest, body: blob });
  }
  return fetch(input, init);
}

/**
 * Wrapper around fetch() that injects the Supabase auth token.
 *
 * Uses safeFetch() to work around Safari's large-body bug:
 * 1. Read token from localStorage
 * 2. If expired, refresh via direct HTTP to Supabase /auth/v1/token
 * 3. Send request; on 401, try one refresh + retry
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

  const headers = buildHeaders(init, token);
  const res = await safeFetch(input, { ...init, headers });

  if (res.status === 401 && token) {
    const fresh = await refreshTokenDirect();
    if (fresh && fresh !== token) {
      return safeFetch(input, { ...init, headers: buildHeaders(init, fresh) });
    }
  }

  return res;
}

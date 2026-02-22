import { supabase } from "./supabase";

/**
 * Read the Supabase access_token directly from localStorage.
 * This is the ONLY safe way on Safari/WebKit, which throws
 * "The string did not match the expected pattern" from the SDK's
 * internal URL constructor during getSession/refreshSession.
 */
function getTokenFromStorage(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const token = parsed?.access_token || parsed?.currentSession?.access_token;
        if (token && typeof token === "string") return token;
      }
    }
  } catch {
    // localStorage unavailable or corrupt
  }
  return null;
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 < Date.now() - 30_000;
  } catch {
    return false;
  }
}

async function sdkGetToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function sdkRefreshToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.refreshSession();
    return data?.session?.access_token ?? null;
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
 * Wrapper around fetch() that injects the Supabase auth token.
 *
 * Token resolution strategy (localStorage-first to avoid Safari SDK bugs):
 * 1. Read token from localStorage (instant, no SDK calls, safe on all browsers)
 * 2. If token looks expired, try SDK refresh (wrapped in try-catch)
 * 3. If still nothing, try SDK getSession as last resort
 * 4. Send request; on 401, retry with refreshed token
 */
export async function apiFetch(
  input: string | URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  let token = getTokenFromStorage();

  if (!token || isTokenExpired(token)) {
    const sdkToken = await sdkGetToken();
    if (sdkToken) {
      token = sdkToken;
    } else if (!token || isTokenExpired(token)) {
      const refreshed = await sdkRefreshToken();
      if (refreshed) token = refreshed;
    }
  }

  const headers = buildHeaders(init, token);
  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 && token) {
    const refreshed = await sdkRefreshToken();
    const freshToken = refreshed || getTokenFromStorage();
    if (freshToken && freshToken !== token) {
      const retryHeaders = buildHeaders(init, freshToken);
      return fetch(input, { ...init, headers: retryHeaders });
    }
  }

  return res;
}

import { supabase } from "./supabase";

/**
 * Last-resort fallback: read the Supabase access_token directly from
 * localStorage when the SDK's getSession/refreshSession throws (Safari bug).
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
    // localStorage unavailable or corrupt — give up
  }
  return null;
}

async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch (e) {
    console.warn("[apiFetch] getSession failed, trying localStorage:", e);
    return getTokenFromStorage();
  }
}

async function refreshAndGetToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.refreshSession();
    return data?.session?.access_token ?? null;
  } catch (e) {
    console.warn("[apiFetch] refreshSession failed, trying localStorage:", e);
    return getTokenFromStorage();
  }
}

function buildHeaders(init: RequestInit | undefined, token: string | null): Headers {
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

function isPatternError(e: unknown): boolean {
  return String((e as any)?.message || e).includes("did not match the expected pattern");
}

/**
 * Wrapper around fetch() that injects the Supabase auth token.
 * Falls back to reading the token from localStorage if the SDK throws
 * (common Safari/WebKit bug). Auth failures never block the API call.
 * Retries once on the Safari "pattern" error with a brief delay.
 */
export async function apiFetch(
  input: string | URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  return apiFetchInner(input, init, 0);
}

async function apiFetchInner(
  input: string | URL | RequestInfo,
  init: RequestInit | undefined,
  attempt: number,
): Promise<Response> {
  let token: string | null = null;

  try {
    token = await getToken();
    if (!token) {
      token = await refreshAndGetToken();
    }
    if (!token) {
      token = getTokenFromStorage();
    }
  } catch (e) {
    if (isPatternError(e) && attempt === 0) {
      console.warn("[apiFetch] Safari pattern error on token, retrying in 500ms");
      await new Promise((r) => setTimeout(r, 500));
      return apiFetchInner(input, init, 1);
    }
    console.warn("[apiFetch] All token methods failed, trying localStorage:", e);
    token = getTokenFromStorage();
  }

  let res: Response;
  try {
    const headers = buildHeaders(init, token);
    res = await fetch(input, { ...init, headers });
  } catch (fetchErr) {
    if (isPatternError(fetchErr) && attempt === 0) {
      console.warn("[apiFetch] Safari pattern error on fetch, retrying in 500ms");
      await new Promise((r) => setTimeout(r, 500));
      return apiFetchInner(input, init, 1);
    }
    throw fetchErr;
  }

  if (res.status === 401) {
    try {
      let freshToken = await refreshAndGetToken();
      if (!freshToken) freshToken = getTokenFromStorage();
      if (freshToken && freshToken !== token) {
        const retryHeaders = buildHeaders(init, freshToken);
        return fetch(input, { ...init, headers: retryHeaders });
      }
    } catch (e) {
      console.warn("[apiFetch] Auth retry failed:", e);
    }
  }

  return res;
}

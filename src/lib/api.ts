import { supabase } from "./supabase";

async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch (e) {
    console.warn("[apiFetch] getSession failed:", e);
    return null;
  }
}

async function refreshAndGetToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.refreshSession();
    return data?.session?.access_token ?? null;
  } catch (e) {
    console.warn("[apiFetch] refreshSession failed:", e);
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
 * Auth failures never block the underlying API call.
 */
export async function apiFetch(
  input: string | URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  let token: string | null = null;

  try {
    token = await getToken();
    if (!token) {
      token = await refreshAndGetToken();
    }
  } catch (e) {
    console.warn("[apiFetch] Auth token retrieval failed, proceeding without:", e);
  }

  const headers = buildHeaders(init, token);
  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    try {
      const freshToken = await refreshAndGetToken();
      if (freshToken) {
        const retryHeaders = buildHeaders(init, freshToken);
        return fetch(input, { ...init, headers: retryHeaders });
      }
    } catch (e) {
      console.warn("[apiFetch] Auth retry failed:", e);
    }
  }

  return res;
}

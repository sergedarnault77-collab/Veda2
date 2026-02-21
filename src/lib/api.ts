import { supabase } from "./supabase";

async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function refreshAndGetToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
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
 * On 401, refreshes the session and retries once.
 */
export async function apiFetch(
  input: string | URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const token = await getToken();
  const headers = buildHeaders(init, token);

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 && token) {
    const freshToken = await refreshAndGetToken();
    if (freshToken && freshToken !== token) {
      const retryHeaders = buildHeaders(init, freshToken);
      return fetch(input, { ...init, headers: retryHeaders });
    }
  }

  return res;
}

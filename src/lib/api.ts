import { supabase } from "./supabase";

/**
 * Wrapper around fetch() that injects the Supabase auth token.
 * Drop-in replacement: same signature as window.fetch().
 */
export async function apiFetch(
  input: string | URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  let token: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  } catch { /* proceed without token */ }

  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

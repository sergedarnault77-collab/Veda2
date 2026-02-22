// Safari-safe fetch wrapper for Veda
// Fixes: "The string did not match the expected pattern"
// Root cause: Supabase auth SDK + Safari/WebKit URL parsing bug
// Strategy: NEVER call supabase.auth.getSession() on Safari.
// Read token directly from storage instead. Harden response parsing.

import { supabase } from "./supabase";

/* ---------- Safari / WebKit detection ---------- */
function isSafariOrWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave/i.test(ua);
  const isWebKit = /AppleWebKit/i.test(ua);
  return isSafari || isWebKit;
}

/* ---------- Extract Supabase access token WITHOUT SDK ---------- */
function getAccessTokenFromStorage(): string | null {
  const stores: Storage[] = [];
  if (typeof localStorage !== "undefined") stores.push(localStorage);
  if (typeof sessionStorage !== "undefined") stores.push(sessionStorage);

  for (const store of stores) {
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key || !key.endsWith("-auth-token")) continue;

        const raw = store.getItem(key);
        if (!raw) continue;

        try {
          const obj = JSON.parse(raw);

          if (typeof obj?.access_token === "string") return obj.access_token;
          if (typeof obj?.session?.access_token === "string") return obj.session.access_token;
          if (typeof obj?.currentSession?.access_token === "string") return obj.currentSession.access_token;
          if (typeof obj?.data?.session?.access_token === "string") return obj.data.session.access_token;
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/* ---------- Best-effort token getter ---------- */
async function getAccessToken(): Promise<string | null> {
  const fromStorage = getAccessTokenFromStorage();
  if (fromStorage) return fromStorage;

  if (isSafariOrWebKit()) return null;

  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? getAccessTokenFromStorage();
  } catch {
    return getAccessTokenFromStorage();
  }
}

/* ---------- Safe response reader ---------- */
async function readResponseSafe(res: Response): Promise<{
  json: any | null;
  text: string;
}> {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

/* ---------- Main export ---------- */
export async function apiFetchSafe<T = any>(
  path: string,
  options: RequestInit & { json?: any } = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  let body: BodyInit | undefined = options.body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  const token = await getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(path, { ...options, headers, body });
  } catch (err: any) {
    return { ok: false, status: 0, error: err?.message || "Network error" };
  }

  const parsed = await readResponseSafe(res);

  if (!res.ok) {
    const msg =
      parsed.json?.error ||
      parsed.json?.message ||
      parsed.text?.slice(0, 200) ||
      `${res.status} ${res.statusText}`;

    return { ok: false, status: res.status, error: msg };
  }

  if (!parsed.json) {
    return {
      ok: false,
      status: res.status,
      error: "Expected JSON but received non-JSON response",
    };
  }

  return { ok: true, data: parsed.json as T };
}

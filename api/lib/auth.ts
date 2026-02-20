import { createClient } from "@supabase/supabase-js";

export type AuthUser = { id: string; email: string };

function env(key: string): string {
  const e = (globalThis as any)?.process?.env ?? {};
  return (e[key] || "").trim();
}

function getSupabaseConfig() {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  return { url, key };
}

/**
 * Verify a Supabase access token and return the user, or null if invalid.
 */
export async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  try {
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  } catch {
    return null;
  }
}

/** Extract bearer token from a Web Request or Node IncomingMessage. */
export function extractToken(req: Request | { headers: Record<string, any> }): string | null {
  let raw: string | undefined;
  if (typeof (req as any).headers?.get === "function") {
    raw = (req as Request).headers.get("authorization") ?? undefined;
  } else {
    const h = (req as any).headers?.authorization;
    raw = Array.isArray(h) ? h[0] : h;
  }
  const token = (raw || "").replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

/**
 * Combined: extract + verify. Works with both Edge Request and Node VercelRequest.
 */
export async function requireAuth(req: Request | { headers: Record<string, any> }): Promise<AuthUser | null> {
  const token = extractToken(req);
  if (!token) return null;
  return verifyToken(token);
}

export function unauthorized(message = "Authentication required") {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

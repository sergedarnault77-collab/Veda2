export type AuthUser = { id: string; email: string };

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  return { url, key };
}

let _sb: any = null;
let _sbConfigHash = "";

async function getSupabase() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  const hash = url + "|" + key;
  if (_sb && _sbConfigHash === hash) return _sb;

  const { createClient } = await import("@supabase/supabase-js");
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  _sbConfigHash = hash;
  return _sb;
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const sb = await getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  } catch {
    return null;
  }
}

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

export async function requireAuth(req: Request | { headers: Record<string, any> }): Promise<AuthUser | null> {
  const token = extractToken(req);
  if (!token) return null;
  return verifyToken(token);
}

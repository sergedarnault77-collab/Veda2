import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

let _instance: SupabaseClient | null = null;

/**
 * Lazily create the Supabase client so that the SDK's internal `new URL()`
 * calls (which throw on Safari/WebKit) don't fire at module-load time and
 * corrupt the JS context for other code paths like the scan flow.
 */
function getClient(): SupabaseClient {
  if (_instance) return _instance;
  try {
    _instance = createClient(
      supabaseUrl || "https://placeholder.supabase.co",
      supabaseAnonKey || "placeholder",
      {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: "pkce",
          storage: {
            getItem: (key) => {
              try { return localStorage.getItem(key); } catch { return null; }
            },
            setItem: (key, value) => {
              try { localStorage.setItem(key, value); } catch {}
            },
            removeItem: (key) => {
              try { localStorage.removeItem(key); } catch {}
            },
          },
        },
      },
    );
  } catch (err) {
    console.error("[Supabase] Failed to create client:", err);
    _instance = createClient("https://placeholder.supabase.co", "placeholder");
  }
  return _instance!;
}

/**
 * Proxy that lazily initializes the real client on first property access.
 * This prevents Safari/WebKit URL constructor errors at module load time.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const val = Reflect.get(client, prop, receiver);
    return typeof val === "function" ? val.bind(client) : val;
  },
});

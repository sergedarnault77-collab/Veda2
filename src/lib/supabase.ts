import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

let supabase: SupabaseClient;

try {
  supabase = createClient(
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
  supabase = createClient("https://placeholder.supabase.co", "placeholder");
}

export { supabase };

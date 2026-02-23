import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

let supabase: SupabaseClient;

try {
  supabase = createClient(
    supabaseUrl || "https://placeholder.supabase.co",
    supabaseAnonKey || "placeholder",
  );
} catch (err) {
  console.error("[Supabase] Failed to create client:", err);
  supabase = createClient("https://placeholder.supabase.co", "placeholder");
}

export { supabase };

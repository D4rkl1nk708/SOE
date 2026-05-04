import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "CRITICAL ERROR: Supabase environment variables are missing! Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment settings.",
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

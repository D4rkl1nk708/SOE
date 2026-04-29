import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "CRITICAL ERROR: Supabase environment variables are missing! " +
      "Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment settings.",
  );
}

// Export a dummy object if variables are missing to prevent immediate crash,
// though calls to it will still fail, the app bundle will at least load.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : (new Proxy(
        {},
        {
          get: () => {
            throw new Error(
              "Supabase client called but environment variables are missing.",
            );
          },
        },
      ) as any);

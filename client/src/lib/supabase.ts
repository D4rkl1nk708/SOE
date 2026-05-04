import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "CRITICAL ERROR: Supabase environment variables are missing! Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment settings.",
  );
}

// Cria a instância real ou null
const supabaseInstance =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Exportamos um Proxy para o cliente Supabase.
 * Se o cliente for null (variáveis faltando), qualquer tentativa de acesso
 * disparará um erro claro no console em vez de um "Cannot read property of null".
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!supabaseInstance) {
      throw new Error(
        `Supabase client called but environment variables are missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`,
      );
    }
    return (supabaseInstance as any)[prop];
  },
});

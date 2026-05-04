import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[Supabase] ERRO: Chaves não encontradas no process.env!");
} else {
  console.log("[Supabase] Cliente inicializado com sucesso.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

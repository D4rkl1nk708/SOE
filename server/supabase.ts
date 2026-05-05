import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";
import { ENV_SUPABASE_URL, ENV_SUPABASE_ANON_KEY } from "../client/src/lib/env";

const supabaseUrl = ENV_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey =
  ENV_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[Supabase] ERRO: Chaves não encontradas no process.env!");
} else {
  console.log("[Supabase] Cliente inicializado com sucesso.");
}

// Em vez de quebrar o servidor inteiro caso falte as chaves na build local, usamos um proxy ou try/catch
export let supabase: ReturnType<typeof createClient>;

try {
  supabase = createClient(
    supabaseUrl || "https://dummy.supabase.co",
    supabaseAnonKey || "dummy",
  );
} catch (e) {
  console.error("Failed to initialize backend Supabase client", e);
}

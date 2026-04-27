import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[SUPABASE] Warning: SUPABASE_URL or SUPABASE_ANON_KEY missing in .env",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

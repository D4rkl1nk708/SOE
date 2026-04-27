import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

console.log("Testing connection to:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.from("users").select("*").limit(1);
  if (error) {
    console.error("Connection failed:", error.message);
    process.exit(1);
  }
  console.log("Connection successful! Data:", data);
  process.exit(0);
}

test();

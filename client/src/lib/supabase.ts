import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://nhdsmlbybipchjmcrida.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_dLi9CgzH-N0X2u2WnucIHA_6baBFS0s";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

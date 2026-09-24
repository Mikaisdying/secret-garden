import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Both values end up public in the browser by design: the anon key only
// grants what the RLS policies in supabase/schema.sql allow (read + insert,
// delete via RPC). They live in .env only to keep them out of the repo.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

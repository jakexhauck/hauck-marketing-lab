import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

// Service-role client against the SAME Supabase project as the Command Center,
// so admin_accounts is shared and the same logins work. Never exposed to the
// browser. Returns null if Supabase is not configured.
export function getServiceClient(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

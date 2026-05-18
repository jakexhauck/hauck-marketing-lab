import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

let cached: SupabaseClient | null = null;
let cachedKey = "";

export function admin(env: Env): SupabaseClient {
  const key = env.SUPABASE_URL + "|" + env.SUPABASE_SERVICE_ROLE_KEY;
  if (cached && cachedKey === key) return cached;
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cachedKey = key;
  return cached;
}

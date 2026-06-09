import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

/**
 * Service-role client. Bypasses RLS. Only ever called from trusted Functions,
 * never exposed to the browser. Returns null if Supabase is not configured so
 * callers can degrade gracefully (the app still works without it).
 */
export function getServiceClient(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the tenant id for the current session mode. Test app: one tenant. */
export async function resolveTenantId(
  client: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

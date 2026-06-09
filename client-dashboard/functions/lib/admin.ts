import type { Env } from "./env";
import { getServiceClient } from "./supabase";

// isAdmin: server-side authority for admin-only writes (e.g. team sync).
// Never gate admin writes on `?dev=1`; that flag is a client UI convenience only.
//
// Schema note (0003_admins.sql): the `admins` table keys on `user_id`, a
// Supabase auth uid. The identity model in this plan uses GHL user ids, so a
// follow-up migration is needed to add a `ghl_user_id` column to `admins`
// (and to `tenant_users`) before a GHL-user-id identity can be matched here.
// Until then this matches the real `user_id` column; if Supabase is
// unconfigured or no row matches, it returns false (deny by default).
export async function isAdmin(
  env: Env,
  identityId: string,
): Promise<boolean> {
  const client = getServiceClient(env);
  if (!client || !identityId) return false;
  const { data } = await client
    .from("admins")
    .select("user_id")
    .eq("user_id", identityId)
    .maybeSingle();
  return Boolean(data);
}

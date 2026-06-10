import type { Env } from "./env";
import { getServiceClient } from "./supabase";

// isAdmin: server-side authority for admin-only writes (e.g. team sync).
// Never gate admin writes on `?dev=1`; that flag is a client UI convenience only.
//
// The identity model (0004) keys admins on `ghl_user_id` (the GHL user id the
// app stores at the "who are you?" step), so that is the column matched here.
// If Supabase is unconfigured or no row matches, returns false (deny by
// default). Note the identity itself arrives via a client-supplied header, so
// this is authorization against a curated allowlist, not authentication; do
// not put anything truly destructive behind it until identity is bound into
// the session cookie.
export async function isAdmin(
  env: Env,
  identityId: string,
): Promise<boolean> {
  const client = getServiceClient(env);
  if (!client || !identityId) return false;
  const { data } = await client
    .from("admins")
    .select("ghl_user_id")
    .eq("ghl_user_id", identityId)
    .maybeSingle();
  return Boolean(data);
}

import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

interface Identity {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "rep";
}

// GET /api/me/identity?id=<ghl_user_id>  (or x-identity header)
// Resolves a stored identity (the GHL user id chosen at the "who are you?"
// step) to its row in tenant_users for the session's tenant.
//
// Degrades gracefully on purpose: if Supabase is unconfigured, no id is
// provided, or no matching row is found, it returns { identity: null } so the
// client (AuthContext) falls back to the hardcoded-owner behaviour and never
// hard-fails.
//
// Schema note: tenant_users (0001_init.sql) has no ghl_user_id / name / email
// columns yet; this lookup relies on the same follow-up migration described in
// functions/api/team/sync.ts. Until that migration lands the select below
// returns no row and the client falls back to the owner default.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const url = new URL(ctx.request.url);
  const id =
    ctx.request.headers.get("x-identity") || url.searchParams.get("id") || "";

  if (!id) return Response.json({ identity: null });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ identity: null });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ identity: null });

  const { data, error } = await client
    .from("tenant_users")
    .select("ghl_user_id, name, email, role")
    .eq("tenant_id", tenantId)
    .eq("ghl_user_id", id)
    .maybeSingle();

  if (error || !data) return Response.json({ identity: null });

  const row = data as {
    ghl_user_id: string;
    name: string | null;
    email: string | null;
    role: string | null;
  };

  const role: Identity["role"] =
    row.role === "owner" || row.role === "manager" ? row.role : "rep";

  const identity: Identity = {
    id: row.ghl_user_id,
    name: row.name ?? "Unknown",
    email: row.email ?? "",
    role,
  };

  return Response.json({ identity });
};

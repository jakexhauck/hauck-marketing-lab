import type { Env, ApiData } from "../../lib/env";
import { ghlJson } from "../../lib/ghl";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

interface GhlUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface GhlUsersResp {
  users?: GhlUser[];
}

// POST /api/team/sync
// Owner-only (gated on the signed session). Upserts the GHL team into Supabase
// `tenant_users` for the session's tenant with a default role of "rep".
// Degrades gracefully: returns 503 when Supabase is unconfigured so the app
// never hard-fails.
//
// Schema: requires migrations 0004 (ghl_user_id/name/email columns) and 0006
// (full unique index on (tenant_id, ghl_user_id); the partial index 0004
// created cannot be targeted by this upsert's ON CONFLICT).
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  // Owner-only, gated on the SIGNED session (set by _middleware.ts), not a
  // client-supplied x-identity header. This rewrites tenant_users, so it must
  // not be reachable by spoofing a known admin's GHL user id in a header.
  if (!ctx.data.isOwner) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json(
      { error: "supabase not configured" },
      { status: 503 },
    );
  }

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) {
    return Response.json(
      { error: "tenant not found" },
      { status: 404 },
    );
  }

  const t = ctx.data.tenant;
  const data = await ghlJson<GhlUsersResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/users/?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );

  const team = (data.users ?? []).map((u) => ({
    id: u.id,
    name:
      u.name ||
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
      "Unknown",
    email: u.email ?? "",
  }));

  // Upsert keyed on the GHL user id within the tenant. Requires the follow-up
  // migration described above; onConflict matches the (tenant_id, ghl_user_id)
  // unique constraint that migration must add.
  const rows = team.map((m) => ({
    tenant_id: tenantId,
    ghl_user_id: m.id,
    name: m.name,
    email: m.email,
    role: "rep",
  }));

  const { error } = await client
    .from("tenant_users")
    .upsert(rows, { onConflict: "tenant_id,ghl_user_id" });

  if (error) {
    return Response.json(
      { error: error.message, synced: 0 },
      { status: 500 },
    );
  }

  return Response.json({ synced: rows.length });
};

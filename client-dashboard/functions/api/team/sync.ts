import type { Env, ApiData } from "../../lib/env";
import { ghlJson } from "../../lib/ghl";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { isAdmin } from "../../lib/admin";

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
// Admin-only. Upserts the GHL team into Supabase `tenant_users` for the
// test-account tenant with a default role of "rep". Degrades gracefully:
// returns 503 when Supabase is unconfigured so the app never hard-fails.
//
// IMPORTANT (schema): 0001_init.sql defines tenant_users as
//   (tenant_id uuid, user_id uuid -> auth.users, role text, created_at)
// with primary key (tenant_id, user_id). It has NO ghl_user_id / name / email
// columns, so the upsert below (keyed on the GHL user id) requires a follow-up
// migration adding `ghl_user_id text`, `name text`, `email text` to
// tenant_users plus a unique (tenant_id, ghl_user_id) constraint. Until that
// migration is applied this endpoint will return the underlying Postgres error
// describing the missing column, which is the correct signal to run it.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  // Identity of the caller (the GHL user id chosen at the "who are you?" step).
  // Admin authority is checked server-side against the admins table, never on
  // a URL/dev flag.
  const url = new URL(ctx.request.url);
  const identityId =
    ctx.request.headers.get("x-identity") || url.searchParams.get("id") || "";

  if (!(await isAdmin(ctx.env, identityId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json(
      { error: "supabase not configured" },
      { status: 503 },
    );
  }

  const tenantId = await resolveTenantId(client, "test-account");
  if (!tenantId) {
    return Response.json(
      { error: "test-account tenant not found" },
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

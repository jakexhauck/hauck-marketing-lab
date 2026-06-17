import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../../lib/adminAuth";
import { hashPassword } from "../../../../../lib/password";
import {
  loadEnabledCapabilities,
  sanitizeGrants,
  type GrantInput,
} from "../../../../../lib/permissions";
import type { StaffRole } from "../../../../../lib/staff";

interface PatchBody {
  name?: string;
  role?: string;
  status?: string;
  password?: string;
  permissions?: GrantInput[];
}

const ROLES = new Set<StaffRole>(["owner", "manager", "rep"]);

// Confirm the staff member belongs to the named client before touching anything.
async function staffInTenant(
  client: ReturnType<typeof getServiceClient>,
  tenantId: string,
  staffId: string,
): Promise<boolean> {
  if (!client) return false;
  const { data } = await client
    .from("staff_accounts")
    .select("id")
    .eq("id", staffId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(data);
}

// PATCH /api/admin/clients/:tenantId/staff/:staffId  (admin-only)
// Change an employee's name, role, status, password, and/or replace their full
// grant set. The grant set is bounded by what the client has enabled (Layer 2).
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const staffId = ctx.params.staffId as string;
  if (!(await getTenantById(client, tenantId))) {
    return Response.json({ error: "client not found" }, { status: 404 });
  }
  if (!(await staffInTenant(client, tenantId, staffId))) {
    return Response.json({ error: "staff not found" }, { status: 404 });
  }

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (body.role && ROLES.has(body.role as StaffRole)) update.role = body.role;
  if (body.status === "active" || body.status === "disabled") update.status = body.status;
  if (typeof body.password === "string" && body.password.trim()) {
    if (body.password.trim().length < 8) {
      return Response.json({ error: "password must be at least 8 characters" }, { status: 400 });
    }
    update.password_hash = await hashPassword(body.password.trim());
  }

  if (Object.keys(update).length > 1) {
    const { error } = await client.from("staff_accounts").update(update).eq("id", staffId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (body.permissions) {
    const enabled = await loadEnabledCapabilities(client, tenantId);
    const rows = sanitizeGrants(body.permissions, enabled);
    await client.from("staff_permissions").delete().eq("staff_account_id", staffId);
    if (rows.length) {
      const { error } = await client
        .from("staff_permissions")
        .insert(rows.map((r) => ({ staff_account_id: staffId, ...r })));
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  }

  await logAdminAction(client, ctx.data.admin!.id, "staff.update", tenantId, { staffId });
  return Response.json({ ok: true });
};

// DELETE /api/admin/clients/:tenantId/staff/:staffId  (admin-only)
// Soft-disable: blocks login but keeps the row (and history). Live sessions are
// rejected on their next request.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const staffId = ctx.params.staffId as string;
  if (!(await getTenantById(client, tenantId))) {
    return Response.json({ error: "client not found" }, { status: 404 });
  }
  if (!(await staffInTenant(client, tenantId, staffId))) {
    return Response.json({ error: "staff not found" }, { status: 404 });
  }

  const { error } = await client
    .from("staff_accounts")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", staffId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "staff.disable", tenantId, { staffId });
  return Response.json({ ok: true });
};

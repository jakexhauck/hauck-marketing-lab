import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../../lib/adminAuth";
import { hashPassword } from "../../../../../lib/password";
import {
  loadEnabledCapabilities,
  sanitizeGrants,
  type GrantInput,
} from "../../../../../lib/permissions";
import { normalizeEmail, type StaffRole } from "../../../../../lib/staff";

interface CreateBody {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  permissions?: GrantInput[];
}

const ROLES = new Set<StaffRole>(["owner", "manager", "rep"]);

// POST /api/admin/clients/:tenantId/staff  (admin-only)
// Create an employee login for any client, from the tower. Mirrors the owner's
// own /api/staff create, but cross-tenant and without GHL user provisioning
// (the tower does not assume this client's GHL token has the users scope; the
// account works without a linked GHL user, exactly like the owner-side path
// when provisioning is unavailable).
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = normalizeEmail(body.email ?? "");
  const password = (body.password ?? "").trim();
  const role: StaffRole = ROLES.has(body.role as StaffRole) ? (body.role as StaffRole) : "rep";

  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  if (!email || !email.includes("@")) {
    return Response.json({ error: "a valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const { data: existing } = await client
    .from("staff_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return Response.json({ error: "a staff member with that email already exists" }, { status: 409 });
  }

  const enabled = await loadEnabledCapabilities(client, tenantId);
  const permRows = sanitizeGrants(body.permissions, enabled);
  const password_hash = await hashPassword(password);

  const { data: inserted, error } = await client
    .from("staff_accounts")
    .insert({
      tenant_id: tenantId,
      ghl_user_id: null,
      email,
      name,
      role,
      password_hash,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return Response.json({ error: error?.message ?? "could not create staff" }, { status: 500 });
  }

  const staffId = (inserted as { id: string }).id;
  if (permRows.length) {
    const { error: permErr } = await client
      .from("staff_permissions")
      .insert(permRows.map((r) => ({ staff_account_id: staffId, ...r })));
    if (permErr) {
      await client.from("staff_accounts").delete().eq("id", staffId);
      return Response.json({ error: permErr.message }, { status: 500 });
    }
  }

  await logAdminAction(client, ctx.data.admin!.id, "staff.create", tenantId, {
    staffId,
    email,
    role,
  });

  return Response.json({ ok: true, id: staffId }, { status: 201 });
};

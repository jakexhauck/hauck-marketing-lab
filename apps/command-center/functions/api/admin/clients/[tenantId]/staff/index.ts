import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../../lib/adminAuth";
import type { GrantInput } from "../../../../../lib/permissions";
import { normalizeEmail, type StaffRole } from "../../../../../lib/staff";
import { createStaffLogin } from "../../../../../lib/staffCreate";

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

  const created = await createStaffLogin(client, tenantId, {
    name,
    email,
    role,
    password,
    permissions: body.permissions,
  });
  if (!created.ok) return Response.json({ error: created.error }, { status: created.status });
  const staffId = created.id;

  await logAdminAction(client, ctx.data.admin!.id, "staff.create", tenantId, {
    staffId,
    email,
    role,
  });

  return Response.json({ ok: true, id: staffId }, { status: 201 });
};

import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { hashPassword } from "../../lib/password";
import {
  loadEnabledCapabilities,
  sanitizeGrants,
  type GrantInput,
} from "../../lib/permissions";
import { normalizeEmail, tryCreateGhlUser, type StaffRole } from "../../lib/staff";

interface CreateBody {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  permissions?: GrantInput[];
}

const ROLES = new Set<StaffRole>(["owner", "manager", "rep"]);

// GET /api/staff  (owner-only) — list staff with their grants.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const { data: staffRows } = await client
    .from("staff_accounts")
    .select("id, name, email, role, status, ghl_user_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const staff = (staffRows ?? []) as {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    status: string;
    ghl_user_id: string | null;
    created_at: string;
  }[];

  const ids = staff.map((s) => s.id);
  const permsByStaff = new Map<string, { capability: string; view: boolean; edit: boolean }[]>();
  if (ids.length) {
    const { data: permRows } = await client
      .from("staff_permissions")
      .select("staff_account_id, capability, can_view, can_edit")
      .in("staff_account_id", ids);
    for (const row of (permRows ?? []) as {
      staff_account_id: string;
      capability: string;
      can_view: boolean;
      can_edit: boolean;
    }[]) {
      const list = permsByStaff.get(row.staff_account_id) ?? [];
      list.push({ capability: row.capability, view: row.can_view, edit: row.can_edit });
      permsByStaff.set(row.staff_account_id, list);
    }
  }

  return Response.json({
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      status: s.status,
      ghlUserId: s.ghl_user_id,
      createdAt: s.created_at,
      permissions: permsByStaff.get(s.id) ?? [],
    })),
  });
};

// POST /api/staff  (owner-only) — create a staff member, provision a GHL user
// (best-effort), and write their grants.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

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
  if (!email || !email.includes("@")) return Response.json({ error: "a valid email is required" }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "password must be at least 8 characters" }, { status: 400 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  // Reject a duplicate email up front for a friendly message (the unique index
  // is the hard guarantee).
  const { data: existing } = await client
    .from("staff_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();
  if (existing) return Response.json({ error: "a staff member with that email already exists" }, { status: 409 });

  const enabled = await loadEnabledCapabilities(client, tenantId);
  const permRows = sanitizeGrants(body.permissions, enabled);

  // Provision the GHL user first (best-effort). Null is fine: the account still
  // works, just without a linked GHL user.
  const ghlUser = await tryCreateGhlUser(
    { token: ctx.data.tenant.ghl_token, locationId: ctx.data.tenant.ghl_location_id },
    ctx.env,
    { name, email, password },
  );

  const password_hash = await hashPassword(password);

  const { data: inserted, error } = await client
    .from("staff_accounts")
    .insert({
      tenant_id: tenantId,
      ghl_user_id: ghlUser?.id ?? null,
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
      // Roll back the account so we never leave a login with no permissions.
      await client.from("staff_accounts").delete().eq("id", staffId);
      return Response.json({ error: permErr.message }, { status: 500 });
    }
  }

  return Response.json(
    {
      ok: true,
      id: staffId,
      ghlLinked: Boolean(ghlUser),
      // Surface this so the owner UI can hint when GHL provisioning is off.
      ghlProvisioning: Boolean(ctx.env.GHL_COMPANY_ID),
    },
    { status: 201 },
  );
};

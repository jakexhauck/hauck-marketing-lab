import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { hashPassword } from "../../lib/password";
import {
  loadEnabledCapabilities,
  sanitizeGrants,
  type GrantInput,
} from "../../lib/permissions";
import type { StaffRole } from "../../lib/staff";

interface PatchBody {
  name?: string;
  role?: string;
  status?: string;
  password?: string;
  permissions?: GrantInput[];
}

const ROLES = new Set<StaffRole>(["owner", "manager", "rep"]);

type OwnerCtx =
  | { ok: false; res: Response }
  | { ok: true; client: SupabaseClient; tenantId: string };

async function ownerTenant(
  ctx: Parameters<PagesFunction<Env, string, ApiData>>[0],
): Promise<OwnerCtx> {
  if (!ctx.data.isOwner) {
    return { ok: false, res: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  const client = getServiceClient(ctx.env);
  if (!client) {
    return { ok: false, res: Response.json({ error: "supabase not configured" }, { status: 503 }) };
  }
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) {
    return { ok: false, res: Response.json({ error: "tenant not found" }, { status: 404 }) };
  }
  return { ok: true, client, tenantId };
}

// PATCH /api/staff/:staffId  (owner-only)
// Update any of name, role, status, password, and/or replace the full grant set.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const ot = await ownerTenant(ctx);
  if (!ot.ok) return ot.res;
  const { client, tenantId } = ot;
  const staffId = ctx.params.staffId as string;

  // Confirm the target belongs to this tenant before touching anything.
  const { data: target } = await client
    .from("staff_accounts")
    .select("id")
    .eq("id", staffId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!target) return Response.json({ error: "staff not found" }, { status: 404 });

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

  // Replace the grant set wholesale when permissions are supplied: delete then
  // insert the sanitized rows. Simpler and race-free vs. diffing.
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

  return Response.json({ ok: true });
};

// DELETE /api/staff/:staffId  (owner-only)
// Soft-disable: keeps the row (and history/attribution) but blocks login. The
// staff member's live sessions are rejected on their next request because
// resolveCaller treats a non-active account as revoked.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const ot = await ownerTenant(ctx);
  if (!ot.ok) return ot.res;
  const { client, tenantId } = ot;
  const staffId = ctx.params.staffId as string;

  const { data: target } = await client
    .from("staff_accounts")
    .select("id")
    .eq("id", staffId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!target) return Response.json({ error: "staff not found" }, { status: 404 });

  const { error } = await client
    .from("staff_accounts")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", staffId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
};

import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";

interface PatchRoleBody {
  name?: string;
  color?: string;
  sortOrder?: number;
}

interface RoleRow {
  id: string;
  name: string;
  color: string;
  is_preset: boolean;
  sort_order: number;
}

function toRoleDTO(r: RoleRow) {
  return { id: r.id, name: r.name, color: r.color, isPreset: r.is_preset, sortOrder: r.sort_order };
}

export const onRequestPatch: PagesFunction<Env, "roleId", ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const roleId = ctx.params.roleId as string;
  const body = await readJsonBody<PatchRoleBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.color === "string") patch.color = body.color.trim();
  if (typeof body.sortOrder === "number") patch.sort_order = body.sortOrder;
  if (Object.keys(patch).length === 0) return Response.json({ error: "no_fields" }, { status: 400 });

  const { data, error } = await client
    .from("chat_roles")
    .update(patch)
    .eq("id", roleId)
    .eq("tenant_id", tenantId)
    .select("id, name, color, is_preset, sort_order")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "role_not_found" }, { status: 404 });

  return Response.json({ role: toRoleDTO(data as RoleRow) });
};

export const onRequestDelete: PagesFunction<Env, "roleId", ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const roleId = ctx.params.roleId as string;

  // Load first so a preset role is refused with 409, not silently no-op deleted.
  const { data: existing, error: loadErr } = await client
    .from("chat_roles")
    .select("id, is_preset")
    .eq("id", roleId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return Response.json({ error: "role_not_found" }, { status: 404 });
  if ((existing as { is_preset: boolean }).is_preset) {
    return Response.json({ error: "preset_role_undeletable" }, { status: 409 });
  }

  const { error } = await client
    .from("chat_roles")
    .delete()
    .eq("id", roleId)
    .eq("tenant_id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
};

import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

interface CreateRoleBody {
  name?: string;
  color?: string;
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

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { data, error } = await client
    .from("chat_roles")
    .select("id, name, color, is_preset, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .order("name", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ roles: ((data ?? []) as RoleRow[]).map(toRoleDTO) });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const body = await readJsonBody<CreateRoleBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const name = (body.name ?? "").trim();
  const color = (body.color ?? "").trim();
  if (!name || !color) return Response.json({ error: "name_and_color_required" }, { status: 400 });

  const { data, error } = await client
    .from("chat_roles")
    .insert({ tenant_id: tenantId, name, color, is_preset: false, sort_order: 0 })
    .select("id, name, color, is_preset, sort_order")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ role: toRoleDTO(data as RoleRow) });
};

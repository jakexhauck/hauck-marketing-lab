import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

interface RoleRow {
  id: string;
  name: string;
  color: string;
  is_preset: boolean;
  sort_order: number;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const [staffRes, rolesRes, memberRolesRes, presenceRes] = await Promise.all([
    client
      .from("staff_accounts")
      .select("id, name, can_contact_hauck")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("name", { ascending: true }),
    client
      .from("chat_roles")
      .select("id, name, color, is_preset, sort_order")
      .eq("tenant_id", tenantId),
    client
      .from("chat_member_roles")
      .select("staff_account_id, chat_role_id"),
    client
      .from("chat_presence")
      .select("member_id, last_seen")
      .eq("tenant_id", tenantId)
      .eq("member_kind", "staff"),
  ]);

  if (staffRes.error) return Response.json({ error: staffRes.error.message }, { status: 500 });
  if (rolesRes.error) return Response.json({ error: rolesRes.error.message }, { status: 500 });
  if (memberRolesRes.error) return Response.json({ error: memberRolesRes.error.message }, { status: 500 });
  if (presenceRes.error) return Response.json({ error: presenceRes.error.message }, { status: 500 });

  const roleById = new Map<string, RoleRow>();
  for (const r of (rolesRes.data ?? []) as RoleRow[]) roleById.set(r.id, r);

  // staff_account_id -> [role DTO], sorted highest sort_order first.
  const rolesByStaff = new Map<string, RoleRow[]>();
  for (const link of (memberRolesRes.data ?? []) as { staff_account_id: string; chat_role_id: string }[]) {
    const role = roleById.get(link.chat_role_id);
    if (!role) continue;
    const list = rolesByStaff.get(link.staff_account_id) ?? [];
    list.push(role);
    rolesByStaff.set(link.staff_account_id, list);
  }

  const lastSeenById = new Map<string, string>();
  for (const p of (presenceRes.data ?? []) as { member_id: string; last_seen: string }[]) {
    lastSeenById.set(p.member_id, p.last_seen);
  }

  const members = ((staffRes.data ?? []) as { id: string; name: string; can_contact_hauck: boolean }[]).map(
    (s) => {
      const roles = (rolesByStaff.get(s.id) ?? [])
        .sort((a, b) => b.sort_order - a.sort_order)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          isPreset: r.is_preset,
          sortOrder: r.sort_order,
        }));
      return {
        id: s.id,
        name: s.name,
        roles,
        online: false,
        lastSeen: lastSeenById.get(s.id) ?? null,
        canContactHauck: Boolean(s.can_contact_hauck),
      };
    },
  );

  return Response.json({ members });
};

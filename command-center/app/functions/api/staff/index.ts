import type { SupabaseClient } from "@supabase/supabase-js";
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
  chatRoleIds?: string[];
  canContactHauck?: boolean;
  channelIds?: string[];
}

const ROLES = new Set<StaffRole>(["owner", "manager", "rep"]);

// Dedup and drop blanks from an id array body field. Returns [] for anything
// that is not a string array.
function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      ),
    ),
  ];
}

// Replace a staff member's cosmetic chat roles with exactly `roleIds`,
// delete-then-insert. Only roles belonging to `tenantId` are honored.
export async function writeChatRoles(
  client: SupabaseClient,
  tenantId: string,
  staffId: string,
  roleIds: string[],
): Promise<void> {
  await client.from("chat_member_roles").delete().eq("staff_account_id", staffId);
  if (!roleIds.length) return;
  const { data: valid } = await client
    .from("chat_roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", roleIds);
  const ids = (valid ?? []).map((r) => (r as { id: string }).id);
  if (!ids.length) return;
  await client
    .from("chat_member_roles")
    .insert(ids.map((chat_role_id) => ({ staff_account_id: staffId, chat_role_id })));
}

// Set a staff member's channel membership to exactly `channelIds`. Removes the
// member from every channel they are no longer in, then upserts the chosen set.
// Only channels belonging to `tenantId` are honored. member_kind = 'staff'.
export async function writeChannelMembers(
  client: SupabaseClient,
  tenantId: string,
  staffId: string,
  channelIds: string[],
): Promise<void> {
  const { data: valid } = await client
    .from("chat_channels")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", channelIds.length ? channelIds : ["00000000-0000-0000-0000-000000000000"]);
  const wanted = new Set((valid ?? []).map((r) => (r as { id: string }).id));

  // Current channel memberships for this staff member. Remove any not in
  // `wanted`, then add the missing ones.
  const { data: current } = await client
    .from("chat_channel_members")
    .select("channel_id")
    .eq("member_kind", "staff")
    .eq("member_id", staffId);
  const have = new Set(
    (current ?? []).map((r) => (r as { channel_id: string }).channel_id),
  );

  const toRemove = [...have].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !have.has(id));

  if (toRemove.length) {
    await client
      .from("chat_channel_members")
      .delete()
      .eq("member_kind", "staff")
      .eq("member_id", staffId)
      .in("channel_id", toRemove);
  }
  if (toAdd.length) {
    await client.from("chat_channel_members").insert(
      toAdd.map((channel_id) => ({
        channel_id,
        member_kind: "staff",
        member_id: staffId,
      })),
    );
  }
}

// GET /api/staff  (owner-only) — list staff with their grants.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const { data: staffRows } = await client
    .from("staff_accounts")
    .select("id, name, email, role, status, ghl_user_id, can_contact_hauck, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const staff = (staffRows ?? []) as {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    status: string;
    ghl_user_id: string | null;
    can_contact_hauck: boolean;
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

  // Team comms (Phase 06): cosmetic role ids, can_contact_hauck, channel ids.
  // can_contact_hauck rides on the staff_accounts select above; the other two
  // come from join tables keyed by staff id.
  const chatRolesByStaff = new Map<string, string[]>();
  const channelsByStaff = new Map<string, string[]>();
  if (ids.length) {
    const { data: roleRows } = await client
      .from("chat_member_roles")
      .select("staff_account_id, chat_role_id")
      .in("staff_account_id", ids);
    for (const row of (roleRows ?? []) as {
      staff_account_id: string;
      chat_role_id: string;
    }[]) {
      const list = chatRolesByStaff.get(row.staff_account_id) ?? [];
      list.push(row.chat_role_id);
      chatRolesByStaff.set(row.staff_account_id, list);
    }

    // chat_channel_members is keyed by (channel_id, member_kind, member_id).
    // Staff members carry member_kind = 'staff'; member_id is the staff id.
    const { data: memberRows } = await client
      .from("chat_channel_members")
      .select("channel_id, member_id")
      .eq("member_kind", "staff")
      .in("member_id", ids);
    for (const row of (memberRows ?? []) as {
      channel_id: string;
      member_id: string;
    }[]) {
      const list = channelsByStaff.get(row.member_id) ?? [];
      list.push(row.channel_id);
      channelsByStaff.set(row.member_id, list);
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
      chatRoleIds: chatRolesByStaff.get(s.id) ?? [],
      canContactHauck: Boolean(s.can_contact_hauck),
      channelIds: channelsByStaff.get(s.id) ?? [],
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
  const chatRoleIds = normalizeIdList(body.chatRoleIds);
  const channelIds = normalizeIdList(body.channelIds);
  const canContactHauck = body.canContactHauck === true;

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
      can_contact_hauck: canContactHauck,
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

  // Cosmetic chat roles (membership in chat_member_roles). Scope to roles that
  // actually belong to this tenant so a stale or foreign id is ignored.
  if (chatRoleIds.length) {
    await writeChatRoles(client, tenantId, staffId, chatRoleIds);
  }
  // Channel membership (member_kind = 'staff'). Same tenant scoping.
  if (channelIds.length) {
    await writeChannelMembers(client, tenantId, staffId, channelIds);
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

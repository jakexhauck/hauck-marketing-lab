import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// Mirrors AdminHauckThread in src/lib/api.ts.
interface AdminHauckThreadDTO {
  channelId: string;
  tenantId: string;
  tenantName: string;
  personName: string;
  unread: number;
  lastMessageAt: string | null;
}

// GET /api/admin/messages  (admin-only, gated in _middleware.ts)
// Every Hauck thread across all tenants, newest activity first.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const adminId = ctx.data.admin!.id;

  // All Hauck channels, with tenant name joined.
  const { data: channels, error } = await client
    .from("chat_channels")
    .select("id, tenant_id, tenants(name)")
    .eq("kind", "hauck");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (channels ?? []) as unknown as {
    id: string;
    tenant_id: string;
    tenants: { name: string } | null;
  }[];

  const threads: AdminHauckThreadDTO[] = [];
  for (const ch of rows) {
    // The non-admin member (the client) gives the thread its person name.
    // Resolve via explicit lookup: sender_id is polymorphic (no FK to staff_accounts),
    // so a PostgREST embed would fail at runtime.
    const { data: staffMember } = await client
      .from("chat_channel_members")
      .select("member_id")
      .eq("channel_id", ch.id)
      .eq("member_kind", "staff")
      .maybeSingle();
    const staffMemberId = (staffMember as { member_id?: string } | null)?.member_id ?? null;
    let personName = "Unknown";
    if (staffMemberId) {
      const { data: staffRow } = await client
        .from("staff_accounts")
        .select("name")
        .eq("id", staffMemberId)
        .maybeSingle();
      personName = (staffRow as { name?: string } | null)?.name ?? "Unknown";
    }

    // This admin's last_read_at for the channel, to compute unread.
    const { data: membership } = await client
      .from("chat_channel_members")
      .select("last_read_at")
      .eq("channel_id", ch.id)
      .eq("member_kind", "admin")
      .eq("member_id", adminId)
      .maybeSingle();
    const lastReadAt = (membership as { last_read_at?: string | null } | null)?.last_read_at ?? null;

    // Newest message timestamp (for ordering + the row preview time).
    const { data: lastMsg } = await client
      .from("chat_messages")
      .select("created_at")
      .eq("channel_id", ch.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastMessageAt = (lastMsg as { created_at?: string } | null)?.created_at ?? null;

    // Unread: messages after this admin's last_read_at (all if never read).
    let unreadQuery = client
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", ch.id)
      .is("deleted_at", null);
    if (lastReadAt) unreadQuery = unreadQuery.gt("created_at", lastReadAt);
    const { count } = await unreadQuery;

    threads.push({
      channelId: ch.id,
      tenantId: ch.tenant_id,
      tenantName: ch.tenants?.name ?? "Unknown",
      personName,
      unread: count ?? 0,
      lastMessageAt,
    });
  }

  threads.sort((a, b) => {
    const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bt - at;
  });

  return Response.json({ threads });
};

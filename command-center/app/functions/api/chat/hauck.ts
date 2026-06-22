import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { resolveParticipant } from "../../lib/participants";

// Shape returned to the client. Mirrors ChatChannel in src/lib/api.ts.
interface ChatChannelDTO {
  id: string;
  kind: "channel" | "dm" | "hauck";
  name: string;
  memberIds: string[];
  unread: number;
  lastMessageAt: string | null;
}

// GET /api/chat/hauck
// Get-or-create the caller's private Hauck channel. Owner or a staff member with
// can_contact_hauck only. Members are the caller plus every active admin.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant || participant.kind !== "staff") {
    // An admin or an identity-less shared-owner session cannot own a Hauck line.
    return Response.json({ error: "hauck_not_allowed" }, { status: 403 });
  }

  // Permission gate: tenant owner, or a staff member flagged can_contact_hauck.
  let allowed = Boolean(ctx.data.isOwner);
  if (!allowed) {
    const { data: staffRow } = await client
      .from("staff_accounts")
      .select("can_contact_hauck")
      .eq("id", participant.id)
      .maybeSingle();
    allowed = Boolean((staffRow as { can_contact_hauck?: boolean } | null)?.can_contact_hauck);
  }
  if (!allowed) return Response.json({ error: "hauck_not_allowed" }, { status: 403 });

  // Existing Hauck channel this caller already belongs to (idempotent path).
  const { data: existingMember } = await client
    .from("chat_channel_members")
    .select("channel_id, chat_channels!inner(id, kind, tenant_id)")
    .eq("member_kind", "staff")
    .eq("member_id", participant.id)
    .eq("chat_channels.kind", "hauck")
    .eq("chat_channels.tenant_id", tenantId)
    .maybeSingle();

  let channelId =
    (existingMember as { channel_id?: string } | null)?.channel_id ?? null;

  if (!channelId) {
    // Create the channel and its membership set: the caller + every active admin.
    // If a concurrent request already created it (unique violation on the partial
    // index chat_channels_hauck_unique), fall back to reading the existing channel.
    const { data: created, error: createErr } = await client
      .from("chat_channels")
      .insert({
        tenant_id: tenantId,
        kind: "hauck",
        name: "Hauck",
        created_by_kind: "staff",
        created_by_id: participant.id,
      })
      .select("id")
      .single();

    if (createErr) {
      // Unique-violation code from PostgREST / Postgres.
      const isConflict =
        (createErr as { code?: string }).code === "23505" ||
        createErr.message?.includes("duplicate") ||
        createErr.message?.includes("unique");
      if (!isConflict) {
        return Response.json({ error: createErr.message ?? "could not create channel" }, { status: 500 });
      }
      // Another request won the race: find and return the channel it created.
      const { data: raceWinner } = await client
        .from("chat_channel_members")
        .select("channel_id, chat_channels!inner(id, kind, tenant_id)")
        .eq("member_kind", "staff")
        .eq("member_id", participant.id)
        .eq("chat_channels.kind", "hauck")
        .eq("chat_channels.tenant_id", tenantId)
        .maybeSingle();
      channelId = (raceWinner as { channel_id?: string } | null)?.channel_id ?? null;
      if (!channelId) {
        return Response.json({ error: "could not find or create hauck channel" }, { status: 500 });
      }
    } else {
      if (!created) {
        return Response.json({ error: "could not create channel" }, { status: 500 });
      }
      channelId = (created as { id: string }).id;

      const { data: admins } = await client
        .from("admin_accounts")
        .select("id")
        .eq("status", "active");

      // chat_channel_members has no tenant_id column; omit it.
      const members = [
        { channel_id: channelId, member_kind: "staff", member_id: participant.id },
        ...((admins ?? []) as { id: string }[]).map((a) => ({
          channel_id: channelId as string,
          member_kind: "admin",
          member_id: a.id,
        })),
      ];
      const { error: memberErr } = await client.from("chat_channel_members").insert(members);
      if (memberErr) {
        // Roll back the orphan channel so a retry recreates cleanly.
        await client.from("chat_channels").delete().eq("id", channelId);
        return Response.json({ error: memberErr.message }, { status: 500 });
      }
    }
  }

  // Resolve the member id list + last message timestamp for the DTO.
  const { data: memberRows } = await client
    .from("chat_channel_members")
    .select("member_id")
    .eq("channel_id", channelId);
  const memberIds = ((memberRows ?? []) as { member_id: string }[]).map((m) => m.member_id);

  const { data: lastMsg } = await client
    .from("chat_messages")
    .select("created_at")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const channel: ChatChannelDTO = {
    id: channelId,
    kind: "hauck",
    name: "Hauck",
    memberIds,
    unread: 0,
    lastMessageAt: (lastMsg as { created_at?: string } | null)?.created_at ?? null,
  };
  return Response.json({ channel });
};

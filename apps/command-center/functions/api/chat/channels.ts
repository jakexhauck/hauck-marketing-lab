import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { resolveParticipant } from "../../lib/participants";

interface CreateChannelBody {
  name?: string;
  memberIds?: string[];
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant, needsIndividualAccount } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) {
    return Response.json(
      { error: needsIndividualAccount ? "needs_individual_account" : "forbidden" },
      { status: 403 },
    );
  }

  // Channels the caller belongs to, with their read cursor.
  const { data: myMemberships, error: memErr } = await client
    .from("chat_channel_members")
    .select("channel_id, last_read_at")
    .eq("member_kind", participant.kind)
    .eq("member_id", participant.id);
  if (memErr) return Response.json({ error: memErr.message }, { status: 500 });

  const channelIds = ((myMemberships ?? []) as { channel_id: string }[]).map((m) => m.channel_id);
  if (channelIds.length === 0) return Response.json({ channels: [] });

  const lastReadByChannel = new Map<string, string | null>();
  for (const m of (myMemberships ?? []) as { channel_id: string; last_read_at: string | null }[]) {
    lastReadByChannel.set(m.channel_id, m.last_read_at);
  }

  const [channelsRes, membersRes, messagesRes] = await Promise.all([
    client
      .from("chat_channels")
      .select("id, kind, name, archived")
      .eq("tenant_id", tenantId)
      .in("id", channelIds),
    client
      .from("chat_channel_members")
      .select("channel_id, member_kind, member_id")
      .in("channel_id", channelIds),
    client
      .from("chat_messages")
      .select("channel_id, sender_kind, sender_id, created_at, deleted_at")
      .in("channel_id", channelIds)
      .is("deleted_at", null),
  ]);
  if (channelsRes.error) return Response.json({ error: channelsRes.error.message }, { status: 500 });
  if (membersRes.error) return Response.json({ error: membersRes.error.message }, { status: 500 });
  if (messagesRes.error) return Response.json({ error: messagesRes.error.message }, { status: 500 });

  // Member ids per channel (only staff/admin member_ids; mixed kinds are flattened
  // to ids, which is what the client roster keys on).
  const memberIdsByChannel = new Map<string, string[]>();
  for (const m of (membersRes.data ?? []) as { channel_id: string; member_id: string }[]) {
    const list = memberIdsByChannel.get(m.channel_id) ?? [];
    list.push(m.member_id);
    memberIdsByChannel.set(m.channel_id, list);
  }

  const lastAtByChannel = new Map<string, string>();
  const unreadByChannel = new Map<string, number>();
  for (const msg of (messagesRes.data ?? []) as {
    channel_id: string;
    sender_kind: string;
    sender_id: string;
    created_at: string;
  }[]) {
    const prev = lastAtByChannel.get(msg.channel_id);
    if (!prev || msg.created_at > prev) lastAtByChannel.set(msg.channel_id, msg.created_at);

    const lastRead = lastReadByChannel.get(msg.channel_id) ?? null;
    const isOwnSend = msg.sender_kind === participant.kind && msg.sender_id === participant.id;
    const isUnread = !isOwnSend && (lastRead === null || msg.created_at > lastRead);
    if (isUnread) unreadByChannel.set(msg.channel_id, (unreadByChannel.get(msg.channel_id) ?? 0) + 1);
  }

  const channels = ((channelsRes.data ?? []) as {
    id: string;
    kind: "channel" | "dm" | "hauck";
    name: string;
    archived: boolean;
  }[]).map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    memberIds: memberIdsByChannel.get(c.id) ?? [],
    unread: unreadByChannel.get(c.id) ?? 0,
    lastMessageAt: lastAtByChannel.get(c.id) ?? null,
  }));

  return Response.json({ channels });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) return Response.json({ error: "needs_individual_account" }, { status: 403 });

  const body = await readJsonBody<CreateChannelBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "name_required" }, { status: 400 });
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((id) => typeof id === "string") : [];

  // Confirm every member id is an active staff row in this tenant.
  let validStaffIds: string[] = [];
  if (memberIds.length > 0) {
    const { data: staffRows, error: staffErr } = await client
      .from("staff_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("id", memberIds);
    if (staffErr) return Response.json({ error: staffErr.message }, { status: 500 });
    validStaffIds = ((staffRows ?? []) as { id: string }[]).map((s) => s.id);
  }

  const { data: created, error: chErr } = await client
    .from("chat_channels")
    .insert({
      tenant_id: tenantId,
      name,
      kind: "channel",
      created_by_kind: participant.kind,
      created_by_id: participant.id,
    })
    .select("id, kind, name, archived")
    .single();
  if (chErr) return Response.json({ error: chErr.message }, { status: 500 });
  const channel = created as { id: string; kind: "channel" | "dm" | "hauck"; name: string };

  // Members: the supplied staff plus the creator (deduped).
  const memberRows = new Map<string, { member_kind: string; member_id: string }>();
  for (const id of validStaffIds) memberRows.set(`staff:${id}`, { member_kind: "staff", member_id: id });
  memberRows.set(`${participant.kind}:${participant.id}`, {
    member_kind: participant.kind,
    member_id: participant.id,
  });

  const { error: insErr } = await client.from("chat_channel_members").insert(
    [...memberRows.values()].map((m) => ({
      channel_id: channel.id,
      member_kind: m.member_kind,
      member_id: m.member_id,
    })),
  );
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

  return Response.json({
    channel: {
      id: channel.id,
      kind: channel.kind,
      name: channel.name,
      memberIds: [...memberRows.values()].map((m) => m.member_id),
      unread: 0,
      lastMessageAt: null,
    },
  });
};

import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveParticipant } from "../../../lib/participants";
import { notifyParticipants } from "../../../lib/chatRealtime";

interface EditBody {
  body?: string;
}

interface MessageRow {
  id: string;
  channel_id: string;
  tenant_id: string;
  sender_kind: "staff" | "admin";
  sender_id: string;
  deleted_at: string | null;
}

async function channelRecipients(
  client: ReturnType<typeof getServiceClient>,
  channelId: string,
  exclude: { kind: string; id: string },
): Promise<{ kind: string; id: string }[]> {
  if (!client) return [];
  const { data } = await client
    .from("chat_channel_members")
    .select("member_kind, member_id")
    .eq("channel_id", channelId);
  return ((data ?? []) as { member_kind: string; member_id: string }[])
    .filter((m) => !(m.member_kind === exclude.kind && m.member_id === exclude.id))
    .map((m) => ({ kind: m.member_kind, id: m.member_id }));
}

export const onRequestPatch: PagesFunction<Env, "messageId", ApiData> = async (ctx) => {
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

  const messageId = ctx.params.messageId as string;
  const body = await readJsonBody<EditBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const text = (body.body ?? "").trim();
  if (!text) return Response.json({ error: "empty_message" }, { status: 400 });

  const { data: msgRow, error: loadErr } = await client
    .from("chat_messages")
    .select("id, channel_id, tenant_id, sender_kind, sender_id, deleted_at")
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 });
  if (!msgRow) return Response.json({ error: "message_not_found" }, { status: 404 });
  const msg = msgRow as MessageRow;
  if (msg.deleted_at) return Response.json({ error: "message_deleted" }, { status: 409 });

  const isAuthor = msg.sender_kind === participant.kind && msg.sender_id === participant.id;
  if (!isAuthor) return Response.json({ error: "forbidden" }, { status: 403 });

  const { data: updated, error: updErr } = await client
    .from("chat_messages")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at")
    .single();
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
  const u = updated as {
    id: string;
    channel_id: string;
    sender_kind: "staff" | "admin";
    sender_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  };

  const recipients = await channelRecipients(client, msg.channel_id, {
    kind: participant.kind,
    id: participant.id,
  });
  ctx.waitUntil(notifyParticipants(ctx.env, recipients, { kind: "message", channelId: msg.channel_id }));

  return Response.json({
    message: {
      id: u.id,
      channelId: u.channel_id,
      senderKind: u.sender_kind,
      senderId: u.sender_id,
      senderName: participant.name,
      body: u.body,
      createdAt: u.created_at,
      editedAt: u.edited_at,
      deletedAt: u.deleted_at,
      attachments: [],
    },
  });
};

export const onRequestDelete: PagesFunction<Env, "messageId", ApiData> = async (ctx) => {
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

  const messageId = ctx.params.messageId as string;

  const { data: msgRow, error: loadErr } = await client
    .from("chat_messages")
    .select("id, channel_id, tenant_id, sender_kind, sender_id, deleted_at")
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 });
  if (!msgRow) return Response.json({ error: "message_not_found" }, { status: 404 });
  const msg = msgRow as MessageRow;
  if (msg.deleted_at) return Response.json({ ok: true }); // already gone, idempotent

  const isAuthor = msg.sender_kind === participant.kind && msg.sender_id === participant.id;
  const isModerator = Boolean(ctx.data.isOwner);
  if (!isAuthor && !isModerator) return Response.json({ error: "forbidden" }, { status: 403 });

  const { error: updErr } = await client
    .from("chat_messages")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_kind: participant.kind,
      deleted_by_id: participant.id,
    })
    .eq("id", messageId);
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  const recipients = await channelRecipients(client, msg.channel_id, {
    kind: participant.kind,
    id: participant.id,
  });
  ctx.waitUntil(notifyParticipants(ctx.env, recipients, { kind: "message", channelId: msg.channel_id }));

  return Response.json({ ok: true });
};

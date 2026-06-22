import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../../lib/supabase";
import { resolveParticipant, isChannelMember } from "../../../../lib/participants";
import { notifyParticipants } from "../../../../lib/chatRealtime";
import { sendChatPush, chatPreview } from "../../../../lib/chatPush";

const PAGE_SIZE = 50;

interface SendBody {
  body?: string;
  attachmentIds?: string[];
}

interface MessageRow {
  id: string;
  channel_id: string;
  sender_kind: "staff" | "admin";
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

interface AttachmentRow {
  id: string;
  message_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

function attachmentDTO(a: AttachmentRow) {
  return {
    id: a.id,
    fileName: a.file_name,
    mimeType: a.mime_type,
    sizeBytes: Number(a.size_bytes),
    width: a.width,
    height: a.height,
  };
}

export const onRequestGet: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
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
    return Response.json({ error: needsIndividualAccount ? "needs_individual_account" : "forbidden" }, { status: 403 });
  }

  const channelId = ctx.params.channelId as string;
  if (!(await isChannelMember(client, channelId, participant))) {
    return Response.json({ error: "not_a_member" }, { status: 403 });
  }

  const before = new URL(ctx.request.url).searchParams.get("before");

  let query = client
    .from("chat_messages")
    .select("id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) query = query.lt("created_at", before);

  const { data: rows, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const msgRows = ((rows ?? []) as MessageRow[]).slice().reverse(); // oldest-first for render

  // Resolve sender names: split ids by kind, look up both tables once.
  const staffIds = [...new Set(msgRows.filter((m) => m.sender_kind === "staff").map((m) => m.sender_id))];
  const adminIds = [...new Set(msgRows.filter((m) => m.sender_kind === "admin").map((m) => m.sender_id))];
  const nameByKey = new Map<string, string>();

  const lookups: PromiseLike<unknown>[] = [];
  if (staffIds.length > 0) {
    lookups.push(
      client
        .from("staff_accounts")
        .select("id, name")
        .in("id", staffIds)
        .then(({ data }) => {
          for (const s of (data ?? []) as { id: string; name: string }[]) nameByKey.set(`staff:${s.id}`, s.name);
        }),
    );
  }
  if (adminIds.length > 0) {
    lookups.push(
      client
        .from("admin_accounts")
        .select("id, name")
        .in("id", adminIds)
        .then(({ data }) => {
          for (const a of (data ?? []) as { id: string; name: string }[]) nameByKey.set(`admin:${a.id}`, a.name);
        }),
    );
  }

  // Attachments for the page (only for non-deleted messages).
  const liveMessageIds = msgRows.filter((m) => !m.deleted_at).map((m) => m.id);
  const attByMessage = new Map<string, AttachmentRow[]>();
  if (liveMessageIds.length > 0) {
    lookups.push(
      client
        .from("chat_attachments")
        .select("id, message_id, file_name, mime_type, size_bytes, width, height")
        .in("message_id", liveMessageIds)
        .then(({ data }) => {
          for (const a of (data ?? []) as AttachmentRow[]) {
            if (!a.message_id) continue;
            const list = attByMessage.get(a.message_id) ?? [];
            list.push(a);
            attByMessage.set(a.message_id, list);
          }
        }),
    );
  }
  await Promise.all(lookups);

  const messages = msgRows.map((m) => ({
    id: m.id,
    channelId: m.channel_id,
    senderKind: m.sender_kind,
    senderId: m.sender_id,
    senderName: nameByKey.get(`${m.sender_kind}:${m.sender_id}`) ?? "Unknown",
    body: m.deleted_at ? "" : m.body,
    createdAt: m.created_at,
    editedAt: m.edited_at,
    deletedAt: m.deleted_at,
    attachments: m.deleted_at ? [] : (attByMessage.get(m.id) ?? []).map(attachmentDTO),
  }));

  return Response.json({ messages });
};

export const onRequestPost: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
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
    return Response.json({ error: needsIndividualAccount ? "needs_individual_account" : "forbidden" }, { status: 403 });
  }

  const channelId = ctx.params.channelId as string;
  if (!(await isChannelMember(client, channelId, participant))) {
    return Response.json({ error: "not_a_member" }, { status: 403 });
  }

  const body = await readJsonBody<SendBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const text = (body.body ?? "").trim();
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id) => typeof id === "string")
    : [];
  if (!text && attachmentIds.length === 0) {
    return Response.json({ error: "empty_message" }, { status: 400 });
  }

  const { data: inserted, error: insErr } = await client
    .from("chat_messages")
    .insert({
      channel_id: channelId,
      tenant_id: tenantId,
      sender_kind: participant.kind,
      sender_id: participant.id,
      body: text,
    })
    .select("id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at")
    .single();
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  const message = inserted as MessageRow;

  // Link attachments that belong to this tenant and are not yet attached.
  let attachmentDTOs: ReturnType<typeof attachmentDTO>[] = [];
  if (attachmentIds.length > 0) {
    const { data: linked, error: attErr } = await client
      .from("chat_attachments")
      .update({ message_id: message.id })
      .in("id", attachmentIds)
      .eq("tenant_id", tenantId)
      .is("message_id", null)
      .select("id, message_id, file_name, mime_type, size_bytes, width, height");
    if (attErr) return Response.json({ error: attErr.message }, { status: 500 });
    attachmentDTOs = ((linked ?? []) as AttachmentRow[]).map(attachmentDTO);
  }

  // Ping the other members (notify only, no content). Never blocks the response.
  const { data: members } = await client
    .from("chat_channel_members")
    .select("member_kind, member_id")
    .eq("channel_id", channelId);
  const recipients = ((members ?? []) as { member_kind: string; member_id: string }[])
    .filter((m) => !(m.member_kind === participant.kind && m.member_id === participant.id))
    .map((m) => ({ kind: m.member_kind, id: m.member_id }));
  ctx.waitUntil(notifyParticipants(ctx.env, recipients, { kind: "message", channelId }));
  // OS push to the same recipients. Best-effort: a push failure must never fail
  // the send, hence waitUntil + sendChatPush's internal try/catch.
  ctx.waitUntil(
    sendChatPush(ctx.env, recipients, {
      title: participant.name,
      body: chatPreview(text),
      url: "/comms",
    }),
  );

  return Response.json({
    message: {
      id: message.id,
      channelId: message.channel_id,
      senderKind: message.sender_kind,
      senderId: message.sender_id,
      senderName: participant.name,
      body: message.body,
      createdAt: message.created_at,
      editedAt: message.edited_at,
      deletedAt: message.deleted_at,
      attachments: attachmentDTOs,
    },
  });
};

import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { notifyParticipants } from "../../../../lib/chatRealtime";
import { sendChatPush, chatPreview } from "../../../../lib/chatPush";

interface SendBody {
  body?: string;
}

interface ChatMessageDTO {
  id: string;
  channelId: string;
  senderKind: "staff" | "admin";
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: never[];
}

// POST /api/admin/messages/:channelId/send  (admin-only)
export const onRequestPost: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const channelId = ctx.params.channelId as string;
  const admin = ctx.data.admin!;

  let payload: SendBody = {};
  try {
    payload = (await ctx.request.json()) as SendBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const text = (payload.body ?? "").trim();
  if (!text) return Response.json({ error: "body is required" }, { status: 400 });

  // Guard: only Hauck threads, and capture the tenant id for the insert.
  const { data: channel } = await client
    .from("chat_channels")
    .select("id, kind, tenant_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || (channel as { kind: string }).kind !== "hauck") {
    return Response.json({ error: "not a hauck thread" }, { status: 404 });
  }
  const tenantId = (channel as { tenant_id: string }).tenant_id;

  const { data: inserted, error } = await client
    .from("chat_messages")
    .insert({
      channel_id: channelId,
      tenant_id: tenantId,
      sender_kind: "admin",
      sender_id: admin.id,
      body: text,
    })
    .select("id, created_at, edited_at, deleted_at")
    .single();
  if (error || !inserted) {
    return Response.json({ error: error?.message ?? "could not send" }, { status: 500 });
  }
  const row = inserted as {
    id: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  };

  // Notify the one non-admin member so their browser refetches the thread.
  const { data: staffMembers } = await client
    .from("chat_channel_members")
    .select("member_kind, member_id")
    .eq("channel_id", channelId)
    .eq("member_kind", "staff");
  const clientMembers = ((staffMembers ?? []) as { member_kind: string; member_id: string }[]).map(
    (m) => ({ kind: m.member_kind, id: m.member_id }),
  );
  ctx.waitUntil(notifyParticipants(ctx.env, clientMembers, { kind: "message", channelId }));
  ctx.waitUntil(
    sendChatPush(ctx.env, clientMembers, {
      title: "Hauck Marketing",
      body: chatPreview(text),
      url: "/comms",
    }),
  );

  const message: ChatMessageDTO = {
    id: row.id,
    channelId,
    senderKind: "admin",
    senderId: admin.id,
    senderName: admin.name,
    body: text,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    attachments: [],
  };
  return Response.json({ message }, { status: 201 });
};

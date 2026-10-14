import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { resolveParticipant, isChannelMember } from "../../../lib/participants";

interface AttachmentRow {
  id: string;
  message_id: string | null;
  uploader_kind: string;
  uploader_id: string;
  storage_path: string;
}

export const onRequestGet: PagesFunction<Env, "attachmentId", ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) {
    return Response.json({ error: "no_identity" }, { status: 403 });
  }

  const attachmentId = ctx.params.attachmentId as string;
  const { data: att } = await client
    .from("chat_attachments")
    .select("id, message_id, uploader_kind, uploader_id, storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  const row = att as AttachmentRow | null;
  if (!row) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let allowed = false;
  if (row.message_id) {
    const { data: msg } = await client
      .from("chat_messages")
      .select("channel_id")
      .eq("id", row.message_id)
      .maybeSingle();
    const channelId = (msg as { channel_id?: string } | null)?.channel_id;
    allowed = channelId
      ? await isChannelMember(client, channelId, participant)
      : false;
  } else {
    // Unlinked upload: only the uploader can read it back.
    allowed =
      row.uploader_kind === participant.kind &&
      row.uploader_id === participant.id;
  }
  if (!allowed) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: signed, error } = await client.storage
    .from("chat-attachments")
    .createSignedUrl(row.storage_path, 300);
  if (error || !signed) {
    return Response.json(
      { error: error?.message ?? "sign_failed" },
      { status: 500 },
    );
  }

  return Response.json({ url: signed.signedUrl });
};

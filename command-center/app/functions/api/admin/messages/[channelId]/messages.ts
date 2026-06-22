import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";

// Mirrors ChatMessageDTO in src/lib/api.ts. Attachments are not surfaced on the
// admin reply view in this phase, so the array is always empty here.
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

interface MessageRow {
  id: string;
  channel_id: string;
  sender_kind: "staff" | "admin";
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  staff_accounts: { name: string } | null;
  admin_accounts: { name: string } | null;
}

function toDTO(row: MessageRow): ChatMessageDTO {
  const senderName =
    row.sender_kind === "admin"
      ? row.admin_accounts?.name ?? "Hauck"
      : row.staff_accounts?.name ?? "Member";
  return {
    id: row.id,
    channelId: row.channel_id,
    senderKind: row.sender_kind,
    senderId: row.sender_id,
    senderName,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    attachments: [],
  };
}

// GET /api/admin/messages/:channelId/messages  (admin-only)
export const onRequestGet: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const channelId = ctx.params.channelId as string;
  const adminId = ctx.data.admin!.id;

  const { data: channel } = await client
    .from("chat_channels")
    .select("id, kind")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || (channel as { kind: string }).kind !== "hauck") {
    return Response.json({ error: "not a hauck thread" }, { status: 404 });
  }

  const { data, error } = await client
    .from("chat_messages")
    .select(
      "id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at, staff_accounts(name), admin_accounts(name)",
    )
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const messages = ((data ?? []) as unknown as MessageRow[]).map(toDTO);

  // Mark this admin's copy of the thread read.
  await client
    .from("chat_channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("member_kind", "admin")
    .eq("member_id", adminId);

  return Response.json({ messages });
};

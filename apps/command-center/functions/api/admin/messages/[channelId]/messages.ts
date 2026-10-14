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
}

function toDTO(row: MessageRow, nameByKey: Map<string, string>): ChatMessageDTO {
  const senderName = nameByKey.get(`${row.sender_kind}:${row.sender_id}`) ?? (row.sender_kind === "admin" ? "Hauck" : "Member");
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
    .select("id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as MessageRow[];

  // Resolve sender names via explicit lookups (sender_id is polymorphic, no FK to
  // staff_accounts or admin_accounts, so PostgREST embeds would fail at runtime).
  const staffIds = [...new Set(rows.filter((m) => m.sender_kind === "staff").map((m) => m.sender_id))];
  const adminIds = [...new Set(rows.filter((m) => m.sender_kind === "admin").map((m) => m.sender_id))];
  const nameByKey = new Map<string, string>();

  const lookups: PromiseLike<unknown>[] = [];
  if (staffIds.length > 0) {
    lookups.push(
      client
        .from("staff_accounts")
        .select("id, name")
        .in("id", staffIds)
        .then(({ data: sd }) => {
          for (const s of (sd ?? []) as { id: string; name: string }[]) nameByKey.set(`staff:${s.id}`, s.name);
        }),
    );
  }
  if (adminIds.length > 0) {
    lookups.push(
      client
        .from("admin_accounts")
        .select("id, name")
        .in("id", adminIds)
        .then(({ data: ad }) => {
          for (const a of (ad ?? []) as { id: string; name: string }[]) nameByKey.set(`admin:${a.id}`, a.name);
        }),
    );
  }
  await Promise.all(lookups);

  const messages = rows.map((row) => toDTO(row, nameByKey));

  // Mark this admin's copy of the thread read.
  await client
    .from("chat_channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("member_kind", "admin")
    .eq("member_id", adminId);

  return Response.json({ messages });
};

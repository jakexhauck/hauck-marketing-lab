import type { Env, ApiData } from "../../lib/env";
import { ghlJson } from "../../lib/ghl";

interface GhlConversation {
  id: string;
  contactId?: string;
  fullName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  lastMessageBody?: string;
  lastMessageType?: string;
  lastMessageDate?: string;
  unreadCount?: number;
  type?: string;
}

interface SearchResp {
  conversations?: GhlConversation[];
  total?: number;
}

export interface ApiConversation {
  id: string;
  contactId: string;
  name: string;
  preview: string;
  lastMessageType: string;
  lastMessageAt: string;
  unreadCount: number;
}

function isSystemActivity(t?: string): boolean {
  if (!t) return false;
  const upper = t.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const data = await ghlJson<SearchResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/conversations/search?locationId=${encodeURIComponent(t.ghl_location_id)}&limit=100&sort=desc&sortBy=last_message_date`,
  );

  const items = (data.conversations ?? [])
    .filter((c) => Boolean(c.contactId))
    .map((c) => {
      const name =
        c.fullName ||
        c.contactName ||
        c.email ||
        c.phone ||
        "Unknown";
      const previewRaw = c.lastMessageBody ?? "";
      const preview = isSystemActivity(c.lastMessageType)
        ? ""
        : previewRaw;
      return {
        id: c.id,
        contactId: c.contactId as string,
        name,
        preview,
        lastMessageType: c.lastMessageType ?? "",
        lastMessageAt: c.lastMessageDate ?? new Date().toISOString(),
        unreadCount: c.unreadCount ?? 0,
      } satisfies ApiConversation;
    });

  return Response.json({ conversations: items, total: items.length });
};

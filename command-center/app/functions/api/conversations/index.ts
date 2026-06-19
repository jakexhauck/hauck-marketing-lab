import type { Env, ApiData } from "../../lib/env";
import { fetchAllConversations } from "../../lib/ghl";

export interface ApiConversation {
  id: string;
  contactId: string;
  name: string;
  preview: string;
  lastMessageType: string;
  lastMessageAt: string;
  unreadCount: number;
}

function isSystemActivity(t?: string | number): boolean {
  if (typeof t !== "string" || !t) return false;
  const upper = t.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;

  // Paginated across every conversation (shared helper), so the inbox is not
  // capped at the first 100.
  const all = await fetchAllConversations({
    token: t.ghl_token,
    locationId: t.ghl_location_id,
  });

  // Drop system / activity conversations; shape the rest for the inbox.
  const items = all
    .filter((c) => Boolean(c.contactId))
    .map((c) => {
      const name = c.fullName || c.contactName || c.email || c.phone || "Unknown";
      const previewRaw = c.lastMessageBody ?? "";
      const preview = isSystemActivity(c.lastMessageType) ? "" : previewRaw;
      const atMs =
        typeof c.lastMessageDate === "number"
          ? c.lastMessageDate
          : c.lastMessageDate
            ? +new Date(c.lastMessageDate)
            : NaN;
      return {
        id: c.id,
        contactId: c.contactId as string,
        name,
        preview,
        lastMessageType:
          typeof c.lastMessageType === "string" ? c.lastMessageType : "",
        lastMessageAt: Number.isFinite(atMs)
          ? new Date(atMs).toISOString()
          : new Date().toISOString(),
        unreadCount: c.unreadCount ?? 0,
      } satisfies ApiConversation;
    });

  return Response.json({ conversations: items, total: items.length });
};

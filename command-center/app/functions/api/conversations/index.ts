import type { Env, ApiData } from "../../lib/env";
import { fetchAllConversations, fetchAllContacts } from "../../lib/ghl";
import { classifyOrigin, normalizeChannel } from "../../lib/origin";
import type { OriginKey, ChannelKey } from "../../lib/origin";

export interface ApiConversation {
  id: string;
  contactId: string;
  name: string;
  preview: string;
  lastMessageType: string;
  lastMessageAt: string;
  unreadCount: number;
  channel: ChannelKey;
  origin: OriginKey;
  source: string;
  firstTouchAt: string;
}

function isSystemActivity(t?: string | number): boolean {
  if (typeof t !== "string" || !t) return false;
  const upper = t.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  // Conversations + the contact roster (for source/tags), fetched in parallel.
  const [all, contacts] = await Promise.all([
    fetchAllConversations(gctx),
    fetchAllContacts(gctx),
  ]);

  const byContact = new Map(contacts.map((c) => [c.id, c]));

  const items = all
    .filter((c) => Boolean(c.contactId))
    .map((c) => {
      const contact = byContact.get(c.contactId as string);
      const name = c.fullName || c.contactName || c.email || c.phone || "Unknown";
      const previewRaw = c.lastMessageBody ?? "";
      const preview = isSystemActivity(c.lastMessageType) ? "" : previewRaw;
      const atMs =
        typeof c.lastMessageDate === "number"
          ? c.lastMessageDate
          : c.lastMessageDate
            ? +new Date(c.lastMessageDate)
            : NaN;
      const lastType =
        typeof c.lastMessageType === "string" ? c.lastMessageType : "";
      return {
        id: c.id,
        contactId: c.contactId as string,
        name,
        preview,
        lastMessageType: lastType,
        lastMessageAt: Number.isFinite(atMs)
          ? new Date(atMs).toISOString()
          : new Date().toISOString(),
        unreadCount: c.unreadCount ?? 0,
        channel: normalizeChannel(lastType),
        origin: classifyOrigin(contact?.source, contact?.tags),
        source: contact?.source ?? "",
        firstTouchAt: contact?.dateAdded ?? "",
      } satisfies ApiConversation;
    });

  return Response.json({ conversations: items, total: items.length });
};

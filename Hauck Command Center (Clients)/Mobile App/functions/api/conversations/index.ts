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
  // Documented as a string enum, but GHL's types lie elsewhere in this
  // response (see lastMessageDate), so treat it as untrusted too.
  lastMessageType?: string | number;
  // Epoch millis in raw search responses, but tolerate ISO strings.
  lastMessageDate?: string | number;
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

function isSystemActivity(t?: string | number): boolean {
  if (typeof t !== "string" || !t) return false;
  const upper = t.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;

  const base = `/conversations/search?locationId=${encodeURIComponent(t.ghl_location_id)}&limit=100&sort=desc&sortBy=last_message_date`;

  const all: GhlConversation[] = [];
  const seen = new Set<string>();
  // The search endpoint does not return cursors; its pagination mechanism is
  // startAfterDate, derived from the last conversation's sort key (epoch ms,
  // matching sortBy=last_message_date).
  let startAfterDate: number | undefined;
  let pageCount = 0;
  const maxPages = 10;

  const sortKeyMs = (c: GhlConversation): number | undefined => {
    if (typeof c.lastMessageDate === "number") return c.lastMessageDate;
    if (c.lastMessageDate) {
      const t = +new Date(c.lastMessageDate);
      if (Number.isFinite(t)) return t;
    }
    return undefined;
  };

  while (pageCount < maxPages) {
    const path =
      startAfterDate === undefined
        ? base
        : `${base}&startAfterDate=${encodeURIComponent(String(startAfterDate))}`;

    const data = await ghlJson<SearchResp>(
      { token: t.ghl_token, locationId: t.ghl_location_id },
      path,
    );

    const page = data.conversations ?? [];
    for (const c of page) {
      if (c.id && !seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }

    // Stop on the natural last page (short page).
    if (page.length < 100) break;

    const next = sortKeyMs(page[page.length - 1]);
    if (next === undefined || next === startAfterDate) break;
    startAfterDate = next;

    pageCount += 1;
  }

  if (pageCount >= maxPages) {
    console.warn(
      `conversations pagination hit maxPages cap for location ${t.ghl_location_id}`,
    );
  }

  // Preserve the post-filter that drops system / activity conversations.
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

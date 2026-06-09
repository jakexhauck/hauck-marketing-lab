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
  startAfterId?: string;
  startAfter?: string;
  nextPageUrl?: string;
  meta?: {
    total?: number;
    startAfterId?: string;
    startAfter?: string;
    nextPageUrl?: string;
  };
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

  const base = `/conversations/search?locationId=${encodeURIComponent(t.ghl_location_id)}&limit=100&sort=desc&sortBy=last_message_date`;

  const all: GhlConversation[] = [];
  const seen = new Set<string>();
  // Cursor state. The conversations-search response may carry cursor fields at
  // the top level or under meta, and may use either a full nextPageUrl or
  // startAfterId / startAfter. Handle all of them defensively.
  let nextPageUrl: string | undefined;
  let startAfterId: string | undefined;
  let startAfter: string | undefined;
  let pageCount = 0;
  const maxPages = 10;

  while (pageCount < maxPages) {
    let path: string;
    if (nextPageUrl) {
      path = nextPageUrl;
    } else {
      path = base;
      if (startAfterId)
        path += `&startAfterId=${encodeURIComponent(startAfterId)}`;
      if (startAfter) path += `&startAfter=${encodeURIComponent(startAfter)}`;
    }

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

    // Stop on the natural last page (short page) regardless of cursor style.
    if (page.length < 100) break;

    const next = data.meta?.nextPageUrl ?? data.nextPageUrl;
    const nextId = data.meta?.startAfterId ?? data.startAfterId;
    const nextTs = data.meta?.startAfter ?? data.startAfter;

    if (next) {
      if (next === nextPageUrl) break;
      nextPageUrl = next;
    } else {
      if (!nextId || nextId === startAfterId) break;
      startAfterId = nextId;
      startAfter = nextTs;
    }

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

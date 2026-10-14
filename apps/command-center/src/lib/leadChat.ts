import type { ApiConversation } from "./api";

export interface UnreadInfo {
  unreadCount: number;
  lastMessageAt: string;
  channel: string;
}

export type UnreadIndex = Map<string, UnreadInfo>;

// contactId -> the lastMessageAt the operator has already opened.
export type SeenMap = Record<string, string>;

// Index the conversations feed by contactId so a lead card can look up its
// unread state in O(1) by the contactId it already carries.
export function buildUnreadIndex(conversations: ApiConversation[]): UnreadIndex {
  const index: UnreadIndex = new Map();
  for (const c of conversations) {
    if (!c.contactId) continue;
    index.set(c.contactId, {
      unreadCount: c.unreadCount ?? 0,
      lastMessageAt: c.lastMessageAt,
      channel: c.channel ?? "other",
    });
  }
  return index;
}

// A lead is "unread" when its contact has genuinely new inbound waiting
// (unreadCount > 0, straight from the messaging feed) AND its newest message
// is not the one we already opened. Opening a chat records lastMessageAt as
// seen, so the badge clears at once and only re-lights on a newer inbound.
export function leadUnreadCount(
  index: UnreadIndex,
  contactId: string | null | undefined,
  seen: SeenMap,
): number {
  if (!contactId) return 0;
  const info = index.get(contactId);
  if (!info || info.unreadCount <= 0) return 0;
  if (seen[contactId] === info.lastMessageAt) return 0;
  return info.unreadCount;
}

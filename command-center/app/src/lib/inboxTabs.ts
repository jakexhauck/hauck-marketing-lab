// The Inbox queue: one flat list of every conversation, search-filtered and
// sorted. It used to be a ten-tab strip slicing by Sales stage and lead source;
// that collapsed to a single "Inbox" tab matching everything, and the strip was
// then removed outright because a one-option control that repeated the page
// title was pure noise.
//
// INBOX_TABS survives as the queue's match + sort definition, not as a UI
// control. Nothing renders it. If per-stage filtering ever comes back, add the
// entries here and a strip built on TAB_TRACK / TabButton from PageTabs.
import { sortForQueue } from "./stageGroups";
import type { ApiConversation } from "./api";

export interface InboxTab {
  key: string;
  label: string;
  match: (c: ApiConversation) => boolean;
}

export const INBOX_TABS: InboxTab[] = [
  { key: "all", label: "Inbox", match: () => true },
];

export const DEFAULT_INBOX_TAB = INBOX_TABS[0].key;

export function tabByKey(key: string): InboxTab {
  return INBOX_TABS.find((t) => t.key === key) ?? INBOX_TABS[0];
}

// The active tab's conversations, search-filtered (name + preview) and in queue
// order (unread first, longest-wait on top).
export function conversationsForTab(
  items: ApiConversation[],
  tabKey: string,
  search: string,
): ApiConversation[] {
  const tab = tabByKey(tabKey);
  const q = search.trim().toLowerCase();
  const filtered = items.filter((c) => {
    if (!tab.match(c)) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)
    );
  });
  return sortForQueue(filtered);
}

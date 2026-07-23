// The Inbox tab strip. A single "Inbox" tab that shows every conversation. It
// used to be a ten-tab strip that sliced the queue by Sales stage and by lead
// source, but the Inbox now presents one flat queue, so there is just the one
// tab here.
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

// No source tabs anymore, so the strip never draws its old stage/source divider.
// Kept (as -1) so InboxTabStrip's `i === FIRST_SOURCE_TAB_INDEX` check imports
// cleanly and simply never matches.
export const FIRST_SOURCE_TAB_INDEX = INBOX_TABS.findIndex((t) =>
  t.key.startsWith("source:"),
);

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

// The Inbox tab strip. One flat row of tabs across the top of the Inbox that
// replaces the old collapsible stage-group list and the organic/Facebook source
// chips. The first seven mirror the live Willis Sales pipeline stages (folded
// through stageGroups.ts, so the same substring mapping and emoji-tolerance
// apply); the last two are lead-source views (chat widget / estimate form) that
// cut ACROSS every stage. A chat-origin New Lead therefore counts under both
// "New Leads" and "Chat Widget" — the overlap is intended.
//
// Order is load-bearing: "New Leads" is leftmost and the default tab. The two
// stages Jake retired from the live pipeline (Estimate Completed, Follow Up)
// have no tab here, though stageGroups.ts still maps them so nothing crashes.
import {
  mapStageNameToGroup,
  sortForQueue,
  type StageGroupKey,
} from "./stageGroups";
import { convOrigin, type OriginKey } from "./inboxFilters";
import type { ApiConversation } from "./api";

export interface InboxTab {
  key: string;
  label: string;
  match: (c: ApiConversation) => boolean;
}

const stageTab = (group: StageGroupKey, label: string): InboxTab => ({
  key: `stage:${group}`,
  label,
  match: (c) => mapStageNameToGroup(c.stageName) === group,
});

const sourceTab = (origin: OriginKey, label: string): InboxTab => ({
  key: `source:${origin}`,
  label,
  match: (c) => convOrigin(c) === origin,
});

export const INBOX_TABS: InboxTab[] = [
  stageTab("new", "New Leads"),
  stageTab("hot_lead", "Hot Lead"),
  stageTab("phone_appt", "Phone Appt"),
  stageTab("estimate_scheduled", "Estimate Scheduled"),
  stageTab("job_booked", "Job Booked"),
  stageTab("job_completed", "Job Completed"),
  stageTab("closed", "Closed"),
  sourceTab("chat", "Chat Widget"),
  sourceTab("form", "Estimate Form"),
];

export const DEFAULT_INBOX_TAB = INBOX_TABS[0].key;

export function tabByKey(key: string): InboxTab {
  return INBOX_TABS.find((t) => t.key === key) ?? INBOX_TABS[0];
}

// One pass over the list, tallying every tab a conversation belongs to (a
// conversation can hit one stage tab and one source tab at once).
export function countByTab(items: ApiConversation[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of INBOX_TABS) out[t.key] = 0;
  for (const c of items) {
    for (const t of INBOX_TABS) if (t.match(c)) out[t.key] += 1;
  }
  return out;
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

// The Inbox tab strip. One flat row of tabs across the top of the Inbox that
// replaces the old collapsible stage-group list and the organic/Facebook source
// chips. The first seven mirror the live Willis Sales pipeline stages (folded
// through stageGroups.ts, so the same substring mapping and emoji-tolerance
// apply); the last two are lead-source views (chat widget / estimate form) that
// cut ACROSS every stage. A chat-origin New Lead therefore counts under both
// "New Leads" and "Chat Widget" — the overlap is intended.
//
// Order is load-bearing: "New Leads" is leftmost and the default tab. Stages with
// no tab (Estimate Completed, Follow Up, and everything mapping to "closed") do
// not appear in the Inbox at all. That is deliberate for the two it fully hides:
// Trash is trash, and Google Reviews contacts have their own Chats page (every
// GR stage name contains "review"/"feedback", which the "closed" rule catches).
//
// Reactivation is NOT fully hidden, and no tab here can hide it: only its
// dead-end stages ("No Answer", "No Show", "Not Qualified") map to "closed". Its
// live stages "Estimate Scheduled", "Quote Given", "Apt Completed" (see
// functions/api/campaigns/reactivation.ts) map to estimate_scheduled / new, so a
// Reactivation-only contact still surfaces under Estimate or New Leads. That is
// pre-existing behaviour, not something the tab list decides — fixing it means
// filtering on pipeline, not stage name.
import {
  mapStageNameToGroup,
  sortForQueue,
  type StageGroupKey,
} from "./stageGroups";
import { convOrigin, type OriginKey } from "./inboxFilters";
import { convPipelines, type ApiConversation } from "./api";

export interface InboxTab {
  key: string;
  label: string;
  match: (c: ApiConversation) => boolean;
}

// The Inbox is the SALES pipeline's queue, so a stage tab must read the contact's
// Sales position specifically. `c.stageName` is whichever single opportunity the
// backend chose, which for a past customer is a coin flip between Sales "Job
// Completed" and Google Reviews "Asked For Review" — reading it directly would
// drop the lead out of Job Completed at random. Falls back to `c.stageName` when
// the contact has no Sales opportunity (or the payload predates `pipelines`).
// Matched by substring, not equality: live Willis calls it "Sales", but a tenant
// may well name theirs "Sales Pipeline" (the demo tenant's is "Roofing Sales
// Pipeline"). The other live pipelines — Reactivation, Trash, Google Reviews —
// contain no "sales", so this stays unambiguous.
export function salesStageName(c: ApiConversation): string | undefined {
  const sales = convPipelines(c).find((p) =>
    p.pipelineName.toLowerCase().includes("sales"),
  );
  return sales ? sales.stageName : c.stageName;
}

const stageTab = (group: StageGroupKey, label: string): InboxTab => ({
  key: `stage:${group}`,
  label,
  match: (c) => mapStageNameToGroup(salesStageName(c)) === group,
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
  // "Estimate" and "Nurture" are deliberately shorter than their GHL stage names
  // ("Estimate Scheduled", "Long Term Nurture"): at full length the ten tabs
  // overflow the title line by ~140px at 1440 and clip the two source tabs.
  stageTab("estimate_scheduled", "Estimate"),
  stageTab("job_booked", "Job Booked"),
  stageTab("job_completed", "Job Completed"),
  stageTab("long_term_nurture", "Nurture"),
  sourceTab("chat", "Chat Widget"),
  sourceTab("form", "Estimate Form"),
];

// Where the source tabs begin. The strip draws a divider here: everything before
// is a Sales stage, everything after cuts across stages by lead source.
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

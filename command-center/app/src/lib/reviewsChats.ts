// The Google Reviews Chats tab strip: the review-request conversations, sliced
// by their position in the live GHL "Google Reviews" pipeline.
//
// Why this cannot reuse inboxTabs/stageGroups: a review-request contact is a past
// customer, so they hold a Sales opportunity AND a Google Reviews one at the same
// time. `c.stageName` is whichever single opportunity the backend picked, which
// is a coin flip between the two — so this reads `pipelines[]` and matches the
// Google Reviews entry by pipeline NAME (never the id, which differs per tenant).
// stageGroups.ts is no help either: its "closed" rule swallows every stage name
// containing "review" or "feedback" into one bucket.
//
// Live stages pulled from `ghl opportunities pipelines` 2026-07-16 — re-check the
// live account before changing these, the names drift as the pipeline is edited.
import { sortForQueue } from "./stageGroups";
import { convPipelines, type ApiConversation } from "./api";

export const REVIEWS_PIPELINE_NAME = "google reviews";
// Live Willis id, the last resort if the pipeline is renamed past recognition.
// Same exact -> contains -> known-id ladder the other pipeline resolvers use
// (see functions/api/campaigns/reactivation.ts, api/sales/leads/index.ts).
export const REVIEWS_PIPELINE_ID = "R76ncRGrODiJuDJJTUWR";

export interface ReviewsChatTab {
  key: string;
  label: string;
  // Substring of the live GHL stage name, lowercased. Matched by substring so the
  // emoji GHL may append to a stage name stays harmless.
  match: string;
}

// Labels are deliberately shorter than the GHL stage names they match: at full
// length these four overflow the title line by ~100px at 1440 and clip the last
// tab. They sit under a "Google Reviews > Chats" header, so the short forms are
// unambiguous in place. `match` still carries the real stage name.
export const REVIEWS_CHAT_TABS: ReviewsChatTab[] = [
  { key: "asked", label: "Asked", match: "asked for review" },
  { key: "clicked", label: "Clicked", match: "review link clicked" },
  { key: "negative", label: "Negative", match: "negative feedback" },
  { key: "positive", label: "Positive", match: "positive review" },
];

export const DEFAULT_REVIEWS_CHAT_TAB = REVIEWS_CHAT_TABS[0].key;

export function reviewsTabByKey(key: string): ReviewsChatTab {
  return REVIEWS_CHAT_TABS.find((t) => t.key === key) ?? REVIEWS_CHAT_TABS[0];
}

// The contact's stage in the Google Reviews pipeline, or undefined if they are
// not in it at all (most of the inbox).
//
// Resolved exact name -> name contains -> known id, because the live pipeline
// name drifts: it already carries emoji on every stage, and a rename to
// "Google Reviews 2026" under an exact match would empty this whole page while
// still rendering the honest "no review requests yet" state — a silent failure
// indistinguishable from working correctly.
export function reviewsStageName(c: ApiConversation): string | undefined {
  const all = convPipelines(c);
  const norm = (s: string) => s.trim().toLowerCase();
  const p =
    all.find((x) => norm(x.pipelineName) === REVIEWS_PIPELINE_NAME) ??
    all.find((x) => norm(x.pipelineName).includes(REVIEWS_PIPELINE_NAME)) ??
    all.find((x) => norm(x.pipelineName).includes("review")) ??
    all.find((x) => x.pipelineId === REVIEWS_PIPELINE_ID);
  return p?.stageName;
}

export function isReviewConversation(c: ApiConversation): boolean {
  return reviewsStageName(c) !== undefined;
}

export function matchesReviewsTab(c: ApiConversation, key: string): boolean {
  const stage = reviewsStageName(c);
  if (!stage) return false;
  return stage.toLowerCase().includes(reviewsTabByKey(key).match);
}

// The active tab's conversations, search-filtered (name + preview) and in queue
// order (unread first, longest-wait on top).
export function conversationsForReviewsTab(
  items: ApiConversation[],
  tabKey: string,
  search: string,
): ApiConversation[] {
  const q = search.trim().toLowerCase();
  const filtered = items.filter((c) => {
    if (!matchesReviewsTab(c, tabKey)) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)
    );
  });
  return sortForQueue(filtered);
}

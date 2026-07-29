import type { SalesCallOutcome } from "./salesCalls";

// What a sales-call button writes to GoHighLevel.
//
// ONE TAG, and nothing else. This is the same arrangement the Setter Suite runs
// on (src/lib/setterStageActions.ts) and that Cold Call runs on
// (./agencyGhl.ts:CC_TAGS): the app states what happened, and Jake's own
// workflow decides what it means and moves the opportunity. The app writes no
// pipeline stage and creates no card.
//
// Until 0065 this surface did the opposite: it PUT a stage and a won/lost
// status straight onto the opportunity. That worked, but it made the app a
// second author of the board, and it meant every automation hanging off a sale
// had to be built in here rather than in the CRM where the rest of them live.
//
// THE ONE EXCEPTION is the cash figure on a close. No workflow can know what
// was collected on the call, so the app writes that single field onto the card
// and touches nothing else on it. See functions/api/lib/salesCallPush.ts.
//
// ---------------------------------------------------------------------------
// TAG NAMES LIVE HERE AND NOWHERE ELSE.
//
// Nothing else in the app spells a tag out, so renaming one is an edit to this
// object. They must match the tags the GoHighLevel workflows listen for
// exactly: a tag nobody built a workflow for is a button that appears to do
// nothing.
//
// The "sc " prefix is deliberate and matches the "cc " convention: it marks a
// tag as one this app writes, so a tag applied by a workflow, a form or by hand
// is never mistaken for one of ours and stripped.

export const SC_TAG_PREFIX = "sc ";

// VERIFIED AGAINST THE LIVE ACCOUNT 2026-07-29: every one of these exists as a
// real tag with a workflow behind it. Two of them did not until then (the app
// wrote "sc no close" and "sc not a fit", which nothing listened for), which is
// exactly the failure this comment is here to stop recurring: a tag with no
// workflow is a button that appears to work and does nothing.
export const SC_TAGS = {
  // Applied when a meeting is booked, before anybody has run it. This is the
  // one that has to CREATE the card: the app no longer makes opportunities, so
  // a workflow on this tag is what puts a new meeting on the board at all.
  booked: "sc booked",
  closed: "sc closed",
  followUp: "sc follow up",
  notInterested: "sc not interested",
  notQualified: "sc not qualified",
  noShow: "sc no show",
} as const;

// Every tag this app is allowed to write or remove. Anything outside this list
// belongs to somebody else and is left alone.
export const ALL_SC_TAGS: string[] = Object.values(SC_TAGS);

// What a button does to the contact: the one tag it leaves, and every other
// sales-call tag removed.
export interface SalesCallTagging {
  tag: string;
  // The others, taken off so a contact carries exactly one at a time. Without
  // this a filter on "sc no show" would keep returning somebody who has since
  // closed, and a workflow keyed to a tag being present would re-fire.
  removeTags: string[];
}

// "booked" is not an outcome (nothing has happened yet), so it is named
// separately rather than smuggled into the outcome union.
export type SalesCallTagEvent = SalesCallOutcome | "booked";

const TAG_FOR: Record<SalesCallTagEvent, string> = {
  booked: SC_TAGS.booked,
  closed: SC_TAGS.closed,
  follow_up: SC_TAGS.followUp,
  not_interested: SC_TAGS.notInterested,
  not_qualified: SC_TAGS.notQualified,
  no_show: SC_TAGS.noShow,
};

// The tagging for one event, or null for something with no meaning in
// GoHighLevel (a bug, or a new button nobody has mapped yet). Null rather than
// a guess: applying the nearest-looking tag would fire the wrong workflow, and
// a button that does nothing is easier to notice than one that does the wrong
// thing quietly.
export function tagsForSalesCall(event: string): SalesCallTagging | null {
  const tag = TAG_FOR[event as SalesCallTagEvent];
  if (!tag) return null;
  return { tag, removeTags: ALL_SC_TAGS.filter((t) => t !== tag) };
}

import { CC_TAGS, RETIRED_CC_TAGS, tagsForOutcome } from "./agencyGhl";
import { NEW_LEAD_TAG } from "./leadScraper";

// Making a GoHighLevel list mean the same thing as a page of the Cold Call
// suite.
//
// The two systems were already joined by tags: the app writes one when an
// outcome is pressed and Jake's workflows decide what it means over there. What
// was missing is the guarantee that makes a list usable for a power dialer.
// A Smart List filtered on "cc call back" only equals the Call Back page if
// every prospect on that page carries the tag AND nobody else does.
//
// So the rule here is EXCLUSIVE: a contact in the book carries exactly one of
// these tags, never two, never none. That single rule is what lets a Smart List
// be one filter with no "does not have" conditions bolted on, and it is why the
// reconcile removes as eagerly as it applies.
//
// `cc new lead` is inside the exclusive set (Jake's call, 2026-08-17). It used
// to be applied on import and never taken off, so a prospect called five times
// still read as new and the New Lead list was the only one that could not be
// trusted. Anything in GoHighLevel that watched that tag needs to expect it to
// be removed on the first outcome now.
//
// Pure. The endpoint does the talking.

// Which tag a lead's stored status means, in GoHighLevel.
//
// Booked is deliberately null: the demo lives on the Sales pipeline, and the
// appointment on the calendar is the state change. A booked prospect therefore
// carries NO cold call tag at all, which is also what stops them appearing in
// any dialing list.
export const STATUS_TAGS: Record<string, string | null> = {
  "New Lead": NEW_LEAD_TAG,
  "No Answer Day 1": CC_TAGS.noAnswerDay1,
  "No Answer Day 2": CC_TAGS.noAnswerDay2,
  "Call Back": CC_TAGS.callBack,
  "Not Interested": CC_TAGS.notInterested,
  Booked: null,
};

// Every tag the book owns and is therefore allowed to remove. Retired tags are
// removable and never applicable, same as in agencyGhl.ts: a tag we stop
// knowing about is a tag we stop tidying off contacts that still carry it.
export const BOOK_TAGS: string[] = [
  NEW_LEAD_TAG,
  ...Object.values(CC_TAGS),
];

export const OWNED_TAGS: string[] = [...BOOK_TAGS, ...RETIRED_CC_TAGS];

// The tag that hands a prospect to GoHighLevel's power dialer (Jake, 2026-08-18).
//
// NOT part of the exclusive set above, deliberately. Those tags say which stage
// of the book somebody is in; this one says only "put them on the phone next",
// so a prospect keeps their stage tag while they are queued and the dialer list
// can still be one filter on this tag alone.
//
// A hand-off rather than a state the app maintains: a workflow on Jake's side
// watches for it. It used to be applied and never removed, on the understanding
// that GoHighLevel decided what became of the list afterwards; it did not, and
// the list grew for ever. An answered call now takes the company back off it.
// See leavesTheDialer at the foot of this file.
export const POWER_DIALER_TAG = "Power Dialer";

// The workflow the tag above hands a prospect to, by the name it carries in the
// agency sub-account (confirmed live, published, 2026-08-24).
//
// Needed because taking a company back OFF the dialer means removing it from
// this workflow: the tag is only the trigger, and a manual action the workflow
// has already created outlives the tag that caused it. See leadReturn.ts.
//
// Found by name rather than held as an id for the same reason the dial bridge
// does it: an id in the source is an id nobody can see is wrong until a button
// stops working. Overridable by env for the same reason that one is.
export const POWER_DIALER_WORKFLOW_NAME = "1. | Power Dialer";

export function powerDialerWorkflowName(env: {
  AGENCY_GHL_POWER_DIALER_WORKFLOW?: string;
}): string {
  return (env.AGENCY_GHL_POWER_DIALER_WORKFLOW ?? "").trim() || POWER_DIALER_WORKFLOW_NAME;
}

// undefined means a status with no place in the cold call book at all, which is
// a lead the reconcile should skip rather than guess about.
export function tagForStatus(status: string): string | null | undefined {
  return status in STATUS_TAGS ? STATUS_TAGS[status] : undefined;
}

export interface TagPlan {
  apply: string[];
  remove: string[];
}

// What one contact needs, given the lead's status and the tags it carries now.
//
// Both lists are empty when the contact is already right, and the endpoint
// checks for that before making a request: on a settled book the reconcile
// costs one read and no writes, which is what makes it safe to press twice.
//
// Compared case-insensitively because GoHighLevel lowercases tags on the way in
// and a caller here should not have to know that. The tag WRITTEN is always our
// own spelling, so nothing drifts.
export function planContactTags(status: string, currentTags: string[]): TagPlan {
  const wanted = tagForStatus(status);
  if (wanted === undefined) return { apply: [], remove: [] };

  const have = new Set(currentTags.map((t) => (t ?? "").trim().toLowerCase()).filter(Boolean));
  const wantedKey = wanted?.toLowerCase() ?? null;

  const apply = wanted && wantedKey && !have.has(wantedKey) ? [wanted] : [];
  const remove = OWNED_TAGS.filter(
    (tag) => tag.toLowerCase() !== wantedKey && have.has(tag.toLowerCase()),
  );

  return { apply, remove };
}

// ---------------------------------------------------------------------------
// Coming back OFF the dialer's list.
//
// The list is a filter on POWER_DIALER_TAG, and until now nothing ever took
// that tag off again: send.ts put it on and said so in as many words ("Nothing
// here removes the tag"), on the understanding that GoHighLevel would decide
// what became of the list afterwards. It never did.
//
// So the list only ever grew. Measured against the live account on 2026-08-25:
// of the 685 companies carrying the tag, 559 had ALREADY been rung. 302 of them
// had said no, 15 had agreed a callback and 5 had booked a meeting. Every one
// was still being handed back to the caller, which is the duplicates Jake
// reported.
//
// A finished call therefore ends the company's place in the queue, exactly as
// Return to leads already does for one nobody has rung: out of the workflow
// first, because a manual action already created outlives the tag that caused
// it, and only then the tag (see leadReturn.ts, and agencyCrm.ts for the calls).
//
// A NO ANSWER is the deliberate exception. The conversation has not happened,
// so the company is still owed a call, and 233 of those 559 were exactly this:
// taking them off would have ended the second attempt rather than ended the
// duplicates.
//
// Unknown outcomes stay on. A button this file has not heard of is a reason to
// leave a queue alone, not to quietly empty somebody out of it.
const STAYS_ON_THE_DIALER = new Set(["no_answer"]);

// Which outcomes are real is asked of tagsForOutcome rather than answered again
// here. It already owns that switch, and a second list of the buttons would be
// a list that drifts the first time one is added.
export function leavesTheDialer(outcome: string): boolean {
  const key = (outcome ?? "").trim();
  if (!key || STAYS_ON_THE_DIALER.has(key)) return false;
  return tagsForOutcome(key) !== null;
}

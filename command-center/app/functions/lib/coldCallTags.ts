import { CC_TAGS, RETIRED_CC_TAGS } from "./agencyGhl";
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

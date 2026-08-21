import type { Env } from "./env";
import type { GhlContext } from "./ghl";
import { NEW_LEAD_TAG } from "./leadScraper";

// Hauck Marketing's OWN GoHighLevel account.
//
// Every other GHL path in this app is per client: the Setter Suite books into a
// client's calendar with that client's credentials. A cold caller booking a
// meeting for Jake is the opposite, and pointing it at a tenant's creds would
// put agency sales calls on a customer's calendar.
//
// So it has its own pair of secrets, agency-wide and not in the tenants table:
//
//   AGENCY_GHL_LOCATION_ID   the Hauck Marketing sub-account
//   AGENCY_GHL_TOKEN         a Private Integration token for it
//
// Absent, every agency booking route answers "not configured" rather than
// falling back to a client's account, which is the only safe direction to fail.

export class AgencyGhlError extends Error {
  code: "not_configured";
  constructor() {
    super("The agency GoHighLevel account is not connected.");
    this.code = "not_configured";
  }
}

export function getAgencyGhlContext(env: Env): GhlContext {
  const locationId = (env.AGENCY_GHL_LOCATION_ID ?? "").trim();
  const token = (env.AGENCY_GHL_TOKEN ?? "").trim();
  if (!locationId || !token) throw new AgencyGhlError();
  return { locationId, token };
}

export function isAgencyGhlConfigured(env: Env): boolean {
  return Boolean((env.AGENCY_GHL_LOCATION_ID ?? "").trim() && (env.AGENCY_GHL_TOKEN ?? "").trim());
}

// The agency's booking timezone. GHL's free-slot lookup needs one, and the
// account itself is set to New York; the env var lets that move without a
// deploy if the agency ever does.
export function agencyTimezone(env: Env): string {
  return (env.AGENCY_TIMEZONE ?? "").trim() || "America/New_York";
}

// ---------------------------------------------------------------------------
// What a cold call does to the contact in GoHighLevel.
//
// ONE tag, and nothing else. Jake drives every automation and every pipeline
// move from these tags inside GHL, so the app deliberately does not touch
// opportunities or stages: two systems moving the same card is how a pipeline
// ends up lying. The app states what happened; GHL decides what that means.
//
// The "cc " prefix is his, and it matters: it marks a tag as one this app
// writes, so a tag applied by a workflow, a form or by hand is never mistaken
// for one of ours and stripped.

export const CC_TAG_PREFIX = "cc ";

export const CC_TAGS = {
  noAnswerDay1: "cc no answer day 1",
  noAnswerDay2: "cc no answer day 2",
  notInterested: "cc not interested",
  callBack: "cc call back",
} as const;

// A tag this app no longer applies but must still CLEAN OFF a contact.
//
// "cc brush off" named a stage that migration 0056 deleted, so a contact still
// carrying it is carrying a pointer to a board column that does not exist.
// Dropping it from CC_TAGS alone would have left it stuck on those contacts for
// ever, because removeTags is built from the tags this app knows about: a tag it
// stops knowing is a tag it stops tidying.
export const RETIRED_CC_TAGS = ["cc brush off"] as const;

// Every tag this app is allowed to write or remove. Anything outside this list
// is somebody else's and is left alone. Retired tags are removable but never
// applicable, which is the whole reason they are listed separately above.
//
// NEW_LEAD_TAG is in here as of 2026-08-17 (Jake's call) and it is the one entry
// this file does not also apply. It is written on import, by leadScraper's push,
// and until now nothing ever took it off: a prospect called five times still
// read as new, so the New Lead list was the only one a power dialer could not be
// pointed at. Being removable makes the tags EXCLUSIVE, which is what lets a
// Smart List be one filter and still mean exactly one page of the book. See
// coldCallTags.ts for the rule in full.
export const ALL_CC_TAGS: string[] = [
  ...Object.values(CC_TAGS),
  NEW_LEAD_TAG,
  ...RETIRED_CC_TAGS,
];

export interface OutcomeTags {
  // The single tag this outcome leaves on the contact. Null for Booked: the
  // appointment on the calendar is the state change, so no tag is applied and
  // the previous one is simply cleared.
  tag: string | null;
  // Every other cc tag, removed so a contact carries exactly one at a time and
  // a filter on "cc no answer day 1" cannot return somebody who has since
  // booked.
  removeTags: string[];
}

// `attempt` is which no-answer this is for that prospect (1 = the first). It is
// counted from the recorded dials, not from a field anyone can type, and it
// stops at 2: day 1 and day 2 are the only two tags that exist, so a third
// unanswered call leaves them on day 2 rather than inventing a day 3 nobody
// built a workflow for.
export function tagsForOutcome(outcome: string, attempt = 1): OutcomeTags | null {
  const tag = tagForOutcome(outcome, attempt);
  if (tag === undefined) return null;
  return { tag, removeTags: ALL_CC_TAGS.filter((t) => t !== tag) };
}

// undefined = an outcome with no GHL meaning at all (a bug or a new button).
// null = an outcome that deliberately leaves no tag behind.
function tagForOutcome(outcome: string, attempt: number): string | null | undefined {
  switch (outcome) {
    case "no_answer":
      return attempt >= 2 ? CC_TAGS.noAnswerDay2 : CC_TAGS.noAnswerDay1;
    // All three nos land on the same GoHighLevel stage, because Not Interested
    // is the only terminal no column that board has. How far the call got is
    // OURS to report on (pass-through is the number that measures the script)
    // and is not something the CRM needs to model.
    //
    // Adding a tag per no would be inventing three automations Jake has not
    // built, and a tag no workflow watches is a tag that silently does nothing.
    case "not_qualified":
    case "opener_no":
    case "pitch_no":
    // A business in the wrong trade lands here too (0117). It is not a no we
    // report on, but the contact still has to stop being rung, and Not
    // Interested is the only terminal column that board has.
    case "not_in_niche":
      return CC_TAGS.notInterested;
    case "callback":
      return CC_TAGS.callBack;
    case "booked":
      return null;
    default:
      return undefined;
  }
}

// The GHL user a task is assigned to. One-man account today; the env var lets a
// second person take the callbacks without a deploy.
export function agencyGhlUserId(env: Env): string {
  return (env.AGENCY_GHL_USER_ID ?? "").trim() || "kQawsNSJbC7UApa6f4Am";
}

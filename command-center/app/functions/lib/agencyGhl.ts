import type { Env } from "./env";
import type { GhlContext } from "./ghl";

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
  brushOff: "cc brush off",
  notInterested: "cc not interested",
  callBack: "cc call back",
} as const;

// Every tag this app is allowed to write or remove. Anything outside this list
// is somebody else's and is left alone.
export const ALL_CC_TAGS: string[] = Object.values(CC_TAGS);

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
    case "brush_off":
      return CC_TAGS.brushOff;
    case "not_interested":
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

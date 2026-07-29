// The agency's own Sales board: which pipeline it is, and where each outcome is
// expected to end up on it.
//
// Cold Call ends at Booked. This is the board the meeting lands on afterwards.
// The app used to move the cards itself (Stage 2 of
// docs/build-plans/agency-ghl-connection.md); since
// docs/build-plans/sales-call-tags.md it does not. It applies a tag and Jake's
// workflow moves the card, so everything below about stages is EXPECTATION, for
// telling him when his board and his buttons have parted company. Nothing here
// is written anywhere.
//
// Pure. No network, no database, so the endpoint and the tests agree about what
// an outcome means without an account to ask.
//
// STAGES ARE MATCHED BY NAME, NEVER BY ID. Ids belong to one sub-account and
// this is the house convention everywhere else (resolveCalendarByName,
// resolveStageByName). It also survives the thing that actually happens: the
// live board reads "Not Interested/Unqualified" while the plan written three
// days earlier said "Not Interested". A hardcoded id would have been wrong on
// day one; a name match that tolerates a renamed tail is not.

import type { SalesCallOutcome } from "./salesCalls";

// The stages the buttons EXPECT to exist on the live board.
//
// NOTHING HERE IS WRITTEN BY THE APP any more (0065). The app applies a tag and
// Jake's workflow moves the card, so this table is a drift check and nothing
// else: it lets the Sales Pipeline page say "your workflows are expected to
// move cards into Follow Up and this board has no such stage" instead of
// letting somebody discover it days later by wondering where a deal went.
//
// Re-surveyed 2026-07-29 (evening) on pipeline Faxunp7Qq5zCtJrfFpS8, after Jake
// rebuilt the board and its workflows. It now reads, in order:
//
//   Demo Call Booked -> Not Interested/Unqualified | No-Show | Follow Up
//                    -> Closed -> Onboarding Call Booked -> New Client
//
// Only the stages a sales-call BUTTON is expected to reach are listed here.
// Onboarding Call Booked and New Client are deliberately absent: they come
// after the sale, driven by Jake's onboarding automations, and listing them
// would make the drift check demand columns no button here targets.
export const SALES_STAGES = {
  // Matched loosely on purpose: the live column is "Not Interested/Unqualified"
  // and findStage tolerates the qualifier. BOTH no-buttons land here; they are
  // told apart by their tag, not by their column.
  notInterested: "Not Interested",
  booked: "Demo Call Booked",
  followUp: "Follow Up",
  closed: "Closed",
  noShow: "No-Show",
} as const;

export const SALES_PIPELINE_NAME = "Sales Pipeline";

// What that board is actually called, in order of preference.
//
// It read "Sales Pipeline" when this file was written and reads "Sales" on the
// live account today. Matching only the long name meant the resolver found
// nothing at all, which is worse than it sounds: a null pipeline is not an
// error anybody sees, it is a page quietly showing no board.
//
// Both are matched EXACTLY (after normalizeStageName), with one deliberate
// exception below for a suffixed long name. A prefix match on the short name
// would let "Sales Calls" or "Sales Team" answer to it, and picking the wrong
// board is how a page reports on something nobody is selling from.
export const SALES_PIPELINE_NAMES: readonly string[] = [SALES_PIPELINE_NAME, "Sales"];

// The Sales board out of everything on the account, or null when none of them
// is it. Pure, so which board the app calls "Sales" is decided in one place and
// tested without an account.
export function pickSalesPipeline<T extends { name?: string }>(
  pipelines: readonly T[],
): T | null {
  for (const wanted of SALES_PIPELINE_NAMES) {
    const target = normalizeStageName(wanted);
    const exact = pipelines.find((p) => normalizeStageName(p.name ?? "") === target);
    if (exact) return exact;
  }
  // "Sales Pipeline (2026)" is still the Sales Pipeline. Only the long name
  // gets this, and only when exactly one board matches: two say the account has
  // a distinction this app does not know about.
  const long = normalizeStageName(SALES_PIPELINE_NAME);
  const prefixed = pipelines.filter((p) => normalizeStageName(p.name ?? "").startsWith(long));
  return prefixed.length === 1 ? prefixed[0] : null;
}

// What each outcome is expected to become on the board. Read only: see above.
export interface StageRoute {
  // The name matched against the live board. Tolerant on purpose: findStage
  // accepts a longer live name, which is how "Not Interested" finds
  // "Not Interested/Unqualified".
  stage: string;
  // What that column is CALLED on the board, verbatim, punctuation and all.
  //
  // This is what the outcome buttons say. A button reading "Showed, not a fit"
  // beside a column reading "Not Interested/Unqualified" makes somebody hold
  // two vocabularies for one thing and guess at the mapping; naming the button
  // after the column it lands in removes the guess. Surveyed 2026-07-29.
  label: string;
}

const ROUTES: Record<SalesCallOutcome, StageRoute> = {
  // The sale itself. New Client comes later, after onboarding is booked, and is
  // not this button's business.
  closed: { stage: SALES_STAGES.closed, label: "Closed" },
  follow_up: { stage: SALES_STAGES.followUp, label: "Follow Up" },
  // Both nos share ONE column, so their labels cannot come from the stage name
  // the way the others do: two buttons both reading "Not Interested/Unqualified"
  // would be indistinguishable. They are named after their tags instead, which
  // is still Jake's vocabulary and is what actually differs between them.
  not_interested: { stage: SALES_STAGES.notInterested, label: "Not Interested" },
  not_qualified: { stage: SALES_STAGES.notInterested, label: "Not Qualified" },
  no_show: { stage: SALES_STAGES.noShow, label: "No-Show" },
};

// Where a meeting is expected to sit the moment it is booked, before anybody
// has run it. The booked TAG is what puts it there; a workflow of Jake's reads
// that tag and creates the card.
export const BOOKING_ROUTE: StageRoute = {
  stage: SALES_STAGES.booked,
  label: "Demo Call Booked",
};

// The expected stage for an outcome, or the booking stage when there is no
// outcome yet.
export function routeFor(outcome: SalesCallOutcome | null | undefined): StageRoute {
  return outcome ? ROUTES[outcome] : BOOKING_ROUTE;
}

// ---------------------------------------------------------------------------
// Matching a stage name against a live board.

// Case, spacing, punctuation and emoji all vary between what somebody typed in
// GoHighLevel and what is written here. Reduce both sides to letters and digits
// before comparing, so "No-Show", "no show" and "No Show ❌" are one stage.
export function normalizeStageName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface NamedStage {
  id: string;
  name: string;
}

// Find the stage a route wants on a real board.
//
// Exact (normalized) first, then a prefix match, which is what makes
// "Not Interested" find "Not Interested/Unqualified". The prefix has to run in
// that direction only: the wanted name being the start of the live one means
// Jake added a qualifier, whereas the reverse would let a stage called "New"
// swallow "New Client".
//
// Returns null rather than guessing. A route that cannot find its stage is
// reported to the caller as a routing that did not happen, which is recoverable;
// a card dropped into the nearest-looking column is not.
export function findStage(stages: NamedStage[], wanted: string): NamedStage | null {
  const target = normalizeStageName(wanted);
  if (!target) return null;

  const exact = stages.find((s) => normalizeStageName(s.name) === target);
  if (exact) return exact;

  const prefixed = stages.filter((s) => normalizeStageName(s.name).startsWith(target));
  // Only when it is unambiguous. Two stages both starting with the wanted name
  // means the board has a distinction this app does not know about.
  return prefixed.length === 1 ? prefixed[0] : null;
}

// Every stage a button is expected to land in, so a board can be checked once
// up front rather than somebody discovering a missing column days later.
export function requiredStages(): string[] {
  return [
    BOOKING_ROUTE.stage,
    ...Object.values(ROUTES).map((r) => r.stage),
  ].filter((v, i, a) => a.indexOf(v) === i);
}

// Which of those stages a board does not have. Empty means the pipeline can
// carry everything the console's buttons can say.
export function missingStages(stages: NamedStage[]): string[] {
  return requiredStages().filter((name) => findStage(stages, name) === null);
}

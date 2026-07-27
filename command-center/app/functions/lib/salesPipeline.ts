// The agency's own Sales Pipeline, and what each meeting outcome means in it.
//
// Cold Call ends at Booked. This is the board the meeting lands on afterwards,
// and until now the app never touched it: outcomes were recorded in our own
// database and the pipeline Jake actually reads held nothing. Stage 2 of
// command-center/docs/build-plans/agency-ghl-connection.md is this file plus
// agencySales.ts.
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

// The six stages as they read on the live board (surveyed 2026-07-27,
// pipeline Faxunp7Qq5zCtJrfFpS8). Only four are ever written by the app.
export const SALES_STAGES = {
  newLead: "New Lead",
  notInterested: "Not Interested",
  booked: "Appointment Booked",
  showed: "Appointment Showed",
  noShow: "No-Show",
  newClient: "New Client",
} as const;

export const SALES_PIPELINE_NAME = "Sales Pipeline";

// What each outcome does to the card. The status matters as much as the stage:
// GoHighLevel reports won/lost separately from the column, and a "New Client"
// card left sitting at status open is a sale that never reaches a report.
export interface StageRoute {
  stage: string;
  status: "open" | "won" | "lost";
  // Said out loud in the console, so the person pressing the button knows what
  // it does to the board before it does it.
  describe: string;
}

const ROUTES: Record<SalesCallOutcome, StageRoute> = {
  closed: {
    stage: SALES_STAGES.newClient,
    status: "won",
    describe: "New Client, marked won",
  },
  // They turned up and it is not decided. "Appointment Showed" is exactly that
  // stage: the meeting happened and the card is still in play. There is no
  // Follow Up column on this board, and inventing one here would be this app
  // designing Jake's pipeline for him.
  follow_up: {
    stage: SALES_STAGES.showed,
    status: "open",
    describe: "Appointment Showed, still open",
  },
  not_a_fit: {
    stage: SALES_STAGES.notInterested,
    status: "lost",
    describe: "Not Interested, marked lost",
  },
  // Left OPEN on purpose. A no-show is somebody who can still be re-booked, and
  // marking it lost writes off a prospect the day they overslept.
  no_show: {
    stage: SALES_STAGES.noShow,
    status: "open",
    describe: "No-Show, still open",
  },
};

// Where a meeting sits the moment it is booked, before anybody has run it.
export const BOOKING_ROUTE: StageRoute = {
  stage: SALES_STAGES.booked,
  status: "open",
  describe: "Appointment Booked",
};

// The route for an outcome, or the booking route when there is no outcome yet.
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

// Every stage this app is capable of writing, so a caller can check a board once
// up front rather than discovering a missing column mid-press.
export function requiredStages(): string[] {
  return [
    BOOKING_ROUTE.stage,
    ...Object.values(ROUTES).map((r) => r.stage),
  ].filter((v, i, a) => a.indexOf(v) === i);
}

// Which of the stages this app writes are missing from a board. Empty means the
// pipeline can carry everything the console can say.
export function missingStages(stages: NamedStage[]): string[] {
  return requiredStages().filter((name) => findStage(stages, name) === null);
}

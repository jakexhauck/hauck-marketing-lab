// The pages inside Acquisition > Cold Call.
//
// Cold Call is the only pillar tab that owns sub-pages, so it carries a second
// URL param: ?tab=cold-call&view=<id>. Same discipline as adminPillars' ?tab=,
// one level down, which keeps every page linkable and reload-proof.
//
// Order is the order of the day: he lives in Leads, checks Callbacks, and the
// rest are reference. Settings is last and only an owner sees it.

import { COLD_CALL_STAGES } from "./coldCallStages";

// The pages inside Acquisition > Cold Call, in two groups.
//
// LEFT is the work: the pipeline in order, then the caller's own dialing
// tracker. A cold caller sees all of it, because all of it is his job.
//
// RIGHT is the running of it: who gets which leads, and the script. Owner only,
// and separated by a divider so the strip reads as "what I do" and "what I
// manage" rather than as one list of eleven things.

export type ColdCallView = string;

export type ColdCallSide = "left" | "right";

export interface ColdCallPageDef {
  id: ColdCallView;
  label: string;
  side: ColdCallSide;
  // Owner-only pages are hidden from a cold caller's strip. The API refuses
  // them independently; this only decides what renders.
  ownerOnly?: boolean;
}

export const COLD_CALL_PAGES: ColdCallPageDef[] = [
  ...COLD_CALL_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.short,
    side: "left" as ColdCallSide,
  })),
  // The caller's own month of dialing. His numbers, so he can see them.
  { id: "tracker", label: "Tracker", side: "left" },
  // Handing work out: pick rows, pick a person. Import lives here too, since a
  // list has to arrive before it can be assigned.
  { id: "assign", label: "Assign", side: "right", ownerOnly: true },
  { id: "settings", label: "Settings", side: "right", ownerOnly: true },
];

// The pages a role may see, in strip order.
export function coldCallPagesFor(isOwner: boolean): ColdCallPageDef[] {
  return COLD_CALL_PAGES.filter((p) => isOwner || !p.ownerOnly);
}

// The two groups, for the strip's divider. Either may be empty (a cold caller
// has no right-hand group at all, and gets no divider).
export function coldCallSides(isOwner: boolean): {
  left: ColdCallPageDef[];
  right: ColdCallPageDef[];
} {
  const pages = coldCallPagesFor(isOwner);
  return {
    left: pages.filter((p) => p.side === "left"),
    right: pages.filter((p) => p.side === "right"),
  };
}

// Resolve a raw ?view= against what this role can see, else the first page.
// A cold caller who types ?view=settings lands on the first stage rather than
// an error.
export function resolveColdCallView(
  param: string | null | undefined,
  isOwner: boolean,
): ColdCallView {
  const pages = coldCallPagesFor(isOwner);
  const hit = pages.find((p) => p.id === param);
  return hit ? hit.id : pages[0].id;
}

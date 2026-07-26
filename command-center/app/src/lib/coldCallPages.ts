// The pages inside Acquisition > Cold Call.
//
// Cold Call is the only pillar tab that owns sub-pages, so it carries a second
// URL param: ?tab=cold-call&view=<id>. Same discipline as adminPillars' ?tab=,
// one level down, which keeps every page linkable and reload-proof.
//
// Order is the order of the day: he lives in Leads, checks Callbacks, and the
// rest are reference. Settings is last and only an owner sees it.

import { COLD_CALL_STAGES } from "./coldCallStages";

// A page is either a stage of the Cold Calling pipeline or one of the three
// things that are not a stage. The stage pages come first and in pipeline order,
// so the strip reads the way the work flows.
export type ColdCallView = string;

export interface ColdCallPageDef {
  id: ColdCallView;
  label: string;
  // Owner-only pages are hidden from a cold caller's strip. The API refuses
  // them independently; this only decides what renders.
  ownerOnly?: boolean;
}

export const COLD_CALL_PAGES: ColdCallPageDef[] = [
  ...COLD_CALL_STAGES.map((stage) => ({ id: stage.id, label: stage.short })),
  // The whole prospect book: import a list, hand rows out. An owner's job, so a
  // caller never sees it and never picks his own work.
  { id: "book", label: "Book", ownerOnly: true },
  { id: "tracker", label: "Tracker" },
  { id: "scoreboard", label: "Scoreboard" },
  { id: "settings", label: "Settings", ownerOnly: true },
];

// The pages a role may see, in strip order.
export function coldCallPagesFor(isOwner: boolean): ColdCallPageDef[] {
  return COLD_CALL_PAGES.filter((p) => isOwner || !p.ownerOnly);
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

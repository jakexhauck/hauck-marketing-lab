// The pages inside Acquisition > Cold Call.
//
// Cold Call is the only pillar tab that owns sub-pages, so it carries a second
// URL param: ?tab=cold-call&view=<id>. Same discipline as adminPillars' ?tab=,
// one level down, which keeps every page linkable and reload-proof.
//
// Order is the order of the day: he lives in Leads, checks Callbacks, and the
// rest are reference. Settings is last and only an owner sees it.

export type ColdCallView =
  | "leads"
  | "callbacks"
  | "booked"
  | "tracker"
  | "scoreboard"
  | "settings";

export interface ColdCallPageDef {
  id: ColdCallView;
  label: string;
  // Owner-only pages are hidden from a cold caller's strip. The API refuses
  // them independently; this only decides what renders.
  ownerOnly?: boolean;
}

export const COLD_CALL_PAGES: ColdCallPageDef[] = [
  { id: "leads", label: "Leads" },
  { id: "callbacks", label: "Callbacks" },
  { id: "booked", label: "Booked" },
  { id: "tracker", label: "Tracker" },
  { id: "scoreboard", label: "Scoreboard" },
  { id: "settings", label: "Settings", ownerOnly: true },
];

// The pages a role may see, in strip order.
export function coldCallPagesFor(isOwner: boolean): ColdCallPageDef[] {
  return COLD_CALL_PAGES.filter((p) => isOwner || !p.ownerOnly);
}

// Resolve a raw ?view= against what this role can see, else the first page.
// A cold caller who types ?view=settings lands on Leads rather than an error.
export function resolveColdCallView(
  param: string | null | undefined,
  isOwner: boolean,
): ColdCallView {
  const pages = coldCallPagesFor(isOwner);
  const hit = pages.find((p) => p.id === param);
  return hit ? hit.id : pages[0].id;
}

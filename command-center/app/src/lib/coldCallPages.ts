// The pages inside Acquisition > Cold Call.
//
// Cold Call is the only pillar tab that owns sub-pages, so it carries a second
// URL param: ?tab=cold-call&view=<id>. Same discipline as adminPillars' ?tab=,
// one level down, which keeps every page linkable and reload-proof.
//
// Cut to three pages (Jake, 2026-09-21): the Power dialer, the Tracker and the
// Scripts. Pipeline, Availability, SOPs and the whole Management tab (Assign
// leads, Team availability, SOPs, Stage check) came out; Scripts, the one page
// of Management still wanted, moved up to the strip itself.

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
  // First, because it is where the day is spent: the page to have open while
  // the GoHighLevel power dialer works through the list.
  { id: "dialing", label: "Power dialer", side: "left" },
  // The caller's own month of dialing. His numbers, so he can see them.
  { id: "tracker", label: "Tracker", side: "left" },
  // The pitch variations and the objection handling read alongside them.
  // Owner only: the owner writes them, the caller reads them in the dialing
  // script panel.
  { id: "scripts", label: "Scripts", side: "right", ownerOnly: true },
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
// A cold caller who types ?view=scripts lands on the Power dialer rather than
// an error.
export function resolveColdCallView(
  param: string | null | undefined,
  isOwner: boolean,
  manage?: string | null,
): ColdCallView {
  const pages = coldCallPagesFor(isOwner);
  const hit = pages.find((p) => p.id === param);
  if (hit) return hit.id;
  // Old links to what is now Scripts: Management's Scripts page (and its
  // retired call shelf, ?manage=assets), and Settings before that. Everything
  // else that was cut falls through to the first page.
  const wasScripts =
    param === "settings" ||
    (param === "management" && (manage === "scripts" || manage === "assets"));
  if (isOwner && wasScripts) return "scripts";
  return pages[0].id;
}

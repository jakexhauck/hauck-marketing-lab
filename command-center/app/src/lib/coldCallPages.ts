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
  // When he is on the phones. LEFT rather than right: filling this in is his
  // job, not the owner's, and an owner setting a hire's hours without asking
  // them is how a rota stops matching reality.
  { id: "availability", label: "Availability", side: "left" },
  // Running the operation: handing work out, and reading the roster's week.
  // Both were reached as their own strip entries once; they are one tab with
  // pages inside it now, so the strip stays the length of a day's work rather
  // than growing an entry every time the owner gains a lever.
  { id: "management", label: "Management", side: "right", ownerOnly: true },
  { id: "settings", label: "Settings", side: "right", ownerOnly: true },
];

// The pages inside Management (?view=management&manage=<id>). Owner-only by
// construction: nothing renders them unless the Management tab does.
export interface ManagementPageDef {
  id: string;
  label: string;
}

export const MANAGEMENT_PAGES: ManagementPageDef[] = [
  // Assign first: handing work out is the thing done daily. Reading the rota is
  // what happens when the week is being planned.
  { id: "assign", label: "Assign leads" },
  { id: "availability", label: "Team availability" },
];

export function resolveManagementPage(param: string | null | undefined): string {
  const hit = MANAGEMENT_PAGES.find((p) => p.id === param);
  return hit ? hit.id : MANAGEMENT_PAGES[0].id;
}

// Pages that used to be their own entry in the strip, and where they went. A
// bookmark or a pasted link from before this change lands on the page it names
// rather than being silently dumped on the first stage.
const MOVED_INTO_MANAGEMENT: Record<string, string> = {
  assign: "assign",
};

// The Management sub-page a retired top-level view maps to, or null when the
// view was never a top-level page. Only meaningful for an owner: a cold caller
// typing ?view=assign has nowhere legitimate to land.
export function movedIntoManagement(
  param: string | null | undefined,
  isOwner: boolean,
): string | null {
  if (!isOwner || !param) return null;
  return MOVED_INTO_MANAGEMENT[param] ?? null;
}

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
  if (hit) return hit.id;
  // An owner's link to a page that moved inside Management still opens
  // Management rather than the first stage.
  if (movedIntoManagement(param, isOwner)) return "management";
  return pages[0].id;
}

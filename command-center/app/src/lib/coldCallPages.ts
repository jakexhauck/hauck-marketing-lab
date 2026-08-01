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
  // Only the stages worth reading. Not Interested is a stage but not a page:
  // see ColdCallStage.page. The outcome, the tag and the GoHighLevel move all
  // still happen; there is simply no tab onto a list nobody works.
  ...COLD_CALL_STAGES.filter((stage) => stage.page).map((stage) => ({
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
  // How the job is done. LEFT because it is written FOR the caller: the owner
  // writes them under Management, everybody reads them here.
  { id: "sops", label: "SOPs", side: "left" },
  // Running the operation: ONE owner-side tab, with everything the owner does
  // as pages inside it. Assign, the roster's week, the scripts, the shelf and
  // the stage check were all their own strip entries at some point; a strip
  // that grows an entry per lever stops reading as a day's work.
  { id: "management", label: "Management", side: "right", ownerOnly: true },
];

// The pages inside Management (?view=management&manage=<id>). Owner-only by
// construction: nothing renders them unless the Management tab does.
export interface ManagementPageDef {
  id: string;
  label: string;
}

// Ordered by how often the owner opens them. Assign is daily, the rota is
// weekly, and the scripts and shelf are set up once and revisited. Stages last:
// it is a check, not a thing you edit.
//
// There is deliberately no page called Settings. The word grouped three
// unrelated jobs (write a pitch, stock a shelf, verify a CRM) under one heading
// that described none of them, so each is named for what it is.
export const MANAGEMENT_PAGES: ManagementPageDef[] = [
  { id: "assign", label: "Assign leads" },
  { id: "availability", label: "Team availability" },
  // The pitch variations AND the objection handling read alongside them. Those
  // were two pages; objection handling was the only thing the second one held,
  // and it is read in the same breath as the script, so it is now a section of
  // this page rather than a tab of its own.
  { id: "scripts", label: "Scripts" },
  // Choosing which SOP Hub documents the team reads on their own SOPs page.
  { id: "sops", label: "SOPs" },
  { id: "stages", label: "Stage check" },
];

export function resolveManagementPage(param: string | null | undefined): string {
  const hit = MANAGEMENT_PAGES.find((p) => p.id === param);
  if (hit) return hit.id;
  if (param && RETIRED_MANAGEMENT_PAGES[param]) return RETIRED_MANAGEMENT_PAGES[param];
  return MANAGEMENT_PAGES[0].id;
}

// Pages that used to be their own entry in the strip, and where they went. A
// bookmark or a pasted link from before this change lands on the page it names
// rather than being silently dumped on the first stage.
const MOVED_INTO_MANAGEMENT: Record<string, string> = {
  assign: "assign",
  // Settings was three panels stacked on one page. It opens on the first of
  // them rather than on Management's default, so an old link still lands on
  // something it used to show.
  settings: "scripts",
};

// Management pages that no longer exist, and where their content went. Read by
// resolveManagementPage so a bookmark to ?manage=assets opens the page that now
// holds objection handling rather than silently dropping onto Assign leads.
const RETIRED_MANAGEMENT_PAGES: Record<string, string> = {
  // The call shelf held exactly one document, objection handling, which now sits
  // under Scripts because that is where it is read from.
  assets: "scripts",
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

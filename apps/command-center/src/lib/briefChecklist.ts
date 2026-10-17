// The checkboxes under each Client Brief section (Brief v2, Jake, 2026-10-17;
// docs/build-plans/agents.md, "Brief v2").
//
// The Full Setup Checklist, Onboarding Call and Launch Call pages went; their
// items now sit under the brief section whose work they are. The items and
// their saved keys still come from lib/sopChecklists.ts, so every tick made on
// the old pages carries over: a box here is the same "sop:" row in
// onboarding_checklist.
//
// Accounts checks (functions/lib/clientAccounts.ts) are boxes too, but auto
// ones: they follow the live check, so they are listed apart (by id) and never
// saved.

import type { AgentId } from "./agents";
import type { BriefBox, BriefSectionId } from "./agentWire";
import { SOP_LISTS, sopTaskKey, type SopListId } from "./sopChecklists";
import { tickSections } from "./clientBrief";
import type { AccountCheckId } from "../../functions/lib/clientAccounts";

export interface BriefBoxDef {
  key: string;
  label: string;
  note?: string;
}

export interface BriefBoxGroup {
  // A caption over the boxes, or null when the section has only one group.
  label: string | null;
  items: BriefBoxDef[];
}

function sopSection(list: SopListId, title: string) {
  const s = SOP_LISTS[list].sections.find((x) => x.title === title);
  if (!s) throw new Error(`sop section missing: ${list} / ${title}`);
  return s;
}

const box = (list: SopListId, section: string) => (i: { label: string; note?: string }): BriefBoxDef => ({
  key: sopTaskKey(list, section, i.label),
  label: i.label,
  ...(i.note ? { note: i.note } : {}),
});

// Items of one Full Setup section, kept or dropped by label.
function fullSetup(title: string, keep: (label: string) => boolean = () => true): BriefBoxDef[] {
  const s = sopSection("full-setup", title);
  return s.groups.flatMap((g) => g.items).filter((i) => keep(i.label)).map(box("full-setup", title));
}

// A Full Setup section with its own groups, each captioned "Section: Group".
function fullSetupGroups(title: string, keep: (label: string) => boolean = () => true): BriefBoxGroup[] {
  const s = sopSection("full-setup", title);
  return s.groups.map((g) => ({
    label: g.label ? `${title}: ${g.label}` : title,
    items: g.items.filter((i) => keep(i.label)).map(box("full-setup", title)),
  }));
}

// A whole call checklist: one group per doc group, captioned by its section.
function wholeList(list: SopListId): BriefBoxGroup[] {
  return SOP_LISTS[list].sections.flatMap((s) =>
    s.groups.map((g) => ({
      label: g.label ? `${s.title}: ${g.label}` : s.title,
      items: g.items.map(box(list, s.title)),
    })),
  );
}

const CREATIVES = "Creatives Done/Added To Media Library";
const CONVERSION_ASSETS = "Conversion Assets Created/Placed Into Funnel";

export const BRIEF_BOXES: Record<BriefSectionId, BriefBoxGroup[]> = {
  client: [],
  manager: [{ label: null, items: fullSetup("Operations / Onboarding Call") }],
  "onboarding-call": wholeList("onboarding-call"),
  "launch-call": wholeList("launch-call"),
  research: [],
  ads: [{ label: null, items: fullSetup("Facebook Ads", (l) => l !== CREATIVES) }],
  creative: [{ label: null, items: fullSetup("Facebook Ads", (l) => l === CREATIVES) }],
  landing: [{ label: null, items: fullSetup("GHL", (l) => l === CONVERSION_ASSETS) }],
  ghl: [
    ...fullSetupGroups("GHL", (l) => l !== CONVERSION_ASSETS),
    ...fullSetupGroups("Phone"),
    ...fullSetupGroups("GHL Follow Ups"),
  ],
  reporting: [],
};

export function sectionBoxKeys(section: BriefSectionId): string[] {
  return BRIEF_BOXES[section].flatMap((g) => g.items.map((i) => i.key));
}

// Which section each Accounts check sits in, by what it is about. In the
// Accounts page's order, which is the order the boxes show.
export const ACCOUNT_CHECK_SECTION: Record<AccountCheckId, BriefSectionId> = {
  ghl: "ghl",
  "meta-ads": "ads",
  "meta-page": "ads",
  pipeline: "ghl",
  calendars: "ghl",
  "owner-links": "ghl",
  "owner-phone": "ghl",
  login: "manager",
  push: "manager",
};

export function accountChecksFor(section: BriefSectionId): AccountCheckId[] {
  return (Object.keys(ACCOUNT_CHECK_SECTION) as AccountCheckId[]).filter((id) => ACCOUNT_CHECK_SECTION[id] === section);
}

// A label as an agent may write it: any case, extra spaces, a list marker or
// a checkbox in front.
export function normLabel(s: string): string {
  return s
    .replace(/^\s*(?:[-*]\s+)?(?:\[[ xX]?\]\s*)?/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * What an agent's ```tick block may tick: manual boxes in the sections it owns
 * (tickSections), matched by label. Everything else is refused, including
 * Accounts checks, which follow the live check and are never ticked by hand.
 * The server runs this on the agent read from the chat, never from the request.
 */
export function resolveTicks(agent: AgentId, labels: string[]): { keys: string[]; ticked: string[]; refused: string[] } {
  const own = tickSections(agent).flatMap((s) => BRIEF_BOXES[s].flatMap((g) => g.items));
  const keys: string[] = [];
  const ticked: string[] = [];
  const refused: string[] = [];
  for (const raw of labels) {
    if (typeof raw !== "string") continue;
    const want = normLabel(raw);
    if (!want) continue;
    const hits = own.filter((i) => normLabel(i.label) === want);
    if (hits.length === 0) {
      refused.push(raw.trim());
      continue;
    }
    for (const h of hits) {
      if (keys.includes(h.key)) continue;
      keys.push(h.key);
      ticked.push(h.label);
    }
  }
  return { keys, ticked, refused };
}

/** A section's manual boxes and their state, as the claim carries them. */
export function claimBoxes(section: BriefSectionId, done: Set<string>): BriefBox[] {
  return BRIEF_BOXES[section].flatMap((g) => g.items.map((i) => ({ label: i.label, done: done.has(i.key) })));
}

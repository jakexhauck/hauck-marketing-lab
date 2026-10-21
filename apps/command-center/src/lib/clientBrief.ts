// The Client Brief (Jake, 2026-10-17; docs/build-plans/agents.md, Phase 6).
//
// One living brief per client with a section per agent. The brain is a list of
// short lessons; the brief is the polished, current summary you would hand to
// someone. Jake edits any section, an agent only its own. Shared by the admin
// API, the runner API and the page; projects/agent-runner keeps the wire half
// in src/wire.ts.

import { AGENTS, isAgentId } from "./agents";
import type { BriefAuthor, BriefDrive, BriefSection, BriefSectionId } from "./agentWire";

// Brief v2 (Jake, 2026-10-17): the brief replaced the client setup pages. Client
// (the onboarding answers) leads, then Status (the Manager), the two call
// checklists, and the agents in rail order. Client and the calls are Jake's
// text; no agent writes them with a ```brief block, because a brief block only
// ever lands on the writing agent's own section.
export const BRIEF_SECTIONS: { id: BriefSectionId; label: string }[] = [
  { id: "client", label: "Client" },
  { id: "csm", label: "Status" },
  { id: "onboarding-call", label: "Onboarding Call" },
  { id: "launch-call", label: "Launch Call" },
  { id: "research", label: "Market Research" },
  { id: "ads", label: "Ads" },
  { id: "ghl", label: "GHL" },
];

// The longest a section may be. Generous for a summary, small enough that the
// whole brief rides in every agent's prompt.
export const MAX_SECTION_CHARS = 20_000;

export function sectionLabel(id: BriefSectionId): string {
  return BRIEF_SECTIONS.find((s) => s.id === id)?.label ?? id;
}

export function isBriefSectionId(v: unknown): v is BriefSectionId {
  return typeof v === "string" && BRIEF_SECTIONS.some((s) => s.id === v);
}


/** Every section in order; one nobody wrote yet is empty at version 0. */
export function fullBrief(rows: BriefSection[]): BriefSection[] {
  return BRIEF_SECTIONS.map(
    (s) =>
      rows.find((r) => r.section === s.id) ?? { section: s.id, body: "", version: 0, updatedBy: null, updatedAt: null },
  );
}

/**
 * The whole brief's revision: each save adds one to one section's version, so
 * the sum only grows. The Drive sync uses it to tell whether the brief moved
 * while it was writing the Doc.
 */
export function briefRevision(sections: Pick<BriefSection, "version">[]): number {
  return sections.reduce((n, s) => n + s.version, 0);
}

export function isBriefAuthor(v: unknown): v is BriefAuthor {
  return v === "jake" || (typeof v === "string" && isAgentId(v));
}

function since(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/** "You, just now" or "Ads Agent, 2h ago"; "" for a section nobody wrote. */
export function whoEdited(s: Pick<BriefSection, "updatedBy" | "updatedAt">, now: Date): string {
  if (!s.updatedBy) return "";
  const who = s.updatedBy === "jake" ? "You" : (AGENTS.find((a) => a.id === s.updatedBy)?.name ?? s.updatedBy);
  return s.updatedAt ? `${who}, ${since(s.updatedAt, now)}` : who;
}

export type DriveChipTone = "ok" | "busy" | "bad" | "none";

// How long a save may wait on its Drive sync before the chip stops saying it
// is on its way. The sync is one Docs call after the save, so seconds.
const SYNC_GRACE_MS = 2 * 60_000;

/**
 * The "Saved to Drive" chip. ok when the Doc was written from the brief as it
 * stands, busy for a save whose sync is still running, bad when the last sync
 * failed (title says why) or never caught up, none before anything is written.
 */
export function driveChip(
  drive: BriefDrive | null,
  sections: BriefSection[],
  now: Date,
): { tone: DriveChipTone; label: string; title: string | null } {
  const rev = briefRevision(sections);
  if (drive?.error) return { tone: "bad", label: "Drive sync failed", title: drive.error };
  if (rev === 0) return { tone: "none", label: "Not in Drive yet", title: null };
  if (drive && drive.revision >= rev) return { tone: "ok", label: "Saved to Drive", title: null };
  const newest = Math.max(0, ...sections.map((s) => (s.updatedAt ? Date.parse(s.updatedAt) : 0)));
  if (now.getTime() - newest < SYNC_GRACE_MS) return { tone: "busy", label: "Saving to Drive", title: null };
  return { tone: "bad", label: "Drive out of date", title: "The last save has not reached Drive. Edit any section to sync again." };
}

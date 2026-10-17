// The Client Brief (Jake, 2026-10-17; docs/build-plans/agents.md, Phase 6).
//
// One living brief per client with a section per agent. The brain is a list of
// short lessons; the brief is the polished, current summary you would hand to
// someone. Jake edits any section, an agent only its own. Shared by the admin
// API, the runner API and the page; projects/agent-runner keeps the wire half
// in src/wire.ts.

import { AGENTS, isAgentId, type AgentId } from "./agents";
import type { BriefAuthor, BriefSection } from "./agentWire";

// Status (the Manager) leads, because it is where the client stands; then the
// agents in rail order.
export const BRIEF_SECTIONS: { id: AgentId; label: string }[] = [
  { id: "manager", label: "Status" },
  { id: "research", label: "Market Research" },
  { id: "ads", label: "Ads" },
  { id: "creative", label: "Creative" },
  { id: "landing", label: "Landing Page" },
  { id: "ghl", label: "GHL" },
  { id: "reporting", label: "Reporting" },
];

// The longest a section may be. Generous for a summary, small enough that the
// whole brief rides in every agent's prompt.
export const MAX_SECTION_CHARS = 20_000;

export function sectionLabel(id: AgentId): string {
  return BRIEF_SECTIONS.find((s) => s.id === id)?.label ?? id;
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

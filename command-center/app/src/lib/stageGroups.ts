// Unified Inbox grouping. Every conversation is bucketed into one of nine
// ordered groups derived from its GHL opportunity stage name. Name-based (not
// stage-id based) so the mapping survives per-tenant pipeline id differences.
// Anything unmapped, or a contact with no opportunity, falls to "new" so raw
// inbounds and legacy stages surface at the top and are never hidden.
import type { ApiConversation } from "./api";

export type StageGroupKey =
  | "new"
  | "lead_in"
  | "lead_responded"
  | "estimate_scheduled"
  | "estimate_completed"
  | "job_booked"
  | "job_completed"
  | "follow_up"
  | "closed";

export interface StageGroupMeta {
  key: StageGroupKey;
  label: string;
  defaultCollapsed: boolean;
  // Functional swatch color for the group dot (the one place non-token color is
  // acceptable, mirroring SourceBadge's convention).
  swatch: string;
}

export const STAGE_GROUPS: StageGroupMeta[] = [
  { key: "new", label: "New / Unsorted", defaultCollapsed: false, swatch: "#64748b" },
  { key: "lead_in", label: "Lead In", defaultCollapsed: false, swatch: "#2563eb" },
  { key: "lead_responded", label: "Lead Responded", defaultCollapsed: false, swatch: "#0891b2" },
  { key: "estimate_scheduled", label: "Estimate Scheduled", defaultCollapsed: false, swatch: "#7c3aed" },
  { key: "estimate_completed", label: "Estimate Completed", defaultCollapsed: false, swatch: "#c026d3" },
  { key: "job_booked", label: "Job Booked", defaultCollapsed: false, swatch: "#0d9488" },
  { key: "job_completed", label: "Job Completed", defaultCollapsed: false, swatch: "#16a34a" },
  { key: "follow_up", label: "Follow Up", defaultCollapsed: true, swatch: "#d97706" },
  { key: "closed", label: "Closed / Inactive", defaultCollapsed: true, swatch: "#94a3b8" },
];

export const STAGE_GROUP_BY_KEY = Object.fromEntries(
  STAGE_GROUPS.map((g) => [g.key, g]),
) as Record<StageGroupKey, StageGroupMeta>;

// Ordered rules; first substring hit wins. "job completed" sits before
// "job booked" so "Job Completed" does not match the bare "booked" rule.
const RULES: { group: StageGroupKey; test: (s: string) => boolean }[] = [
  { group: "lead_in", test: (s) => s.includes("lead in") },
  { group: "lead_responded", test: (s) => s.includes("lead responded") || s.includes("responded") },
  { group: "estimate_scheduled", test: (s) => s.includes("estimate scheduled") || s.includes("appointment scheduled") },
  { group: "estimate_completed", test: (s) => s.includes("estimate completed") || s.includes("quote given") || s.includes("apt completed") },
  { group: "job_completed", test: (s) => s.includes("job completed") },
  { group: "job_booked", test: (s) => s.includes("job booked") || s.includes("booked") },
  { group: "follow_up", test: (s) => s.includes("follow up") || s.includes("followup") || s.includes("not ready") },
  {
    group: "closed",
    test: (s) =>
      ["no answer", "not qualified", "no show", "no-close", "no close", "abandoned"].some((k) =>
        s.includes(k),
      ),
  },
];

export function mapStageNameToGroup(stageName: string | null | undefined): StageGroupKey {
  const s = (stageName ?? "").toLowerCase().trim();
  if (!s) return "new";
  for (const rule of RULES) if (rule.test(s)) return rule.group;
  return "new";
}

// Unread rise to the top and sort longest-wait-first (oldest last message on
// top); read rows read newest-first like a normal inbox.
function sortForQueue(list: ApiConversation[]): ApiConversation[] {
  return [...list].sort((a, b) => {
    const au = a.unreadCount > 0 ? 1 : 0;
    const bu = b.unreadCount > 0 ? 1 : 0;
    if (au !== bu) return bu - au;
    const ta = new Date(a.lastMessageAt).getTime();
    const tb = new Date(b.lastMessageAt).getTime();
    return au ? ta - tb : tb - ta;
  });
}

export function groupConversations(
  items: ApiConversation[],
): Array<{ meta: StageGroupMeta; items: ApiConversation[] }> {
  const buckets = new Map<StageGroupKey, ApiConversation[]>();
  for (const g of STAGE_GROUPS) buckets.set(g.key, []);
  for (const c of items) buckets.get(mapStageNameToGroup(c.stageName))!.push(c);
  return STAGE_GROUPS.map((meta) => ({ meta, items: sortForQueue(buckets.get(meta.key)!) }));
}

// Unified Inbox grouping. Every conversation is bucketed into one ordered group
// derived from its GHL opportunity stage NAME (never the stage id, which differs
// per tenant). The groups mirror the live Willis "Sales" pipeline funnel, with
// the off-spine pipelines (Reactivation, Trash, Google Reviews) folded into
// "Follow Up / Nurture" and "Closed / Inactive". Anything unmapped, or a contact
// with no opportunity, falls to "new" so raw inbounds surface at the top and are
// never hidden.
//
// Stage names are matched by substring, so the emoji GHL appends to a stage name
// ("New Lead 🔔", "Job Booked 💼") are harmless. Live stage list pulled from
// `ghl opportunities pipelines` 2026-07-15 — re-check the live account before
// changing these rules, the names drift as the pipeline is edited.
import type { ApiConversation } from "./api";

export type StageGroupKey =
  | "new"
  | "hot_lead"
  | "phone_appt"
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
  // acceptable, mirroring SourceBadge's convention). Kept close to the stage's
  // own GHL colour where there is one.
  swatch: string;
}

export const STAGE_GROUPS: StageGroupMeta[] = [
  { key: "new", label: "New / Unsorted", defaultCollapsed: false, swatch: "#64748b" },
  { key: "hot_lead", label: "Hot Lead", defaultCollapsed: false, swatch: "#f97316" },
  { key: "phone_appt", label: "Phone Appointment Booked", defaultCollapsed: false, swatch: "#3b82f6" },
  { key: "estimate_scheduled", label: "Estimate Scheduled", defaultCollapsed: false, swatch: "#8b5cf6" },
  { key: "estimate_completed", label: "Estimate Completed", defaultCollapsed: false, swatch: "#7c3aed" },
  { key: "job_booked", label: "Job Booked", defaultCollapsed: false, swatch: "#ea580c" },
  { key: "job_completed", label: "Job Completed", defaultCollapsed: false, swatch: "#059669" },
  { key: "follow_up", label: "Follow Up / Nurture", defaultCollapsed: true, swatch: "#d97706" },
  { key: "closed", label: "Closed / Inactive", defaultCollapsed: true, swatch: "#94a3b8" },
];

export const STAGE_GROUP_BY_KEY = Object.fromEntries(
  STAGE_GROUPS.map((g) => [g.key, g]),
) as Record<StageGroupKey, StageGroupMeta>;

// Ordered rules; first substring hit wins. Order is load-bearing:
//   * "closed" runs FIRST so Trash stages that also contain an active-sounding
//     word ("Phone Appointment No-Show", "Lead In No Call Booked") close out
//     instead of matching "phone appointment" / "booked" below.
//   * "job completed" sits before "job booked", and both are matched on their
//     full two-word name (never a bare "booked") so "Phone Appointment Booked"
//     and "Lead In No Call Booked" do not fall into Job Booked.
const RULES: { group: StageGroupKey; test: (s: string) => boolean }[] = [
  {
    group: "closed",
    test: (s) =>
      [
        "no answer",
        "not qualified",
        "no show",
        "no-show",
        "no close",
        "no-close",
        "opted out",
        "no call booked",
        "abandoned",
        "review",
        "feedback",
      ].some((k) => s.includes(k)),
  },
  { group: "job_completed", test: (s) => s.includes("job completed") },
  { group: "job_booked", test: (s) => s.includes("job booked") },
  { group: "phone_appt", test: (s) => s.includes("phone appointment") },
  { group: "estimate_completed", test: (s) => s.includes("estimate completed") },
  { group: "estimate_scheduled", test: (s) => s.includes("estimate scheduled") },
  { group: "hot_lead", test: (s) => s.includes("hot lead") },
  {
    group: "follow_up",
    test: (s) =>
      ["follow up", "followup", "nurture", "lead contacted", "lead responded", "not ready"].some(
        (k) => s.includes(k),
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

// Maps a GHL opportunity stage NAME (never the stage id, which differs per
// tenant) onto one of the Inbox's stage groups, which mirror the live Willis
// "Sales" pipeline funnel. The off-spine pipelines (Reactivation, Trash, Google
// Reviews) fold into "follow_up" and "closed". Anything unmapped, or a contact
// with no opportunity, falls to "new" so raw inbounds are never hidden.
//
// Which of these groups actually get a tab is inboxTabs.ts's decision, not this
// file's: "closed", "follow_up" and "estimate_completed" map here but have no tab.
//
// Stage names are matched by substring, so the emoji GHL appends to a stage name
// ("New Lead 🔔", "Job Booked 💼") are harmless. Live stage list pulled from
// `ghl opportunities pipelines` 2026-07-16 — re-check the live account before
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
  | "long_term_nurture"
  | "follow_up"
  | "closed";

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
  // "nurture" runs BEFORE follow_up so the live Sales stage "Long Term Nurture
  // 🌱" gets its own group and its own Inbox tab. It used to fall into follow_up,
  // which has no tab, so those conversations were invisible in the Inbox.
  { group: "long_term_nurture", test: (s) => s.includes("nurture") },
  {
    group: "follow_up",
    test: (s) =>
      ["follow up", "followup", "lead contacted", "lead responded", "not ready"].some(
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
export function sortForQueue(list: ApiConversation[]): ApiConversation[] {
  return [...list].sort((a, b) => {
    const au = a.unreadCount > 0 ? 1 : 0;
    const bu = b.unreadCount > 0 ? 1 : 0;
    if (au !== bu) return bu - au;
    const ta = new Date(a.lastMessageAt).getTime();
    const tb = new Date(b.lastMessageAt).getTime();
    return au ? ta - tb : tb - ta;
  });
}

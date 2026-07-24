// The client-facing lead status: Jake's definitive 12-status model, locked
// 2026-07-24. See docs/build-plans/lead-status-model.md.
//
// Status is DERIVED from the lead's live GHL stage, never typed by hand and
// never stored. The GHL workflows Jake built move the stage; this file is the
// single place that decides what the client reads on the tracker.
//
// This is NOT adTrackerMetrics' TrackerLevel. That is a four-rung ladder the
// KPI arithmetic uses (lead / pickup / booking / sale); this is the twelve-rung
// label the client sees. They move together but answer different questions, so
// they stay separate.

export type ClientLeadStatus =
  | "new"
  | "contacted"
  | "phone_follow_up"
  | "long_term_nurture"
  | "phone_appt_booked"
  | "phone_appt_confirmed"
  | "handed_off"
  | "follow_up"
  | "estimate_booked"
  | "job_booked"
  | "won"
  | "lost";

// Journey order, earliest first. Doubles as the "furthest card wins" ladder for
// a contact holding opportunities in several pipelines.
//
// Two placements are judgement calls rather than plain sequence:
//   long_term_nurture sits above phone_follow_up because a lead parked in
//     nurture has been through the dialling cadence already.
//   follow_up (the Sales stage the owner sets post-handoff) sits above
//     handed_off but below estimate_booked: a booked estimate is the louder,
//     more useful signal for the client to see.
// lost is deliberately last so it wins over everything except a real win, which
// is handled by the explicit carve-out in furthestStatus.
export const CLIENT_STATUS_ORDER: ClientLeadStatus[] = [
  "new",
  "contacted",
  "phone_follow_up",
  "long_term_nurture",
  "phone_appt_booked",
  "phone_appt_confirmed",
  "handed_off",
  "follow_up",
  "estimate_booked",
  "job_booked",
  "won",
  "lost",
];

const RANK: Record<ClientLeadStatus, number> = CLIENT_STATUS_ORDER.reduce(
  (acc, status, i) => {
    acc[status] = i;
    return acc;
  },
  {} as Record<ClientLeadStatus, number>,
);

// Live GHL stage name (normalised) -> client status. Pulled 2026-07-24 from
// Willis's real pipelines (1) Lead Form, 2) Funnel, 3) Sales, 4) Cancelled
// Appointments, 5) Trash). Matched by NAME, never by id: ids are per-location
// and this has to work for the next client without a remap.
//
// Insertion order matters for the prefix pass in statusForStage: longer, more
// specific keys must come before the shorter keys they contain.
const STAGE_STATUS: Record<string, ClientLeadStatus> = {
  // 1) Lead Form Pipeline
  "opted in (needs dialing)": "new",
  "opted in follow up": "contacted",
  "long term nurture": "long_term_nurture",

  // 2) Funnel Pipeline
  "survey completed no call booked (needs dialing)": "new",
  "survey follow up": "contacted",
  "phone appt booked": "phone_appt_booked",
  "phone appt confirmed": "phone_appt_confirmed",

  // 4) Cancelled Appointments. An appointment existed and fell through, so the
  // lead is back in the chase queue: the client sees Phone Follow Up, not a
  // booking. These sit ABOVE the bare "no answer" prefix key on purpose.
  "phone appt follow up": "phone_follow_up",
  "phone appt rescheduling": "phone_follow_up",
  "phone appt unspecified": "phone_follow_up",

  // "No Answer Day 1..N (needs dialing)" all match this prefix, in both the
  // Lead Form and Funnel pipelines. Adding Day 5, 6, 7 in GHL needs no change
  // here, which is the whole point of matching by prefix.
  "no answer": "phone_follow_up",

  // 3) Sales Pipeline
  "handed off": "handed_off",
  "estimate booked": "estimate_booked",
  "job booked": "job_booked",
  "won recurring": "won",
  won: "won",
  "follow up": "follow_up",

  // 5) Trash Pipeline
  "services uninterested": "lost",
  "services unqualified": "lost",
  "bad intent": "lost",
  lost: "lost",
};

// Strip emoji and any other non-ASCII, collapse runs of whitespace, lowercase.
// GHL stage names carry decorative emoji and the odd double space, so
// collapsing is load-bearing, not cosmetic.
function normaliseStage(name: string): string {
  return String(name ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Exact match first, then prefix, because a stage may carry a trailing suffix
// GHL renders after the name ("No Answer Day 3 (needs dialing)"). An unknown
// stage falls back to "new": never invent progress for a stage we have not seen.
export function statusForStage(stageName: string): ClientLeadStatus {
  const key = normaliseStage(stageName);
  if (!key) return "new";
  const exact = STAGE_STATUS[key];
  if (exact) return exact;
  for (const [stage, status] of Object.entries(STAGE_STATUS)) {
    if (key.startsWith(stage)) return status;
  }
  return "new";
}

// One contact can hold opportunities in several pipelines at once (the Sales
// card that won them outlives the Lead Form card that found them). The furthest
// along one is the truth.
export function furthestStatus(statuses: ClientLeadStatus[]): ClientLeadStatus {
  if (statuses.length === 0) return "new";
  // Sold outranks lost: a paying customer with a stale Trash card is a
  // customer, not a loss.
  if (statuses.includes("won")) return "won";
  let best: ClientLeadStatus = "new";
  for (const s of statuses) if (RANK[s] > RANK[best]) best = s;
  return best;
}

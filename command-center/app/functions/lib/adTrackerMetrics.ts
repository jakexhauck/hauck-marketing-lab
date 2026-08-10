// The Ad Tracker's arithmetic, ported from the Local Ads School client tracking
// sheet (see docs/build-plans/ad-tracker-rebuild.md §3).
//
// Pure on purpose: no network, no Supabase, no system clock. Every KPI here has
// a counterpart formula on the sheet's Dashboard tab and the tests assert
// against numbers transcribed from it. If you change a definition, change the
// spec first.
//
// This is NOT src/lib/adTrackingMetrics.ts (the old hand-typed daily tracker).
// That one is being deleted; do not merge the two.

import {
  furthestStatus,
  statusForStage,
  type ClientLeadStatus,
} from "./leadStatus";

// A lead's furthest-along position. The ladder is cumulative: every sale is a
// booking, every booking is a pickup. That single ordering is what makes both
// the predicates and the cross-pipeline dedupe trivial.
export type TrackerLevel = "lead" | "pickup" | "booking" | "sale";

const LEVEL_ORDER: Record<TrackerLevel, number> = {
  lead: 0,
  pickup: 1,
  booking: 2,
  sale: 3,
};

// Live GHL stage name (normalised) -> level. Re-pulled 2026-07-30 from Willis's
// real pipelines, which the 2026-07-28 CRM realignment reduced to four:
// 1) Leads, 2) No Answer, 3) Sales, 4) Trash. Stages absent here fall through
// to "lead", which counts the contact without inventing progress for it.
//
// The pre-realignment names are kept below rather than deleted. A client who has
// not been migrated still runs them, and the failure mode of a missing name is
// silent: the lead is counted but never progresses, so the client's booking rate
// quietly reads zero. That is exactly what happened between 28 and 30 July,
// when this map still named pipelines that no longer existed.
//
// The ladder is: lead (came in) -> pickup (we made contact / they responded) ->
// booking (an appointment or estimate exists) -> sale (paying customer).
//
// Deliberate mappings worth remembering:
//   Opted In (needs dialing)  -> lead    (just arrived, nobody has dialled yet)
//   No Answer Day N           -> lead    (we dialled, they never answered: no
//                                          contact made, so not a pickup)
//   Long Term Nurture         -> lead    (no response, per Jake)
//   Survey Completed          -> pickup  (they engaged by completing a survey)
//   Cancelled-appt stages     -> booking (an appointment was made, then moved)
//   Handed Off                -> booking (the setter only hands a lead over once
//                                          a phone appointment exists)
//   Won / Won Recurring       -> sale    (a SECOND sale signal alongside the app
//                                          close-out value; see assembleLeads.
//                                          The old Customers pipeline that used
//                                          to carry this is gone.)
const STAGE_LEVELS: Record<string, TrackerLevel> = {
  // 1) Leads (post-realignment: the lead form and the funnel share one pipeline,
  // and a phone appointment is one stage rather than three).
  "lead form opt in": "lead",
  "funnel opt in": "lead",
  "lead follow up": "pickup",
  "phone appt": "booking",
  "slow burn": "lead",

  // 3) Sales. "Job/Estimate Cancelled" sits above the two booked keys because
  // the prefix pass would otherwise never reach it. It stays a booking: the
  // appointment did happen, and demoting it would understate the ad that earned
  // it. The client-facing status disagrees on purpose (leadStatus.ts calls it
  // Follow Up), because "did an appointment exist" and "what should I do about
  // this lead today" are different questions.
  "job/estimate cancelled": "booking",

  // 4) Trash
  dnd: "lead",

  // 1) Lead Form Pipeline (pre-realignment)
  "opted in (needs dialing)": "lead",
  "opted in follow up": "pickup",
  "long term nurture": "lead",
  // "No Answer Day 1..N (needs dialing)" all match this prefix, in both the
  // Lead Form and Funnel pipelines. Adding Day 5, 6, 7 in GHL needs no change.
  "no answer": "lead",
  // 2) Funnel Pipeline
  "survey completed no call booked (needs dialing)": "pickup",
  "survey follow up": "pickup",
  "phone appt booked": "booking",
  "phone appt confirmed": "booking",
  // 4) Cancelled Appointments (an appointment existed, so still a booking).
  // These sit above the "follow up" key so the prefix pass cannot reach them
  // first; exact matching makes that belt-and-braces, not load-bearing.
  "phone appt follow up": "booking",
  "phone appt rescheduling": "booking",
  "phone appt unspecified": "booking",
  // 3) Sales Pipeline
  "handed off": "booking",
  "estimate booked": "booking",
  "job booked": "booking",
  "won recurring": "sale",
  won: "sale",
  "follow up": "pickup",
  // 5) Trash Pipeline. These count as bare leads; the "Lost" status itself is
  // set from Trash-pipeline membership, not from the level (see leadTrackerData).
  "services uninterested": "lead",
  "services unqualified": "lead",
  "bad intent": "lead",
  lost: "lead",
};

// Which tracker pipelines a live pipeline belongs to, matched by name because
// ids are per-location. Returns null for pipelines the ad tracker ignores
// (Organic, Google Reviews, Reactivation, News Channel): those are not paid-ad
// leads.
//
//   lead      the ad-lead journey (Leads, No Answer, Sales, and the
//             pre-realignment Lead Form / Funnel / Cancelled Appointments)
//   customers the Customers pipeline (a sale signal)
//   trash     the Trash pipeline (marks a contact "Lost")
//
// Getting this wrong does not throw, it returns zero leads while spend keeps
// arriving, which is a dashboard that looks alive and reads nonsense. The
// 2026-07-28 realignment renamed "1) Lead Form" to "1) Leads" and "2) Funnel"
// to "2) No Answer", and this function matched neither until 2026-07-30.
export type PipelineRole = "lead" | "customers" | "trash";

export function trackerPipelineRole(name: string): PipelineRole | null {
  // Strip the "N) " agency prefix and any emoji, then match on keywords.
  const key = normaliseStage(name).replace(/^\d+\)\s*/, "").trim();
  if (!key) return null;
  if (key.includes("trash")) return "trash";
  if (key.includes("customer")) return "customers";
  if (
    // Post-realignment names.
    key.includes("leads") ||
    key.includes("no answer") ||
    // Pre-realignment names, for a client who has not been migrated.
    key.includes("lead form") ||
    key.includes("funnel") ||
    key.includes("sales") ||
    key.includes("cancelled appointment") ||
    key.includes("canceled appointment")
  ) {
    return "lead";
  }
  return null;
}

// Strip emoji and any other non-ASCII, collapse runs of whitespace, lowercase.
// GHL's live "Phone Appointment Booked  📞" carries a double space before the
// emoji, so collapsing is load-bearing, not cosmetic.
function normaliseStage(name: string): string {
  return String(name ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Match stages by name, never by id: ids are per-location and this has to work
// for the next client without a remap. Exact first, then prefix, because an
// enclosing-keycap emoji ("One-Time Customer 1️⃣") leaves an ASCII digit behind
// that normalisation cannot strip.
export function deriveLevel(stageName: string): TrackerLevel {
  const key = normaliseStage(stageName);
  if (!key) return "lead";
  const exact = STAGE_LEVELS[key];
  if (exact) return exact;
  for (const [stage, level] of Object.entries(STAGE_LEVELS)) {
    if (key.startsWith(stage)) return level;
  }
  return "lead";
}

export function isPickup(level: TrackerLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER.pickup;
}
export function isBooking(level: TrackerLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER.booking;
}
export function isSale(level: TrackerLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER.sale;
}

// One contact can hold opportunities in several pipelines (a customer keeps the
// Sales card that produced them). The furthest-along one is the truth.
export function furthestLevel(levels: TrackerLevel[]): TrackerLevel {
  let best: TrackerLevel = "lead";
  for (const l of levels) if (LEVEL_ORDER[l] > LEVEL_ORDER[best]) best = l;
  return best;
}

// An opportunity, reduced to what the tracker needs from it.
export interface TrackerOpportunity {
  id: string;
  contactId: string;
  pipelineStageId: string;
  createdAt: string;
}

// A lead as the tracker sees it, already joined and classified.
export interface TrackerLead {
  contactId: string;
  createdAt: string;
  level: TrackerLevel;
  // The client-facing label (Jake's 12-status model). Derived from the same
  // stages as `level`, but a finer ladder: `level` drives the KPI arithmetic,
  // `status` is what the lead tracker prints. See lib/leadStatus.ts.
  status: ClientLeadStatus;
  // Deal value in dollars, summed from customer_jobs.value_cents. Zero until
  // the contact has a closed-out job.
  value: number;
  // Meta ad id from contact.attributions[], or null when unattributed.
  adId: string | null;
}

// One ad's spend for one day, as stored in meta_ad_days.
export interface TrackerSpendRow {
  date: string;
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
}

export type TrackerRange = "all" | "7" | "30" | "90";
export type BreakdownLevel = "campaign" | "adset" | "ad";

export interface TrackerKpis {
  leads: number;
  pickups: number;
  bookings: number;
  sales: number;
  revenue: number;
  spend: number;
  pickupRate: number | null;
  bookingRate: number | null;
  salesPct: number | null;
  closeRate: number | null;
  roas: number | null;
}

export interface BreakdownRow {
  id: string;
  name: string;
  spend: number;
  leads: number;
  bookings: number;
  sales: number;
  revenue: number;
  roas: number | null;
  costPerLead: number | null;
  costPerBooking: number | null;
  // Running in Meta right now. Drives the "Live" badge and sorts the row to the
  // top, so the client's eye lands on what their money is buying today rather
  // than on whichever dead creative happened to spend the most historically.
  live: boolean;
}

// One campaign / ad set / ad as Meta describes it today. Supplied by
// lib/metaAdEntities.ts; kept as a structural type here so the arithmetic stays
// free of that module and its network calls.
export interface BreakdownEntity {
  id: string;
  level: BreakdownLevel;
  name: string;
  campaignId: string;
  live: boolean;
}

// A zero denominator yields null, never 0 and never Infinity. The UI renders
// null as "-"; rendering 0 would claim we measured something we did not.
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

// The sheet's date filter is `>= TODAY() - N`, so the boundary day is included.
// All Time returns null, meaning "do not filter".
export function rangeStart(range: TrackerRange, now: Date): string | null {
  if (range === "all") return null;
  const days = Number(range);
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  );
  return d.toISOString().slice(0, 10);
}

// Dates are ISO (YYYY-MM-DD) or ISO timestamps, so a string compare on the
// first ten characters is a correct date compare and cannot drift by timezone.
function inRange(value: string, start: string | null): boolean {
  if (!start) return true;
  return String(value).slice(0, 10) >= start;
}

// The most recent day present in the spend snapshot, or null if it is empty.
//
// Worth its own function because a stale snapshot is the quietest way for this
// page to lie: spend simply stops growing, and every ROAS, cost per lead and
// cost per booking derived from it drifts up looking perfectly plausible. The
// UI shows this date so the staleness is visible rather than inferred.
export function lastSpendDate(spendRows: TrackerSpendRow[]): string | null {
  let latest: string | null = null;
  for (const r of spendRows) {
    const d = String(r.date ?? "").slice(0, 10);
    if (!d) continue;
    if (latest === null || d > latest) latest = d;
  }
  return latest;
}

export function rollup(
  leads: TrackerLead[],
  spendRows: TrackerSpendRow[],
  start: string | null = null,
): TrackerKpis {
  const inWindow = leads.filter((l) => inRange(l.createdAt, start));

  let pickups = 0;
  let bookings = 0;
  let sales = 0;
  let revenue = 0;
  for (const l of inWindow) {
    if (isPickup(l.level)) pickups += 1;
    if (isBooking(l.level)) bookings += 1;
    if (isSale(l.level)) {
      sales += 1;
      revenue += l.value;
    }
  }

  const spend = spendRows
    .filter((r) => inRange(r.date, start))
    .reduce((sum, r) => sum + r.spend, 0);

  const leadCount = inWindow.length;
  return {
    leads: leadCount,
    pickups,
    bookings,
    sales,
    revenue,
    spend,
    // Every rate is over Leads except Close Rate, which is step-over-step.
    pickupRate: ratio(pickups, leadCount),
    bookingRate: ratio(bookings, leadCount),
    salesPct: ratio(sales, leadCount),
    closeRate: ratio(sales, bookings),
    roas: ratio(revenue, spend),
  };
}

interface GroupKey {
  id: string;
  name: string;
}

function groupOf(row: TrackerSpendRow, level: BreakdownLevel): GroupKey {
  if (level === "campaign") return { id: row.campaignId, name: row.campaignName };
  if (level === "adset") return { id: row.adsetId, name: row.adsetName };
  return { id: row.adId, name: row.adName };
}

// Which campaign the breakdown is scoped to: the one Meta says is live.
//
// Returns null when no entity data has been synced yet, or when nothing is
// live. Both cases mean "do not filter": a blank breakdown is a worse answer
// than an unfiltered one, and a client between campaigns should still see where
// their money went.
export function liveCampaignIds(entities: BreakdownEntity[]): Set<string> | null {
  const live = new Set<string>();
  for (const e of entities) {
    if (e.level === "campaign" && e.live) live.add(e.id);
  }
  return live.size > 0 ? live : null;
}

// Pivot spend and leads to one row per campaign / ad set / ad.
//
// The spend rows own the hierarchy: GHL gives us an ad id and nothing else, so
// ad -> ad set -> campaign is resolved through the Meta snapshot. Two
// consequences, both intended:
//   - an ad with spend but no leads still gets a row (wasted spend stays visible)
//   - a lead whose ad id we have never seen spend for is dropped from the
//     breakdown; it is still counted by rollup(), and the caller surfaces the
//     difference as an unattributed count so the two never look inconsistent.
//
// `entities` (Meta's live structure, from lib/metaAdEntities.ts) changes two
// things when supplied and a campaign is live, per Jake's rule of 2026-07-30:
//   - rows outside the live campaign are dropped, so a client sees the campaign
//     they are paying for rather than a museum of dead ones
//   - every entity in it gets a row even if it has never spent, and the ones
//     actually running are marked live and sorted to the top
//
// Note that this scopes the BREAKDOWN only. The Results block above it stays the
// true total for the date range, which is the sheet's behaviour and Jake's
// explicit call: the two answer different questions, so they are allowed to
// differ, and the page says so.
export function breakdown(
  leads: TrackerLead[],
  spendRows: TrackerSpendRow[],
  level: BreakdownLevel,
  start: string | null = null,
  entities: BreakdownEntity[] = [],
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  const adToGroup = new Map<string, string>();

  const liveCampaigns = liveCampaignIds(entities);
  const atLevel = entities.filter((e) => e.level === level);
  const inScope = liveCampaigns
    ? new Set(atLevel.filter((e) => liveCampaigns.has(e.campaignId)).map((e) => e.id))
    : null;
  const entityById = new Map(atLevel.map((e) => [e.id, e]));

  const blank = (id: string, name: string): BreakdownRow => ({
    id,
    name,
    spend: 0,
    leads: 0,
    bookings: 0,
    sales: 0,
    revenue: 0,
    roas: null,
    costPerLead: null,
    costPerBooking: null,
    live: entityById.get(id)?.live ?? false,
  });

  // Seed from Meta's own structure so an ad that has never run still gets a row.
  // Only possible when we have entity data; spend rows alone cannot know that an
  // ad exists.
  if (inScope) {
    for (const id of inScope) {
      const e = entityById.get(id)!;
      rows.set(id, blank(id, e.name));
    }
  }

  for (const row of spendRows.filter((r) => inRange(r.date, start))) {
    const { id, name } = groupOf(row, level);
    if (!id) continue;
    adToGroup.set(row.adId, id);
    if (inScope && !inScope.has(id)) continue;

    const existing = rows.get(id);
    if (existing) {
      existing.spend += row.spend;
    } else {
      rows.set(id, { ...blank(id, name), spend: row.spend });
    }
  }

  // An ad can appear in the snapshot on a day outside the window while its
  // lead falls inside it, so resolve ad -> group across all rows, not just the
  // filtered ones.
  for (const row of spendRows) {
    if (!adToGroup.has(row.adId)) {
      const { id } = groupOf(row, level);
      if (id && rows.has(id)) adToGroup.set(row.adId, id);
    }
  }

  for (const lead of leads) {
    if (!lead.adId || !inRange(lead.createdAt, start)) continue;
    const groupId = adToGroup.get(lead.adId);
    if (!groupId) continue;
    const row = rows.get(groupId);
    if (!row) continue;

    row.leads += 1;
    if (isBooking(lead.level)) row.bookings += 1;
    if (isSale(lead.level)) {
      row.sales += 1;
      row.revenue += lead.value;
    }
  }

  for (const row of rows.values()) {
    row.roas = ratio(row.revenue, row.spend);
    row.costPerLead = ratio(row.spend, row.leads);
    row.costPerBooking = ratio(row.spend, row.bookings);
  }

  // Live first, then by spend. What is running today is the thing worth looking
  // at; among the rest, the biggest spender is.
  return [...rows.values()].sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return b.spend - a.spend;
  });
}

// Fold opportunities, contact attribution and the job ledger into one lead per
// contact.
//
// One contact can hold several opportunities (a repeat customer keeps the Sales
// card that produced them), so they collapse to a single lead carrying:
//   - the FURTHEST level reached across all of them
//   - the EARLIEST created date, because that is when the ad acquired them.
//     Dating a lead by its conversion would push revenue into whichever range
//     the close happened in and understate the ad that actually earned it.
//
// A closed-out job (customer_jobs.value_cents, keyed by ghl_contact_id) is what
// makes a lead a Sale, not a Customers-pipeline card. See the build plan §4:
// the pipeline has never been used, while the job ledger is the app's own data.
// A zero-value job still counts, because a $0 close-out is explicitly allowed.
export function assembleLeads(
  opportunities: TrackerOpportunity[],
  stageNames: Map<string, string>,
  attributionByContact: Map<string, { adId: string } | null>,
  jobValueByContact: Map<string, number>,
  // Per-tenant overrides from ghl_stage_map, keyed by STAGE ID. Name matching
  // in leadStatus.ts stays the default and handles every client that names
  // stages the usual way; this is for the ones that do not. Empty or absent
  // means the behaviour is exactly what it was before the map existed.
  statusOverrides?: ReadonlyMap<string, ClientLeadStatus>,
): TrackerLead[] {
  const byContact = new Map<string, TrackerLead>();

  for (const opp of opportunities) {
    const contactId = opp.contactId?.trim();
    // No contact means no attribution and no way to dedupe. Nothing to track.
    if (!contactId) continue;

    const stageName = stageNames.get(opp.pipelineStageId) ?? "";
    const level = deriveLevel(stageName);
    const status =
      statusOverrides?.get(opp.pipelineStageId) ?? statusForStage(stageName);
    const existing = byContact.get(contactId);

    if (existing) {
      existing.level = furthestLevel([existing.level, level]);
      existing.status = furthestStatus([existing.status, status]);
      if (opp.createdAt && opp.createdAt < existing.createdAt) {
        existing.createdAt = opp.createdAt;
      }
      continue;
    }

    byContact.set(contactId, {
      contactId,
      createdAt: opp.createdAt,
      level,
      status,
      value: 0,
      adId: attributionByContact.get(contactId)?.adId ?? null,
    });
  }

  for (const [contactId, value] of jobValueByContact) {
    const lead = byContact.get(contactId);
    if (!lead) continue;
    // A closed-out job is money in the bank, so it wins outright over whatever
    // stage the cards happen to sit in.
    lead.level = "sale";
    lead.status = "won";
    lead.value = value;
  }

  return [...byContact.values()];
}

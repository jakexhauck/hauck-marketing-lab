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

// Live GHL stage name (normalised) -> level. Pulled 2026-07-19 from the Sales,
// Trash and Customers pipelines. Stages absent here fall through to "lead",
// which counts the contact without inventing progress for it.
//
// Deliberate mappings worth remembering:
//   Long Term Nurture -> lead    (Jake: no response goes here, so not a pickup)
//   No Close          -> booking (they took an appointment and did not buy;
//                                 the sheet counts Lost as a booking)
//   No-Show           -> booking (a booking was made, then missed)
//   Opted Out         -> pickup  (they responded, even if only to leave)
const STAGE_LEVELS: Record<string, TrackerLevel> = {
  // Sales
  "new lead": "lead",
  "hot lead": "pickup",
  "phone appointment booked": "booking",
  "estimate scheduled": "booking",
  "job booked": "booking",
  "job completed": "booking",
  "follow up": "pickup",
  "long term nurture": "lead",
  // Trash
  "no answer": "lead",
  "no close": "booking",
  "phone appointment no-show": "booking",
  "opted out": "pickup",
  // Customers. A secondary sale signal only: the money comes from the job
  // ledger (see assembleLeads), because this pipeline has never been used.
  "one-time customer": "sale",
  "recurring customer": "sale",
};

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

// Pivot spend and leads to one row per campaign / ad set / ad.
//
// The spend rows own the hierarchy: GHL gives us an ad id and nothing else, so
// ad -> ad set -> campaign is resolved through the Meta snapshot. Two
// consequences, both intended:
//   - an ad with spend but no leads still gets a row (wasted spend stays visible)
//   - a lead whose ad id we have never seen spend for is dropped from the
//     breakdown; it is still counted by rollup(), and the caller surfaces the
//     difference as an unattributed count so the two never look inconsistent.
export function breakdown(
  leads: TrackerLead[],
  spendRows: TrackerSpendRow[],
  level: BreakdownLevel,
  start: string | null = null,
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  const adToGroup = new Map<string, string>();

  for (const row of spendRows.filter((r) => inRange(r.date, start))) {
    const { id, name } = groupOf(row, level);
    if (!id) continue;
    adToGroup.set(row.adId, id);

    const existing = rows.get(id);
    if (existing) {
      existing.spend += row.spend;
    } else {
      rows.set(id, {
        id,
        name,
        spend: row.spend,
        leads: 0,
        bookings: 0,
        sales: 0,
        revenue: 0,
        roas: null,
        costPerLead: null,
        costPerBooking: null,
      });
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

  return [...rows.values()].sort((a, b) => b.spend - a.spend);
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
): TrackerLead[] {
  const byContact = new Map<string, TrackerLead>();

  for (const opp of opportunities) {
    const contactId = opp.contactId?.trim();
    // No contact means no attribution and no way to dedupe. Nothing to track.
    if (!contactId) continue;

    const level = deriveLevel(stageNames.get(opp.pipelineStageId) ?? "");
    const existing = byContact.get(contactId);

    if (existing) {
      existing.level = furthestLevel([existing.level, level]);
      if (opp.createdAt && opp.createdAt < existing.createdAt) {
        existing.createdAt = opp.createdAt;
      }
      continue;
    }

    byContact.set(contactId, {
      contactId,
      createdAt: opp.createdAt,
      level,
      value: 0,
      adId: attributionByContact.get(contactId)?.adId ?? null,
    });
  }

  for (const [contactId, value] of jobValueByContact) {
    const lead = byContact.get(contactId);
    if (!lead) continue;
    lead.level = "sale";
    lead.value = value;
  }

  return [...byContact.values()];
}

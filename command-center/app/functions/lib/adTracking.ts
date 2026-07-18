// Server-side shaping for the per-client daily paid-ad funnel tracker behind
// GET/POST /api/admin/clients/:tenantId/ad-tracking.
//
// Kept out of the handler so the month range and the field whitelist are pure
// and unit-tested. Only the 13 typed inputs are ever stored; the ratios the UI
// shows are derived client-side and never round-trip.

// camelCase wire key -> snake_case column. This map IS the whitelist: anything
// not in it is dropped rather than written.
const FIELDS: Record<string, string> = {
  spend: "spend",
  impressions: "impressions",
  clicks: "clicks",
  linkClicks: "link_clicks",
  newLeads: "new_leads",
  demosBooked: "demos_booked",
  qualified: "qualified",
  disqualified: "disqualified",
  noShow: "no_show",
  sales: "sales",
  contractedRev: "contracted_rev",
  ufCash: "uf_cash",
  newMrr: "new_mrr",
};

export const AD_TRACKING_COLUMNS = ["date", ...Object.values(FIELDS)].join(", ");

// One day as the wire carries it.
export interface AdTrackingDayDto {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  newLeads: number;
  demosBooked: number;
  qualified: number;
  disqualified: number;
  noShow: number;
  sales: number;
  contractedRev: number;
  ufCash: number;
  newMrr: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

// The half-open range [start, nextStart) covering one YYYY-MM, or null when the
// month is malformed. Built from the string parts rather than Date arithmetic,
// so no timezone can shift a month boundary.
export function monthRange(month: string): { start: string; nextStart: string } | null {
  if (!ISO_MONTH.test(month)) return null;
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (m < 1 || m > 12) return null;

  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${year}-${pad(m)}-01`,
    nextStart: `${nextYear}-${pad(nextMonth)}-01`,
  };
}

// The current UTC month, used when the request omits ?month=.
export function currentMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  // Reject a well-formed but non-existent day (2026-02-30).
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

export type AdTrackingUpsertResult =
  | { ok: true; date: string; row: Record<string, unknown> }
  | { ok: false; error: string };

// Whitelist an upsert body into a snake_case row. `date` is required and must be
// a real calendar day. Every metric is optional; negatives clamp to 0 (a
// negative spend or lead count is a typo, not data), and non-numeric values are
// rejected outright rather than silently zeroed.
export function buildAdTrackingUpsert(body: unknown): AdTrackingUpsertResult {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  const input = body as Record<string, unknown>;

  if (!isIsoDate(input.date)) return { ok: false, error: "date must be YYYY-MM-DD" };

  const row: Record<string, unknown> = { date: input.date };
  for (const [key, column] of Object.entries(FIELDS)) {
    if (input[key] === undefined || input[key] === null || input[key] === "") continue;
    const n = Number(input[key]);
    if (!Number.isFinite(n)) return { ok: false, error: `${key} must be a number` };
    row[column] = Math.max(0, n);
  }

  return { ok: true, date: input.date, row };
}

// The DB row as Postgres returns it. numeric(12,2) can arrive as a string from
// PostgREST, so every value goes through Number().
export function toAdTrackingDto(row: Record<string, unknown>): AdTrackingDayDto {
  const n = (v: unknown) => {
    const parsed = Number(v ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    date: String(row.date ?? ""),
    spend: n(row.spend),
    impressions: n(row.impressions),
    clicks: n(row.clicks),
    linkClicks: n(row.link_clicks),
    newLeads: n(row.new_leads),
    demosBooked: n(row.demos_booked),
    qualified: n(row.qualified),
    disqualified: n(row.disqualified),
    noShow: n(row.no_show),
    sales: n(row.sales),
    contractedRev: n(row.contracted_rev),
    ufCash: n(row.uf_cash),
    newMrr: n(row.new_mrr),
  };
}

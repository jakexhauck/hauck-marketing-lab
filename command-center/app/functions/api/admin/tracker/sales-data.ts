import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { monthWindow } from "../../../lib/tracker";
import { agencyTimezone, getAgencyGhlContext, AgencyGhlError } from "../../../lib/agencyGhl";
import { syncAgencyMeetings, type SyncResult } from "../../lib/salesCallSync";
import {
  daysInMonth,
  rollUpSalesCalls,
  rowsInMonth,
  toCountable,
  type DerivedSalesDay,
  type SalesCallRow,
} from "../../../lib/salesDataRollup";
import {
  byOffer,
  bySource,
  reasonCounts,
  type OfferSplitRow,
  type SourceSplitRow,
} from "../../../lib/salesCalls";

// GET /api/admin/tracker/sales-data?month=YYYY-MM
//
// The agency's own daily sales-call funnel (Sales > Sales Data). Agency-global:
// this is Jake's data, not a client's, so there is no tenant in play. Reaching
// this file at all means _middleware.ts already proved an active super-admin
// session, so there is no per-handler auth beyond that.
//
// DERIVED, NOT TYPED. Until now this read public.sales_data, a grid somebody
// filled in by hand, and had a PATCH beside it to write cells. Every one of
// those counts is already recorded a meeting at a time in public.sales_calls:
// the calendar says what was booked and cancelled, and the outcome recorded on
// Sales Calls says what turned up, qualified and closed. Two answers to one
// question only agree until somebody is busy, so the typed grid is gone and
// this reads the meetings. There is no PATCH any more: nothing here is a number
// a person can assert.
//
// The rollup itself is pure and lives in lib/salesDataRollup.ts. This file is
// only the I/O around it: sync, read, group, answer.
//
// public.sales_data (migration 0030) is left in place and no longer read or
// written. It holds nothing; dropping a table is a migration and a decision of
// its own, not a side effect of changing a page.

interface SalesCallDbRow {
  scheduled_at: string | null;
  appointment_status: string | null;
  outcome: string | null;
  qualified: boolean | null;
  cash_collected: number | string | null;
  // What was sold, why they said no, and where the meeting came from. All three
  // have been on the table for months and were read by nothing until the source
  // table, the reason list and New MRR needed them.
  deal: unknown;
  not_a_fit_reason: string | null;
  source: string | null;
  // Which offer was on the table (0086). Only the variant: the terms inside it
  // are what was quoted on one call, and this page counts calls.
  offer_variant: string | null;
  prospect_name: string | null;
  business_name: string | null;
}

const SELECT =
  "scheduled_at, appointment_status, outcome, qualified, cash_collected," +
  " deal, not_a_fit_reason, source, offer_variant, prospect_name, business_name";

// numeric arrives as a string on some drivers, so cash is normalised to a
// number exactly once, here at the boundary.
function toMoney(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRow(row: SalesCallDbRow): SalesCallRow {
  return {
    scheduledAt: row.scheduled_at,
    appointmentStatus: row.appointment_status ?? "",
    outcome: row.outcome,
    qualified: row.qualified,
    cashCollected: toMoney(row.cash_collected),
    deal: row.deal,
    reason: row.not_a_fit_reason,
    source: row.source,
    offerVariant: row.offer_variant,
    prospectName: row.prospect_name ?? "",
    businessName: row.business_name ?? "",
  };
}

// A day of the response. The counts, plus the names behind them.
interface WireDay extends DerivedSalesDay {
  day: string;
}

interface GetResponse {
  days: WireDay[];
  // Whether the agency GoHighLevel account is connected at all. False makes
  // every count on the page a statement about our own database rather than
  // about the business.
  configured: boolean;
  sync: (SyncResult & { ok: true }) | { ok: false; error: string } | null;
  // Meetings with no time on them, so they belong to no day. Reported rather
  // than dropped.
  undated: number;
  // The month split by where the meetings came from, busiest first. Counted per
  // MEETING rather than per day, which is why it is sent whole rather than
  // summed by the client off the day rows.
  sources: SourceSplitRow[];
  // The month split by which OFFER was pitched, best close rate first. Only
  // meetings somebody turned up to: an offer cannot be pitched to a no-show.
  offers: OfferSplitRow[];
  // How many of the month's nos gave each reason, keyed by SALES_NO_REASONS.
  reasons: Record<string, number>;
}

// A New York day reaches into two UTC days, so the window queried is widened by
// a day at each end and trimmed back after the timezone has been applied.
const DAY_MS = 86_400_000;

function widen(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString();
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const month = url.searchParams.get("month");
  const window = monthWindow(month);
  if (!window) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  // ?sync=0 reads what is already stored. The month grid is derived from rows
  // the sync maintains, so by default opening this page reconciles the
  // calendars exactly as Sales Calls does: the numbers are meant to be current
  // without anybody remembering to visit another page first.
  const wantSync = url.searchParams.get("sync") !== "0";

  let gctx = null;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (err) {
    if (!(err instanceof AgencyGhlError)) throw err;
  }

  let sync: GetResponse["sync"] = null;
  if (gctx && wantSync) {
    // Best effort. A calendar that could not be read must still leave a
    // readable month: the meetings already recorded are real, and blanking them
    // because GoHighLevel timed out would be the wrong answer.
    try {
      const result = await syncAgencyMeetings(gctx, client, {
        calendarIds: ctx.env.AGENCY_SALES_CALENDAR_IDS ?? null,
      });
      sync = { ok: true, ...result };
    } catch (err) {
      console.error("[tracker/sales-data] sync failed", err);
      const raw = err instanceof Error ? err.message : String(err);
      sync = { ok: false, error: raw.split("\n")[0].slice(0, 200) };
    }
  }

  const { data, error } = await client
    .from("sales_calls")
    .select(SELECT)
    .gte("scheduled_at", widen(window.first, -1))
    .lte("scheduled_at", widen(window.last, 2))
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("[tracker/sales-data] read failed", error.message);
    return Response.json({ error: "failed to load sales data" }, { status: 500 });
  }

  const timeZone = agencyTimezone(ctx.env);
  const rows = ((data ?? []) as unknown as SalesCallDbRow[]).map(toRow);
  const rolled = rollUpSalesCalls(rows, timeZone);
  // From the validated window rather than the raw query string, so the trim can
  // never be asked to match a month the read did not cover.
  const monthKey = window.first.slice(0, 7);
  const inMonth = daysInMonth(rolled.days, monthKey);

  // The two per-meeting breakdowns. Trimmed to the month by the same timezone
  // rule the grid uses, then counted by the same functions the Sales Calls page
  // counts with, so no reader can hold this table against that funnel and find
  // them disagreeing.
  const monthRows = rowsInMonth(rows, timeZone, monthKey).map(toCountable);

  // No cold_call_dials read here any more. This page used to open with the
  // month's dialing so the strip could run Dials through to cash, but the same
  // month is already reported on Acquisition > Cold Call > Tracker and a number
  // with two homes drifts. Sales counts meetings; Cold Call counts dials.

  const body: GetResponse = {
    // Only the days that have a meeting on them. The client generates the empty
    // ones, so a month with no selling in it stays visibly empty rather than
    // arriving as a run of fabricated zero rows.
    days: Object.entries(inMonth)
      .map(([day, counts]) => ({ day, ...counts }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    configured: Boolean(gctx),
    sync,
    undated: rolled.undated,
    sources: bySource(monthRows),
    offers: byOffer(monthRows),
    reasons: reasonCounts(monthRows),
  };
  return Response.json(body);
};

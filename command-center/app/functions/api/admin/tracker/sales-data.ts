import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { monthWindow } from "../../../lib/tracker";
import { agencyTimezone, getAgencyGhlContext, AgencyGhlError } from "../../../lib/agencyGhl";
import { syncAgencyMeetings, type SyncResult } from "../../lib/salesCallSync";
import {
  callsInMonth,
  toSheetCall,
  type SalesCallRow,
  type SheetCall,
} from "../../../lib/salesSheetRows";

// GET /api/admin/tracker/sales-data?month=YYYY-MM
//
// The agency's own daily sales-call funnel (Sales > Sales Data). Agency-global:
// this is Jake's data, not a client's, so there is no tenant in play. Reaching
// this file at all means _middleware.ts already proved an active super-admin
// session, so there is no per-handler auth beyond that.
//
// ONE ROW PER MEETING. This used to group the month into days, because the page
// above it was a day grid. The page is now a clone of the sales tracking sheet
// Jake works from, and that sheet has one line per call, so the days are gone
// and the meetings themselves go over the wire.
//
// DERIVED, NOT TYPED. Every field is read off a meeting already recorded in
// public.sales_calls: the calendar says what was booked and cancelled, and the
// outcome recorded on Sales Calls says what turned up and closed. There is no
// PATCH: nothing on this page is a number a person can assert.
//
// The band totals across the top of the sheet are NOT computed here. The client
// already holds every call it would add up, and the arithmetic a commission is
// argued over belongs in one unit-tested place (src/lib/salesSheet.ts) rather
// than in two that agree until one of them is edited.
//
// The month trim and the wire shape are pure and live in lib/salesSheetRows.ts.
// This file is only the I/O around them: sync, read, trim, answer.
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
  // What was sold, why they said no, and the notes taken on the call: the three
  // the sheet has columns for.
  deal: unknown;
  not_a_fit_reason: string | null;
  scratchpad: string | null;
  prospect_name: string | null;
  business_name: string | null;
  // The GHL disposition form's answers (sales-disposition-form.md). Flat
  // revenue is numeric, so it goes through toMoney like cash does.
  post_call_form_url: string | null;
  payment_platform: string | null;
  recording_link: string | null;
  revenue_generated: number | string | null;
}

// qualified and offer_variant are deliberately not selected: the sheet
// has no column for them, and a query that reads what no page renders is
// how a select grows without anybody noticing.
const SELECT =
  "scheduled_at, appointment_status, outcome, cash_collected," +
  " deal, not_a_fit_reason, scratchpad, prospect_name, business_name," +
  " post_call_form_url, payment_platform, recording_link, revenue_generated";

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
    cashCollected: toMoney(row.cash_collected),
    deal: row.deal,
    reason: row.not_a_fit_reason,
    scratchpad: row.scratchpad,
    prospectName: row.prospect_name ?? "",
    businessName: row.business_name ?? "",
    postCallFormUrl: row.post_call_form_url ?? "",
    paymentPlatform: row.payment_platform ?? "",
    recordingLink: row.recording_link ?? "",
    revenueGenerated: toMoney(row.revenue_generated),
  };
}

interface GetResponse {
  // The month's meetings, earliest first. One per line of the sheet.
  calls: SheetCall[];
  // The agency's timezone, so the client writes each appointment date in the
  // zone the business runs on rather than in whichever one the reader sits in.
  timeZone: string;
  // Whether the agency GoHighLevel account is connected at all. False makes
  // every count on the page a statement about our own database rather than
  // about the business.
  configured: boolean;
  sync: (SyncResult & { ok: true }) | { ok: false; error: string } | null;
  // Meetings with no time on them, so they belong to no month. Reported rather
  // than dropped: a meeting missing from a month should be visible as a meeting
  // missing from a month.
  undated: number;
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

  // From the validated window rather than the raw query string, so the trim can
  // never be asked to match a month the read did not cover. The query window is
  // widened by a day at each end, so this is what keeps a neighbouring month's
  // meetings off the sheet.
  const monthKey = window.first.slice(0, 7);

  const body: GetResponse = {
    calls: callsInMonth(rows, timeZone, monthKey)
      .map(toSheetCall)
      // Earliest first, so the sheet reads down the month the way a diary does.
      .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "")),
    timeZone,
    configured: Boolean(gctx),
    sync,
    // Counted off the whole read rather than off the trimmed month: a meeting
    // with no time belongs to no month, so it can never survive the trim.
    undated: rows.filter((r) => !r.scheduledAt || Number.isNaN(Date.parse(r.scheduledAt))).length,
  };
  return Response.json(body);
};

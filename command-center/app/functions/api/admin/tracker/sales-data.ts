import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { agencyTimezone } from "../../../lib/agencyGhl";
import {
  countsByDay,
  isDerivedDay,
  type CountableCall,
  type DayCounts,
} from "../../../lib/salesCalls";
import {
  isIsoDay,
  monthWindow,
  buildTrackerUpdate,
  type TrackerFieldSpec,
} from "../../../lib/tracker";

// The agency's own daily sales-call funnel (migration 0030). Agency-global: this
// is Jake's data, not a client's, so there is no tenant in play. Reaching this
// file at all means _middleware.ts already proved an active super-admin session,
// so there is no per-handler auth beyond that.
//
// Raw counts only. Every rate the page shows is derived client-side in
// src/lib/salesTracker.ts from these numbers, so nothing computed is ever
// stored and nothing stored can drift from what it was computed from.
//
// ---------------------------------------------------------------------------
// Two sources, one answer.
//
// Since migration 0057 these counts have a second, better source: the demo
// calls actually logged on the Sales Calls page. A day that has calls on the
// agency calendar reports DERIVED counts and its typed values are ignored,
// because a day with two numbers is a day with no number. Notes stay typed.
//
// A day with no calls keeps whatever was typed, so the months entered by hand
// before that page existed stay intact and stay editable.

// The wire contract. camelCase in, snake_case column out; the shared helper in
// lib/tracker.ts owns the coercion and the refusals.
const FIELDS: TrackerFieldSpec = {
  callsOnCalendar: { column: "calls_on_calendar", kind: "int" },
  rescheduledCancelled: { column: "rescheduled_cancelled", kind: "int" },
  callsTaken: { column: "calls_taken", kind: "int" },
  qualified: { column: "qualified", kind: "int" },
  closed: { column: "closed", kind: "int" },
  cashCollected: { column: "cash_collected", kind: "money" },
  notes: { column: "notes", kind: "text" },
};

const SELECT =
  "day, calls_on_calendar, rescheduled_cancelled, calls_taken, qualified, closed, cash_collected, notes";

interface SalesDataDbRow {
  day: string;
  calls_on_calendar: number | null;
  rescheduled_cancelled: number | null;
  calls_taken: number | null;
  qualified: number | null;
  closed: number | null;
  cash_collected: number | string | null;
  notes: string | null;
}

// numeric(12,2) can arrive as a string depending on the driver, so cash is
// normalised to a number (or null) exactly once, here at the boundary.
function toMoney(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toWire(row: SalesDataDbRow) {
  return {
    day: row.day,
    callsOnCalendar: row.calls_on_calendar,
    rescheduledCancelled: row.rescheduled_cancelled,
    callsTaken: row.calls_taken,
    qualified: row.qualified,
    closed: row.closed,
    cashCollected: toMoney(row.cash_collected),
    notes: row.notes,
  };
}

// Every logged demo call whose scheduled day could land inside the month.
//
// The window is widened by a day at each end before it is filtered by day
// string, because `scheduled_at` is an instant and the day it belongs to is
// worked out in the agency's timezone. A call at 8pm on the 31st is still that
// month's call even though it is already the 1st in UTC.
async function derivedCounts(
  client: ReturnType<typeof getServiceClient>,
  first: string,
  last: string,
  timeZone: string,
): Promise<Record<string, DayCounts>> {
  if (!client) return {};

  const from = new Date(`${first}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${last}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);

  const { data, error } = await client
    .from("sales_calls")
    .select("scheduled_at, appointment_status, outcome, qualified, cash_collected")
    .gte("scheduled_at", from.toISOString())
    .lt("scheduled_at", to.toISOString());

  if (error) {
    // The typed numbers are still worth showing. Failing the whole month
    // because the derivation could not run would take away data that is
    // already there.
    console.error("[sales-data] could not read logged calls", error.message);
    return {};
  }

  const all = countsByDay((data ?? []) as CountableCall[], timeZone);
  // Trim back to the month the caller asked for.
  const out: Record<string, DayCounts> = {};
  for (const [day, counts] of Object.entries(all)) {
    if (day >= first && day <= last) out[day] = counts;
  }
  return out;
}

// A day's counts, with logged calls overriding what was typed. Notes are never
// overridden: they are the one column no call can write.
function mergeDay(row: SalesDataDbRow | undefined, counts: DayCounts, day: string) {
  return {
    day,
    callsOnCalendar: counts.callsOnCalendar,
    rescheduledCancelled: counts.rescheduledCancelled,
    callsTaken: counts.callsTaken,
    qualified: counts.qualified,
    closed: counts.closed,
    cashCollected: counts.cashCollected,
    notes: row?.notes ?? null,
  };
}

// GET /api/admin/tracker/sales-data?month=YYYY-MM
// The logged days inside that month, in date order. Days with no row simply are
// not here: the client auto-generates the empty ones, so an unlogged day stays
// visibly empty rather than arriving as a fabricated zero row.
//
// `derivedDays` lists the days whose numbers came from logged calls. The client
// locks those cells, so nobody types over a number they cannot change.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const month = new URL(ctx.request.url).searchParams.get("month");
  const window = monthWindow(month);
  if (!window) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const { data, error } = await client
    .from("sales_data")
    .select(SELECT)
    .gte("day", window.first)
    .lte("day", window.last)
    .order("day", { ascending: true });

  if (error) {
    return Response.json({ error: "failed to load sales data" }, { status: 500 });
  }

  const typed = (data ?? []) as SalesDataDbRow[];
  const counts = await derivedCounts(client, window.first, window.last, agencyTimezone(ctx.env));

  const byDay = new Map(typed.map((row) => [row.day, row]));
  const derivedDays = Object.keys(counts).filter((d) => isDerivedDay(counts[d]));

  // Every day that has either a typed row or logged calls, in date order.
  const days = [...new Set([...byDay.keys(), ...derivedDays])]
    .sort()
    .map((day) =>
      derivedDays.includes(day)
        ? mergeDay(byDay.get(day), counts[day], day)
        : toWire(byDay.get(day)!),
    );

  return Response.json({ days, derivedDays });
};

interface PatchBody {
  day?: unknown;
  [field: string]: unknown;
}

// PATCH /api/admin/tracker/sales-data
// Body: { day: "YYYY-MM-DD", ...any subset of the input fields }.
// Upserts on `day`, so the first edit to a day creates its row and every later
// edit updates it. Columns absent from the body keep their stored value: typing
// in one cell must never blank the rest of the day.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: PatchBody;
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { day } = body;
  if (!isIsoDay(day)) {
    return Response.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  }

  const result = buildTrackerUpdate(FIELDS, body);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  // A day whose numbers come from logged calls cannot have those numbers typed
  // over. The client already locks the cells; this is the same rule on the
  // write path, because a lock that only exists in the UI is not a lock and the
  // stored value would silently lose to the derivation on the next read anyway.
  //
  // Notes are exempt: no call writes them, so they stay typeable every day.
  const touchedCounts = Object.keys(result.update).filter((c) => c !== "notes");
  if (touchedCounts.length) {
    const counts = await derivedCounts(client, day, day, agencyTimezone(ctx.env));
    if (isDerivedDay(counts[day])) {
      return Response.json(
        {
          error: "derived_day",
          message:
            "This day's numbers come from the demo calls logged on Sales Calls. Log the call there instead.",
        },
        { status: 409 },
      );
    }
  }

  const { data, error } = await client
    .from("sales_data")
    .upsert({ day, ...result.update, updated_at: new Date().toISOString() }, {
      onConflict: "day",
    })
    .select(SELECT)
    .single();

  if (error) {
    return Response.json({ error: "failed to save sales data" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "tracker.sales_data.update", null, {
    day,
    fields: Object.keys(result.update),
  });

  return Response.json({ ok: true, day: toWire(data as SalesDataDbRow) });
};

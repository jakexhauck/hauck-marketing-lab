import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
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

// GET /api/admin/tracker/sales-data?month=YYYY-MM
// The logged days inside that month, in date order. Days with no row simply are
// not here: the client auto-generates the empty ones, so an unlogged day stays
// visibly empty rather than arriving as a fabricated zero row.
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

  return Response.json({ days: ((data ?? []) as SalesDataDbRow[]).map(toWire) });
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

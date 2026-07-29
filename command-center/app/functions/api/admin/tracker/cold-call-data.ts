import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { monthWindow } from "../../../lib/tracker";
import { rollUpDialsByDay, type DialRow, type RecordedCounts } from "../../../lib/coldCallDials";

// GET /api/admin/tracker/cold-call-data?month=YYYY-MM
//
// Sales > Cold Call Data: the agency's whole month of dialing, measured.
//
// This is NOT the Cold Call tracker in Acquisition. That one is a caller's own
// month, scoped to whoever is signed in, and it has typed cells that override
// the measurement for dialing done off-app. This is the agency's month, every
// caller at once, and nothing on it can be typed: it is the channel's numbers
// as the app recorded them, sitting beside Sales Data so the two halves of the
// funnel can be read against each other.
//
// Owner only, for the same reason Sales Calls is: a cold caller sees their own
// numbers on their own page, not everybody's.
//
// Derived from cold_call_dials, one row per attempt (0052). The counting rules
// live in lib/coldCallDials.ts and are shared with the caller's tracker, so the
// two pages can never disagree about what a pickup is.

interface DialDbRow {
  caller_id: string | null;
  day: string;
  spoke: boolean | null;
  pitched: boolean | null;
  outcome: string | null;
  reason: string | null;
}

// One person's month, for the who-did-what table.
export interface CallerTotals {
  id: string;
  name: string;
  dials: number;
  talked: number;
  pitched: number;
  booked: number;
}

interface WireDay extends RecordedCounts {
  day: string;
}

interface GetResponse {
  days: WireDay[];
  callers: CallerTotals[];
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin!;
  if (admin.role !== "owner") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const month = new URL(ctx.request.url).searchParams.get("month");
  const window = monthWindow(month);
  if (!window) return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });

  // `day` is a plain date column, written in the agency's own day by the route
  // that logs the attempt, so the window needs no timezone conversion.
  const { data, error } = await client
    .from("cold_call_dials")
    .select("caller_id, day, spoke, pitched, outcome, reason")
    .gte("day", window.first)
    .lte("day", window.last)
    .order("day", { ascending: true });

  if (error) {
    console.error("[tracker/cold-call-data] read failed", error.message);
    return Response.json({ error: "failed to load the dialing" }, { status: 500 });
  }

  const rows = (data ?? []) as DialDbRow[];

  // Per day, through the shared rollup the caller's own tracker uses.
  const byDay = rollUpDialsByDay(
    rows.map(
      (r): DialRow => ({
        day: r.day,
        spoke: Boolean(r.spoke),
        pitched: Boolean(r.pitched),
        outcome: r.outcome ?? "",
        reason: r.reason,
      }),
    ),
  );

  // Per caller. Names are resolved in one query rather than per row; a caller
  // whose account has since been deleted keeps their dials and loses only their
  // name, because deleting somebody must not delete the month they worked.
  const callerIds = [...new Set(rows.map((r) => r.caller_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (callerIds.length) {
    const { data: accounts } = await client
      .from("admin_accounts")
      .select("id, name")
      .in("id", callerIds);
    for (const a of (accounts ?? []) as { id: string; name: string }[]) {
      names.set(a.id, a.name);
    }
  }

  const byCaller = new Map<string, CallerTotals>();
  for (const r of rows) {
    const id = r.caller_id ?? "unassigned";
    const totals =
      byCaller.get(id) ??
      ({
        id,
        name: names.get(id) ?? "A caller who has since been removed",
        dials: 0,
        talked: 0,
        pitched: 0,
        booked: 0,
      } satisfies CallerTotals);
    totals.dials += 1;
    if (r.spoke) totals.talked += 1;
    if (r.pitched) totals.pitched += 1;
    if (r.outcome === "booked") totals.booked += 1;
    byCaller.set(id, totals);
  }

  const body: GetResponse = {
    // Only the days that were dialled. The client generates the blank ones, so
    // a quiet week stays visibly blank rather than arriving as fabricated zeroes.
    days: Object.entries(byDay)
      .map(([day, counts]) => ({ day, ...counts }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    // Busiest first: the table is read to see who is on the phones.
    callers: [...byCaller.values()].sort((a, b) => b.dials - a.dials),
  };
  return Response.json(body);
};

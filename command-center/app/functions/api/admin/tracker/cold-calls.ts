import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  mergeRecordedDays,
  rollUpDialsByDay,
  type DialRow,
  type TypedDay,
} from "../../../lib/coldCallDials";
import {
  aggregateAgencyMonth,
  type AgencyDialRow,
  type AgencyTypedRow,
} from "../../../lib/coldCallAgency";

// Cold Call daily dialing funnel (Acquisition > Cold Call). Agency-global, one
// row per caller per day in public.cold_calls (0035, 0050).
// Admin-gated in functions/api/_middleware.ts, reached with the service client.
//
// Since 0052 a day carries TWO sets of counts: what the app recorded (derived
// from cold_call_dials, one row per attempt) and what somebody typed. The typed
// cells are an OVERRIDE for dialing done off-app; the recorded counts are the
// measurement. GET returns both and never merges them into one number, because
// which of the two you are looking at is exactly what a commission argument
// turns on.
//
// Rates (pickup %, pickup -> pass-through %, pitch -> book %) are never stored
// or returned: the client computes them in src/lib/coldCall.ts.

interface ColdCallDbRow {
  id: string;
  day: string;
  calls_made: number | null;
  pickups: number | null;
  pass_through: number | null;
  meetings_booked: number | null;
  objections: string | null;
  notes: string | null;
}

const SELECT =
  "id, day, calls_made, pickups, pass_through, meetings_booked, objections, notes";

function toRow(row: ColdCallDbRow): TypedDay {
  return {
    id: row.id,
    day: row.day,
    callsMade: row.calls_made,
    pickups: row.pickups,
    passThrough: row.pass_through,
    meetingsBooked: row.meetings_booked,
    objections: row.objections,
    notes: row.notes,
  };
}

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The only columns a client may write, camelCase in -> snake_case column out.
// Anything else in the body is dropped.
const NUMERIC_FIELDS: Record<string, string> = {
  callsMade: "calls_made",
  pickups: "pickups",
  passThrough: "pass_through",
  meetingsBooked: "meetings_booked",
};

const TEXT_FIELDS: Record<string, string> = {
  objections: "objections",
  notes: "notes",
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// The [first, last] ISO bounds of a "YYYY-MM" month.
function monthRange(month: string): { first: string; last: string } {
  const year = Number(month.slice(0, 4));
  const monthNo = Number(month.slice(5, 7));
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${pad2(lastDay)}` };
}

// A blank cell clears the column (null, not 0). Anything numeric is stored as a
// non-negative integer so a stray "-5" or "3.7" cannot poison the rollups.
function coerceCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

function coerceText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  return raw ? raw : null;
}

// The whole roster at once, rather than one person: ?callerId=all. Owner only,
// and safe as a sentinel because every real caller id is a uuid.
const AGENCY = "all";

// Whose tracker this request is for (0050). An owner may read and write anyone's
// by passing ?callerId=; without it they get their own. Anyone else is pinned to
// themselves whatever they ask for, so a caller cannot read a colleague's
// numbers or write into them.
function resolveCallerId(ctx: { data: ApiData; request: Request }): string {
  const admin = ctx.data.admin!;
  if (admin.role !== "owner") return admin.id;
  const asked = new URL(ctx.request.url).searchParams.get("callerId");
  return asked && asked.trim() ? asked.trim() : admin.id;
}

// GET /api/admin/tracker/cold-calls?month=YYYY-MM[&callerId=...]  (admin-only)
// One person's month, or the whole roster's with ?callerId=all. Returns only the
// days that have something on them (a typed row, recorded dials, or both); the
// client auto-generates the rest as blank rows, so an unworked month is empty
// here, never zero-filled.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const month = new URL(ctx.request.url).searchParams.get("month") ?? "";
  if (!MONTH_RE.test(month)) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const callerId = resolveCallerId(ctx);
  const { first, last } = monthRange(month);

  if (callerId === AGENCY) return agencyMonth(client, first, last);

  // Both sides of the month in parallel: the typed grid and the attempts the
  // app recorded.
  const [typedRes, dialsRes] = await Promise.all([
    client
      .from("cold_calls")
      .select(SELECT)
      .eq("caller_id", callerId)
      .gte("day", first)
      .lte("day", last)
      .order("day", { ascending: true }),
    client
      .from("cold_call_dials")
      .select("day, spoke, pitched, outcome, reason")
      .eq("caller_id", callerId)
      .gte("day", first)
      .lte("day", last),
  ]);
  if (typedRes.error) return Response.json({ error: typedRes.error.message }, { status: 500 });
  if (dialsRes.error) return Response.json({ error: dialsRes.error.message }, { status: 500 });

  const typed = ((typedRes.data ?? []) as unknown as ColdCallDbRow[]).map(toRow);
  const recorded = rollUpDialsByDay((dialsRes.data ?? []) as unknown as DialRow[]);

  return Response.json({ days: mergeRecordedDays(typed, recorded) });
};

// The whole roster's month, one row per day (?callerId=all, owner only).
//
// Same two reads as above with the caller filter dropped, then combined in
// lib/coldCallAgency.ts: each person's typed cells are resolved against their
// own recorded dials BEFORE the people are summed, which is what makes the
// agency total equal the sum of the individual trackers.
//
// The answer carries an `agency` block so the page can say what it is showing:
// how many people are in the sum, and how many of its days contain dialing that
// was typed rather than measured.
async function agencyMonth(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  first: string,
  last: string,
): Promise<Response> {
  const [typedRes, dialsRes] = await Promise.all([
    client
      .from("cold_calls")
      .select(`caller_id, ${SELECT}`)
      .gte("day", first)
      .lte("day", last)
      .order("day", { ascending: true }),
    client
      .from("cold_call_dials")
      .select("caller_id, day, spoke, pitched, outcome, reason")
      .gte("day", first)
      .lte("day", last),
  ]);
  if (typedRes.error) return Response.json({ error: typedRes.error.message }, { status: 500 });
  if (dialsRes.error) return Response.json({ error: dialsRes.error.message }, { status: 500 });

  const typed: AgencyTypedRow[] = (
    (typedRes.data ?? []) as unknown as (ColdCallDbRow & { caller_id: string | null })[]
  ).map((row) => ({ ...toRow(row), callerId: row.caller_id ?? "" }));

  const dials: AgencyDialRow[] = (
    (dialsRes.data ?? []) as unknown as {
      caller_id: string | null;
      day: string;
      spoke: boolean | null;
      pitched: boolean | null;
      outcome: string | null;
      reason: string | null;
    }[]
  ).map((row) => ({
    callerId: row.caller_id ?? "",
    day: row.day,
    spoke: Boolean(row.spoke),
    pitched: Boolean(row.pitched),
    outcome: row.outcome ?? "",
    reason: row.reason,
  }));

  const { days, callers, typedDays } = aggregateAgencyMonth(typed, dials);
  return Response.json({ days, agency: { callers, typedDays } });
}

interface PatchBody {
  // The day being edited, "YYYY-MM-DD".
  day?: string;
  // Owner only: whose tracker is being written. Ignored for everyone else, who
  // can only ever write their own.
  callerId?: string;
  // Either one cell...
  field?: string;
  value?: unknown;
  // ...or several at once.
  values?: Record<string, unknown>;
}

// PATCH /api/admin/tracker/cold-calls  (admin-only): upsert one person's day.
// Keyed on (day, caller_id), unique since 0050, so a single cell edit needs no
// read first and two people can log the same Tuesday.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const day = (body.day ?? "").trim();
  if (!DAY_RE.test(day)) {
    return Response.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  }

  const supplied: Record<string, unknown> = { ...(body.values ?? {}) };
  if (body.field) supplied[body.field] = body.value;

  const update: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(supplied)) {
    if (NUMERIC_FIELDS[field]) update[NUMERIC_FIELDS[field]] = coerceCount(value);
    else if (TEXT_FIELDS[field]) update[TEXT_FIELDS[field]] = coerceText(value);
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "no editable fields supplied" }, { status: 400 });
  }

  // The body may name a caller, but resolveCallerId is what decides: a non-owner
  // asking to write someone else's day writes their own instead.
  const admin = ctx.data.admin!;
  const bodyCaller = typeof body.callerId === "string" ? body.callerId.trim() : "";

  // The agency view is a sum, not a row. There is nothing to write into, and
  // quietly writing the owner's own day instead would be worse than refusing:
  // it would file the whole roster's number under one person.
  if (bodyCaller === AGENCY) {
    return Response.json(
      { error: "the agency view is a total of everyone, so it cannot be typed into" },
      { status: 400 },
    );
  }

  const callerId = admin.role === "owner" && bodyCaller ? bodyCaller : admin.id;

  const { data, error } = await client
    .from("cold_calls")
    .upsert(
      { day, caller_id: callerId, ...update, updated_at: new Date().toISOString() },
      { onConflict: "day,caller_id" },
    )
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save day" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "cold_call.upsert", null, { day });

  return Response.json({ ok: true, day: toRow(data as unknown as ColdCallDbRow) });
};

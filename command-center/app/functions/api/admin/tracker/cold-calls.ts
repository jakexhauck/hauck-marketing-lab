import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// Cold Call daily dialing funnel (Acquisition > Cold Call). Agency-global, one
// row per calendar day in public.cold_calls (migration 0031), hand-entered.
// Admin-gated in functions/api/_middleware.ts, reached with the service client.
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

function toRow(row: ColdCallDbRow) {
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

// GET /api/admin/tracker/cold-calls?month=YYYY-MM  (admin-only)
// Returns only the days that exist. The client auto-generates the rest of the
// month as blank rows, so an unlogged month is empty here, never zero-filled.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const month = new URL(ctx.request.url).searchParams.get("month") ?? "";
  if (!MONTH_RE.test(month)) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const { first, last } = monthRange(month);
  const { data, error } = await client
    .from("cold_calls")
    .select(SELECT)
    .gte("day", first)
    .lte("day", last)
    .order("day", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const days = ((data ?? []) as unknown as ColdCallDbRow[]).map(toRow);
  return Response.json({ days });
};

interface PatchBody {
  // The day being edited, "YYYY-MM-DD".
  day?: string;
  // Either one cell...
  field?: string;
  value?: unknown;
  // ...or several at once.
  values?: Record<string, unknown>;
}

// PATCH /api/admin/tracker/cold-calls  (admin-only): upsert one day.
// Keyed on the unique `day` column so a single cell edit needs no read first;
// only the supplied columns are touched.
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

  const { data, error } = await client
    .from("cold_calls")
    .upsert({ day, ...update, updated_at: new Date().toISOString() }, { onConflict: "day" })
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save day" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "cold_call.upsert", null, { day });

  return Response.json({ ok: true, day: toRow(data as unknown as ColdCallDbRow) });
};

import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// Cold SMS > Daily. One row per calendar day, keyed by `day` (unique), so a
// single cell edit upserts without reading first. Agency-global: no tenant,
// admin-gated by functions/api/_middleware.ts.
//
// Rates (reply %, reply->book %, book->sent %) are computed client-side in
// src/lib/coldSms.ts and never stored.

interface DailyRow {
  id: string;
  day: string;
  sms_sent: number | null;
  positive_replies: number | null;
  meetings_booked: number | null;
  note: string | null;
}

const SELECT = "id, day, sms_sent, positive_replies, meetings_booked, note";

function toRow(row: DailyRow) {
  return {
    id: row.id,
    day: row.day,
    smsSent: row.sms_sent,
    positiveReplies: row.positive_replies,
    meetingsBooked: row.meetings_booked,
    note: row.note,
  };
}

// A blank cell must round-trip as blank, never as a fabricated 0, so an empty
// string (or unparseable input) collapses to null.
function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toTextOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  return raw ? raw : null;
}

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// First and last calendar day of a "YYYY-MM" month, as ISO dates.
function monthBounds(month: string): { first: string; last: string } {
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

// GET /api/admin/tracker/cold-sms-daily?month=YYYY-MM
// Returns only the persisted rows for that month. The client fills in every
// other day of the month from the shared month generator, so an unlogged month
// renders the empty template rather than fabricated rows.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const month = new URL(ctx.request.url).searchParams.get("month") ?? "";
  if (!MONTH_RE.test(month)) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const { first, last } = monthBounds(month);
  const { data, error } = await client
    .from("cold_sms_daily")
    .select(SELECT)
    .gte("day", first)
    .lte("day", last)
    .order("day", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ rows: ((data ?? []) as unknown as DailyRow[]).map(toRow) });
};

interface UpsertBody {
  day?: string;
  sms_sent?: unknown;
  positive_replies?: unknown;
  meetings_booked?: unknown;
  note?: unknown;
}

// PATCH /api/admin/tracker/cold-sms-daily: upsert one day by `day`.
// Only the supplied whitelisted fields are written, so editing one cell never
// clears its neighbours.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: UpsertBody = {};
  try {
    body = (await ctx.request.json()) as UpsertBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const day = (body.day ?? "").trim();
  if (!DAY_RE.test(day)) {
    return Response.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  }

  const update: Record<string, unknown> = { day, updated_at: new Date().toISOString() };
  if ("sms_sent" in body) update.sms_sent = toIntOrNull(body.sms_sent);
  if ("positive_replies" in body) update.positive_replies = toIntOrNull(body.positive_replies);
  if ("meetings_booked" in body) update.meetings_booked = toIntOrNull(body.meetings_booked);
  if ("note" in body) update.note = toTextOrNull(body.note);

  const { data, error } = await client
    .from("cold_sms_daily")
    .upsert(update, { onConflict: "day" })
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save day" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "cold_sms_daily.upsert", null, update);

  return Response.json({ row: toRow(data as unknown as DailyRow) });
};

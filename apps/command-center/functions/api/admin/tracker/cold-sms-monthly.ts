import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// Cold SMS > Monthly economics. One row per month of agency spend against
// booked, showed and closed. All-time (not month-scoped in the UI), keyed by
// `month` stored as the first of the month. Agency-global: no tenant.
//
// Show Rate, SMS/Client, Total Cost, Cost/Call, Cost/Showed, CAC and ROI are
// computed client-side in src/lib/coldSms.ts and never stored.

interface MonthlyRow {
  id: string;
  month: string;
  total_sms_sent: number | null;
  va_cost: number | null;
  calls_booked: number | null;
  calls_showed: number | null;
  sms_cost: number | null;
  new_clients: number | null;
  cash_collected: number | null;
  ltv: number | null;
}

const SELECT =
  "id, month, total_sms_sent, va_cost, calls_booked, calls_showed, sms_cost, new_clients, cash_collected, ltv";

function toRow(row: MonthlyRow) {
  return {
    id: row.id,
    month: row.month,
    totalSmsSent: row.total_sms_sent,
    vaCost: row.va_cost,
    callsBooked: row.calls_booked,
    callsShowed: row.calls_showed,
    smsCost: row.sms_cost,
    newClients: row.new_clients,
    cashCollected: row.cash_collected,
    ltv: row.ltv,
  };
}

// A blank cell must round-trip as blank, never as a fabricated 0.
function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Counts are integers; money keeps its cents.
const COUNT_FIELDS = ["total_sms_sent", "calls_booked", "calls_showed", "new_clients"] as const;
const MONEY_FIELDS = ["va_cost", "sms_cost", "cash_collected", "ltv"] as const;

// Accept "YYYY-MM" or any "YYYY-MM-DD" and normalize to the first of that
// month, so the unique `month` key can never split one month across two rows.
function normalizeMonth(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(raw);
  if (!match) return null;
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

// GET /api/admin/tracker/cold-sms-monthly: every logged month, newest first.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("cold_sms_monthly")
    .select(SELECT)
    .order("month", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ rows: ((data ?? []) as unknown as MonthlyRow[]).map(toRow) });
};

type UpsertBody = Record<string, unknown> & { month?: unknown };

// PATCH /api/admin/tracker/cold-sms-monthly: upsert one month by `month`.
// Only the supplied whitelisted fields are written.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: UpsertBody = {};
  try {
    body = (await ctx.request.json()) as UpsertBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const month = normalizeMonth(body.month);
  if (!month) {
    return Response.json({ error: "month must be YYYY-MM or YYYY-MM-DD" }, { status: 400 });
  }

  const update: Record<string, unknown> = { month, updated_at: new Date().toISOString() };
  for (const field of COUNT_FIELDS) {
    if (field in body) {
      const n = toNumOrNull(body[field]);
      update[field] = n === null ? null : Math.round(n);
    }
  }
  for (const field of MONEY_FIELDS) {
    if (field in body) update[field] = toNumOrNull(body[field]);
  }

  const { data, error } = await client
    .from("cold_sms_monthly")
    .upsert(update, { onConflict: "month" })
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save month" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "cold_sms_monthly.upsert", null, update);

  return Response.json({ row: toRow(data as unknown as MonthlyRow) });
};

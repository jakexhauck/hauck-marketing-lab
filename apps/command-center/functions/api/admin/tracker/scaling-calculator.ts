import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// The scaling calculator's seven persisted inputs. Agency-global (no tenant_id):
// one singleton row, id pinned to 1 by migration 0030. The compute itself is
// entirely client-side (src/lib/scalingCalculator.ts); this endpoint only
// remembers Jake's last numbers across sessions and devices.

interface ScalingRow {
  current_revenue: number;
  monthly_cash_goal: number;
  offer_price: number;
  avg_cash_close: number;
  closing_pct: number;
  show_rate_pct: number;
  booking_rate_pct: number;
}

const SELECT =
  "current_revenue, monthly_cash_goal, offer_price, avg_cash_close, closing_pct, show_rate_pct, booking_rate_pct";

// Must stay in step with DEFAULT_INPUTS in src/lib/scalingCalculator.ts and the
// column defaults in the migration.
const DEFAULTS: ScalingRow = {
  current_revenue: 0,
  monthly_cash_goal: 10000,
  offer_price: 1000,
  avg_cash_close: 1000,
  closing_pct: 20,
  show_rate_pct: 60,
  booking_rate_pct: 2,
};

// Body camelCase -> column snake_case. Anything not in here is ignored.
const FIELDS: Record<string, keyof ScalingRow> = {
  currentRevenue: "current_revenue",
  monthlyCashGoal: "monthly_cash_goal",
  offerPrice: "offer_price",
  avgCashClose: "avg_cash_close",
  closingPct: "closing_pct",
  showRatePct: "show_rate_pct",
  bookingRatePct: "booking_rate_pct",
};

function toDto(row: ScalingRow) {
  return {
    currentRevenue: Number(row.current_revenue),
    monthlyCashGoal: Number(row.monthly_cash_goal),
    offerPrice: Number(row.offer_price),
    avgCashClose: Number(row.avg_cash_close),
    closingPct: Number(row.closing_pct),
    showRatePct: Number(row.show_rate_pct),
    bookingRatePct: Number(row.booking_rate_pct),
  };
}

// GET /api/admin/tracker/scaling-calculator  (admin-only, gated in _middleware.ts)
// The singleton row. If it is somehow missing (migration applied but the seed
// skipped), fall back to the defaults rather than 404: the page must always
// have numbers to compute from.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("scaling_calculator")
    .select(SELECT)
    .eq("id", 1)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(toDto((data as ScalingRow | null) ?? DEFAULTS));
};

// PATCH /api/admin/tracker/scaling-calculator  (admin-only)
// Whitelist the seven numeric fields, coerce to finite numbers, upsert onto
// id = 1. A field that is missing or not a finite number is skipped rather than
// 400-ing the whole request: the client saves on a debounce while Jake is still
// typing, so a half-entered field must not lose the rest of the edit.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(FIELDS)) {
    const raw = body[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    update[column] = raw;
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await client
    .from("scaling_calculator")
    .upsert({ id: 1, ...update, updated_at: new Date().toISOString() })
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "could not save the calculator" },
      { status: 500 },
    );
  }

  await logAdminAction(client, ctx.data.admin!.id, "scaling_calculator.update", null, update);

  return Response.json(toDto(data as ScalingRow));
};

import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// Business Health: the agency's own numbers, one row per period.
//
// Agency-global on purpose (see migration 0030): there is no tenant here, so
// nothing in this file resolves or filters by tenant_id. /api/admin/* is
// already gated on session.adminId in functions/api/_middleware.ts.
//
// Only the ten hand-entered inputs are read and written. CAC, ROAS, Avg LTV,
// LTV:CAC and the end client count are derived on the client
// (src/lib/businessHealth.ts) and never stored, so they cannot go stale.

const PERIOD_TYPES = ["month", "quarter", "year"] as const;
type PeriodType = (typeof PERIOD_TYPES)[number];

// The wire shape, camelCase. Columns are snake_case; the mapping is explicit in
// both directions below so a rename on either side fails loudly.
interface BusinessHealthInputs {
  marketingSpend: number;
  newRevenue: number;
  newMrr: number;
  startClients: number;
  newClients: number;
  churnedClients: number;
  profitMarginPct: number;
  avgRetentionMonths: number;
  avgRevenuePerClient: number;
  churnPct: number;
}

interface BusinessHealthRow {
  period_key: string;
  period_type: PeriodType;
  marketing_spend: number | string;
  new_revenue: number | string;
  new_mrr: number | string;
  start_clients: number;
  new_clients: number;
  churned_clients: number;
  profit_margin_pct: number | string;
  avg_retention_months: number | string;
  avg_revenue_per_client: number | string;
  churn_pct: number | string;
  updated_at: string;
}

const ROW_COLUMNS =
  "period_key, period_type, marketing_spend, new_revenue, new_mrr, start_clients, new_clients, churned_clients, profit_margin_pct, avg_retention_months, avg_revenue_per_client, churn_pct, updated_at";

// A period nobody has saved yet. Returned instead of 404 so the dashboard opens
// on all-zeros (an honest empty period) rather than fabricated numbers.
const EMPTY_INPUTS: BusinessHealthInputs = {
  marketingSpend: 0,
  newRevenue: 0,
  newMrr: 0,
  startClients: 0,
  newClients: 0,
  churnedClients: 0,
  profitMarginPct: 0,
  avgRetentionMonths: 0,
  avgRevenuePerClient: 0,
  churnPct: 0,
};

// Postgres numeric comes back as a string over PostgREST; coerce so the client
// never has to guess whether a field is "4250" or 4250.
function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function mapRow(row: BusinessHealthRow) {
  return {
    period: row.period_key,
    periodType: row.period_type,
    inputs: {
      marketingSpend: num(row.marketing_spend),
      newRevenue: num(row.new_revenue),
      newMrr: num(row.new_mrr),
      startClients: num(row.start_clients),
      newClients: num(row.new_clients),
      churnedClients: num(row.churned_clients),
      profitMarginPct: num(row.profit_margin_pct),
      avgRetentionMonths: num(row.avg_retention_months),
      avgRevenuePerClient: num(row.avg_revenue_per_client),
      churnPct: num(row.churn_pct),
    } satisfies BusinessHealthInputs,
    updatedAt: row.updated_at,
  };
}

function isPeriodType(v: unknown): v is PeriodType {
  return typeof v === "string" && (PERIOD_TYPES as readonly string[]).includes(v);
}

// GET /api/admin/tracker/business-health?period=2026-07  (admin-only)
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const period = new URL(ctx.request.url).searchParams.get("period")?.trim() ?? "";
  if (!period) return Response.json({ error: "period required" }, { status: 400 });

  const { data, error } = await client
    .from("business_health")
    .select(ROW_COLUMNS)
    .eq("period_key", period)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!data) {
    // Never saved. periodType is inferred from the key's own shape, which is the
    // only information a missing row carries.
    const periodType: PeriodType = period.includes("Q")
      ? "quarter"
      : period.includes("-")
        ? "month"
        : "year";
    return Response.json({ period, periodType, inputs: EMPTY_INPUTS, updatedAt: null });
  }

  return Response.json(mapRow(data as BusinessHealthRow));
};

interface PatchBody {
  period?: string;
  periodType?: string;
  inputs?: Partial<Record<keyof BusinessHealthInputs, unknown>>;
}

// Each input maps to its column plus how it is sanitised. Percents clamp to
// 0..100 (a 340% margin is a typo, not data) and head counts are non-negative
// integers. Anything not on this list is ignored, so an unknown key in the body
// can never reach the update.
const FIELDS: {
  key: keyof BusinessHealthInputs;
  column: string;
  kind: "money" | "count" | "percent";
}[] = [
  { key: "marketingSpend", column: "marketing_spend", kind: "money" },
  { key: "newRevenue", column: "new_revenue", kind: "money" },
  { key: "newMrr", column: "new_mrr", kind: "money" },
  { key: "startClients", column: "start_clients", kind: "count" },
  { key: "newClients", column: "new_clients", kind: "count" },
  { key: "churnedClients", column: "churned_clients", kind: "count" },
  { key: "profitMarginPct", column: "profit_margin_pct", kind: "percent" },
  { key: "avgRetentionMonths", column: "avg_retention_months", kind: "money" },
  { key: "avgRevenuePerClient", column: "avg_revenue_per_client", kind: "money" },
  { key: "churnPct", column: "churn_pct", kind: "percent" },
];

function coerce(kind: "money" | "count" | "percent", raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (kind === "percent") return Math.min(100, Math.max(0, n));
  if (kind === "count") return Math.max(0, Math.round(n));
  return Math.max(0, n);
}

// PATCH /api/admin/tracker/business-health  (admin-only)
// Upserts one period row. The same call covers the first save for a period and
// every later edit, and the field whitelist means a single-field autosave sends
// only the field that changed.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const period = typeof body.period === "string" ? body.period.trim() : "";
  if (!period) return Response.json({ error: "period required" }, { status: 400 });
  if (!isPeriodType(body.periodType)) {
    return Response.json({ error: "invalid period type" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  const supplied = body.inputs ?? {};
  for (const field of FIELDS) {
    if (supplied[field.key] === undefined) continue;
    const value = coerce(field.kind, supplied[field.key]);
    if (value === null) {
      return Response.json({ error: `invalid value for ${field.key}` }, { status: 400 });
    }
    update[field.column] = value;
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error } = await client.from("business_health").upsert(
    {
      period_key: period,
      period_type: body.periodType,
      ...update,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "period_key" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Agency-global, so there is no target tenant to audit against.
  await logAdminAction(client, ctx.data.admin!.id, "business_health.update", null, {
    period,
    ...update,
  });

  // Read back so the client reconciles against what actually landed (clamped
  // percents, rounded counts) instead of what it optimistically typed.
  const { data, error: readError } = await client
    .from("business_health")
    .select(ROW_COLUMNS)
    .eq("period_key", period)
    .maybeSingle();
  if (readError || !data) {
    return Response.json({ error: readError?.message ?? "row not found after save" }, { status: 500 });
  }

  return Response.json(mapRow(data as BusinessHealthRow));
};

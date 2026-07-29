import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// Business Health (admin Command home). Agency-global manual metrics, one row
// per period key (month "2026-07", quarter "2026-Q3", year "2026"). No
// tenant_id: this is Jake's own agency data, gated by /api/admin/* middleware.
//
// GET  ?period=<key>  -> that period's saved inputs, or an all-zero template.
// PATCH { period, periodType, inputs } -> upsert the supplied fields by key.

const PERIOD_TYPES = ["month", "quarter", "year"] as const;
type PeriodType = (typeof PERIOD_TYPES)[number];

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

interface BusinessHealthResponse {
  period: string;
  periodType: PeriodType;
  inputs: BusinessHealthInputs;
  updatedAt: string | null;
}

// The db row shape we read back (snake_case).
interface Row {
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

const SELECT =
  "period_key, period_type, marketing_spend, new_revenue, new_mrr, start_clients, " +
  "new_clients, churned_clients, profit_margin_pct, avg_retention_months, " +
  "avg_revenue_per_client, churn_pct, updated_at";

const num = (v: number | string): number => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

// Postgres numeric columns come back as strings via PostgREST; coerce them.
function rowToResponse(row: Row): BusinessHealthResponse {
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
    },
    updatedAt: row.updated_at,
  };
}

// Infer the period type from a key when the period has no saved row yet, so the
// empty template still reports the right kind: "2026-Q3" -> quarter, "2026-07"
// -> month, "2026" -> year.
function inferPeriodType(key: string): PeriodType {
  if (/-Q[1-4]$/.test(key)) return "quarter";
  if (/^\d{4}-\d{2}$/.test(key)) return "month";
  return "year";
}

function zeroResponse(period: string, periodType: PeriodType): BusinessHealthResponse {
  return {
    period,
    periodType,
    inputs: {
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
    },
    updatedAt: null,
  };
}

// GET /api/admin/tracker/business-health?period=<key>
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const period = new URL(ctx.request.url).searchParams.get("period")?.trim();
  if (!period) return Response.json({ error: "period required" }, { status: 400 });

  const { data, error } = await client
    .from("business_health")
    .select(SELECT)
    .eq("period_key", period)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!data) return Response.json(zeroResponse(period, inferPeriodType(period)));
  return Response.json(rowToResponse(data as Row));
};

// camelCase input key -> [snake_case column, coercer].
type Coerce = (v: number) => number;
const nonNeg: Coerce = (v) => Math.max(0, v);
const nonNegInt: Coerce = (v) => Math.max(0, Math.round(v));
const pct: Coerce = (v) => Math.min(100, Math.max(0, v));

const FIELD_MAP: Record<keyof BusinessHealthInputs, [string, Coerce]> = {
  marketingSpend: ["marketing_spend", nonNeg],
  newRevenue: ["new_revenue", nonNeg],
  newMrr: ["new_mrr", nonNeg],
  startClients: ["start_clients", nonNegInt],
  newClients: ["new_clients", nonNegInt],
  churnedClients: ["churned_clients", nonNegInt],
  profitMarginPct: ["profit_margin_pct", pct],
  avgRetentionMonths: ["avg_retention_months", nonNeg],
  avgRevenuePerClient: ["avg_revenue_per_client", nonNeg],
  churnPct: ["churn_pct", pct],
};

interface PatchBody {
  period?: string;
  periodType?: PeriodType;
  inputs?: Partial<Record<keyof BusinessHealthInputs, unknown>>;
}

// PATCH /api/admin/tracker/business-health
// One upsert covers both first-save and edit. The field whitelist means a
// single-field autosave sends just that field.
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
  if (!body.periodType || !PERIOD_TYPES.includes(body.periodType)) {
    return Response.json({ error: "invalid period type" }, { status: 400 });
  }

  // Whitelist known input keys into a snake_case update; coerce each to a finite,
  // clamped number. Unknown keys are ignored.
  const update: Record<string, number> = {};
  const rawInputs = body.inputs ?? {};
  for (const key of Object.keys(FIELD_MAP) as (keyof BusinessHealthInputs)[]) {
    const raw = rawInputs[key];
    if (raw === undefined) continue;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (!Number.isFinite(n)) continue;
    const [col, coerce] = FIELD_MAP[key];
    update[col] = coerce(n);
  }

  const nowIso = new Date().toISOString();
  const { error } = await client.from("business_health").upsert(
    {
      period_key: period,
      period_type: body.periodType,
      ...update,
      updated_at: nowIso,
    },
    { onConflict: "period_key" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "business_health.update", null, {
    period,
    ...update,
  });

  // Re-read so the client reconciles against the stored row.
  const { data, error: readErr } = await client
    .from("business_health")
    .select(SELECT)
    .eq("period_key", period)
    .maybeSingle();
  if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
  if (!data) return Response.json(zeroResponse(period, body.periodType));
  return Response.json(rowToResponse(data as Row));
};

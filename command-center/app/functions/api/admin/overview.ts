import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";

// GET /api/admin/overview  (admin-only, gated in _middleware.ts)
// The Command home's agency-wide KPI row. Returns only numbers computable
// truthfully from real data today: how many tenants exist, and their combined
// monthly spend. There is no agency-wide MRR or leads rollup yet (billing and
// lead aggregation are per-tenant only), so those stay off this endpoint
// entirely; the client renders explicit "Not yet wired" tiles for them rather
// than this endpoint inventing a number.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenantRows, error } = await client.from("tenants").select("monthly_spend");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tenants = (tenantRows ?? []) as { monthly_spend: number | null }[];
  const activeClients = tenants.length;
  const combinedSpend = tenants.reduce((sum, t) => sum + (t.monthly_spend ?? 0), 0);

  return Response.json({ activeClients, combinedSpend });
};

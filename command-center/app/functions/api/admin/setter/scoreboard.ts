import { tenantTimezone, type Env, type ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { startOfTodayMs, startOfDayOffsetMs } from "../../../lib/tz";
import {
  computeScoreboard,
  rowsSince,
  type ScoreDialRow,
  type ScoreboardMetrics,
} from "../../../lib/setterScoreboard";

// GET /api/admin/setter/scoreboard?tenantId= (admin-only, gated in
// _middleware.ts). The setter's headline numbers, derived live from
// setter_dials (single write path, dials.ts); nothing here is stored.
//
// Returns BOTH windows in one response: "today" and the trailing 7 days,
// each computed from one DB query (the week fetch) split in memory. Day
// boundaries run on the tenant's business timezone, not UTC: a dial at
// 9pm Detroit time is still "today" even though UTC has rolled over.
//
// Speed to lead is deliberately absent: setter_dials does not carry the
// lead's created time, so the client computes the median from the board
// leads it already holds (medianSpeedToLeadMs in src/lib/setterModel.ts).

export interface ScoreboardResponse {
  today: ScoreboardMetrics;
  week: ScoreboardMetrics;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const zone = tenantTimezone(ctx.env);
  const todayStartMs = startOfTodayMs(zone);
  const weekStartMs = startOfDayOffsetMs(zone, -6);

  const { data, error } = await client
    .from("setter_dials")
    .select("contact_id, dialed_at, spoke, outcome")
    .eq("tenant_id", tenantId)
    .gte("dialed_at", new Date(weekStartMs).toISOString());
  if (error) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });

  const weekRows = (data ?? []) as ScoreDialRow[];
  return Response.json({
    today: computeScoreboard(rowsSince(weekRows, todayStartMs)),
    week: computeScoreboard(weekRows),
  } satisfies ScoreboardResponse);
};

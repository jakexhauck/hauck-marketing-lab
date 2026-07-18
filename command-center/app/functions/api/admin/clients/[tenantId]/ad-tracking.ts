import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import {
  AD_TRACKING_COLUMNS,
  buildAdTrackingUpsert,
  currentMonth,
  monthRange,
  toAdTrackingDto,
} from "../../../../lib/adTracking";

// One client's daily paid-ad funnel tracker for the Fulfillment cockpit's
// Paid Ads > Ad Tracking sub-tab. Phase 1 is manual entry and this table is the
// source of truth: nothing is pulled from Meta or GHL yet. Auth is enforced
// upstream in _middleware.ts (admin session only); do not re-check it here.
//
// GET  /api/admin/clients/:tenantId/ad-tracking?month=YYYY-MM -> { month, days }
// POST /api/admin/clients/:tenantId/ad-tracking               -> { day }
//
// Only the 13 typed inputs cross the wire. Every ratio (CPM, CPC, ROAS, ...) is
// derived in src/lib/adTrackingMetrics.ts, so the server never stores or
// recomputes them. Days with nothing logged are simply absent from the response;
// the client fills the month grid from trackerMonth.ts.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const month = new URL(ctx.request.url).searchParams.get("month") ?? currentMonth(new Date());
  const range = monthRange(month);
  if (!range) return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });

  const { data, error } = await client
    .from("ad_tracking_days")
    .select(AD_TRACKING_COLUMNS)
    .eq("tenant_id", tenantId)
    .gte("date", range.start)
    .lt("date", range.nextStart)
    .order("date", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    month,
    days: (data ?? []).map((row) => toAdTrackingDto(row as unknown as Record<string, unknown>)),
  });
};

// Upsert one day. Editing a single cell sends that day's row; the (tenant_id,
// date) unique constraint makes this create-or-update without a read first.
const upsertDay: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const result = buildAdTrackingUpsert(body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  const row = {
    ...result.row,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("ad_tracking_days")
    .upsert(row, { onConflict: "tenant_id,date" })
    .select(AD_TRACKING_COLUMNS)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.adTracking.upsert", tenantId, {
    date: result.date,
    fields: Object.keys(result.row).filter((k) => k !== "date"),
  });

  return Response.json({
    day: data ? toAdTrackingDto(data as unknown as Record<string, unknown>) : null,
  });
};

export const onRequestPost = upsertDay;
// PATCH is accepted as an alias: the semantics are identical (upsert one day).
export const onRequestPatch = upsertDay;

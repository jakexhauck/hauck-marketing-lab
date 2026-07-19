import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { loadTenantById, resolveGhlCreds } from "../../../../lib/tenantResolve";
import {
  ghlJson,
  fetchAllOpportunities,
  fetchAllContacts,
  type GhlContext,
} from "../../../../lib/ghl";
import { firstTouchAttribution } from "../../../../lib/adAttribution";
import { toSpendRows } from "../../../../lib/metaAdDays";
import {
  assembleLeads,
  breakdown,
  rangeStart,
  rollup,
  type BreakdownLevel,
  type TrackerOpportunity,
  type TrackerRange,
} from "../../../../lib/adTrackerMetrics";

// The rebuilt Ad Tracker, replacing the Local Ads School Google Sheet's
// Dashboard tab. See docs/build-plans/ad-tracker-rebuild.md.
//
// GET /api/admin/clients/:tenantId/ad-tracker?range=all|7|30|90&level=campaign|adset|ad
//   -> { range, level, kpis, breakdown, unattributed, currency, meta }
//
// Auth is enforced upstream in _middleware.ts (admin session only).
//
// Where each number comes from:
//   spend, impressions        meta_ad_days (nightly snapshot, api/admin/ads/sync)
//   leads, pickups, bookings  GHL opportunity stage names, mapped in adTrackerMetrics
//   sales, revenue            customer_jobs.value_cents, the app's own close-out ledger
//   the ad/adset/campaign     contact.attributions[].utmAdId joined to meta_ad_days
//
// Every ratio is computed server-side so the client cannot recompute one
// differently and quietly disagree with the sheet.

const PIPELINES = ["sales", "trash", "customers"];
const RANGES: TrackerRange[] = ["all", "7", "30", "90"];
const LEVELS: BreakdownLevel[] = ["campaign", "adset", "ad"];

interface PipelineDef {
  id: string;
  name?: string;
  stages?: { id: string; name?: string }[];
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const url = new URL(ctx.request.url);
  const range = (url.searchParams.get("range") ?? "all") as TrackerRange;
  const level = (url.searchParams.get("level") ?? "ad") as BreakdownLevel;
  if (!RANGES.includes(range)) return Response.json({ error: "bad range" }, { status: 400 });
  if (!LEVELS.includes(level)) return Response.json({ error: "bad level" }, { status: 400 });

  const start = rangeStart(range, new Date());

  // Resolve creds the way the live middleware does. Reading tenant.ghl_token
  // raw would send a placeholder ('env'/'pending') to GHL and 401 for any
  // client not yet fully wired.
  const creds = resolveGhlCreds(tenant, ctx.env);
  if (!creds) return Response.json({ error: "crm not connected" }, { status: 503 });
  const gctx: GhlContext = { token: creds.token, locationId: creds.locationId };

  // Which pipelines to read. Resolved by name so a re-created pipeline does not
  // silently drop out, matching how the stage map works.
  const { pipelines = [] } = await ghlJson<{ pipelines?: PipelineDef[] }>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );

  // stageId -> stage name, across every pipeline we read. The level mapping is
  // by name (adTrackerMetrics.deriveLevel), so ids never leak into the logic.
  const stageNames = new Map<string, string>();
  const wanted: string[] = [];
  for (const p of pipelines) {
    const name = (p.name ?? "").trim().toLowerCase();
    if (!PIPELINES.includes(name)) continue;
    wanted.push(p.id);
    for (const s of p.stages ?? []) stageNames.set(s.id, s.name ?? "");
  }

  const [oppSets, contacts, jobsRes, spendRes] = await Promise.all([
    Promise.all(wanted.map((pipelineId) => fetchAllOpportunities(gctx, { pipelineId }))),
    fetchAllContacts(gctx),
    client
      .from("customer_jobs")
      .select("ghl_contact_id, value_cents")
      .eq("tenant_id", tenantId),
    client
      .from("meta_ad_days")
      .select(
        "date, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, spend, impressions, reach, link_clicks",
      )
      .eq("tenant_id", tenantId)
      .gte("date", start ?? "1970-01-01"),
  ]);

  if (jobsRes.error) return Response.json({ error: jobsRes.error.message }, { status: 500 });
  if (spendRes.error) return Response.json({ error: spendRes.error.message }, { status: 500 });

  const attributionByContact = new Map(
    contacts.map((c) => [c.id, firstTouchAttribution(c.attributions)]),
  );

  // Cents to dollars once, here, so no downstream maths has to know the unit.
  const jobValueByContact = new Map<string, number>();
  for (const row of jobsRes.data ?? []) {
    const id = String(row.ghl_contact_id ?? "");
    if (!id) continue;
    const dollars = Number(row.value_cents ?? 0) / 100;
    jobValueByContact.set(id, (jobValueByContact.get(id) ?? 0) + dollars);
  }

  const opportunities: TrackerOpportunity[] = oppSets.flat().map((o) => ({
    id: o.id,
    contactId: o.contactId ?? o.contact?.id ?? "",
    pipelineStageId: o.pipelineStageId ?? "",
    createdAt: o.createdAt ?? "",
  }));

  const leads = assembleLeads(opportunities, stageNames, attributionByContact, jobValueByContact);
  const spendRows = toSpendRows((spendRes.data ?? []) as Record<string, unknown>[]);

  const kpis = rollup(leads, spendRows, start);
  const rows = breakdown(leads, spendRows, level, start);

  // Leads inside the window that carry no ad id. Surfaced so the KPI row and
  // the breakdown never look like they disagree: the breakdown is always the
  // attributed subset.
  const unattributed = leads.filter(
    (l) => !l.adId && (!start || l.createdAt.slice(0, 10) >= start),
  ).length;

  return Response.json({
    range,
    level,
    kpis,
    breakdown: rows,
    unattributed,
    // Every Hauck client is USD; the sheet's GBP was the template's.
    currency: "USD",
    meta: {
      pipelines: wanted.length,
      opportunities: opportunities.length,
      spendDays: spendRows.length,
      // True when nothing has ever been snapshotted, which reads identically to
      // "no spend" on the page. The UI uses it to say which.
      neverSynced: spendRows.length === 0,
    },
  });
};

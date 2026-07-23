import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import type { GhlContext } from "../../lib/ghl";
import { loadTrackerData } from "../../lib/leadTrackerData";
import {
  breakdown,
  rangeStart,
  rollup,
  type BreakdownLevel,
  type TrackerLead,
  type TrackerRange,
} from "../../lib/adTrackerMetrics";

// GET /api/ads/tracker?range=all|7|30|90&level=campaign|adset|ad
//   -> { range, level, kpis, breakdown, unattributed, leads, currency, meta }
//
// The sheet's Dashboard tab (RESULTS + BREAKDOWN) and Lead Tracker tab, served
// as one payload. Same arithmetic as the admin Ad Tracker (adTrackerMetrics),
// scoped to the session tenant, plus the per-lead rows the lead list renders.

const RANGES: TrackerRange[] = ["all", "7", "30", "90"];
const LEVELS: BreakdownLevel[] = ["campaign", "adset", "ad"];

// The tracker's client-facing status. Sold outranks lost: a paying customer
// with a stale Trash card is a customer, not a loss.
export type LeadTrackerStatus = "new" | "contacted" | "booked" | "sold" | "lost";

export function displayStatus(
  level: TrackerLead["level"],
  lost: boolean,
): LeadTrackerStatus {
  if (level === "sale") return "sold";
  if (lost) return "lost";
  if (level === "booking") return "booked";
  if (level === "pickup") return "contacted";
  return "new";
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const url = new URL(ctx.request.url);
  const range = (url.searchParams.get("range") ?? "all") as TrackerRange;
  const level = (url.searchParams.get("level") ?? "ad") as BreakdownLevel;
  if (!RANGES.includes(range)) return Response.json({ error: "bad range" }, { status: 400 });
  if (!LEVELS.includes(level)) return Response.json({ error: "bad level" }, { status: 400 });

  const tenantId = await resolveTenantId(client, t.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const start = rangeStart(range, new Date());

  let data;
  try {
    data = await loadTrackerData(gctx, client, tenantId, t.internal_recipients);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  const kpis = rollup(data.leads, data.spendRows, start);
  const rows = breakdown(data.leads, data.spendRows, level, start);
  const unattributed = data.leads.filter(
    (l) => !l.adId && (!start || l.createdAt.slice(0, 10) >= start),
  ).length;

  const leadRows = data.leads
    .filter((l) => !start || l.createdAt.slice(0, 10) >= start)
    .filter((l) => !data.isInternal({ contactId: l.contactId }))
    .map((l) => {
      const c = data.contactById.get(l.contactId);
      const att = data.attributionByContact.get(l.contactId) ?? null;
      const meta = l.adId ? data.adMeta.get(l.adId) : undefined;
      const name =
        c?.contactName?.trim() ||
        [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim() ||
        "Unknown";
      return {
        contactId: l.contactId,
        opportunityId: data.oppIdByContact.get(l.contactId) ?? null,
        name,
        email: c?.email ?? "",
        phone: c?.phone ?? "",
        createdAt: l.createdAt,
        status: displayStatus(l.level, data.lostContacts.has(l.contactId)),
        value: l.value,
        campaignName: att?.campaignName ?? meta?.campaignName ?? null,
        adsetName: att?.adsetName ?? meta?.adsetName ?? null,
        adName: att?.adName ?? meta?.adName ?? null,
        adId: l.adId,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return Response.json({
    range,
    level,
    kpis,
    breakdown: rows,
    unattributed,
    leads: leadRows,
    currency: "USD",
    meta: {
      opportunities: data.opportunitiesCount,
      spendDays: data.spendRows.length,
      neverSynced: data.spendRows.length === 0,
    },
  });
};

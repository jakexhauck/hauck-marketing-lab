import type { Env, ApiData } from "../../lib/env";
import { parseServiceAccount, batchRunReports, type ReportResponse } from "../../lib/ga4";

// Website > Overview + Insights real numbers, from the client's GA4 property via
// the Data API. The service-account key (GA4_SA_JSON) is one shared agency
// secret; the property is per-client (tenants.ga4_property_id, GA4_PROPERTY_ID
// env as the single-tenant fallback), which is what keeps one client's visitor
// numbers from ever showing on another's page.
//
// Golden rule (same as Paid Ads / Reviews): a real client only ever sees their
// real numbers. Missing key or property, or any GA4 error, returns
// { connected: false } and the tabs keep their honest empty state. Never a
// fabricated number. Cached ~15 min per property in KV.
//
// GET /api/website/analytics

export interface AnalyticsSource {
  label: string;
  pct: number;
}
export interface AnalyticsTopPage {
  path: string;
  label: string;
  views: number;
}
export interface WebsiteAnalytics {
  connected: boolean;
  visitorsThisMonth: number;
  visitorsLastMonth: number;
  // Percent change vs last month; null when last month had zero visitors.
  deltaPct: number | null;
  avgTimeOnSiteSec: number;
  pageViews: number;
  topPage: AnalyticsTopPage | null;
  topPages: AnalyticsTopPage[];
  sources: AnalyticsSource[];
  // Up to 12 months of active users, oldest first (Insights trend bars).
  trend: number[];
}

const NOT_CONNECTED: WebsiteAnalytics = {
  connected: false,
  visitorsThisMonth: 0,
  visitorsLastMonth: 0,
  deltaPct: null,
  avgTimeOnSiteSec: 0,
  pageViews: 0,
  topPage: null,
  topPages: [],
  sources: [],
  trend: [],
};

const CACHE_TTL_S = 15 * 60;

// GA4 sessionDefaultChannelGroup -> plain-English label a business owner reads.
// Unknown groups keep their own label rather than being dropped.
function channelLabel(group: string): string {
  switch (group) {
    case "Organic Search":
      return "Google search";
    case "Direct":
      return "Typed it in directly";
    case "Organic Social":
    case "Paid Social":
    case "Social":
      return "Social media";
    case "Referral":
      return "Other sites";
    case "Paid Search":
      return "Google Ads";
    case "Email":
      return "Email";
    default:
      return group || "Other";
  }
}

function pageLabel(path: string): string {
  if (path === "/" || path === "") return "Home";
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? path;
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/[-_]+/g, " ");
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Compute YYYY-MM-01 for the current month and the YYYYMM keys for this/last
// month, in UTC. GA4 dateRanges are evaluated in the property's timezone; the
// day-level fuzz at month boundaries is immaterial to a monthly headline.
function monthAnchors(now: Date) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${y}-${pad(m + 1)}-01`;
  const thisYm = `${y}${pad(m + 1)}`;
  const last = new Date(Date.UTC(y, m - 1, 1));
  const lastYm = `${last.getUTCFullYear()}${pad(last.getUTCMonth() + 1)}`;
  return { monthStart, thisYm, lastYm };
}

export function shapeAnalytics(reports: ReportResponse[], now: Date): WebsiteAnalytics {
  const [trendR, kpiR, pagesR, srcR] = reports;
  const { thisYm, lastYm } = monthAnchors(now);

  // Trend + this/last month from the yearMonth report.
  const byMonth = new Map<string, number>();
  for (const row of trendR?.rows ?? []) {
    const ym = row.dimensionValues?.[0]?.value ?? "";
    byMonth.set(ym, num(row.metricValues?.[0]?.value));
  }
  const months = [...byMonth.keys()].sort();
  const trend = months.slice(-12).map((ym) => byMonth.get(ym) ?? 0);
  const visitorsThisMonth = byMonth.get(thisYm) ?? 0;
  const visitorsLastMonth = byMonth.get(lastYm) ?? 0;
  const deltaPct =
    visitorsLastMonth > 0
      ? Math.round(((visitorsThisMonth - visitorsLastMonth) / visitorsLastMonth) * 100)
      : null;

  // KPI report: averageSessionDuration, screenPageViews, activeUsers.
  const kpiRow = kpiR?.rows?.[0]?.metricValues ?? [];
  const avgTimeOnSiteSec = Math.round(num(kpiRow[0]?.value));
  const pageViews = Math.round(num(kpiRow[1]?.value));

  // Top pages.
  const topPages: AnalyticsTopPage[] = (pagesR?.rows ?? [])
    .map((row) => {
      const path = row.dimensionValues?.[0]?.value ?? "";
      return { path, label: pageLabel(path), views: num(row.metricValues?.[0]?.value) };
    })
    .filter((p) => p.path)
    .slice(0, 5);

  // Traffic sources: aggregate by friendly label, then to % of total sessions.
  const bySource = new Map<string, number>();
  let totalSessions = 0;
  for (const row of srcR?.rows ?? []) {
    const label = channelLabel(row.dimensionValues?.[0]?.value ?? "");
    const sessions = num(row.metricValues?.[0]?.value);
    bySource.set(label, (bySource.get(label) ?? 0) + sessions);
    totalSessions += sessions;
  }
  const sources: AnalyticsSource[] =
    totalSessions > 0
      ? [...bySource.entries()]
          .map(([label, sessions]) => ({ label, pct: Math.round((sessions / totalSessions) * 100) }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 5)
      : [];

  return {
    connected: true,
    visitorsThisMonth,
    visitorsLastMonth,
    deltaPct,
    avgTimeOnSiteSec,
    pageViews,
    topPage: topPages[0] ?? null,
    topPages,
    sources,
    trend,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const propertyId = (ctx.data.tenant.ga4_property_id || ctx.env.GA4_PROPERTY_ID)?.trim();
  const sa = parseServiceAccount(ctx.env.GA4_SA_JSON);
  if (!propertyId || !sa) return Response.json(NOT_CONNECTED);

  const now = new Date();
  const { monthStart } = monthAnchors(now);
  const cacheKey = `ga4:${propertyId}:${monthStart}`;

  if (ctx.env.KV_CACHE) {
    const hit = await ctx.env.KV_CACHE.get(cacheKey, "json").catch(() => null);
    if (hit) return Response.json(hit as WebsiteAnalytics);
  }

  const thisMonth = { startDate: monthStart, endDate: "today" };
  let reports: ReportResponse[];
  try {
    reports = await batchRunReports(sa, propertyId, [
      // Trend + this/last month.
      {
        dateRanges: [{ startDate: "365daysAgo", endDate: "today" }],
        dimensions: [{ name: "yearMonth" }],
        metrics: [{ name: "activeUsers" }],
      },
      // KPIs this month.
      {
        dateRanges: [thisMonth],
        metrics: [
          { name: "averageSessionDuration" },
          { name: "screenPageViews" },
          { name: "activeUsers" },
        ],
      },
      // Top pages this month.
      {
        dateRanges: [thisMonth],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 5,
      },
      // Traffic sources this month.
      {
        dateRanges: [thisMonth],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
      },
    ]);
  } catch {
    // A GA4 outage / auth hiccup shows not-connected, never crashes the page.
    return Response.json(NOT_CONNECTED);
  }

  const data = shapeAnalytics(reports, now);
  if (ctx.env.KV_CACHE) {
    await ctx.env.KV_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL_S }).catch(
      () => {},
    );
  }
  return Response.json(data);
};

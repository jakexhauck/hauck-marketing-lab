import type { Env, ApiData } from "../../lib/env";
import {
  parseServiceAccount,
  batchRunReports,
  type ReportResponse,
  type ReportRequest,
} from "../../lib/ga4";

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
  // Split of this month's active users into first-time and returning.
  newUsers: number;
  returningUsers: number;
  // Share of engaged sessions, 0..100 (GA4 engagementRate x 100).
  engagementRate: number;
  // Device mix, as % of active users. Phone / Desktop / Tablet, sorted desc.
  devices: { label: string; pct: number }[];
  // Top towns visitors come from this month (blank / "(not set)" dropped).
  cities: { label: string; visitors: number }[];
  // The busiest day of the week this month, e.g. "Saturday". Null when no data.
  busiestDay: string | null;
}

// Exported so the admin-tenant endpoint
// (functions/api/admin/clients/[tenantId]/website/analytics.ts) returns the
// identical not-connected shape instead of duplicating it.
export const NOT_CONNECTED_ANALYTICS: WebsiteAnalytics = {
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
  newUsers: 0,
  returningUsers: 0,
  engagementRate: 0,
  devices: [],
  cities: [],
  busiestDay: null,
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

// GA4 dayOfWeek is 0..6 with 0 = Sunday. Map to a day name we display as-is.
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// GA4 deviceCategory -> plain-English label a business owner reads.
function deviceLabel(cat: string): string {
  switch (cat) {
    case "mobile":
      return "Phone";
    case "desktop":
      return "Desktop";
    case "tablet":
      return "Tablet";
    default:
      return cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "Other";
  }
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Compute YYYY-MM-01 for the current month and the YYYYMM keys for this/last
// month, in UTC. GA4 dateRanges are evaluated in the property's timezone; the
// day-level fuzz at month boundaries is immaterial to a monthly headline.
export function monthAnchors(now: Date) {
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
  const [trendR, kpiR, pagesR, srcR, deviceR, cityR, dayR] = reports;
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

  // KPI report: averageSessionDuration, screenPageViews, activeUsers, newUsers,
  // engagementRate.
  const kpiRow = kpiR?.rows?.[0]?.metricValues ?? [];
  const avgTimeOnSiteSec = Math.round(num(kpiRow[0]?.value));
  const pageViews = Math.round(num(kpiRow[1]?.value));
  const activeUsers = Math.round(num(kpiRow[2]?.value));
  const newUsers = Math.round(num(kpiRow[3]?.value));
  const returningUsers = Math.max(0, activeUsers - newUsers);
  const engagementRate = Math.round(num(kpiRow[4]?.value) * 100);

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

  // Device mix: friendly labels, aggregated to % of active users, sorted desc.
  const deviceRows = (deviceR?.rows ?? []).map((row) => ({
    label: deviceLabel(row.dimensionValues?.[0]?.value ?? ""),
    users: num(row.metricValues?.[0]?.value),
  }));
  const deviceTotal = deviceRows.reduce((sum, d) => sum + d.users, 0);
  const devices =
    deviceTotal > 0
      ? deviceRows
          .map((d) => ({ label: d.label, pct: Math.round((d.users / deviceTotal) * 100) }))
          .sort((a, b) => b.pct - a.pct)
      : [];

  // Top towns, blank / "(not set)" dropped, top 5.
  const cities = (cityR?.rows ?? [])
    .map((row) => ({
      label: row.dimensionValues?.[0]?.value ?? "",
      visitors: num(row.metricValues?.[0]?.value),
    }))
    .filter((c) => c.label && c.label !== "(not set)")
    .slice(0, 5);

  // Busiest day of the week: the dayOfWeek bucket with the most active users.
  let busiestDay: string | null = null;
  let bestDayUsers = -1;
  for (const row of dayR?.rows ?? []) {
    const idx = Number(row.dimensionValues?.[0]?.value);
    const users = num(row.metricValues?.[0]?.value);
    if (Number.isInteger(idx) && idx >= 0 && idx <= 6 && users > bestDayUsers) {
      bestDayUsers = users;
      busiestDay = DAY_NAMES[idx];
    }
  }

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
    newUsers,
    returningUsers,
    engagementRate,
    devices,
    cities,
    busiestDay,
  };
}

// The seven GA4 Data API reports the Website Overview + Insights read, in the
// exact order shapeAnalytics destructures them (trend, KPIs, pages, sources,
// devices, cities, day-of-week). Exported so the admin-tenant endpoint runs the
// identical batch instead of duplicating the request array. `now` fixes the
// month window; every report but the trend is scoped to the current month.
export function ANALYTICS_REPORTS(now: Date): ReportRequest[] {
  const { monthStart } = monthAnchors(now);
  const thisMonth = { startDate: monthStart, endDate: "today" };
  return [
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
        { name: "newUsers" },
        { name: "engagementRate" },
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
    // Device mix this month.
    {
      dateRanges: [thisMonth],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "activeUsers" }],
    },
    // Top towns this month (limit high, then filter "(not set)" in shaping).
    {
      dateRanges: [thisMonth],
      dimensions: [{ name: "city" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 8,
    },
    // Visits by day of week this month.
    {
      dateRanges: [thisMonth],
      dimensions: [{ name: "dayOfWeek" }],
      metrics: [{ name: "activeUsers" }],
    },
  ];
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  // This client's own GA4 property, or none. No env fallback: it points at a
  // real client's site, and one client reading another's traffic as their own
  // is the same leak the GHL creds had.
  const propertyId = ctx.data.tenant.ga4_property_id?.trim();
  const sa = parseServiceAccount(ctx.env.GA4_SA_JSON);
  if (!propertyId || !sa) return Response.json(NOT_CONNECTED_ANALYTICS);

  const now = new Date();
  const { monthStart } = monthAnchors(now);
  const cacheKey = `ga4:${propertyId}:${monthStart}`;

  if (ctx.env.KV_CACHE) {
    const hit = await ctx.env.KV_CACHE.get(cacheKey, "json").catch(() => null);
    if (hit) return Response.json(hit as WebsiteAnalytics);
  }

  let reports: ReportResponse[];
  try {
    reports = await batchRunReports(sa, propertyId, ANALYTICS_REPORTS(now));
  } catch {
    // A GA4 outage / auth hiccup shows not-connected, never crashes the page.
    return Response.json(NOT_CONNECTED_ANALYTICS);
  }

  const data = shapeAnalytics(reports, now);
  if (ctx.env.KV_CACHE) {
    await ctx.env.KV_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL_S }).catch(
      () => {},
    );
  }
  return Response.json(data);
};

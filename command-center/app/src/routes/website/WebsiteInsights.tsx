import {
  Search,
  Smartphone,
  BarChart3,
  FileText,
  MessagesSquare,
  Clock,
  Eye,
  UserPlus,
  Repeat,
  Target,
  Monitor,
  MapPin,
  CalendarDays,
} from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { WEBSITE_TABS } from "../../lib/pageTabs";
import { Panel, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { useWebsiteAnalytics, formatDuration } from "../../hooks/useWebsiteAnalytics";
import { useWebsiteEngagement } from "../../hooks/useWebsiteEngagement";
import {
  WEBSITE_CONTAINER,
  NotConnectedNotice,
  SAMPLE_SOURCES,
  SAMPLE_TREND,
  SAMPLE_VISITORS_THIS_MONTH,
  SAMPLE_VISITORS_LAST_MONTH,
  SAMPLE_ESTIMATE_FORM,
  SAMPLE_CHAT_WIDGET,
  SAMPLE_TOP_PAGES,
  SAMPLE_DEVICES,
  SAMPLE_CITIES,
  SAMPLE_BUSIEST_DAY,
  SAMPLE_ENGAGEMENT_RATE,
  SAMPLE_NEW_USERS,
  SAMPLE_RETURNING_USERS,
  SAMPLE_AVG_TIME_SEC,
  SAMPLE_PAGE_VIEWS,
  type TrafficSource,
  type EngagementMetric,
  type DeviceSplit,
  type CityVisitors,
} from "./shared";

// Website > What's working. A plain-English read on how the live site is doing:
// a bold visitors number with a trend, where the traffic comes from, and the
// page that gets the most attention. Demo shows the designed storytelling; a
// real connected session shows the same shapes from GA4; a real UNconnected
// session shows the zeroed hero plus <NotConnectedNotice/> and an empty state,
// mirroring the Social golden rule.

// Two plain-English takeaways, shown in DEMO only (they narrate fabricated
// facts). A real session never sees invented commentary.
const INSIGHTS: { icon: typeof Search; title: string; body: string }[] = [
  {
    icon: Search,
    title: "Google is your front door",
    body: "Six in ten visitors find you through a Google search. Your reviews and Services page are doing the heavy lifting, so keep asking happy customers to leave a review.",
  },
  {
    icon: Smartphone,
    title: "Most people visit on their phone",
    body: "Around two thirds of your visitors are on a phone, often when something has gone wrong. The 'Book a visit' button stays easy to tap, which is why those visits turn into calls.",
  },
];

export default function WebsiteInsights() {
  const demo = demoMode();
  const analytics = useWebsiteAnalytics();
  const a = analytics.data;
  const aConnected = analytics.connected && Boolean(a);
  const show = demo || aConnected;

  // Engagement (estimate requests + website chats), sourced from the client's
  // lead pipeline. Independent of GA4: shown whenever demo or the pipeline is
  // wired, with honest zeros when a real client has had no leads this month.
  const engagement = useWebsiteEngagement();
  const engagementShow = demo || engagement.connected;
  const estimateForm: EngagementMetric = demo
    ? SAMPLE_ESTIMATE_FORM
    : engagement.data?.estimateForm ?? { thisMonth: 0, lastMonth: 0, deltaPct: null };
  const chatWidget: EngagementMetric = demo
    ? SAMPLE_CHAT_WIDGET
    : engagement.data?.chatWidget ?? { thisMonth: 0, lastMonth: 0, deltaPct: null };

  const visitors = demo ? SAMPLE_VISITORS_THIS_MONTH : aConnected ? a!.visitorsThisMonth : 0;
  const deltaPct = demo
    ? Math.round(
        ((SAMPLE_VISITORS_THIS_MONTH - SAMPLE_VISITORS_LAST_MONTH) / SAMPLE_VISITORS_LAST_MONTH) * 100,
      )
    : aConnected
      ? a!.deltaPct
      : null;
  const lastMonth = demo ? SAMPLE_VISITORS_LAST_MONTH : aConnected ? a!.visitorsLastMonth : 0;
  const trend = demo ? SAMPLE_TREND : aConnected ? a!.trend : [];
  const sources: TrafficSource[] = demo ? SAMPLE_SOURCES : aConnected ? a!.sources : [];

  // New Insights values: demo shows fixtures, a connected session shows GA4, an
  // unconnected real session shows zeros / empties (never fabricated).
  const avgTimeSec = demo ? SAMPLE_AVG_TIME_SEC : aConnected ? a!.avgTimeOnSiteSec : 0;
  const pageViews = demo ? SAMPLE_PAGE_VIEWS : aConnected ? a!.pageViews : 0;
  const engagementRate = demo ? SAMPLE_ENGAGEMENT_RATE : aConnected ? a!.engagementRate : 0;
  const newUsers = demo ? SAMPLE_NEW_USERS : aConnected ? a!.newUsers : 0;
  const returningUsers = demo ? SAMPLE_RETURNING_USERS : aConnected ? a!.returningUsers : 0;
  const devices: DeviceSplit[] = demo ? SAMPLE_DEVICES : aConnected ? a!.devices : [];
  const cities: CityVisitors[] = demo ? SAMPLE_CITIES : aConnected ? a!.cities : [];
  const busiestDay = demo ? SAMPLE_BUSIEST_DAY : aConnected ? a!.busiestDay : null;

  // Most-visited pages: a normalized { label, views }[] for the list panel.
  const topPagesList: { label: string; views: number }[] = demo
    ? SAMPLE_TOP_PAGES.map((p) => ({ label: p.name, views: p.views }))
    : aConnected
      ? (a?.topPages ?? []).map((p) => ({ label: p.label, views: p.views }))
      : [];

  // Share of visitors who are first-time.
  const totalUsers = newUsers + returningUsers;
  const newPct = totalUsers > 0 ? Math.round((newUsers / totalUsers) * 100) : 0;

  // Visitor-to-lead rate: needs both GA4 visitors and the lead pipeline. Null
  // (card hidden) when either is missing or there are no visitors yet.
  const leadsTotal = estimateForm.thisMonth + chatWidget.thisMonth;
  const leadRate =
    show && engagementShow && visitors > 0 ? (leadsTotal / visitors) * 100 : null;

  // Trend bars are heights relative to the tallest bucket, so any scale reads.
  const maxTrend = Math.max(1, ...trend);

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <PageBar
          tabs={WEBSITE_TABS}
        />

        {!show && (
          <NotConnectedNotice message="There are no results to show yet. Connect your site and analytics and your performance will appear here in plain English." />
        )}

        {/* Hero: the headline number + trend */}
        <Panel className="mb-4 p-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="label-cap mb-2 text-muted">Visitors this month</div>
              <div className="flex items-baseline gap-2.5">
                <span
                  className={`font-display text-[64px] font-black leading-[0.9] tracking-[-0.045em] tnum ${
                    show ? "text-text" : "text-faint"
                  }`}
                >
                  {visitors.toLocaleString()}
                </span>
                <span className="font-display text-[18px] font-semibold text-muted">visitors</span>
              </div>
              {show && deltaPct != null && (
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[12px] font-bold tnum ${
                      deltaPct >= 0 ? "bg-positive-tint text-positive" : "bg-danger-tint text-danger"
                    }`}
                  >
                    {deltaPct >= 0 ? "+" : ""}
                    {deltaPct}%
                  </span>
                  <span className="text-[13px] text-muted">
                    vs last month ({lastMonth.toLocaleString()})
                  </span>
                </div>
              )}
            </div>

            {show && trend.length > 0 && (
              <div className="flex h-[60px] items-end gap-[5px]">
                {trend.map((v, i) => (
                  <span
                    key={i}
                    className="block w-[11px] rounded-t-[4px]"
                    style={{ height: `${Math.max(4, (v / maxTrend) * 100)}%`, background: "var(--grad-brand)", opacity: 0.85 }}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* KPI strip: the plain-English numbers behind the headline. */}
        {show && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard icon={Clock} label="Avg time on site" value={formatDuration(avgTimeSec)} />
            <KpiCard icon={Eye} label="Page views" value={pageViews.toLocaleString()} />
            <KpiCard icon={Target} label="Engaged visitors" value={`${engagementRate}%`} />
            <KpiCard icon={UserPlus} label="New visitors" value={`${newPct}%`} />
            {leadRate != null && (
              <KpiCard
                icon={Repeat}
                label="Visitors who reached out"
                value={`${leadRate.toFixed(1)}%`}
                brand
              />
            )}
          </div>
        )}

        {/* Engagement: what visitors did (estimate requests + website chats). */}
        {engagementShow && (
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <EngagementCard
              icon={FileText}
              label="Estimate requests"
              sub="from your website this month"
              metric={estimateForm}
            />
            <EngagementCard
              icon={MessagesSquare}
              label="Website chats"
              sub="conversations started this month"
              metric={chatWidget}
            />
          </div>
        )}

        {show ? (
          <>
            {/* Sources + top performing page */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel className="p-5">
                <h3 className="mb-4 font-display text-[15px] text-text">Where visitors come from</h3>
                {sources.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {sources.map((s) => (
                      <div key={s.label}>
                        <div className="mb-1.5 flex items-center justify-between text-[13px]">
                          <span className="text-text">{s.label}</span>
                          <span className="font-data font-semibold tnum text-muted">{s.pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${s.pct}%`, background: "var(--grad-brand)" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted">No traffic sources recorded yet this month.</p>
                )}
              </Panel>

              <Panel className="p-5">
                <h3 className="mb-4 font-display text-[15px] text-text">Most-visited pages</h3>
                {topPagesList.length > 0 ? (
                  <ul className="flex flex-col">
                    {topPagesList.map((p, i) => (
                      <li
                        key={`${p.label}-${i}`}
                        className="flex items-center justify-between border-b border-divider py-2.5 last:border-b-0"
                      >
                        <span className="flex items-center gap-2.5 text-[13.5px] text-text">
                          <span className="font-data text-[12px] tnum text-faint">{i + 1}</span>
                          {p.label}
                        </span>
                        <span className="font-data text-[13px] font-semibold tnum text-muted">
                          {p.views.toLocaleString()} views
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">No page views recorded yet this month.</p>
                )}
              </Panel>
            </div>

            {/* Devices + top towns. */}
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel className="p-5">
                <h3 className="mb-4 flex items-center gap-2 font-display text-[15px] text-text">
                  <Monitor size={16} className="text-brand" />
                  What people visit on
                </h3>
                {devices.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {devices.map((d) => (
                      <div key={d.label}>
                        <div className="mb-1.5 flex items-center justify-between text-[13px]">
                          <span className="text-text">{d.label}</span>
                          <span className="font-data font-semibold tnum text-muted">{d.pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${d.pct}%`, background: "var(--grad-brand)" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted">No device data yet this month.</p>
                )}
              </Panel>

              <Panel className="p-5">
                <h3 className="mb-4 flex items-center gap-2 font-display text-[15px] text-text">
                  <MapPin size={16} className="text-brand" />
                  Where your visitors are
                </h3>
                {cities.length > 0 ? (
                  <ul className="flex flex-col">
                    {cities.map((c, i) => (
                      <li
                        key={`${c.label}-${i}`}
                        className="flex items-center justify-between border-b border-divider py-2.5 last:border-b-0"
                      >
                        <span className="text-[13.5px] text-text">{c.label}</span>
                        <span className="font-data text-[13px] font-semibold tnum text-muted">
                          {c.visitors.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">No location data yet this month.</p>
                )}
              </Panel>
            </div>

            {/* Busiest day callout. */}
            {busiestDay && (
              <Panel className="mt-4 flex items-center gap-3 p-5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-tint text-brand-text">
                  <CalendarDays size={19} />
                </div>
                <div className="text-[14px] text-text">
                  <span className="font-semibold">{busiestDay}</span> is your busiest day. It is a
                  good day to post and to be ready for calls.
                </div>
              </Panel>
            )}

            {/* Plain-English takeaways: demo only (narrated, not measured). */}
            {demo && (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {INSIGHTS.map((it) => {
                  const Icon = it.icon;
                  return (
                    <Panel key={it.title} className="p-[18px]">
                      <div className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-brand-tint text-brand-text">
                        <Icon size={19} />
                      </div>
                      <h4 className="mb-1.5 font-display text-[15px] text-text">{it.title}</h4>
                      <p className="text-[13px] leading-relaxed text-muted">{it.body}</p>
                    </Panel>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<BarChart3 size={22} />}
              title="Your results, in plain English"
              description="Once your site and analytics are connected, you'll see your visitor trend, where people come from, the page that gets the most attention, and how this month compares, without the vanity metrics."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}

// A single engagement stat (estimate requests / website chats): a big count with
// a "vs last month" delta badge. A real client with no leads yet reads an honest
// 0 with no badge; demo and connected sessions show the real trend.
function EngagementCard({
  icon: Icon,
  label,
  sub,
  metric,
}: {
  icon: typeof FileText;
  label: string;
  sub: string;
  metric: EngagementMetric;
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Icon size={16} className="shrink-0 text-brand" />
        <span>{label}</span>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <span className="font-display text-[40px] font-black leading-[0.9] tracking-[-0.03em] tnum text-text">
          {metric.thisMonth.toLocaleString()}
        </span>
        {metric.deltaPct != null && (
          <span
            className={`mb-1.5 rounded-full px-2 py-0.5 text-[12px] font-bold tnum ${
              metric.deltaPct >= 0 ? "bg-positive-tint text-positive" : "bg-danger-tint text-danger"
            }`}
          >
            {metric.deltaPct >= 0 ? "+" : ""}
            {metric.deltaPct}%
          </span>
        )}
      </div>
      <div className="mt-2 text-[13px] text-muted">{sub}</div>
    </Panel>
  );
}

// A single KPI-strip stat: an icon, a big number, and a plain-English label.
function KpiCard({
  icon: Icon,
  label,
  value,
  brand,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  brand?: boolean;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <Icon size={15} className={brand ? "shrink-0 text-brand" : "shrink-0 text-faint"} />
        <span>{label}</span>
      </div>
      <div
        className={`mt-2 font-display text-[24px] font-black leading-none tracking-tight tnum ${
          brand ? "text-brand-text" : "text-text"
        }`}
      >
        {value}
      </div>
    </Panel>
  );
}

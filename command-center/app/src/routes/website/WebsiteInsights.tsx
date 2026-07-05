import { Search, Smartphone, BarChart3 } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { WEBSITE_TABS } from "../../lib/pageTabs";
import { Panel, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { useWebsiteAnalytics } from "../../hooks/useWebsiteAnalytics";
import {
  WEBSITE_CONTAINER,
  NotConnectedNotice,
  SAMPLE_SOURCES,
  SAMPLE_TREND,
  SAMPLE_VISITORS_THIS_MONTH,
  SAMPLE_VISITORS_LAST_MONTH,
  type TrafficSource,
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
  const topPage = aConnected ? a?.topPage ?? null : null;

  // Trend bars are heights relative to the tallest bucket, so any scale reads.
  const maxTrend = Math.max(1, ...trend);

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <PageBar
          tabs={WEBSITE_TABS}
          description="A plain-English read on how your website is performing this month, and where the work is actually coming from."
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

              <Panel
                className="border-transparent p-5 text-white shadow-brand"
                style={{ background: "var(--grad-brand)" }}
              >
                <div className="label-cap text-white/80">Top performing page</div>
                {demo ? (
                  <>
                    <h3 className="mb-1.5 mt-2 font-display text-[22px] font-bold tracking-[-0.02em] text-white">
                      Services
                    </h3>
                    <p className="text-[13px] leading-relaxed text-white/90">
                      Your Services page turns visitors into booked jobs better than any other page,
                      about 4.2% of people who land there reach out. Keep sending traffic to it.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="mb-1.5 mt-2 font-display text-[22px] font-bold tracking-[-0.02em] text-white">
                      {topPage?.label ?? "Not enough data yet"}
                    </h3>
                    <p className="text-[13px] leading-relaxed text-white/90">
                      {topPage
                        ? `Your most-visited page this month, with ${topPage.views.toLocaleString()} views. Keep sending traffic to it.`
                        : "Once more visitors land on your site, your best page will show here."}
                    </p>
                  </>
                )}
              </Panel>
            </div>

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

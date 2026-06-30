import { Search, Smartphone, BarChart3 } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  WEBSITE_CONTAINER,
  NotConnectedNotice,
  SAMPLE_SOURCES,
  SAMPLE_TREND,
  SAMPLE_VISITORS_THIS_MONTH,
  SAMPLE_VISITORS_LAST_MONTH,
} from "./shared";

// Website > What's working. A plain-English read on how the live site is doing:
// a bold visitors number with a trend, where the traffic comes from, the page
// that converts best, and two short takeaways. Demo only; a real (unconnected)
// session shows the zeroed hero plus <NotConnectedNotice/> and an empty state,
// mirroring the Social golden rule.

// Two plain-English takeaways shown under the fold.
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

  const visitors = demo ? SAMPLE_VISITORS_THIS_MONTH : 0;
  const deltaPct = Math.round(
    ((SAMPLE_VISITORS_THIS_MONTH - SAMPLE_VISITORS_LAST_MONTH) / SAMPLE_VISITORS_LAST_MONTH) * 100,
  );

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <PageHeader
          title="What's working"
          description="A plain-English read on how your website is performing this month, and where the work is actually coming from."
        />

        {!demo && (
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
                    demo ? "text-text" : "text-faint"
                  }`}
                >
                  {visitors.toLocaleString()}
                </span>
                <span className="font-display text-[18px] font-semibold text-muted">visitors</span>
              </div>
              {demo && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-full bg-positive-tint px-2 py-0.5 text-[12px] font-bold text-positive tnum">
                    +{deltaPct}%
                  </span>
                  <span className="text-[13px] text-muted">
                    vs last month ({SAMPLE_VISITORS_LAST_MONTH.toLocaleString()})
                  </span>
                </div>
              )}
            </div>

            {demo && (
              <div className="flex h-[60px] items-end gap-[5px]">
                {SAMPLE_TREND.map((v, i) => (
                  <span
                    key={i}
                    className="block w-[11px] rounded-t-[4px]"
                    style={{ height: `${v}%`, background: "var(--grad-brand)", opacity: 0.85 }}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        {demo ? (
          <>
            {/* Sources + top performing page */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel className="p-5">
                <h3 className="mb-4 font-display text-[15px] text-text">Where visitors come from</h3>
                <div className="flex flex-col gap-3.5">
                  {SAMPLE_SOURCES.map((s) => (
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
              </Panel>

              <Panel
                className="border-transparent p-5 text-white shadow-brand"
                style={{ background: "var(--grad-brand)" }}
              >
                <div className="label-cap text-white/80">Top performing page</div>
                <h3 className="mb-1.5 mt-2 font-display text-[22px] font-bold tracking-[-0.02em] text-white">
                  Services
                </h3>
                <p className="text-[13px] leading-relaxed text-white/90">
                  Your Services page turns visitors into booked jobs better than any other page,
                  about 4.2% of people who land there reach out. Keep sending traffic to it.
                </p>
              </Panel>
            </div>

            {/* Plain-English takeaways */}
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
          </>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<BarChart3 size={22} />}
              title="Your results, in plain English"
              description="Once your site and analytics are connected, you'll see your visitor trend, where people come from, the page that books the most jobs, and a couple of plain takeaways, without the vanity metrics."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}

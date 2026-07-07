import type { ReactNode } from "react";
import { BarChart3, Eye, MousePointerClick, Target } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useAdsInsights } from "../../hooks/useAdsInsights";
import { emptyAdsInsights, type AdsInsightsResponse } from "../../lib/adsInsights";
import { formatCompact, formatMoney, formatNumber } from "../../lib/format";
import { PAID_ADS_CONTAINER, NotConnectedNotice } from "./shared";
import { PAID_ADS_TABS } from "../../lib/pageTabs";

// "Ad Stats": the in-depth read-only numbers for a local service lead-gen
// account. Every metric Meta actually gives us that matters for this use case,
// grouped and plain-labeled (no jargon dumps). All figures are real Meta
// insights (/api/ads/insights); a real account with no activity shows honest
// zeros / a not-connected notice, demo shows a populated sample.

type Totals = AdsInsightsResponse["totals"];

interface Metric {
  label: string;
  sub: string;
  value: (t: Totals) => string;
}

interface MetricGroup {
  title: string;
  icon: ReactNode;
  metrics: Metric[];
}

// Meta returns CTR as a percent number already (1.3 => 1.3%), so it is printed
// with a trailing % rather than run through a fraction formatter.
const pct = (n: number) => `${n}%`;
const times = (n: number) => `${n}x`;

const GROUPS: MetricGroup[] = [
  {
    title: "How far your ads reached",
    icon: <Eye />,
    metrics: [
      { label: "Spent on ads", sub: "Total ad spend this month", value: (t) => formatMoney(t.spend) },
      { label: "Times shown", sub: "How often your ads appeared", value: (t) => formatCompact(t.impressions) },
      { label: "People reached", sub: "Different people who saw them", value: (t) => formatCompact(t.reach) },
      { label: "Times each person saw it", sub: "Average views per person", value: (t) => times(t.frequency) },
    ],
  },
  {
    title: "Clicks and what they cost",
    icon: <MousePointerClick />,
    metrics: [
      { label: "Link clicks", sub: "Taps through to you", value: (t) => formatNumber(t.clicks) },
      { label: "Click rate", sub: "Share of views that clicked", value: (t) => pct(t.ctr) },
      { label: "Cost per click", sub: "What each click cost", value: (t) => formatMoney(t.cpc, { cents: true }) },
      { label: "Cost per 1,000 views", sub: "What 1,000 views cost", value: (t) => formatMoney(t.cpm, { cents: true }) },
    ],
  },
  {
    title: "Leads and your return",
    icon: <Target />,
    metrics: [
      { label: "New leads", sub: "People who reached out", value: (t) => formatNumber(t.leads) },
      { label: "Cost per lead", sub: "What each new lead cost", value: (t) => formatMoney(t.costPerLead) },
      { label: "New customers", sub: "Leads that booked a job", value: (t) => formatNumber(t.customers) },
      { label: "Revenue from ads", sub: "Money those jobs brought in", value: (t) => formatMoney(t.revenue) },
      { label: "Your return", sub: "For every $1 you put in", value: (t) => times(t.roas) },
    ],
  },
];

export default function AdsInsights() {
  const { session } = useAuth();
  const { data } = useAdsInsights(Boolean(session));
  const insights = data ?? emptyAdsInsights(false);
  const { configured, totals, ads } = insights;
  const populated = totals.spend > 0 || totals.impressions > 0 || totals.leads > 0;

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          description="Every number behind your ads this month, in plain English. Read-only, straight from Facebook and Instagram."
        />

        {!populated ? (
          <>
            {!configured && (
              <NotConnectedNotice message="Once your ads are connected, all of your ad numbers, reach, clicks, leads and return, show up here." />
            )}
            <Panel className="px-4 py-12">
              <EmptyState
                icon={<BarChart3 size={22} />}
                title="No numbers yet"
                description={
                  configured
                    ? "Your ad numbers fill in here as your campaigns run."
                    : "Your ad stats appear here after your account is connected."
                }
              />
            </Panel>
          </>
        ) : (
          <div className="space-y-5">
            {GROUPS.map((group) => (
              <section key={group.title}>
                <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-text [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brand-text">
                  {group.icon}
                  {group.title}
                </h3>
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                  {group.metrics.map((m) => (
                    <Panel key={m.label} className="p-4">
                      <div className="font-display text-[24px] font-extrabold leading-none tracking-tight tnum text-text">
                        {m.value(totals)}
                      </div>
                      <div className="mt-1.5 text-[12.5px] font-semibold text-text">{m.label}</div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-faint">{m.sub}</div>
                    </Panel>
                  ))}
                </div>
              </section>
            ))}

            {/* Per-ad breakdown: the same numbers, ad by ad. */}
            {ads.length > 0 && (
              <section>
                <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-text [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brand-text">
                  <BarChart3 />
                  Ad by ad
                </h3>
                <Panel className="overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-divider text-[11.5px] uppercase tracking-wide text-faint">
                          <th className="px-4 py-3 font-semibold">Ad</th>
                          <th className="px-4 py-3 text-right font-semibold">Leads</th>
                          <th className="px-4 py-3 text-right font-semibold">People reached</th>
                          <th className="px-4 py-3 text-right font-semibold">Spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ads.map((ad, i) => (
                          <tr key={ad.id} className={i < ads.length - 1 ? "border-b border-divider" : ""}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[13.5px] font-semibold text-text">{ad.headline}</span>
                                {ad.active && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-positive-tint px-2 py-0.5 text-[10.5px] font-bold text-positive">
                                    <span className="h-1 w-1 rounded-full bg-positive" />
                                    Live
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-display text-[13.5px] font-bold tnum text-brand-text">{formatNumber(ad.leads)}</td>
                            <td className="px-4 py-3 text-right text-[13.5px] tnum text-text">{formatCompact(ad.reach)}</td>
                            <td className="px-4 py-3 text-right text-[13.5px] tnum text-text">{formatMoney(ad.spend)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </section>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

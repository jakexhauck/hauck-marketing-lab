import { Star, TrendingUp, MapPin, BarChart3 } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useAdsInsights } from "../../hooks/useAdsInsights";
import { emptyAdsInsights } from "../../lib/adsInsights";
import { PAID_ADS_CONTAINER, NotConnectedNotice } from "./shared";
import { PAID_ADS_TABS } from "../../lib/pageTabs";

// "What's working": the simple story behind the ads, deliberately dimmed down for
// clients. No CPM/CPC/CTR jargon, just a few plain-English cards. Every figure is
// derived from real Meta insights (/api/ads/insights); nothing is fabricated, so
// a client with no ad activity sees an honest "nothing to report yet".

function Kicker({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="label-cap-strong flex items-center gap-2 text-faint [&>svg]:h-3.5 [&>svg]:w-3.5">
      {icon}
      {children}
    </span>
  );
}

export default function AdsInsights() {
  const { session } = useAuth();
  const { data } = useAdsInsights(Boolean(session));
  const insights = data ?? emptyAdsInsights(false);
  const { configured, totals, ads, sources, lastMonthLeads } = insights;
  const populated = totals.leads > 0;

  const bestAds = ads.slice(0, 3);
  const maxAdLeads = Math.max(...bestAds.map((a) => a.leads), 1);
  const momPct =
    lastMonthLeads > 0
      ? Math.round(((totals.leads - lastMonthLeads) / lastMonthLeads) * 100)
      : null;
  const sourceTotal = sources.fb + sources.ig;
  const igLead = sources.ig >= sources.fb;

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          description="The simple story behind your ads this month. No jargon, just what is going well."
        />

        {!populated ? (
          <>
            {!configured && (
              <NotConnectedNotice message="Once your ads are connected, we will show you, in plain English, what is working best and where your leads are coming from." />
            )}
            <Panel className="px-4 py-12">
              <EmptyState
                icon={<BarChart3 size={22} />}
                title="Nothing to report yet"
                description={
                  configured
                    ? "The simple story of what is working appears here once your ads start bringing in leads."
                    : "The simple story of what is working appears here after your account is connected."
                }
              />
            </Panel>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Best ads */}
            {bestAds.length > 0 && (
              <Panel className="p-5">
                <Kicker icon={<Star />}>Best ads this month</Kicker>
                <h3 className="mt-3 font-display text-[18px] font-bold tracking-tight text-text">{bestAds[0].headline}</h3>
                <p className="mt-1 text-[13px] text-muted">Your top ad brought in the most leads this month.</p>
                <div className="mt-4 space-y-3">
                  {bestAds.map((a) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-[12.5px] font-semibold text-text">{a.headline}</span>
                      <div className="h-[26px] flex-1 overflow-hidden rounded-[9px] bg-surface-2">
                        <div
                          className="flex h-full items-center rounded-[9px] px-3 font-display text-[12px] font-bold text-white"
                          style={{ width: `${Math.max((a.leads / maxAdLeads) * 100, 12)}%`, backgroundImage: "var(--grad-brand)" }}
                        >
                          {a.leads} leads
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Leads vs last month */}
            <Panel className="p-5">
              <Kicker icon={<TrendingUp />}>Leads vs last month</Kicker>
              <div className="mt-3 flex items-end gap-5">
                <span
                  className={`font-display text-[46px] font-black leading-[0.9] tracking-tight tnum ${
                    momPct === null ? "text-text" : momPct >= 0 ? "text-positive" : "text-danger"
                  }`}
                >
                  {momPct === null ? totals.leads : `${momPct >= 0 ? "+" : ""}${momPct}%`}
                </span>
                {momPct !== null && (
                  <span
                    className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                      momPct >= 0 ? "bg-positive-tint text-positive" : "bg-danger-tint text-danger"
                    }`}
                  >
                    <TrendingUp size={14} /> {momPct >= 0 ? "more" : "fewer"} than last month
                  </span>
                )}
              </div>
              <p className="mt-3 text-[13px] text-muted">
                {momPct === null
                  ? `You've had ${totals.leads} leads from ads this month.`
                  : `You went from ${lastMonthLeads} leads last month to ${totals.leads} this month.`}
              </p>
            </Panel>

            {/* Where leads came from */}
            {sourceTotal > 0 && (
              <Panel className="p-5">
                <Kicker icon={<MapPin />}>Where most leads came from</Kicker>
                <h3 className="mt-3 font-display text-[18px] font-bold tracking-tight text-text">
                  {igLead ? "Instagram is leading" : "Facebook is leading"}
                </h3>
                <p className="mt-1 text-[13px] text-muted">
                  {Math.round((Math.max(sources.ig, sources.fb) / sourceTotal) * 100)}% of your leads came from{" "}
                  {igLead ? "Instagram" : "Facebook"} this month.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12.5px] font-semibold text-text">Instagram</span>
                    <div className="h-[26px] flex-1 overflow-hidden rounded-[9px] bg-surface-2">
                      <div className="flex h-full items-center rounded-[9px] px-3 font-display text-[12px] font-bold text-white" style={{ width: `${Math.max((sources.ig / sourceTotal) * 100, 8)}%`, backgroundImage: "linear-gradient(90deg,#db2777,#f59e0b)" }}>
                        {sources.ig} leads
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12.5px] font-semibold text-text">Facebook</span>
                    <div className="h-[26px] flex-1 overflow-hidden rounded-[9px] bg-surface-2">
                      <div className="flex h-full items-center rounded-[9px] px-3 font-display text-[12px] font-bold text-white" style={{ width: `${Math.max((sources.fb / sourceTotal) * 100, 8)}%`, backgroundImage: "linear-gradient(90deg,#4f46e5,#2563eb)" }}>
                        {sources.fb} leads
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

import type { ReactNode } from "react";
import {
  DollarSign,
  UserPlus,
  Tag,
  Heart,
  CreditCard,
  Zap,
  Megaphone,
  BarChart3,
} from "lucide-react";
import Shell from "../../components/Shell";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useAdsInsights } from "../../hooks/useAdsInsights";
import { emptyAdsInsights, type AdsInsightsResponse } from "../../lib/adsInsights";
import { PAID_ADS_CONTAINER, NotConnectedNotice } from "./shared";

// The Paid Ads "Glance". Friendly Cockpit direction: colored stat tiles, a plain
// "leads each week" bar chart, a running-now list, one boost nudge. Driven by
// real Meta insights (/api/ads/insights); demo/preview shows the rich sample.
// Golden rule: a real client sees only their real numbers, honest zeros before
// ads have run, and a not-connected notice until Meta is wired.

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface Kpi {
  label: string;
  sub: string;
  value: (t: AdsInsightsResponse["totals"]) => string;
  icon: ReactNode;
  chipBg: string;
  chipFg: string;
  hero?: boolean;
}

const KPIS: Kpi[] = [
  { label: "Spent on ads", sub: "What you put in this month", value: (t) => money.format(t.spend), icon: <DollarSign />, chipBg: "#eceaff", chipFg: "#4f46e5" },
  { label: "New leads", sub: "People who reached out", value: (t) => String(t.leads), icon: <UserPlus />, chipBg: "#e2f3fc", chipFg: "#0ea5e9" },
  { label: "Cost per lead", sub: "What each new lead cost you", value: (t) => money.format(t.costPerLead), icon: <Tag />, chipBg: "#fef3e2", chipFg: "#d97706" },
  { label: "New customers", sub: "Leads that booked a job", value: (t) => String(t.customers), icon: <Heart />, chipBg: "#fde7f1", chipFg: "#db2777" },
  { label: "Revenue from ads", sub: "Money those jobs brought in", value: (t) => money.format(t.revenue), icon: <CreditCard />, chipBg: "#e6f6ec", chipFg: "#16a34a" },
  { label: "Your return", sub: "For every $1 you put in", value: (t) => `${t.roas}x`, icon: <Zap />, chipBg: "#fef3e2", chipFg: "#d97706", hero: true },
];

export default function AdsOverview() {
  const { session } = useAuth();
  const { data } = useAdsInsights(Boolean(session));
  const insights = data ?? emptyAdsInsights(false);
  const { configured, totals } = insights;
  // "Populated" = real spend/leads to show. Drives the colored/hero styling; a
  // configured-but-zero account reads as honest zeros, not fabricated activity.
  const populated = totals.spend > 0 || totals.leads > 0;

  const activeAds = insights.ads.filter((a) => a.active);
  const maxLeads = Math.max(...insights.ads.map((a) => a.leads), 1);
  const maxWeek = Math.max(...insights.weekly.map((w) => w.value), 1);

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          actions={
            populated ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-positive-tint px-3 py-1.5 text-[12.5px] font-semibold text-positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                {activeAds.length} ads running now
              </span>
            ) : undefined
          }
        />

        {!configured && (
          <NotConnectedNotice message="To see your real ad results, what you spent, the leads it brought in, and the jobs booked, we still need to connect your Meta ad account." />
        )}
        {configured && !populated && (
          <Panel className="mb-4 flex items-start gap-3 border-brand/30 bg-brand-tint p-4">
            <BarChart3 size={20} className="mt-0.5 shrink-0 text-brand-text" />
            <div className="flex-1 text-[13px] leading-snug text-text">
              Your ad account is connected. Your spend, leads and results will show up here
              the moment your campaigns start running.
            </div>
          </Panel>
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          {KPIS.map((k) => (
            <Panel
              key={k.label}
              className={`p-4 ${k.hero && populated ? "border-warning/40" : ""}`}
              style={k.hero && populated ? { backgroundImage: "linear-gradient(150deg,#fffaf0 0%,var(--surface) 60%)" } : undefined}
            >
              <span
                className="mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[11px] [&>svg]:h-[18px] [&>svg]:w-[18px]"
                style={{ backgroundColor: populated ? k.chipBg : "var(--surface-3)", color: populated ? k.chipFg : "var(--text-faint)" }}
              >
                {k.icon}
              </span>
              <div
                className={`font-display text-[26px] font-extrabold leading-none tracking-tight tnum ${
                  k.hero && populated ? "text-warning" : populated ? "text-text" : "text-faint"
                }`}
              >
                {k.value(totals)}
              </div>
              <div className="mt-1.5 text-[12.5px] font-semibold text-text">{k.label}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-faint">{k.sub}</div>
            </Panel>
          ))}
        </div>

        {/* Leads each week + Running now */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Panel className="flex flex-col p-5">
            <h3 className="font-display text-[16px] font-semibold tracking-tight text-text">Leads each week</h3>
            <p className="mt-0.5 text-[12.5px] text-faint">
              How many people reached out from your ads, week by week this month.
            </p>
            {insights.weekly.length > 0 ? (
              <div className="mt-5 flex min-h-[150px] flex-1 items-end gap-4 px-1">
                {insights.weekly.map((w, i) => (
                  <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span className="font-display text-[13px] font-bold text-text tnum">{w.value}</span>
                    <div
                      className="w-full max-w-[46px] rounded-t-[10px]"
                      style={{
                        height: `${(w.value / maxWeek) * 100}%`,
                        backgroundImage:
                          i === insights.weekly.length - 1
                            ? "linear-gradient(180deg,#7c73f0 0%,#4338ca 100%)"
                            : "linear-gradient(180deg,#a5a0f5 0%,var(--brand) 100%)",
                      }}
                    />
                    <span className="text-[11.5px] font-medium text-faint">{w.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8">
                <EmptyState icon={<BarChart3 size={22} />} title="No leads yet" description="Your weekly leads show up here once your ads are running." />
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <h3 className="font-display text-[16px] font-semibold tracking-tight text-text">Running now</h3>
            <p className="mt-0.5 text-[12.5px] text-faint">
              The ads working for you today, and how many leads each one brought.
            </p>
            {activeAds.length > 0 ? (
              <div className="mt-2">
                {activeAds.map((ad, i) => (
                  <div key={ad.id} className={`py-3.5 ${i < activeAds.length - 1 ? "border-b border-divider" : "pb-0.5"}`}>
                    <div className="mb-2 flex items-center justify-between gap-2.5">
                      <span className="text-[13.5px] font-semibold text-text">{ad.headline}</span>
                      <span className="font-display text-[13px] font-bold text-brand-text tnum">{ad.leads} leads</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(ad.leads / maxLeads) * 100}%`, backgroundImage: "var(--grad-brand)" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8">
                <EmptyState icon={<Megaphone size={22} />} title="No ads running yet" description="Your active ads and their leads appear here once campaigns start." />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

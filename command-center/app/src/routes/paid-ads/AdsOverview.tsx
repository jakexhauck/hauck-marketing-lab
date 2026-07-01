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
import { PageHeader } from "../../components/PageHeader";
import { Panel, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  PAID_ADS_CONTAINER,
  NotConnectedNotice,
  DEMO_ADS,
  DEMO_WEEKLY,
} from "./shared";

// The Paid Ads "Glance". Friendly Cockpit direction (mockup paid-ads-v3.html):
// colored stat tiles, a plain "leads each week" bar chart, a running-now list
// with progress meters, and one warm boost nudge. Populated in demo/preview;
// zeroed + not-connected in a real session (the golden rule).

interface Kpi {
  label: string;
  sub: string;
  demoValue: string;
  icon: ReactNode;
  // soft chip colors (decorative), matching the v3 palette
  chipBg: string;
  chipFg: string;
  hero?: boolean;
}

const KPIS: Kpi[] = [
  { label: "Spent on ads", sub: "What you put in this month", demoValue: "$1,840", icon: <DollarSign />, chipBg: "#eceaff", chipFg: "#4f46e5" },
  { label: "New leads", sub: "People who reached out", demoValue: "32", icon: <UserPlus />, chipBg: "#e2f3fc", chipFg: "#0ea5e9" },
  { label: "Cost per lead", sub: "What each new lead cost you", demoValue: "$58", icon: <Tag />, chipBg: "#fef3e2", chipFg: "#d97706" },
  { label: "New customers", sub: "Leads that booked a job", demoValue: "7", icon: <Heart />, chipBg: "#fde7f1", chipFg: "#db2777" },
  { label: "Revenue from ads", sub: "Money those jobs brought in", demoValue: "$14,200", icon: <CreditCard />, chipBg: "#e6f6ec", chipFg: "#16a34a" },
  { label: "Your return", sub: "Every $1 brought back $7.70", demoValue: "7.7x", icon: <Zap />, chipBg: "#fef3e2", chipFg: "#d97706", hero: true },
];

const ZERO: Record<string, string> = {
  "Spent on ads": "$0",
  "New leads": "0",
  "Cost per lead": "$0",
  "New customers": "0",
  "Revenue from ads": "$0",
  "Your return": "0x",
};

export default function AdsOverview() {
  const demo = demoMode();
  const activeAds = DEMO_ADS.filter((a) => a.active);
  const maxLeads = Math.max(...activeAds.map((a) => a.leads), 1);
  const maxWeek = Math.max(...DEMO_WEEKLY.map((w) => w.value), 1);

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageHeader
          title="Paid Ads"
          description="Your ad money at a glance. Here is what it brought in this month, in plain numbers."
          actions={
            demo ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-positive-tint px-3 py-1.5 text-[12.5px] font-semibold text-positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                {activeAds.length} ads running now
              </span>
            ) : undefined
          }
        />

        {!demo && (
          <NotConnectedNotice message="To see your real ad results, what you spent, the leads it brought in, and the jobs booked, we still need to connect your Meta ad account." />
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          {KPIS.map((k) => (
            <Panel
              key={k.label}
              className={`p-4 ${k.hero && demo ? "border-warning/40" : ""}`}
              style={k.hero && demo ? { backgroundImage: "linear-gradient(150deg,#fffaf0 0%,var(--surface) 60%)" } : undefined}
            >
              <span
                className="mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[11px] [&>svg]:h-[18px] [&>svg]:w-[18px]"
                style={{ backgroundColor: demo ? k.chipBg : "var(--surface-3)", color: demo ? k.chipFg : "var(--text-faint)" }}
              >
                {k.icon}
              </span>
              <div
                className={`font-display text-[26px] font-extrabold leading-none tracking-tight tnum ${
                  k.hero && demo ? "text-warning" : demo ? "text-text" : "text-faint"
                }`}
              >
                {demo ? k.demoValue : ZERO[k.label]}
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
              More people are reaching out as the month goes on. That is the trend we want.
            </p>
            {demo ? (
              <div className="mt-5 flex min-h-[150px] flex-1 items-end gap-4 px-1">
                {DEMO_WEEKLY.map((w, i) => (
                  <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span className="font-display text-[13px] font-bold text-text tnum">{w.value}</span>
                    <div
                      className="w-full max-w-[46px] rounded-t-[10px]"
                      style={{
                        height: `${(w.value / maxWeek) * 100}%`,
                        backgroundImage:
                          i === DEMO_WEEKLY.length - 1
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
                <EmptyState icon={<BarChart3 size={22} />} title="No leads yet" description="Once your ads are connected, your weekly leads show up here." />
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <h3 className="font-display text-[16px] font-semibold tracking-tight text-text">Running now</h3>
            <p className="mt-0.5 text-[12.5px] text-faint">
              The ads working for you today, and how many leads each one brought.
            </p>
            {demo ? (
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
                    <div className="mt-1.5 text-[11.5px] text-faint">{ad.blurb}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8">
                <EmptyState icon={<Megaphone size={22} />} title="No ads running yet" description="Your active ads and their leads appear here once connected." />
              </div>
            )}
          </Panel>
        </div>

        {/* Boost nudge */}
        {demo && (
          <div
            className="mt-4 flex flex-col items-start gap-4 rounded-[var(--radius-lg)] border p-5 sm:flex-row sm:items-center"
            style={{ backgroundImage: "linear-gradient(135deg,#fff6e6 0%,#fef0f6 100%)", borderColor: "#f6dfc0" }}
          >
            <span
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-white"
              style={{ backgroundImage: "linear-gradient(135deg,#f59e0b,#db2777)", boxShadow: "0 8px 18px rgba(245,158,11,.32)" }}
            >
              <Zap size={24} />
            </span>
            <div className="flex-1">
              <div className="font-display text-[14.5px] font-semibold text-text">Your "Same-day hot water" ad is taking off.</div>
              <p className="mt-0.5 text-[13px] text-muted">
                It is bringing in the most leads at the lowest cost. Want us to put more behind it?
              </p>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

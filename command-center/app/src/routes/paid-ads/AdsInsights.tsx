import { Star, TrendingUp, MapPin, Clock, BarChart3 } from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import { PageHeader } from "../../components/PageHeader";
import { Panel, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { PAID_ADS_CONTAINER, NotConnectedNotice } from "./shared";
import { PAID_ADS_TABS } from "../../lib/pageTabs";

// "What's working": the simple story behind the ads, deliberately dimmed down for
// clients. No CPM/CPC/CTR/funnel. Just a few plain-English cards with friendly
// pure-CSS visuals.

const BEST_ADS = [
  { label: "Same-day hot water", leads: 12, width: 100, opacity: 1 },
  { label: "$59 AC tune-up", leads: 9, width: 75, opacity: 0.78 },
  { label: "Burst pipe 24/7", leads: 6, width: 50, opacity: 0.58 },
];

const DAYS = [
  { day: "Mon", height: 38, hot: false },
  { day: "Tue", height: 78, hot: true },
  { day: "Wed", height: 92, hot: true },
  { day: "Thu", height: 100, hot: true },
  { day: "Fri", height: 60, hot: false },
  { day: "Sat", height: 30, hot: false },
  { day: "Sun", height: 22, hot: false },
];

function Kicker({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="label-cap-strong flex items-center gap-2 text-faint [&>svg]:h-3.5 [&>svg]:w-3.5">
      {icon}
      {children}
    </span>
  );
}

export default function AdsInsights() {
  const demo = demoMode();

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageTabs tabs={PAID_ADS_TABS} />
        <PageHeader
          title="What's working"
          description="The simple story behind your ads this month. No jargon, just what is going well."
        />

        {!demo ? (
          <>
            <NotConnectedNotice message="Once your ads are connected, we will show you, in plain English, what is working best and where your leads are coming from." />
            <Panel className="px-4 py-12">
              <EmptyState
                icon={<BarChart3 size={22} />}
                title="Nothing to report yet"
                description="The simple story of what is working appears here after your account is connected."
              />
            </Panel>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Best ad */}
            <Panel className="p-5">
              <Kicker icon={<Star />}>Best ad this month</Kicker>
              <h3 className="mt-3 font-display text-[18px] font-bold tracking-tight text-text">Same-day hot water</h3>
              <p className="mt-1 text-[13px] text-muted">It brought in the most leads, and at the lowest cost.</p>
              <div className="mt-4 space-y-3">
                {BEST_ADS.map((a) => (
                  <div key={a.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12.5px] font-semibold text-text">{a.label}</span>
                    <div className="h-[26px] flex-1 overflow-hidden rounded-[9px] bg-surface-2">
                      <div
                        className="flex h-full items-center rounded-[9px] px-3 font-display text-[12px] font-bold text-white"
                        style={{ width: `${a.width}%`, opacity: a.opacity, backgroundImage: "var(--grad-brand)" }}
                      >
                        {a.leads} leads
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Leads vs last month */}
            <Panel className="p-5">
              <Kicker icon={<TrendingUp />}>Leads vs last month</Kicker>
              <div className="mt-3 flex items-end gap-5">
                <span className="font-display text-[46px] font-black leading-[0.9] tracking-tight text-positive tnum">+18%</span>
                <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-positive-tint px-2.5 py-1 text-[13px] font-semibold text-positive">
                  <TrendingUp size={14} /> more than last month
                </span>
              </div>
              <p className="mt-3 text-[13px] text-muted">
                You went from 27 leads last month to 32 this month. The trend is heading the right way.
              </p>
              <div className="mt-4">
                <svg viewBox="0 0 300 64" preserveAspectRatio="none" className="block h-16 w-full">
                  <defs>
                    <linearGradient id="adsSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#16a34a" stopOpacity=".28" />
                      <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,46 L60,42 L120,44 L180,30 L240,24 L300,12 L300,64 L0,64 Z" fill="url(#adsSpark)" />
                  <path d="M0,46 L60,42 L120,44 L180,30 L240,24 L300,12" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="300" cy="12" r="4" fill="#16a34a" />
                </svg>
              </div>
            </Panel>

            {/* Where leads came from */}
            <Panel className="p-5">
              <Kicker icon={<MapPin />}>Where most leads came from</Kicker>
              <h3 className="mt-3 font-display text-[18px] font-bold tracking-tight text-text">Instagram is leading</h3>
              <p className="mt-1 text-[13px] text-muted">A bit more than half of your leads came from Instagram this month.</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[12.5px] font-semibold text-text">Instagram</span>
                  <div className="h-[26px] flex-1 overflow-hidden rounded-[9px] bg-surface-2">
                    <div className="flex h-full items-center rounded-[9px] px-3 font-display text-[12px] font-bold text-white" style={{ width: "56%", backgroundImage: "linear-gradient(90deg,#db2777,#f59e0b)" }}>
                      18 leads
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[12.5px] font-semibold text-text">Facebook</span>
                  <div className="h-[26px] flex-1 overflow-hidden rounded-[9px] bg-surface-2">
                    <div className="flex h-full items-center rounded-[9px] px-3 font-display text-[12px] font-bold text-white" style={{ width: "44%", backgroundImage: "linear-gradient(90deg,#4f46e5,#2563eb)" }}>
                      14 leads
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            {/* Best time */}
            <Panel className="p-5">
              <Kicker icon={<Clock />}>Best time to reach people</Kicker>
              <h3 className="mt-3 font-display text-[18px] font-bold tracking-tight text-text">Weekday evenings</h3>
              <p className="mt-1 text-[13px] text-muted">
                Most people clicked your ads between 6 and 9 PM on weeknights, after they got home.
              </p>
              <div className="mt-4 flex gap-2.5">
                {DAYS.map((d) => (
                  <div key={d.day} className="flex-1 text-center">
                    <div className="flex h-[60px] items-end justify-center">
                      <i
                        className="block w-[60%] rounded-t-[7px]"
                        style={{
                          height: `${d.height}%`,
                          backgroundImage: d.hot ? "linear-gradient(180deg,#fbbf24,#f59e0b)" : undefined,
                          backgroundColor: d.hot ? undefined : "var(--surface-2)",
                        }}
                      />
                    </div>
                    <div className={`mt-1.5 text-[11px] font-semibold ${d.hot ? "text-warning" : "text-faint"}`}>{d.day}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </Shell>
  );
}

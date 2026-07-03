import Shell from "../../components/Shell";
import { Zap, BarChart3 } from "lucide-react";
import { CAMPAIGNS_TABS } from "../../lib/pageTabs";
import PageBar from "../../components/PageBar";
import { Panel, PanelHeader, Badge, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  CAMPAIGNS_CONTAINER,
  NotConnectedNotice,
  ChannelChip,
  DEMO_CAMPAIGNS,
  DEMO_INSIGHTS,
} from "./shared";

// "What's working": which messages turned into booked jobs, plus a plain takeaway.
// Populated in demo; zeroed + not-connected in a real session.

const PERFORMERS = DEMO_CAMPAIGNS.filter((c) => c.status === "Sent")
  .map((c) => ({ ...c, jobs: parseInt(c.result ?? "0", 10) || 0 }))
  .sort((a, b) => b.jobs - a.jobs)
  .slice(0, 4);

const MAX_JOBS = Math.max(...PERFORMERS.map((p) => p.jobs), 1);

export default function CampaignsInsights() {
  const demo = demoMode();
  const summary = demo
    ? DEMO_INSIGHTS.summary
    : DEMO_INSIGHTS.summary.map((k) => ({ ...k, value: "0", brand: false }));

  return (
    <Shell>
      <div className={CAMPAIGNS_CONTAINER}>
        <PageBar tabs={CAMPAIGNS_TABS} description="Which messages turned into real, booked work." />

        {!demo && (
          <NotConnectedNotice message="After your first few campaigns, we'll show what books the most jobs and the best time to send." />
        )}

        {/* summary KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.map((k) => (
            <Panel key={k.label} className="p-4">
              <div className="text-[13px] text-muted">{k.label}</div>
              <div
                className={`mt-2 font-data text-[26px] font-semibold tnum ${
                  k.brand ? "text-brand-text" : demo ? "text-text" : "text-faint"
                }`}
              >
                {k.value}
              </div>
            </Panel>
          ))}
        </div>

        <Panel className="mt-4 overflow-hidden">
          <PanelHeader title="Top campaigns" />
          {demo ? (
            <div className="flex flex-col gap-4 p-4">
              {PERFORMERS.map((p) => (
                <div key={p.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-center gap-2 truncate font-display text-[14px] text-text">
                      <span className="truncate">{p.title}</span>
                      <ChannelChip ch={p.ch} />
                    </div>
                    <div className="shrink-0 font-data text-[13px] font-semibold text-positive">{p.result}</div>
                  </div>
                  <div className="mt-1 text-[12px] text-faint">
                    {p.rate} · {p.sent} sent
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(p.jobs / MAX_JOBS) * 100}%`,
                        backgroundImage:
                          p.ch === "sms" ? "linear-gradient(135deg,#0ea5e9,#38bdf8)" : "var(--grad-brand)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-10">
              <EmptyState
                icon={<BarChart3 size={22} />}
                title="No results yet"
                description="After your first few campaigns, your top performers show up here."
              />
            </div>
          )}
        </Panel>

        {demo && (
          <Panel className="mt-4 flex items-start gap-3 border-brand/30 bg-brand-tint p-4">
            <Zap size={20} className="mt-0.5 shrink-0 text-brand-text" />
            <div className="flex-1 text-[13px] leading-snug text-text">{DEMO_INSIGHTS.takeaway}</div>
          </Panel>
        )}

        {/* a tiny channel legend so the bar colors read clearly */}
        {demo && (
          <div className="mt-3 flex items-center gap-3 px-1 text-[12px] text-faint">
            <Badge tone="neutral">Legend</Badge>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ backgroundImage: "var(--grad-brand)" }} /> Email
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ backgroundImage: "linear-gradient(135deg,#0ea5e9,#38bdf8)" }} /> SMS
            </span>
          </div>
        )}
      </div>
    </Shell>
  );
}

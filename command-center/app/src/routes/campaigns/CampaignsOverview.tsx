import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Send, BarChart3, ArrowRight } from "lucide-react";
import Shell from "../../components/Shell";
import { CAMPAIGNS_TABS } from "../../lib/pageTabs";
import CampaignReportDialog from "../../components/campaigns/CampaignReportDialog";
import PageBar from "../../components/PageBar";
import { Panel, PanelHeader, Badge, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  CAMPAIGNS_CONTAINER,
  NotConnectedNotice,
  ChannelGlyph,
  DEMO_CAMPAIGNS,
  type DemoCampaign,
} from "./shared";

// The Campaigns hub overview ("Glance"): a calm 4-KPI row, what's going out
// next, and what was recently sent (with results). Read-only. Populated in
// demo/preview; zeroed + done-for-you empty state in a real session (the golden
// rule). The client never creates or sends anything here; we run it for them.

const SAMPLE_KPIS: { label: string; value: string; brand?: boolean }[] = [
  { label: "Sent this month", value: "3" },
  { label: "Email open rate", value: "43%" },
  { label: "Replies", value: "22" },
  { label: "Jobs booked", value: "14", brand: true },
];
const EMPTY_KPIS = SAMPLE_KPIS.map((k) => ({ ...k, value: "0", brand: false }));

const UP_NEXT = DEMO_CAMPAIGNS.filter((c) => c.status !== "Sent");
const RECENT = DEMO_CAMPAIGNS.filter((c) => c.status === "Sent").slice(0, 3);

function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-1 text-[12px] font-medium text-brand-text hover:underline">
      {children} <ArrowRight size={12} />
    </Link>
  );
}

export default function CampaignsOverview() {
  const demo = demoMode();
  const kpis = demo ? SAMPLE_KPIS : EMPTY_KPIS;
  const [report, setReport] = useState<DemoCampaign | null>(null);

  return (
    <Shell>
      <CampaignReportDialog campaign={report} onClose={() => setReport(null)} />
      <div className={CAMPAIGNS_CONTAINER}>
        <PageBar
          tabs={CAMPAIGNS_TABS}
          description="The right message to the right customers, at the right time. We handle every send."
        />

        {!demo && <NotConnectedNotice />}

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <Panel key={k.label} className="p-4">
              <div className="text-[13px] text-muted">{k.label}</div>
              <div
                className={`mt-2 font-data text-[28px] font-semibold tnum ${
                  k.brand ? "text-brand-text" : demo ? "text-text" : "text-faint"
                }`}
              >
                {k.value}
              </div>
            </Panel>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Up next"
              action={demo ? <SeeAll to="/marketing/campaigns/all">All campaigns</SeeAll> : undefined}
            />
            {demo ? (
              <ul>
                {UP_NEXT.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0">
                    <ChannelGlyph ch={c.ch} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] text-text">{c.title}</div>
                      <div className="mt-0.5 text-[12.5px] text-faint">
                        {c.audience} · {c.status === "Draft" ? "In review" : c.when}
                      </div>
                    </div>
                    <Badge tone={c.tone}>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<Send size={22} />}
                  title="Nothing scheduled yet"
                  description="Campaigns we line up for you show up here before they go out."
                />
              </div>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Recently sent"
              action={demo ? <SeeAll to="/marketing/campaigns/insights">What's working</SeeAll> : undefined}
            />
            {demo ? (
              <ul>
                {RECENT.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setReport(c)}
                      className="flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
                    >
                      <ChannelGlyph ch={c.ch} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[14px] text-text">{c.title}</div>
                        <div className="mt-0.5 text-[12.5px] text-faint">
                          {c.when} · {c.sent} sent
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-data text-[13px] font-semibold text-positive">{c.result}</div>
                        <div className="text-[11px] text-faint">{c.rate}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<BarChart3 size={22} />}
                  title="No campaigns yet"
                  description="After your first send, every text and email and its results appear here."
                />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

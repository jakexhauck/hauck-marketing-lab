import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, Send, Sparkles, BarChart3, Zap, ArrowRight } from "lucide-react";
import Shell from "../../components/Shell";
import CampaignsMobileTabs from "../../components/campaigns/CampaignsMobileTabs";
import NewCampaignDialog from "../../components/campaigns/NewCampaignDialog";
import CampaignReportDialog from "../../components/campaigns/CampaignReportDialog";
import { PageHeader } from "../../components/PageHeader";
import { Panel, PanelHeader, Badge, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  CAMPAIGNS_CONTAINER,
  NotConnectedNotice,
  ChannelGlyph,
  DEMO_CAMPAIGNS,
  DEMO_IDEAS,
  type DemoCampaign,
} from "./shared";

// The Campaigns hub overview ("Glance"): a calm 4-KPI row, what's going out next,
// what was recently sent (with results), and a few ideas. Populated in
// demo/preview; zeroed + not-connected in a real session (the golden rule).

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
  const [composer, setComposer] = useState(false);
  const [report, setReport] = useState<DemoCampaign | null>(null);

  return (
    <Shell>
      <NewCampaignDialog open={composer} onClose={() => setComposer(false)} />
      <CampaignReportDialog campaign={report} onClose={() => setReport(null)} />
      <div className={CAMPAIGNS_CONTAINER}>
        <CampaignsMobileTabs />
        <PageHeader
          title="Campaigns"
          description="Send the right message to the right customers, at the right time."
          actions={
            <Button variant="primary" size="md" onClick={() => setComposer(true)}>
              <Plus size={16} /> New campaign
            </Button>
          }
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

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
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
                          {c.audience} · {c.status === "Draft" ? "Needs your approval" : c.when}
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
                    description="Once your account is connected, campaigns you schedule show up here."
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

          <div className="flex flex-col gap-4">
            <Panel className="overflow-hidden">
              <PanelHeader title="Ideas for you" />
              {demo ? (
                <div className="flex flex-col gap-2.5 p-3">
                  {DEMO_IDEAS.map((idea) => (
                    <button
                      key={idea.title}
                      type="button"
                      onClick={() => setComposer(true)}
                      className="group relative overflow-hidden rounded-[12px] border border-border bg-surface px-3.5 py-3 pl-4 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]"
                    >
                      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundImage: "var(--grad-brand)" }} />
                      <div className="label-cap text-brand-text">{idea.kind}</div>
                      <div className="mt-1.5 text-[13.5px] font-semibold leading-snug text-text">{idea.title}</div>
                      <span className="mt-2.5 flex items-center gap-1 text-[12.5px] font-medium text-brand-text">
                        Build it <ArrowRight size={12} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-10">
                  <EmptyState
                    icon={<Sparkles size={22} />}
                    title="Ideas land here"
                    description="We'll suggest campaigns worth sending based on your customers and the season."
                  />
                </div>
              )}
            </Panel>

            {demo && (
              <Panel className="flex items-center gap-3 border-brand/30 bg-brand-tint p-4">
                <Zap size={20} className="shrink-0 text-brand-text" />
                <div className="flex-1 text-[13px] leading-snug text-text">
                  Your spring special booked 7 jobs.{" "}
                  <span className="font-semibold text-brand-text">Send it again next month?</span>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

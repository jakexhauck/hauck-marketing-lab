import { useState } from "react";
import { Plus, Send } from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import { CAMPAIGNS_TABS } from "../../lib/pageTabs";
import NewCampaignDialog from "../../components/campaigns/NewCampaignDialog";
import CampaignReportDialog from "../../components/campaigns/CampaignReportDialog";
import { PageHeader } from "../../components/PageHeader";
import { Panel, PanelHeader, Badge, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  CAMPAIGNS_CONTAINER,
  NotConnectedNotice,
  ChannelGlyph,
  ChannelChip,
  DEMO_CAMPAIGNS,
  type DemoCampaign,
  type CampaignStatus,
} from "./shared";

// Every text and email the client has sent, scheduled or drafted. Filter chips
// across status; sent rows open their report. Populated in demo; empty +
// not-connected in a real session.

const FILTERS: { key: "all" | CampaignStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Scheduled", label: "Scheduled" },
  { key: "Draft", label: "Drafts" },
  { key: "Sent", label: "Sent" },
];

export default function CampaignsList() {
  const demo = demoMode();
  const [filter, setFilter] = useState<"all" | CampaignStatus>("all");
  const [composer, setComposer] = useState(false);
  const [report, setReport] = useState<DemoCampaign | null>(null);

  const rows = DEMO_CAMPAIGNS.filter((c) => filter === "all" || c.status === filter);

  return (
    <Shell>
      <NewCampaignDialog open={composer} onClose={() => setComposer(false)} />
      <CampaignReportDialog campaign={report} onClose={() => setReport(null)} />
      <div className={CAMPAIGNS_CONTAINER}>
        <PageTabs tabs={CAMPAIGNS_TABS} />
        <PageHeader
          title="Campaigns"
          description="Every text and email you've sent."
          actions={
            <Button variant="primary" size="md" onClick={() => setComposer(true)}>
              <Plus size={16} /> New campaign
            </Button>
          }
          filters={
            demo
              ? FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                      filter === f.key
                        ? "border border-brand bg-brand-tint text-brand-text"
                        : "border border-border text-muted hover:border-border-strong hover:text-text"
                    }`}
                  >
                    {f.label}
                  </button>
                ))
              : undefined
          }
        />

        {!demo && <NotConnectedNotice />}

        {demo ? (
          <Panel className="overflow-hidden">
            <PanelHeader title="All campaigns" />
            {rows.length ? (
              <ul>
                {rows.map((c) => {
                  const sent = c.status === "Sent";
                  const inner = (
                    <>
                      <ChannelGlyph ch={c.ch} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 truncate font-display text-[14px] text-text">
                          <span className="truncate">{c.title}</span>
                          <ChannelChip ch={c.ch} />
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-faint">
                          {c.audience} · {c.when}
                        </div>
                      </div>
                      {sent ? (
                        <div className="shrink-0 text-right">
                          <div className="font-data text-[13px] font-semibold text-positive">{c.result}</div>
                          <div className="text-[11px] text-faint">
                            {c.rate} · {c.sent} sent
                          </div>
                        </div>
                      ) : (
                        <Badge tone={c.tone}>{c.status}</Badge>
                      )}
                    </>
                  );
                  return (
                    <li key={c.id}>
                      {sent ? (
                        <button
                          type="button"
                          onClick={() => setReport(c)}
                          className="flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-10">
                <EmptyState icon={<Send size={22} />} title="Nothing here yet" description="No campaigns match this filter." />
              </div>
            )}
          </Panel>
        ) : (
          <Panel className="overflow-hidden">
            <div className="px-4 py-10">
              <EmptyState
                icon={<Send size={22} />}
                title="No campaigns yet"
                description="Create your first campaign and it'll show up here with delivery and results once it sends."
              />
            </div>
          </Panel>
        )}
      </div>
    </Shell>
  );
}

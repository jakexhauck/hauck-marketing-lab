import { useState } from "react";
import { Plus, Users, ArrowRight } from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import { CAMPAIGNS_TABS } from "../../lib/pageTabs";
import NewCampaignDialog from "../../components/campaigns/NewCampaignDialog";
import AudienceDetailDialog from "../../components/campaigns/AudienceDetailDialog";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Button, EmptyState } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import { CAMPAIGNS_CONTAINER, NotConnectedNotice, DEMO_AUDIENCES, type DemoAudience } from "./shared";

// The customer lists a client can send to. Built from their customer records
// (smart segments). Demo shows the populated lists; a real session is empty +
// not-connected until the customer list is linked.
export default function CampaignsAudiences() {
  const demo = demoMode();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<DemoAudience | null>(null);
  const [composer, setComposer] = useState(false);

  return (
    <Shell>
      <NewCampaignDialog open={composer} onClose={() => setComposer(false)} />
      <AudienceDetailDialog
        audience={detail}
        onClose={() => setDetail(null)}
        onSend={() => {
          setDetail(null);
          setComposer(true);
        }}
      />
      <div className={CAMPAIGNS_CONTAINER}>
        <PageTabs tabs={CAMPAIGNS_TABS} />
        <PageHeader
          title="Audiences"
          description="The customer lists you can send to. We build these from your customer records."
          actions={
            <Button
              variant="secondary"
              size="md"
              disabled={!demo}
              onClick={() => showToast("Custom audience builder turns on once your customer list is connected.")}
            >
              <Plus size={16} /> New list
            </Button>
          }
        />

        {!demo && (
          <NotConnectedNotice message="Once your customer list is connected, we'll build smart lists like 'past customers' and 'due for a tune-up' here automatically." />
        )}

        {demo ? (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_AUDIENCES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setDetail(a)}
                className="group flex flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-left shadow-[var(--shadow-sm)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-md)]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-brand-tint text-brand-text">
                    <Users size={16} />
                  </span>
                  <span className="flex items-center gap-1 text-[12px] font-medium text-brand-text">
                    View <ArrowRight size={12} />
                  </span>
                </div>
                <div className="mt-3 font-display text-[30px] font-extrabold leading-none tracking-tight text-text tnum">
                  {a.count}
                </div>
                <div className="mt-1.5 font-display text-[15px] font-semibold text-text">{a.name}</div>
                <div className="mt-1.5 text-[13px] leading-snug text-muted">{a.desc}</div>
              </button>
            ))}
          </div>
        ) : (
          <Panel className="overflow-hidden">
            <div className="px-4 py-10">
              <EmptyState
                icon={<Users size={22} />}
                title="No audiences yet"
                description="When your customer list is connected, your smart lists appear here automatically."
              />
            </div>
          </Panel>
        )}
      </div>
    </Shell>
  );
}

import { useState } from "react";
import { Plus, LayoutGrid } from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import { CAMPAIGNS_TABS } from "../../lib/pageTabs";
import NewCampaignDialog from "../../components/campaigns/NewCampaignDialog";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Button, EmptyState } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import {
  CAMPAIGNS_CONTAINER,
  NotConnectedNotice,
  ChannelChip,
  DEMO_TEMPLATES,
  type Channel,
} from "./shared";

// Reusable SMS / email messages the client can drop into any campaign. "Use"
// opens the New campaign flow prefilled. Demo shows a starter set; a real
// session is empty + not-connected.
export default function CampaignsTemplates() {
  const demo = demoMode();
  const { showToast } = useToast();
  const [prefill, setPrefill] = useState<{ ch: Channel; subject?: string; body: string } | null>(null);

  return (
    <Shell>
      <NewCampaignDialog
        open={!!prefill}
        onClose={() => setPrefill(null)}
        initialChannel={prefill?.ch}
        initialSubject={prefill?.subject}
        initialBody={prefill?.body}
      />
      <div className={CAMPAIGNS_CONTAINER}>
        <PageTabs tabs={CAMPAIGNS_TABS} />
        <PageHeader
          title="Templates"
          description="Reusable messages you can drop into any campaign."
          actions={
            <Button
              variant="primary"
              size="md"
              disabled={!demo}
              onClick={() => showToast("Saving custom templates turns on once your account is connected.")}
            >
              <Plus size={16} /> New template
            </Button>
          }
        />

        {!demo && (
          <NotConnectedNotice message="Save a message once and reuse it any time. We'll also stock a few proven ones for your trade once you're connected." />
        )}

        {demo ? (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {DEMO_TEMPLATES.map((t) => (
              <Panel key={t.id} className="flex flex-col overflow-hidden">
                <div className="flex-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <ChannelChip ch={t.ch} />
                    <span className="label-cap">{t.category}</span>
                  </div>
                  <div className="mt-2.5 font-display text-[14.5px] font-semibold text-text">{t.title}</div>
                  <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">{t.body}</p>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-divider bg-surface-2 px-4 py-2.5">
                  <span className="text-[12px] text-faint">Used in 2 campaigns</span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      setPrefill({
                        ch: t.ch,
                        subject: t.ch === "email" ? t.title : undefined,
                        body: t.body,
                      })
                    }
                  >
                    Use
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <Panel className="overflow-hidden">
            <div className="px-4 py-10">
              <EmptyState
                icon={<LayoutGrid size={22} />}
                title="No templates yet"
                description="Save a message once and reuse it any time. A few proven ones for your trade will be here too."
              />
            </div>
          </Panel>
        )}
      </div>
    </Shell>
  );
}

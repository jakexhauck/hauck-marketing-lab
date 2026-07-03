import { useState } from "react";
import { Users, ArrowRight } from "lucide-react";
import Shell from "../../components/Shell";
import { CAMPAIGNS_TABS } from "../../lib/pageTabs";
import AudienceDetailDialog from "../../components/campaigns/AudienceDetailDialog";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { demoMode } from "../../demo/demoMode";
import { useCampaignsAudiences } from "../../hooks/useCampaignsAudiences";
import { CAMPAIGNS_CONTAINER, NotConnectedNotice } from "./shared";
import type { AudienceSegment } from "../../lib/campaignsAudiences";

// Read-only view of the customer lists we can reach when we run a campaign for
// the client. Counts come live from their own contacts (via useCampaignsAudiences);
// a demo session shows the full preview set. A real session with no connected
// list shows the honest done-for-you empty state. Nothing here is client-editable.
export default function CampaignsAudiences() {
  const demo = demoMode();
  const { session } = useAuth();
  const { data } = useCampaignsAudiences(demo || Boolean(session));
  const [detail, setDetail] = useState<AudienceSegment | null>(null);

  const segments = data?.segments ?? [];
  const connected = demo || (!!data && !data.configError && segments.length > 0);

  return (
    <Shell>
      <AudienceDetailDialog audience={detail} onClose={() => setDetail(null)} />
      <div className={CAMPAIGNS_CONTAINER}>
        <PageBar
          tabs={CAMPAIGNS_TABS}
          description="The customer lists we can reach for you. We build these from your customer records."
        />

        {!connected && (
          <NotConnectedNotice message="Once your customer list is linked, we'll build smart lists like 'past customers' and 'due for a tune-up' here automatically." />
        )}

        {connected ? (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {segments.map((a) => (
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
                  {a.count.toLocaleString("en-US")}
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

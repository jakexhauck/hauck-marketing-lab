import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, ChevronRight, Zap } from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import Avatar from "../../components/Avatar";
import { cn } from "../../lib/cn";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import { paidAdsLeads, STATUS_META, type LeadStatus } from "../../lib/leadsHub";
import { NotConnectedNotice } from "./shared";

// Status pill colour. Booked uses a fixed sky so it reads apart from brand indigo.
const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "var(--brand)",
  working: "var(--warning)",
  booked: "#0284c7",
  won: "var(--positive)",
  cold: "var(--faint)",
};

function StatusPill({ status }: { status: LeadStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {STATUS_META[status].label}
    </span>
  );
}

// Every lead that came through paid ads. A plain roster: click a row to open the
// full lead detail and work it. No inline conversation or follow-up tracker.
export default function LeadsPaidAds() {
  const navigate = useNavigate();
  const { leads } = useLeadsHub();
  const ads = useMemo(() => paidAdsLeads(leads), [leads]);

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageTabs tabs={LEADS_TABS} />
        <header className="mb-4">
          <h1 className="font-display text-[19px] font-semibold text-text">Paid Ads</h1>
          <p className="mt-1 text-[13px] text-muted">
            Every lead that came through your paid ads.
          </p>
        </header>

        {ads.length === 0 ? (
          <>
            <div className="mb-5">
              <NotConnectedNotice message="Leads from your paid ads land here automatically once your ad accounts and phone are connected." />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-faint">
                <Zap size={22} />
              </div>
              <p className="mt-3 font-display text-[15px] text-text">No ad leads yet</p>
              <p className="mt-1 max-w-xs text-[13px] text-muted">
                When someone responds to one of your ads, they show up here ready to work.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-display text-sm font-bold text-text">Leads</span>
              <span className="text-[13px] font-semibold text-faint">{ads.length} leads</span>
            </div>
            <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
              {ads.map((lead, i) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/lead/${lead.id}`)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2",
                      i === ads.length - 1 ? "" : "border-b border-divider",
                    )}
                  >
                    <Avatar name={lead.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14.5px] font-bold text-text">
                        {lead.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-faint">
                        <Megaphone size={12} className="shrink-0" />
                        <span className="truncate">{lead.ad}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-faint">{lead.when}</span>
                    <StatusPill status={lead.status} />
                    <ChevronRight size={16} className="shrink-0 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Shell>
  );
}

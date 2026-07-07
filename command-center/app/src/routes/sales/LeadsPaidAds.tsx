import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, ChevronRight } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import Avatar from "../../components/Avatar";
import EmptyState from "../../components/EmptyState";
import { cn } from "../../lib/cn";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import { paidAdsLeads, STATUS_META, type LeadStatus } from "../../lib/leadsHub";

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
        <PageBar
          tabs={LEADS_TABS}
          count={ads.length > 0 ? `${ads.length} ${ads.length === 1 ? "lead" : "leads"}` : undefined}
          description="Every lead that came through your paid ads."
        />

        {ads.length === 0 ? (
          <EmptyState message="When someone responds to one of your ads, they show up here ready to work." />
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

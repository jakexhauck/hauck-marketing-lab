import { useMemo, useState } from "react";
import { Phone } from "lucide-react";
import Avatar from "../Avatar";
import { cn } from "../../lib/cn";
import { useAdsTrackerQuery } from "../../hooks/useApi";
import { selfDialStats, sortNewestFirst } from "../../lib/selfDialLeads";
import { STATUS_META, formatLeadDate } from "../../routes/paid-ads/trackerShared";
import type { LeadTrackerLead } from "../../lib/api";
import SelfDialOutcomeModal from "./SelfDialOutcomeModal";

// The Leads page for a client who rings their own leads (tenants
// .manual_lead_status, switched in the admin client sheet). Every lead that
// submitted, newest first; tap one and say what happened.
//
// The rows are the Lead Tracker's own payload over its widest range, so what the
// owner records here is the same status the Lead Tracker, the ads KPIs and the
// admin Ad Tracker read. One store, three screens, nothing to keep in sync.

export default function SelfDialLeadsBoard() {
  const query = useAdsTrackerQuery("maximum", "ad");
  const [openId, setOpenId] = useState<string | null>(null);

  const leads = useMemo(() => sortNewestFirst(query.data?.leads ?? []), [query.data]);
  const stats = selfDialStats(leads);
  const selected = leads.find((l) => l.contactId === openId) ?? null;

  return (
    <>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-5 pb-6 pt-4 lg:px-6">
        {!query.isLoading && !query.isError && (
          <div className="mb-3 grid shrink-0 grid-cols-3 overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] lg:max-w-md">
            <ScoreCell value={String(stats.total)} label="Leads" />
            <ScoreCell
              value={String(stats.untouched)}
              label="New"
              tone={stats.untouched > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
              divider
            />
            <ScoreCell
              value={
                stats.revenue > 0
                  ? `${stats.won} · $${stats.revenue.toLocaleString()}`
                  : String(stats.won)
              }
              label="Won"
              tone="text-emerald-600 dark:text-emerald-400"
              divider
            />
          </div>
        )}

        {query.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load leads.
          </div>
        ) : query.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
              aria-hidden
            />
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]",
              leads.length > 0 && "flex-1",
            )}
          >
            {leads.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-[var(--text-muted)]">
                No leads yet.
              </div>
            ) : (
              <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {leads.map((l, i) => (
                  <LeadRow
                    key={l.contactId}
                    lead={l}
                    active={l.contactId === openId}
                    last={i === leads.length - 1}
                    onOpen={() => setOpenId(l.contactId)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {selected && <SelfDialOutcomeModal lead={selected} onClose={() => setOpenId(null)} />}
    </>
  );
}

function LeadRow({
  lead,
  active,
  last,
  onOpen,
}: {
  lead: LeadTrackerLead;
  active: boolean;
  last: boolean;
  onOpen: () => void;
}) {
  const meta = STATUS_META[lead.status];
  const chip =
    lead.status === "won" && lead.value ? `${meta.label} · $${lead.value.toLocaleString()}` : meta.label;

  // Two targets, side by side rather than nested: the row opens "what
  // happened", the phone button rings them. A link inside the row button would
  // be invalid markup and a phone tap that also opened the sheet.
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 transition-colors",
        active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]",
        !last && "border-b border-[var(--divider)]",
      )}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={lead.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-[14.5px] font-bold text-[var(--text)]">
              {lead.name}
            </span>
            <span className="shrink-0 text-[12px] font-medium text-[var(--text-faint)]">
              {formatLeadDate(lead.createdAt)}
            </span>
          </div>
          {lead.phone && (
            <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)] tnum">{lead.phone}</div>
          )}
          <div className="mt-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", meta.chip)}>{chip}</span>
          </div>
        </div>
      </button>
      {lead.phone && (
        <a
          href={`tel:${lead.phone}`}
          aria-label={`Call ${lead.name}`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--brand-text)] transition-colors hover:bg-[var(--brand-tint)]"
        >
          <Phone size={17} strokeWidth={2.2} />
        </a>
      )}
    </li>
  );
}

function ScoreCell({
  value,
  label,
  tone = "text-[var(--text)]",
  divider = false,
}: {
  value: string;
  label: string;
  tone?: string;
  divider?: boolean;
}) {
  return (
    <div className={cn("min-w-0 px-2 py-2.5 text-center", divider && "border-l border-[var(--divider)]")}>
      <div className={cn("truncate text-[16px] font-semibold tnum", tone)}>{value}</div>
      <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

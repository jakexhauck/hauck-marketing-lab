import { cn } from "../../../lib/cn";
import { formatMoneyExact } from "../../../lib/formatMoney";
import type { LeadTrackerLead, LeadTrackerWhen } from "../../../lib/api";
import {
  STATUS_META,
  formatLeadDate,
  formatWhen,
  isOverdue,
} from "../../../routes/paid-ads/trackerShared";

// The Paid Ads Lead Tracker table: every ad lead, newest first, with the ad
// that earned it and a status that follows the pipeline automatically (the
// sheet made the owner type it; the app derives it).
//
// Rendered by BOTH the client's own page and the admin cockpit's Paid Ads >
// Lead Tracker tab. The controls above it (range, search) belong to whichever
// app is hosting the table, because the two put their controls in different
// chrome; the rows themselves are one component so they cannot drift.

// The When cell. An appointment prints its time plainly; an overdue follow-up
// is called out, because a follow-up that has slipped is the row on this page
// worth acting on. Nothing booked and no task yet reads "-", never a guess.
function WhenCell({ when }: { when: LeadTrackerWhen | null }) {
  const text = when ? formatWhen(when.at) : "";
  if (!text) return <span className="text-faint">-</span>;
  const overdue = when!.kind === "follow_up" && isOverdue(when!.at);
  return (
    <span
      className={cn("tnum", overdue ? "font-semibold text-warning" : "text-text")}
      title={when!.label}
    >
      {text}
      {overdue && <span className="ml-1.5 text-[11px] font-semibold">overdue</span>}
    </span>
  );
}

export default function LeadTrackerTable({
  leads,
  emptyLabel,
  sampleNotice = false,
}: {
  leads: LeadTrackerLead[];
  emptyLabel: string;
  // Badges the list as illustrative. The client page turns this on for its
  // DEV-only sample set; the cockpit never does, because an operator reading
  // fabricated leads for a named client is worse than an empty table.
  sampleNotice?: boolean;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-[13px] text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {sampleNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
          <span className="inline-flex rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-semibold">
            Sample data
          </span>
          This is what your leads will look like. Real leads replace it automatically as they come
          in.
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-faint">
              <th className="px-3 py-2.5 text-left font-semibold">Date</th>
              <th className="px-3 py-2.5 text-left font-semibold">Lead</th>
              <th className="px-3 py-2.5 text-left font-semibold">Phone</th>
              <th className="px-3 py-2.5 text-left font-semibold">Email</th>
              <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              <th className="px-3 py-2.5 text-left font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const status = STATUS_META[lead.status];
              return (
                <tr
                  key={lead.contactId}
                  className="border-b border-border/60 last:border-b-0 hover:bg-surface"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-faint tnum">
                    {formatLeadDate(lead.createdAt)}
                  </td>
                  <td className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 font-medium text-text">
                    {lead.name}
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5">
                    <div className="truncate text-text">{lead.phone || "-"}</div>
                  </td>
                  <td className="max-w-[240px] px-3 py-2.5">
                    <div className="truncate text-text">{lead.email || "-"}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        status.chip,
                      )}
                    >
                      {status.label}
                    </span>
                    {lead.status === "won" && lead.value > 0 && (
                      <span className="ml-2 font-semibold text-text tnum">
                        {formatMoneyExact(lead.value)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <WhenCell when={lead.when} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

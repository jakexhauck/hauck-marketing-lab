import { useEffect, useState } from "react";
import { cn } from "../../../lib/cn";
import { formatMoneyExact } from "../../../lib/formatMoney";
import {
  MANUAL_LEAD_STATUSES,
  type LeadTrackerLead,
  type LeadTrackerWhen,
  type ManualLeadStatus,
} from "../../../lib/api";
import {
  STATUS_META,
  formatLeadDate,
  formatWhen,
  isOverdue,
} from "../../../routes/paid-ads/trackerShared";

// What a row can be marked with, on a business that works its own leads. Null
// everywhere else, which is what turns every cell below read-only.
export interface LeadMarking {
  onStatus: (contactId: string, status: ManualLeadStatus) => void;
  onJobValue: (contactId: string, value: string) => void;
}

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

// The status chip, shared by the card and the table so the two can never colour
// a status differently.
function StatusChip({ status }: { status: LeadTrackerLead["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.chip,
      )}
    >
      {meta.label}
    </span>
  );
}

// The same chip, except it is a dropdown.
//
// It deliberately does not announce itself with a border or a field background:
// this is a dense table an owner reads down at a glance, and eight editable
// boxes per screen would make the table louder than the leads in it. It reads
// as the status until you go near it, when a ring and a caret say it will move.
// Native select, so the phone gets its own wheel and the keyboard works for free.
function StatusSelect({
  status,
  onChange,
}: {
  status: LeadTrackerLead["status"];
  onChange: (next: ManualLeadStatus) => void;
}) {
  const meta = STATUS_META[status];
  return (
    <span className="relative inline-flex">
      <select
        aria-label="Lead status"
        value={status}
        onChange={(e) => onChange(e.target.value as ManualLeadStatus)}
        className={cn(
          "cursor-pointer appearance-none rounded-full py-0.5 pl-2 pr-6 text-[11px] font-semibold",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          "hover:ring-1 hover:ring-border",
          meta.chip,
        )}
      >
        {MANUAL_LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 opacity-60"
      >
        <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

// The job value, typed straight onto the row once a lead is Won.
//
// Only Won, because that is the only point at which the number exists. Showing
// it on every row would ask an owner to value a job nobody has done yet, and an
// empty money box next to a lead they have not even rung is noise.
//
// Commits on blur and on Enter, not on every keystroke: this writes to the
// revenue ledger the Dashboard divides ad spend by, and a save per character
// would file "4", "45" and "450" as three different answers.
function JobValueCell({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (raw: string) => void;
}) {
  const asText = value === null ? "" : String(value);
  const [draft, setDraft] = useState(asText);

  // The server is the truth. If it comes back with something else (another
  // device, a rejected value), the field follows it rather than sitting on a
  // number that was never saved.
  useEffect(() => setDraft(asText), [asText]);

  const commit = () => {
    if (draft.trim() === asText.trim()) return;
    onCommit(draft);
  };

  return (
    <span className="inline-flex items-center">
      <span className="text-faint">$</span>
      <input
        inputMode="decimal"
        aria-label="Job value"
        value={draft}
        placeholder="Add"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(asText);
        }}
        className={cn(
          "w-16 bg-transparent px-0.5 text-[12px] font-semibold text-text tnum",
          "placeholder:font-normal placeholder:text-faint",
          "rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          "hover:ring-1 hover:ring-border",
        )}
      />
    </span>
  );
}

// One lead as a card, for phone widths.
//
// The table is six columns at min-w-[760px] inside a ~408px phone column, so it
// spent its life scrolled sideways: the client could read a name or a status,
// never both at once. Cards drop the horizontal scroll entirely.
//
// Ordered by what the client actually does with the row rather than by the
// table's column order: who it is and where they are in the pipeline first, then
// how to reach them (phone above email, because these leads get called), then
// the dates. Phone and email are real tel:/mailto: links here, which the table
// never bothered with because a desktop user has the number in their CRM
// anyway; on a phone, tapping the number IS the next action.
function LeadCard({ lead, marking }: { lead: LeadTrackerLead; marking?: LeadMarking }) {
  const when = lead.when ? formatWhen(lead.when.at) : "";
  const overdue = Boolean(lead.when && lead.when.kind === "follow_up" && isOverdue(lead.when.at));
  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">
          {lead.name}
        </span>
        {marking ? (
          <StatusSelect
            status={lead.status}
            onChange={(next) => marking.onStatus(lead.contactId, next)}
          />
        ) : (
          <StatusChip status={lead.status} />
        )}
      </div>

      {lead.status === "won" &&
        (marking ? (
          <div className="mt-1.5 flex items-center gap-1 text-[13px]">
            <span className="text-muted">Job value</span>
            <JobValueCell
              value={lead.value}
              onCommit={(raw) => marking.onJobValue(lead.contactId, raw)}
            />
          </div>
        ) : (
          (lead.value ?? 0) > 0 && (
            <div className="mt-1 text-[13px] font-semibold text-positive tnum">
              {formatMoneyExact(lead.value as number)}
            </div>
          )
        ))}

      <div className="mt-2 flex flex-col gap-1 text-[13px]">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="truncate text-brand tnum">
            {lead.phone}
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="truncate text-brand">
            {lead.email}
          </a>
        )}
        {!lead.phone && !lead.email && (
          <span className="text-faint">No phone or email on this lead.</span>
        )}
      </div>

      {/* The two dates read as a sentence rather than as two unlabelled cells:
          on the card there is no column header above them to say which is
          which. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-2 text-[12px]">
        <span className="text-faint tnum">Came in {formatLeadDate(lead.createdAt)}</span>
        {when && (
          <>
            <span className="text-faint" aria-hidden>
              ·
            </span>
            <span
              className={cn("tnum", overdue ? "font-semibold text-warning" : "text-muted")}
              title={lead.when!.label}
            >
              {lead.when!.kind === "follow_up" ? "Follow up" : "Booked"} {when}
              {overdue && " (overdue)"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default function LeadTrackerTable({
  leads,
  emptyLabel,
  sampleNotice = false,
  marking,
}: {
  leads: LeadTrackerLead[];
  emptyLabel: string;
  // Present only on a business that marks its own leads. Absent leaves every
  // cell exactly as it was: a read-only chip, derived from the pipeline.
  marking?: LeadMarking;
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
      {/* Phone: a card per lead, no horizontal scroll. shrink-0 because this is
          a child of a flex column with min-h-0 and would otherwise be squashed
          rather than scrolled to (the bug that once sliced Paid Ads Results in
          half). */}
      <div className="flex shrink-0 flex-col gap-2 lg:hidden">
        {leads.map((lead) => (
          <LeadCard key={lead.contactId} lead={lead} marking={marking} />
        ))}
      </div>

      {/* Desktop: the sheet's table, unchanged. */}
      <div className="hidden shrink-0 overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-faint">
              <th className="px-3 py-2.5 text-left font-semibold">Date</th>
              <th className="px-3 py-2.5 text-left font-semibold">Lead</th>
              <th className="px-3 py-2.5 text-left font-semibold">Phone</th>
              <th className="px-3 py-2.5 text-left font-semibold">Email</th>
              <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              {/* Its own column rather than a number tucked beside the status:
                  it is a box to type in, and a typeable cell hiding inside
                  another cell is not findable. */}
              {marking && <th className="px-3 py-2.5 text-left font-semibold">Job value</th>}
              <th className="px-3 py-2.5 text-left font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
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
                    {marking ? (
                      <StatusSelect
                        status={lead.status}
                        onChange={(next) => marking.onStatus(lead.contactId, next)}
                      />
                    ) : (
                      <>
                        <StatusChip status={lead.status} />
                        {lead.status === "won" && (lead.value ?? 0) > 0 && (
                          <span className="ml-2 font-semibold text-text tnum">
                            {formatMoneyExact(lead.value as number)}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  {marking && (
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {lead.status === "won" ? (
                        <JobValueCell
                          value={lead.value}
                          onCommit={(raw) => marking.onJobValue(lead.contactId, raw)}
                        />
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </td>
                  )}
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

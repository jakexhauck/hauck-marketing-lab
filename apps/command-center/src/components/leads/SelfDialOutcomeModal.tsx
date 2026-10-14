import { useState } from "react";
import {
  X,
  Check,
  PhoneMissed,
  PhoneCall,
  Clock3,
  CalendarClock,
  FileText,
  Trophy,
  CircleX,
} from "lucide-react";
import Avatar from "../Avatar";
import { cn } from "../../lib/cn";
import { useMarkLead } from "../../hooks/useApi";
import { STATUS_META, formatLeadDate } from "../../routes/paid-ads/trackerShared";
import type { LeadTrackerLead, ManualLeadStatus } from "../../lib/api";

// "What happened?" on a self-dial lead. One tap records it; Won opens a box for
// the job's dollar value first, since that is what Revenue and ROAS sum.
//
// New is not offered: it is what a lead reads before anyone has touched it, and
// a mis-tap is fixed by tapping the right answer, not by going back to New.

type Answer = Exclude<ManualLeadStatus, "new">;

const ANSWERS: { status: Answer; Icon: typeof Check; tint: string }[] = [
  { status: "no_answer", Icon: PhoneMissed, tint: "text-[var(--text-muted)]" },
  { status: "contacted", Icon: PhoneCall, tint: "text-[var(--brand-text)]" },
  { status: "follow_up", Icon: Clock3, tint: "text-amber-600 dark:text-amber-400" },
  { status: "appointment_booked", Icon: CalendarClock, tint: "text-[var(--brand-text)]" },
  { status: "quoted", Icon: FileText, tint: "text-sky-600 dark:text-sky-400" },
  { status: "won", Icon: Trophy, tint: "text-emerald-600 dark:text-emerald-400" },
  { status: "lost", Icon: CircleX, tint: "text-rose-600 dark:text-rose-400" },
];

export default function SelfDialOutcomeModal({
  lead,
  onClose,
}: {
  lead: LeadTrackerLead;
  onClose: () => void;
}) {
  const mark = useMarkLead();
  const [wonOpen, setWonOpen] = useState(false);
  const [value, setValue] = useState(lead.value ? String(lead.value) : "");

  const record = (status: Answer, jobValue?: string) =>
    mark.mutate(
      { contactId: lead.contactId, status, ...(jobValue !== undefined ? { jobValue } : {}) },
      { onSuccess: onClose },
    );

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`What happened with ${lead.name}`}
        className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-[var(--radius-xl,20px)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <Avatar name={lead.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[17px] font-bold text-[var(--text)]">{lead.name}</div>
            <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)] tnum">
              {[lead.phone, formatLeadDate(lead.createdAt)].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-2 font-display text-[13px] font-semibold text-[var(--text)]">What happened?</div>

        <div className="px-2 pb-4">
          {ANSWERS.map(({ status, Icon, tint }) => {
            const active = lead.status === status;
            return (
              <div key={status}>
                <button
                  type="button"
                  disabled={mark.isPending}
                  onClick={() => (status === "won" ? setWonOpen((o) => !o) : record(status))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors disabled:opacity-50",
                    active || (status === "won" && wonOpen) ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]",
                  )}
                >
                  <Icon size={18} strokeWidth={2.2} className={tint} />
                  <span className="flex-1 font-display text-[14.5px] font-bold text-[var(--text)]">
                    {STATUS_META[status].label}
                  </span>
                  {active && <Check size={16} className="text-[var(--brand-text)]" />}
                </button>

                {status === "won" && wonOpen && (
                  <form
                    className="mb-1 ml-3 mt-1 flex items-center gap-2 rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--brand-tint)] px-3 py-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      record("won", value.trim() === "" ? undefined : value);
                    }}
                  >
                    <span className="text-[13px] font-semibold text-[var(--text)]">$</span>
                    <input
                      autoFocus
                      inputMode="decimal"
                      aria-label="Job value"
                      placeholder="Job value"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[14px] text-[var(--text)] tnum focus:border-[var(--brand-primary)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={mark.isPending}
                      className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                  </form>
                )}
              </div>
            );
          })}

          {mark.isError && (
            <p className="px-3 pt-2 text-[12.5px] font-medium text-rose-600 dark:text-rose-400">
              That did not save. Try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

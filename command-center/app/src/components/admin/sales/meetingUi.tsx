import { useState } from "react";
import { CalendarX, Check, HandCoins, Repeat, ThumbsDown } from "lucide-react";
import type { SalesMeeting } from "../../../lib/api";
import { useToast } from "../../../context/ToastContext";
import { SALES_CALL_OUTCOMES, totalsFor, type SalesCallOutcome } from "../../../../functions/lib/salesCalls";

// The parts Cold Call > Booked and Sales > Sales Calls both draw.
//
// They are two ends of one record: a caller sees the meetings they set, Jake
// sees every meeting on the calendar. The buttons, the funnel and the wording
// must be identical between them, because they are recording the same fact into
// the same column, and a "Showed, closed" that looks like a different button on
// a different page is how two people end up believing two numbers.
//
// The counting rules come from functions/lib/salesCalls.ts, not from here.

// The four buttons, in the order somebody thinks: did they turn up, and then
// what happened. Leading three of them with "Showed" is deliberate. Turning up
// and buying are different facts, and a label that blurs them is how a show rate
// quietly becomes a close rate.
export const CHOICES: {
  outcome: SalesCallOutcome;
  label: string;
  icon: typeof Check;
}[] = [
  { outcome: "closed", label: "Showed, closed", icon: HandCoins },
  { outcome: "follow_up", label: "Showed, needs another", icon: Repeat },
  { outcome: "not_a_fit", label: "Showed, not a fit", icon: ThumbsDown },
  { outcome: "no_show", label: "No-showed", icon: CalendarX },
];

export const OUTCOME_TONE: Record<SalesCallOutcome, string> = {
  closed: "var(--positive)",
  follow_up: "var(--brand)",
  not_a_fit: "var(--text-muted)",
  no_show: "var(--warning)",
};

export function whenLabel(iso: string | null): string {
  if (!iso) return "No time set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No time set";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function money(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// An em rule rather than 0%: nothing decided yet is not a rate of zero.
export function percent(rate: number | null): string {
  return rate === null ? "--" : `${Math.round(rate * 100)}%`;
}

// Booked -> showed -> closed, with the two rates drawn as the links BETWEEN the
// numbers rather than as tiles of their own. A rate is a relationship between
// two counts, not a third count, and a row of five equal cards would say the
// opposite of that.
export function Funnel({
  totals,
  awaiting,
}: {
  totals: ReturnType<typeof totalsFor>;
  awaiting: number;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-1 gap-y-3 rounded-[var(--radius-lg)] border border-border px-5 py-4">
      <Step value={totals.booked} label="Booked" />
      <Link value={percent(totals.showRate)} label="showed" />
      <Step value={totals.showed} label="Showed" />
      <Link value={percent(totals.closeRate)} label="closed" />
      <Step value={totals.closed} label="Closed" />

      <div className="ml-auto flex items-end gap-6">
        {/* Only when there are any. A zero here would read as a standing
            reproach rather than a job to do. Same words as the section heading
            below, because it is the same pile of rows. */}
        {awaiting > 0 && <Step value={awaiting} label="Needs an answer" muted />}
        <div>
          <div className="text-[22px] font-semibold leading-none tabular-nums">
            {money(totals.cash)}
          </div>
          <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">
            Cash collected
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div className="min-w-[76px]">
      <div
        className={`text-[26px] font-semibold leading-none tabular-nums${muted ? " text-muted" : ""}`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function Link({ value, label }: { value: string; label: string }) {
  return (
    <div className="mb-1.5 px-2 text-center">
      <div className="text-[13px] font-semibold tabular-nums text-muted">{value}</div>
      <div className="text-[10.5px] tracking-wide text-faint">{label}</div>
    </div>
  );
}

export interface RecordOutcome {
  isPending: boolean;
  mutateAsync: (input: {
    id: string;
    outcome: SalesCallOutcome;
    followUpAt?: string;
    cashCollected?: number | null;
  }) => Promise<unknown>;
}

export function MeetingRow({
  meeting,
  recordable = false,
  record,
  // Drawn under the name on the Sales page: where this meeting came from and
  // where its card ended up. Cold Call's own page leaves it off, because there
  // every row came from the same place.
  showProvenance = false,
}: {
  meeting: SalesMeeting;
  recordable?: boolean;
  record: RecordOutcome;
  showProvenance?: boolean;
}) {
  const { showToast } = useToast();
  // Which outcome is mid-answer, when it needs a second fact before it can be
  // saved. Null the rest of the time, which is most of the time.
  const [pending, setPending] = useState<SalesCallOutcome | null>(null);
  const [detail, setDetail] = useState("");

  const meta = meeting.outcome ? SALES_CALL_OUTCOMES[meeting.outcome] : null;

  const submit = async (outcome: SalesCallOutcome, value: string) => {
    try {
      await record.mutateAsync({
        id: meeting.id,
        outcome,
        followUpAt: outcome === "follow_up" ? value : undefined,
        cashCollected: outcome === "closed" ? (value === "" ? null : Number(value)) : undefined,
      });
      showToast(`${meeting.prospectName || "Meeting"}: ${SALES_CALL_OUTCOMES[outcome].label}`);
      setPending(null);
      setDetail("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not record that");
    }
  };

  const choose = (outcome: SalesCallOutcome) => {
    // A close and a follow-up each need one more fact before they mean
    // anything, so they open a field rather than saving half an answer.
    if (outcome === "closed" || outcome === "follow_up") {
      setPending(outcome);
      setDetail("");
      return;
    }
    void submit(outcome, "");
  };

  const cancelled = /cancel/i.test(meeting.appointmentStatus);

  return (
    <div className="pk-li !flex-col !items-stretch gap-2">
      <div className="flex w-full items-center gap-3">
        <div className="pk-li-main">
          <div className="pk-li-label">
            {meeting.prospectName || "Unnamed prospect"}
            {meeting.businessName ? (
              <span className="ml-2 text-[12px] font-normal text-muted">
                {meeting.businessName}
              </span>
            ) : null}
          </div>
          <div className="pk-li-sub font-mono">{meeting.phone || "No number"}</div>
          {showProvenance && <Provenance meeting={meeting} />}
        </div>
        <div className="pk-li-meta">
          <div style={{ textAlign: "right" }}>
            <div className="text-[13px] font-semibold">
              {whenLabel(meeting.scheduledAt)}
              {/* Cancelled is a fact about the CALENDAR, not about the call. It
                  sits beside the time rather than in the outcome column, which
                  belongs to what happened in the room. */}
              {cancelled && (
                <span className="ml-2 text-[11.5px] font-semibold text-[var(--warning)]">
                  Cancelled
                </span>
              )}
            </div>
            {meta && meeting.outcome ? (
              <div
                className="text-[12px] font-semibold"
                style={{ color: OUTCOME_TONE[meeting.outcome] }}
              >
                {meta.label}
                {meeting.outcome === "closed" && meeting.cashCollected
                  ? ` · ${money(meeting.cashCollected)}`
                  : ""}
                {meeting.outcome === "follow_up" && meeting.followUpAt
                  ? ` · back ${new Date(meeting.followUpAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}`
                  : ""}
              </div>
            ) : (
              <div className="text-[12px] text-muted">Nothing recorded</div>
            )}
          </div>
        </div>
      </div>

      {recordable && pending === null && (
        <div className="flex flex-wrap gap-1.5">
          {CHOICES.map((c) => {
            const Icon = c.icon;
            const on = meeting.outcome === c.outcome;
            return (
              <button
                key={c.outcome}
                type="button"
                disabled={record.isPending}
                onClick={() => choose(c.outcome)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                  on
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:text-text",
                ].join(" ")}
              >
                <Icon size={13} aria-hidden />
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {pending !== null && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(pending, detail);
          }}
        >
          <label className="text-[12px] text-muted" htmlFor={`detail-${meeting.id}`}>
            {pending === "closed" ? "Cash collected on the call" : "Come back on"}
          </label>
          <input
            id={`detail-${meeting.id}`}
            className="pk-input !w-auto"
            type={pending === "closed" ? "number" : "date"}
            min={pending === "closed" ? "0" : undefined}
            step={pending === "closed" ? "1" : undefined}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="pk-btn-save"
            disabled={record.isPending || (pending === "follow_up" && !detail)}
          >
            {record.isPending ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="pk-btn-cancel"
            onClick={() => {
              setPending(null);
              setDetail("");
            }}
          >
            Cancel
          </button>
          {pending === "closed" && (
            <span className="text-[11.5px] text-faint">
              Leave it blank if nothing was taken on the call itself.
            </span>
          )}
        </form>
      )}
    </div>
  );
}

// Where the meeting came from, and where its card is now.
//
// This line is the only thing on the page that admits the app is not the whole
// story. A meeting adopted off the calendar and a meeting a caller booked look
// identical otherwise, and a routing that failed is invisible unless it says so.
function Provenance({ meeting }: { meeting: SalesMeeting }) {
  const parts: string[] = [];
  parts.push(meeting.source === "Calendar" ? "From the calendar" : meeting.source || "Cold call");
  if (meeting.crmStage) parts.push(meeting.crmStage);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-faint">
      <span>{parts.join(" · ")}</span>
      {meeting.crmError && (
        <span className="font-semibold text-[var(--warning)]">{meeting.crmError}</span>
      )}
      {!meeting.crmError && !meeting.opportunityId && meeting.outcome && (
        <span className="text-muted">Not on the pipeline</span>
      )}
    </div>
  );
}

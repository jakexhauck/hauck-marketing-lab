import { useMemo, useState } from "react";
import { CalendarX, Check, HandCoins, Repeat, ThumbsDown } from "lucide-react";
import type { SalesMeeting } from "../../../lib/api";
import { useSalesMeetingsQuery, useRecordMeetingOutcome } from "../../../hooks/useColdCall";
import { useToast } from "../../../context/ToastContext";
import {
  SALES_CALL_OUTCOMES,
  groupFor,
  totalsFor,
  type SalesCallOutcome,
} from "../../../../functions/lib/salesCalls";

// Cold Call > Booked: the meetings he set, and what became of them.
//
// This page used to end at "Already happened", which meant the app knew a
// meeting had been booked and never knew whether anybody turned up. A booking is
// not the result; it is the second-to-last step, and the step after it is the
// only one that says whether the dialing was worth doing.
//
// So the page is ordered by what is WORK rather than by what is chronological.
// Meetings whose slot has passed with nothing recorded come first, because they
// are the only rows anybody has to do something about. Upcoming and finished
// meetings are records, and records go underneath.
//
// The counting rules come from functions/lib/salesCalls.ts rather than being
// rewritten here, the same arrangement CallWorkspace has with the dial outcomes,
// so a show rate means one thing in exactly one place.

// The four buttons, in the order somebody thinks: did they turn up, and then
// what happened. Leading three of them with "Showed" is deliberate. Turning up
// and buying are different facts, and a label that blurs them is how a show rate
// quietly becomes a close rate.
const CHOICES: {
  outcome: SalesCallOutcome;
  label: string;
  icon: typeof Check;
}[] = [
  { outcome: "closed", label: "Showed, closed", icon: HandCoins },
  { outcome: "follow_up", label: "Showed, needs another", icon: Repeat },
  { outcome: "not_a_fit", label: "Showed, not a fit", icon: ThumbsDown },
  { outcome: "no_show", label: "No-showed", icon: CalendarX },
];

const OUTCOME_TONE: Record<SalesCallOutcome, string> = {
  closed: "var(--positive)",
  follow_up: "var(--brand)",
  not_a_fit: "var(--text-muted)",
  no_show: "var(--warning)",
};

function whenLabel(iso: string | null): string {
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

function money(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// An em rule rather than 0%: nothing decided yet is not a rate of zero.
function percent(rate: number | null): string {
  return rate === null ? "--" : `${Math.round(rate * 100)}%`;
}

// callerId "" means everyone; otherwise one person's booked meetings.
export default function ColdCallBooked({ callerId = "" }: { callerId?: string }) {
  const query = useSalesMeetingsQuery(callerId);
  const meetings = useMemo(() => query.data?.meetings ?? [], [query.data]);

  const { awaiting, upcoming, recorded, totals } = useMemo(() => {
    const now = Date.now();
    const countable = meetings.map((m) => ({
      scheduledAt: m.scheduledAt,
      outcome: m.outcome,
      cashCollected: m.cashCollected,
    }));
    const bucket = (name: string) =>
      meetings.filter((_m, i) => groupFor(countable[i], now) === name);
    return {
      awaiting: bucket("awaiting"),
      // The list arrives newest first, which for meetings still to come means
      // furthest away first. Reversed, so the next one is at the top.
      upcoming: bucket("upcoming").slice().reverse(),
      recorded: bucket("recorded"),
      totals: totalsFor(countable),
    };
  }, [meetings]);

  if (query.isLoading) return <div className="pk-empty">Loading meetings...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load meetings. Reload to try again.</div>;
  }
  if (meetings.length === 0) {
    return (
      <div className="pk-empty">
        No meetings booked yet. They land here when a call ends in &quot;Booked&quot;.
      </div>
    );
  }

  return (
    <div>
      {/* The strip counts what is OVERDUE an answer, not everything undecided.
          A meeting three days out is undecided too, and calling it "still to
          record" would be nagging somebody about the future. */}
      <Funnel totals={totals} awaiting={awaiting.length} />

      {awaiting.length > 0 && (
        <>
          <div className="pk-list-sec-h">Needs an answer ({awaiting.length})</div>
          <div className="pk-list">
            {awaiting.map((m) => (
              <MeetingRow key={m.id} meeting={m} recordable />
            ))}
          </div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="pk-list-sec-h">Coming up</div>
          <div className="pk-list">
            {upcoming.map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </div>
        </>
      )}

      {recorded.length > 0 && (
        <>
          <div className="pk-list-sec-h">Recorded</div>
          <div className="pk-list">
            {recorded.map((m) => (
              <MeetingRow key={m.id} meeting={m} recordable />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Booked -> showed -> closed, with the two rates drawn as the links BETWEEN the
// numbers rather than as tiles of their own. A rate is a relationship between
// two counts, not a third count, and a row of five equal cards would say the
// opposite of that.
function Funnel({
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

function MeetingRow({
  meeting,
  recordable = false,
}: {
  meeting: SalesMeeting;
  recordable?: boolean;
}) {
  const { showToast } = useToast();
  const record = useRecordMeetingOutcome();
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

  return (
    <div className="pk-li !flex-col !items-stretch gap-2">
      <div className="flex w-full items-center gap-3">
        <div className="pk-li-main">
          <div className="pk-li-label">{meeting.prospectName || "Unnamed prospect"}</div>
          <div className="pk-li-sub font-mono">{meeting.phone || "No number"}</div>
        </div>
        <div className="pk-li-meta">
          <div style={{ textAlign: "right" }}>
            <div className="text-[13px] font-semibold">{whenLabel(meeting.scheduledAt)}</div>
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

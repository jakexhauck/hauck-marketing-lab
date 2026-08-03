import { useState } from "react";
import {
  CalendarX,
  Check,
  CircleSlash,
  HandCoins,
  Headphones,
  Repeat,
  ThumbsDown,
} from "lucide-react";
import type { SalesMeeting } from "../../../lib/api";
import { routeFor } from "../../../../functions/lib/salesPipeline";
import { useToast } from "../../../context/ToastContext";
import {
  SALES_CALL_OUTCOMES,
  SALES_NO_REASONS,
  SALES_NO_REASON_KEYS,
  contractValue,
  parseDeal,
  daysLate,
  sourceLabel,
  totalsFor,
  type SalesCallOutcome,
  type SalesNoReason,
} from "../../../../functions/lib/salesCalls";
import {
  OFFER_FAMILIES,
  cashLabelFor,
  collectsFor,
  offerVariant,
  variantsOfFamily,
  type OfferFamilyId,
  type OfferUnit,
} from "../../../../functions/lib/salesOffers";

// The parts Cold Call > Booked and Sales > Sales Calls both draw.
//
// They are two ends of one record: a caller sees the meetings they set, Jake
// sees every meeting on the calendar. The buttons, the funnel and the wording
// must be identical between them, because they are recording the same fact into
// the same column, and a "Showed, closed" that looks like a different button on
// a different page is how two people end up believing two numbers.
//
// The counting rules come from functions/lib/salesCalls.ts, not from here.

// The five buttons, NAMED AFTER THE STAGES THEY LAND IN.
//
// They used to read "Showed, closed" / "Showed, not a fit". That described what
// happened in the room, which sounds right until you look at the board beside
// it: a button called "Showed, not a fit" puts a card in a column called
// "Not Interested/Unqualified", so anybody reading both has to hold two
// vocabularies for one thing and guess at the mapping. Now the button says the
// column, verbatim (functions/lib/salesPipeline.ts:ROUTES.label), and pressing
// "New Client" is visibly the thing that makes a New Client.
//
// Order is the funnel, best to worst, so the row reads as a slide down it
// rather than as five equal options.
//
// "No-Close" and "Not Interested/Unqualified" are deliberately separate. Both
// are a no, but one heard the pitch and did not buy and the other was never a
// prospect. Merging them makes the close rate look worse than it is and hides
// whether the problem is the pitch or the list.
export interface OutcomeChoice {
  outcome: SalesCallOutcome;
  label: string;
  icon: typeof Check;
  tone: string;
}

// The four outcomes where somebody turned up. Grouped, because the labels no
// longer say "Showed" and that distinction is the one the show rate is built
// on: it needs to survive the rename.
export const SHOWED_CHOICES: OutcomeChoice[] = [
  { outcome: "closed", label: routeFor("closed").label, icon: HandCoins, tone: "var(--positive)" },
  { outcome: "follow_up", label: routeFor("follow_up").label, icon: Repeat, tone: "var(--brand)" },
  {
    outcome: "not_interested",
    label: routeFor("not_interested").label,
    icon: CircleSlash,
    tone: "var(--danger)",
  },
  {
    outcome: "not_qualified",
    label: routeFor("not_qualified").label,
    icon: ThumbsDown,
    tone: "var(--text-muted)",
  },
];

// The one where they did not.
export const NO_SHOW_CHOICE: OutcomeChoice = {
  outcome: "no_show",
  label: routeFor("no_show").label,
  icon: CalendarX,
  tone: "var(--warning)",
};

export const CHOICES: OutcomeChoice[] = [...SHOWED_CHOICES, NO_SHOW_CHOICE];

export const OUTCOME_TONE: Record<SalesCallOutcome, string> = Object.fromEntries(
  CHOICES.map((c) => [c.outcome, c.tone]),
) as Record<SalesCallOutcome, string>;

// What a recorded outcome is called on screen: the same stage name the button
// said, so the row reads identically before and after it is answered.
export function outcomeLabel(outcome: SalesCallOutcome): string {
  return routeFor(outcome).label;
}

// One outcome button. The icon carries the colour so the row reads as a funnel
// (green through amber) while every label stays the plain stage name; colouring
// the whole button five different ways would turn a row of choices into a
// traffic jam.
function OutcomeButton({
  choice,
  on,
  disabled,
  onPick,
}: {
  choice: OutcomeChoice;
  on: boolean;
  disabled: boolean;
  onPick: (outcome: SalesCallOutcome) => void;
}) {
  const Icon = choice.icon;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(choice.outcome)}
      title={`Move this deal to ${choice.label}`}
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5",
        "text-[12px] font-semibold leading-none transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        on ? "" : "border-border text-text hover:bg-surface-2",
      ].join(" ")}
      style={
        on
          ? {
              borderColor: choice.tone,
              background: `color-mix(in srgb, ${choice.tone} 12%, transparent)`,
              color: choice.tone,
            }
          : undefined
      }
    >
      <Icon size={13} aria-hidden style={{ color: choice.tone }} />
      {choice.label}
    </button>
  );
}

// A promised return date, said the way somebody would say it out loud. Late is
// counted in whole days and stated plainly: "3 days late" is a thing you act
// on, where "back Jul 26" makes the reader do the arithmetic and most will not.
export function dueLabel(followUpAt: string, nowMs: number = Date.now()): string {
  const late = daysLate(followUpAt, nowMs);
  const on = new Date(followUpAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (late === null) return `back ${on}`;
  if (late >= 1) return `${late} ${late === 1 ? "day" : "days"} late`;
  if (late === 0) return "due back today";
  return `back ${on}`;
}

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
        {/* The retainer sold, beside the money taken. They are different
            questions and the pair is the point: $500 today off a $2,000/month
            client is a good day, and cash alone reports it as a small one.
            Shown only once something has been sold, so an empty month is not
            two zeroes. */}
        {totals.newMrr > 0 && (
          <div>
            <div className="text-[22px] font-semibold leading-none tabular-nums">
              {money(totals.newMrr)}
            </div>
            <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">
              New MRR
            </div>
          </div>
        )}
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
    // The retainer, on a close.
    monthly?: number | null;
    months?: number | null;
    // Why they said no, on either kind of no. Required by the server.
    reason?: string;
    // Which offer was pitched, and what was quoted inside its range.
    offerVariant?: string | null;
    offerTerms?: Record<string, number>;
    // Notes, allowed on any outcome.
    notes?: string;
  }) => Promise<unknown>;
}

// What the panel is holding while somebody answers for a meeting.
//
// One shape for all five outcomes rather than a field per outcome: the panel
// asks for what that outcome needs, and everything it does not need is simply
// never read. Prefilled from the meeting, so correcting an answer does not mean
// retyping the figures or losing the notes.
interface Draft {
  followUpAt: string;
  cash: string;
  monthly: string;
  months: string;
  reason: SalesNoReason | "";
  // Which offer was pitched, and the numbers quoted inside its range (0086).
  // Terms are held as STRINGS, like every other number on this panel: a
  // half-typed "1" must not round-trip through Number and come back as 1.
  offerVariant: string;
  offerTerms: Record<string, string>;
  notes: string;
}

function draftFor(meeting: SalesMeeting): Draft {
  return {
    followUpAt: meeting.followUpAt ? meeting.followUpAt.slice(0, 10) : "",
    cash: meeting.cashCollected === null ? "" : String(meeting.cashCollected),
    monthly: meeting.deal ? String(meeting.deal.monthly) : "",
    months: meeting.deal?.months ? String(meeting.deal.months) : "",
    // Only a variant the catalogue still has is prefilled, on the same grounds
    // as the reason below: a retired one would light up no button while still
    // counting as an answer.
    offerVariant: offerVariant(meeting.offer?.variant)?.id ?? "",
    offerTerms: Object.fromEntries(
      Object.entries(meeting.offer?.terms ?? {}).map(([k, v]) => [k, String(v)]),
    ),
    // Only a reason still on the list is prefilled. A stored value the list no
    // longer has would otherwise light up no button while still counting as an
    // answer, letting Save fire something the server will refuse.
    reason:
      meeting.reason && meeting.reason in SALES_NO_REASONS
        ? (meeting.reason as SalesNoReason)
        : "",
    notes: meeting.notes ?? "",
  };
}

// Answering for one meeting: which outcome is mid-answer, what has been typed
// into the panel, and the save.
//
// A hook rather than logic inside MeetingRow, because there are two places a
// meeting is answered from now. The row on Sales Calls opens the panel inline;
// the On Call page opens the same panel flat at the bottom of a live call. They
// must send the identical PATCH, and two copies of this would eventually not.
export interface OutcomeDraft {
  pending: SalesCallOutcome | null;
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  choose: (outcome: SalesCallOutcome) => void;
  cancel: () => void;
  // Resolves true when the outcome was actually recorded, so a caller can throw
  // away whatever it was holding for that call. False on a refusal, where
  // throwing anything away would lose work the server never took.
  submit: (outcome: SalesCallOutcome) => Promise<boolean>;
}

// The typed terms, as numbers, with the blanks left out. A box nobody filled in
// must not arrive as 0: "he did not write it down" and "he quoted nothing" are
// different facts, and the server stores the second faithfully.
function numericTerms(terms: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(terms)) {
    if (raw.trim() === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

export function useOutcomeDraft(meeting: SalesMeeting, record: RecordOutcome): OutcomeDraft {
  const { showToast } = useToast();
  // Which outcome is mid-answer. Null the rest of the time.
  const [pending, setPending] = useState<SalesCallOutcome | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFor(meeting));

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (outcome: SalesCallOutcome) => {
    // Which money figures this offer can even have. The panel hides the boxes
    // it does not ask for, and this makes sure a figure left over from a
    // previously recorded outcome is not sent from a hidden box: switching a
    // close from a retainer to fully performance based must take the retainer
    // with it, not leave it in the monthly revenue figure.
    const collects = collectsFor(draft.offerVariant);
    const takes = (field: "monthly" | "months" | "cash") =>
      outcome === "closed" && collects.includes(field);

    try {
      await record.mutateAsync({
        id: meeting.id,
        outcome,
        followUpAt: outcome === "follow_up" ? draft.followUpAt : undefined,
        // Null rather than undefined on a close that collects nothing: absent
        // would leave whatever was there before, and the answer is that this
        // deal took no cash.
        cashCollected: outcome !== "closed" ? undefined : takes("cash") && draft.cash !== "" ? Number(draft.cash) : null,
        // The retainer. Sent only on a close, only on an offer that has one, and
        // only where a figure was given: an empty box means "not recorded",
        // which the server stores as no deal rather than as a client worth
        // nothing.
        monthly: takes("monthly") && draft.monthly !== "" ? Number(draft.monthly) : undefined,
        months: takes("months") && draft.months !== "" ? Number(draft.months) : undefined,
        reason: draft.reason || undefined,
        // The offer. Sent on every outcome and let the server decide whether it
        // survives (it keeps one on anything where they turned up, and clears it
        // on a no-show), rather than this panel keeping its own copy of that
        // rule. Empty boxes are dropped here so a blank reaches the server as
        // absent rather than as NaN.
        offerVariant: draft.offerVariant || null,
        offerTerms: numericTerms(draft.offerTerms),
        // Sent on every outcome, and only when there is something to send: an
        // empty box must not wipe notes typed earlier.
        notes: draft.notes.trim() || undefined,
      });
      showToast(`${meeting.prospectName || "Meeting"}: ${outcomeLabel(outcome)}`);
      setPending(null);
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not record that");
      return false;
    }
  };

  // EVERY outcome opens the panel now, including a no-show that needs no extra
  // fact. It costs one click and buys two things: notes on any outcome, and one
  // shape to learn instead of "some buttons ask and some just fire".
  const choose = (outcome: SalesCallOutcome) => {
    setDraft(draftFor(meeting));
    setPending(outcome);
  };

  return { pending, draft, set, choose, cancel: () => setPending(null), submit };
}

export function MeetingRow({
  meeting,
  recordable = false,
  record,
  // Drawn under the name on the Sales page: where this meeting came from and
  // where its card ended up. Cold Call's own page leaves it off, because there
  // every row came from the same place.
  showProvenance = false,
  // Open the On Call cockpit on this meeting. Only Sales Calls passes it; the
  // caller's own Booked list has no such page, and a button that went nowhere
  // is worse than no button.
  onStartCall,
}: {
  meeting: SalesMeeting;
  recordable?: boolean;
  record: RecordOutcome;
  showProvenance?: boolean;
  onStartCall?: (meeting: SalesMeeting) => void;
}) {
  const { pending, draft, set, choose, cancel, submit } = useOutcomeDraft(meeting, record);

  const meta = meeting.outcome ? SALES_CALL_OUTCOMES[meeting.outcome] : null;

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
          {/* Who set it. On the agency-wide Booked list this is the only thing
              on the row that says whose booking it was, and a show rate nobody
              can attribute is a number without an owner. Absent on a meeting the
              sync adopted off the calendar, where the honest answer is nobody
              here, and the provenance line says so instead. */}
          {meeting.bookedBy && (
            <div className="mt-0.5 text-[11.5px] text-faint">Set by {meeting.bookedBy}</div>
          )}
          {/* What was said on the call, where anybody wrote it down. Under the
              name rather than beside the outcome: it is about the meeting, not
              about the answer, and a follow-up three weeks later is why it is
              on the row at all instead of behind a click. */}
          {meeting.notes && (
            <div className="mt-1 whitespace-pre-wrap text-[12px] leading-snug text-muted">
              {meeting.notes}
            </div>
          )}
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
                {/* The stage name again, not a second word for it, so the row
                    says the same thing before and after it is answered. */}
                {outcomeLabel(meeting.outcome)}
                {outcomeDetail(meeting)}
              </div>
            ) : (
              <div className="text-[12px] text-muted">Nothing recorded</div>
            )}
          </div>
        </div>
      </div>

      {(recordable || onStartCall) && pending === null && (
        // Two groups on one line: the four outcomes where somebody turned up,
        // then a rule, then the one where they did not. The labels no longer
        // carry the word "Showed", so the grouping is what keeps a show apart
        // from a no-show, which is the distinction the show rate rests on.
        //
        // Start call leads the row, ahead of the outcomes and separated from
        // them, because it is the thing you press BEFORE the call and they are
        // the things you press after it.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {onStartCall && (
            <>
              <button
                type="button"
                onClick={() => onStartCall(meeting)}
                title="Open the call cockpit on this meeting"
                className={[
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5",
                  "border border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]",
                  "text-[12px] font-semibold leading-none text-[var(--brand)]",
                  "transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_20%,transparent)]",
                ].join(" ")}
              >
                <Headphones size={13} aria-hidden />
                Start call
              </button>
              {recordable && (
                <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden />
              )}
            </>
          )}
          {recordable && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-faint">
              Showed
            </span>
          )}
          {recordable && (
            <>
              {SHOWED_CHOICES.map((c) => (
                <OutcomeButton
                  key={c.outcome}
                  choice={c}
                  on={meeting.outcome === c.outcome}
                  disabled={record.isPending}
                  onPick={choose}
                />
              ))}

              <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden />

              <OutcomeButton
                choice={NO_SHOW_CHOICE}
                on={meeting.outcome === NO_SHOW_CHOICE.outcome}
                disabled={record.isPending}
                onPick={choose}
              />
            </>
          )}
        </div>
      )}

      {pending !== null && (
        <RecordPanel
          meeting={meeting}
          outcome={pending}
          draft={draft}
          set={set}
          saving={record.isPending}
          onSave={() => void submit(pending)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

// What the recorded answer amounted to, in one line beside the stage name.
//
// A close now says what was SOLD and not only what was taken: "$2,000/mo, 12 mo,
// $500 today". Those are three different numbers and a page that showed only the
// last of them made a retainer look like a one-off.
function outcomeDetail(meeting: SalesMeeting): string {
  const parts: string[] = [];

  if (meeting.outcome === "closed") {
    if (meeting.deal) {
      parts.push(`${money(meeting.deal.monthly)}/mo`);
      if (meeting.deal.months) parts.push(`${meeting.deal.months} mo`);
    }
    if (meeting.cashCollected) parts.push(`${money(meeting.cashCollected)} today`);
  }

  if (meeting.outcome === "follow_up" && meeting.followUpAt) {
    parts.push(dueLabel(meeting.followUpAt));
  }

  // Why they said no, on either kind of no. The outcome already says which kind.
  if (
    (meeting.outcome === "not_interested" || meeting.outcome === "not_qualified") &&
    meeting.reason &&
    meeting.reason in SALES_NO_REASONS
  ) {
    parts.push(SALES_NO_REASONS[meeting.reason as SalesNoReason].label.toLowerCase());
  }

  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

// The one panel every outcome opens.
//
// It asks for what THIS outcome needs and nothing else, with the notes box
// always at the bottom. One shape for five answers: the alternative was three
// different behaviours (two buttons that opened a field, two that fired
// immediately, one that asked for a reason), which nobody could predict without
// pressing them.
export function RecordPanel({
  meeting,
  outcome,
  draft,
  set,
  saving,
  onSave,
  onCancel,
}: {
  meeting: SalesMeeting;
  outcome: SalesCallOutcome;
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isNo = outcome === "not_interested" || outcome === "not_qualified";
  // A follow-up with no date is a promise nobody can keep, and a no with no
  // reason is the empty column the reason list exists to prevent. Both block the
  // save rather than being quietly accepted half-answered.
  const incomplete = (outcome === "follow_up" && !draft.followUpAt) || (isNo && !draft.reason);
  // Which money boxes this offer can even have. Same function the submit uses,
  // so a box that is not drawn is a figure that is not sent.
  const collects = collectsFor(draft.offerVariant);
  // Through parseDeal rather than multiplied here, so a half-typed box reads as
  // "no figure yet" instead of "$NaN", and the panel agrees with the server about
  // what counts as a deal.
  const total = contractValue(parseDeal({ monthly: draft.monthly, months: draft.months }));

  return (
    <form
      className="rounded-xl bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!incomplete) onSave();
      }}
    >
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">
        {outcomeLabel(outcome)}
      </div>

      {/* Which offer was on the table. FIRST, because on a close it decides
          which money boxes appear underneath it. Asked on every outcome where
          they turned up, not just the close: knowing which offer gets turned
          down is worth more than knowing which one closed. A no-show never
          heard one, so it is not asked. */}
      {outcome !== "no_show" && (
        <div className="mb-3">
          <OfferPicker
            variant={draft.offerVariant}
            terms={draft.offerTerms}
            onVariant={(offerVariantId) => set({ offerVariant: offerVariantId })}
            onTerm={(key, value) => set({ offerTerms: { ...draft.offerTerms, [key]: value } })}
          />
        </div>
      )}

      {/* The money, decided by the offer above rather than always asked.
          A fully performance-based deal takes nothing at signing, so there is
          nothing here to fill in; a retainer has all three. With no offer
          picked, all three are asked, because not knowing which offer it was is
          not the same as knowing it took nothing. */}
      {outcome === "closed" && collects.length > 0 && (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          {collects.includes("monthly") && (
            <Field label="Monthly" hint="What they pay every month">
              <input
                className="pk-input !w-[110px]"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={draft.monthly}
                onChange={(e) => set({ monthly: e.target.value })}
                autoFocus
              />
            </Field>
          )}
          {collects.includes("months") && (
            <Field label="Months" hint="Blank for month-to-month">
              <input
                className="pk-input !w-[90px]"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={draft.months}
                onChange={(e) => set({ months: e.target.value })}
              />
            </Field>
          )}
          {collects.includes("cash") && (
            <Field label={cashLabelFor(draft.offerVariant)} hint="Taken on the call itself">
              <input
                className="pk-input !w-[110px]"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={draft.cash}
                onChange={(e) => set({ cash: e.target.value })}
              />
            </Field>
          )}
          {/* The multiplication, done for the reader. Only when both halves are
              there: month-to-month has no total, and printing one would be a
              guess about how long they stay. */}
          {total !== null && (
            <div className="pb-1.5 text-[12px] text-muted">
              Contract value <span className="font-semibold text-text">{money(total)}</span>
            </div>
          )}
        </div>
      )}

      {/* Said plainly rather than left as a gap, so a close with no boxes reads
          as the offer working correctly instead of as the panel failing. */}
      {outcome === "closed" && collects.length === 0 && (
        <p className="mb-3 text-[12px] text-muted">
          Nothing collected at signing on this offer. What they pay is in the terms above.
        </p>
      )}

      {outcome === "follow_up" && (
        <div className="mb-3">
          <Field label="Come back on">
            <input
              className="pk-input !w-auto"
              type="date"
              value={draft.followUpAt}
              onChange={(e) => set({ followUpAt: e.target.value })}
              autoFocus
            />
          </Field>
        </div>
      )}

      {isNo && (
        <div className="mb-3">
          <div className="mb-1.5 text-[12px] text-muted">Why they said no</div>
          <div className="flex flex-wrap gap-1.5">
            {SALES_NO_REASON_KEYS.map((key) => {
              const on = draft.reason === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set({ reason: key })}
                  className={[
                    "rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold leading-none",
                    "transition-colors",
                    on
                      ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]"
                      : "border-border text-text hover:bg-surface",
                  ].join(" ")}
                >
                  {SALES_NO_REASONS[key].label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-3">
        <Field label="Notes" hint="What was said. Optional.">
          <textarea
            className="pk-input !h-auto"
            rows={2}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder={`Anything worth knowing when ${meeting.prospectName || "they"} come back up`}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="pk-btn-save" disabled={saving || incomplete}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" className="pk-btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        {isNo && !draft.reason && (
          <span className="text-[11.5px] text-faint">Pick a reason to save.</span>
        )}
      </div>
    </form>
  );
}

// ===== Which offer was pitched =====

const UNIT_PREFIX: Record<OfferUnit, string> = {
  money: "$",
  percent: "",
  days: "",
  count: "",
};

const UNIT_SUFFIX: Record<OfferUnit, string> = {
  money: "",
  percent: "%",
  days: "",
  count: "",
};

// Two steps, because six families of offer with ten variants between them is a
// list nobody reads at the bottom of a form. Pick the family, and only that
// family's variants open under it; the numbers appear only once a variant is
// chosen, and only for the ranges that variant actually has.
//
// Nothing here is required. An outcome recorded in a hurry with no offer picked
// is still an outcome, and blocking the save to protect a statistic would be
// the wrong trade.
function OfferPicker({
  variant,
  terms,
  onVariant,
  onTerm,
}: {
  variant: string;
  terms: Record<string, string>;
  onVariant: (variant: string) => void;
  onTerm: (key: string, value: string) => void;
}) {
  const chosen = offerVariant(variant);
  // The family the chosen variant belongs to, so reopening a recorded call
  // lands on the right branch rather than collapsed.
  const [openFamily, setOpenFamily] = useState<OfferFamilyId | "">(chosen?.family ?? "");

  const pickFamily = (family: OfferFamilyId) => {
    if (family === openFamily) {
      // Closing the family it came from clears the answer. Otherwise a variant
      // stays selected under a collapsed heading, recorded but invisible.
      setOpenFamily("");
      if (chosen?.family === family) onVariant("");
      return;
    }
    setOpenFamily(family);
    const only = variantsOfFamily(family);
    // A family with one shape has nothing to choose, so choosing the family IS
    // the answer. Saves a click on three of the six.
    onVariant(only.length === 1 ? only[0].id : "");
  };

  return (
    <div>
      <div className="mb-1.5 text-[12px] text-muted">
        Offer pitched <span className="text-faint">Optional</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {OFFER_FAMILIES.map((family) => {
          const on = openFamily === family.id;
          const answered = chosen?.family === family.id;
          return (
            <button
              key={family.id}
              type="button"
              onClick={() => pickFamily(family.id)}
              className={[
                "rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold leading-none",
                "transition-colors",
                answered || on
                  ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]"
                  : "border-border text-text hover:bg-surface",
              ].join(" ")}
            >
              {family.label}
            </button>
          );
        })}
      </div>

      {openFamily !== "" && variantsOfFamily(openFamily).length > 1 && (
        <div className="mt-2 flex flex-col gap-1 border-l border-[var(--divider)] pl-3">
          {variantsOfFamily(openFamily).map((v) => {
            const on = v.id === variant;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onVariant(v.id)}
                className={[
                  "text-left text-[12.5px] leading-snug transition-colors",
                  on ? "font-semibold text-[var(--brand)]" : "text-muted hover:text-text",
                ].join(" ")}
              >
                {on ? "✓ " : ""}
                {v.label}
              </button>
            );
          })}
        </div>
      )}

      {/* What was actually said inside the range. The placeholder is what Jake
          usually quotes, never stored on his behalf: a default that saved
          itself would fill a year of calls with a number nobody said. */}
      {chosen && chosen.terms.length > 0 && (
        <div className="mt-2 flex flex-wrap items-end gap-3 border-l border-[var(--divider)] pl-3">
          {chosen.terms.map((def) => (
            <label key={def.key} className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-faint">
                {def.label}
              </span>
              <span className="flex items-center gap-1 text-[12.5px] text-muted">
                {UNIT_PREFIX[def.unit]}
                <input
                  className="pk-input !w-[86px]"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={terms[def.key] ?? ""}
                  onChange={(e) => onTerm(def.key, e.target.value)}
                  placeholder={String(def.typical)}
                  aria-label={`${chosen.label}, ${def.label}`}
                />
                {UNIT_SUFFIX[def.unit]}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

// Where the meeting came from, and where its card is now.
//
// This line is the only thing on the page that admits the app is not the whole
// story. A meeting adopted off the calendar and a meeting a caller booked look
// identical otherwise, and a routing that failed is invisible unless it says so.
function Provenance({ meeting }: { meeting: SalesMeeting }) {
  const parts: string[] = [];
  // The same rule the source table on Sales Data counts by (salesCalls.ts:
  // sourceLabel), said as a sentence here. One function, so the line on the row
  // and the row in the table can never describe a blank source differently.
  const label = sourceLabel(meeting.source);
  parts.push(label === "Calendar" ? "From the calendar" : label);
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

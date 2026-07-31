import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { useSalesCallsQuery, useRecordSalesCallOutcome } from "../../../hooks/useSalesCalls";
import type { SalesMeeting } from "../../../lib/api";
import {
  NO_SHOW_CHOICE,
  OUTCOME_TONE,
  RecordPanel,
  SHOWED_CHOICES,
  outcomeLabel,
  useOutcomeDraft,
  whenLabel,
} from "./meetingUi";
import { sourceLabel } from "../../../../functions/lib/salesCalls";
import { useSalesPlaybookQuery } from "../../../hooks/useSalesPlaybook";
import {
  PLAYBOOK_SECTIONS,
  itemsForSection,
  type PlaybookItem,
  type PlaybookSectionDef,
} from "../../../../functions/lib/salesPlaybook";
import {
  callStateKey,
  elapsedLabel,
  emptyCallState,
  normalizeCallState,
  sectionProgress,
  type CallState,
} from "../../../lib/salesCallPlaybook";

// Sales > On Call.
//
// The page that is open WHILE the call is happening. Sales Calls is the list of
// meetings and the place an outcome is recorded after the fact; this is the
// half hour in between, which until now happened on paper.
//
// Three columns in the order the call runs (discovery, pitch, objections), a
// tick and a line of notes against every prompt, and the same outcome recorder
// Sales Calls uses at the bottom. It writes nothing new: the ticks and notes
// live in this browser until an outcome is recorded, at which point they are
// thrown away and the outcome goes where it always went.
//
// What is drawn in the three columns comes from sales_playbook_items (0074) and
// is edited on Sales > Playbook. Nothing about the call is hardcoded here: this
// page knows the shape (three sections, tick, note, outcome) and the playbook
// knows the words.

const PARAM = "meeting";

export default function OnCallSection() {
  const [params, setParams] = useSearchParams();
  const meetingId = params.get(PARAM) ?? "";
  const query = useSalesCallsQuery();
  const playbook = useSalesPlaybookQuery();
  const record = useRecordSalesCallOutcome();

  const meetings = query.data?.meetings ?? [];
  const meeting = meetings.find((m) => m.id === meetingId) ?? null;

  const open = (id: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set(PARAM, id);
        else next.delete(PARAM);
        return next;
      },
      { replace: true },
    );
  };

  // Both reads are waited for. The playbook decides which stored ticks are
  // still real (normalizeCallState), so opening the cockpit before it lands
  // would drop every tick from a call in progress on a mid-call refresh.
  if (query.isLoading || playbook.isLoading) {
    return <div className="pk-empty">Reading the calendar...</div>;
  }
  if (query.isError) {
    return <div className="pk-empty">Could not load the sales calls. Reload to try again.</div>;
  }
  if (playbook.isError) {
    return <div className="pk-empty">Could not load the playbook. Reload to try again.</div>;
  }

  // Landed here without a meeting, or on one that is no longer on the calendar.
  // Both get the picker rather than an error: the second is what happens when a
  // link is a week old, and it is not a fault.
  if (!meeting) {
    return <Picker meetings={meetings} missing={meetingId !== ""} onPick={open} />;
  }

  // Keyed so switching prospects tears down the whole cockpit, ticks, notes,
  // timer and half-typed outcome together. Without it, one call's answers would
  // be sitting in the boxes when the next one opens.
  return (
    <Cockpit
      key={meeting.id}
      meeting={meeting}
      items={playbook.data?.items ?? []}
      record={record}
      onLeave={() => open("")}
    />
  );
}

// ===== Choosing who you are about to call =====

// Nearest to now first, in either direction. The call you are about to take and
// the one you just took are both at the top, which is what "which meeting am I
// on" actually means; a plain chronological list buries today under next month.
function nearestFirst(meetings: SalesMeeting[], nowMs: number): SalesMeeting[] {
  const distance = (m: SalesMeeting) => {
    const t = m.scheduledAt ? new Date(m.scheduledAt).getTime() : NaN;
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : Math.abs(t - nowMs);
  };
  return meetings.slice().sort((a, b) => distance(a) - distance(b));
}

function Picker({
  meetings,
  missing,
  onPick,
}: {
  meetings: SalesMeeting[];
  missing: boolean;
  onPick: (id: string) => void;
}) {
  const ordered = nearestFirst(meetings, Date.now()).slice(0, 12);

  if (ordered.length === 0) {
    return (
      <div className="pk-empty">
        No sales calls on the calendar yet. Book one and it appears here ready to work.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-[13px] text-muted">
        {missing
          ? "That meeting is no longer on the calendar. Pick the call you are on."
          : "Pick the call you are on. Normally you get here by pressing Start call on Sales Calls."}
      </div>
      <div className="pk-list">
        {ordered.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.id)}
            className="pk-li w-full text-left hover:bg-surface-2"
          >
            <div className="pk-li-main">
              <div className="pk-li-label">
                {m.prospectName || "Unnamed prospect"}
                {m.businessName ? (
                  <span className="ml-2 text-[12px] font-normal text-muted">{m.businessName}</span>
                ) : null}
              </div>
              <div className="pk-li-sub font-mono">{m.phone || "No number"}</div>
            </div>
            <div className="pk-li-meta">
              <div style={{ textAlign: "right" }}>
                <div className="text-[13px] font-semibold">{whenLabel(m.scheduledAt)}</div>
                <div className="text-[12px] text-muted">
                  {m.outcome ? outcomeLabel(m.outcome) : "Nothing recorded"}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ===== The cockpit =====

function readCallState(meetingId: string, known: string[]): CallState {
  const now = Date.now();
  try {
    const stored = window.localStorage.getItem(callStateKey(meetingId));
    return normalizeCallState(stored ? JSON.parse(stored) : null, now, known);
  } catch {
    return emptyCallState(now);
  }
}

function writeCallState(meetingId: string, state: CallState) {
  try {
    window.localStorage.setItem(callStateKey(meetingId), JSON.stringify(state));
  } catch {
    /* a browser refusing storage costs the ticks on a refresh, nothing else */
  }
}

function clearCallState(meetingId: string) {
  try {
    window.localStorage.removeItem(callStateKey(meetingId));
  } catch {
    /* ignore */
  }
}

function Cockpit({
  meeting,
  items,
  record,
  onLeave,
}: {
  meeting: SalesMeeting;
  items: PlaybookItem[];
  record: ReturnType<typeof useRecordSalesCallOutcome>;
  onLeave: () => void;
}) {
  // The live prompts of each column, and every id across them. The ids are what
  // a stored tick is checked against, so a prompt retired mid-call takes its
  // tick with it rather than leaving a column reading 6 of 5.
  const columns = useMemo(
    () => PLAYBOOK_SECTIONS.map((s) => ({ section: s, items: itemsForSection(items, s.id) })),
    [items],
  );
  const knownIds = useMemo(() => columns.flatMap((c) => c.items.map((i) => i.id)), [columns]);

  // Held under the meeting id it was read for, so the write below can tell a
  // loaded state from the empty one this render started with. Writing before
  // the read lands would wipe the ticks on every reload.
  const [store, setStore] = useState<{ id: string; state: CallState } | null>(null);

  useEffect(() => {
    setStore({ id: meeting.id, state: readCallState(meeting.id, knownIds) });
    // Deliberately not keyed on knownIds: re-reading storage every time the
    // playbook refetches would throw away ticks made since the page opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  const loaded = store?.id === meeting.id ? store : null;

  useEffect(() => {
    if (loaded) writeCallState(loaded.id, loaded.state);
  }, [loaded]);

  // The clock. One second is the coarsest tick that still reads as running.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const outcome = useOutcomeDraft(meeting, record);

  const patch = (fn: (state: CallState) => CallState) =>
    setStore((s) => (s ? { id: s.id, state: fn(s.state) } : s));

  const toggle = (itemId: string) =>
    patch((state) => ({
      ...state,
      ticked: state.ticked.includes(itemId)
        ? state.ticked.filter((x) => x !== itemId)
        : [...state.ticked, itemId],
    }));

  const setNote = (itemId: string, value: string) =>
    patch((state) => ({ ...state, notes: { ...state.notes, [itemId]: value } }));

  const save = async (chosen: NonNullable<SalesMeeting["outcome"]>) => {
    const ok = await outcome.submit(chosen);
    // Only on a real save. A refused PATCH that still binned the call's notes
    // would lose the half hour it took to write them.
    if (ok) {
      clearCallState(meeting.id);
      onLeave();
    }
  };

  // One frame before the read lands. Deliberately blank rather than a skeleton:
  // localStorage is synchronous and this is gone by the next paint.
  if (!loaded) return null;

  const state = loaded.state;

  return (
    <div>
      <Header meeting={meeting} elapsed={elapsedLabel(state.startedAt, now)} onLeave={onLeave} />

      {/* The call, left to right. One column each on a laptop, stacked on a
          phone, because three columns of prompts at 390px is none of them. */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {columns.map(({ section, items: sectionItems }) => (
          <Column
            key={section.id}
            section={section}
            items={sectionItems}
            ticked={state.ticked}
            notes={state.notes}
            onToggle={toggle}
            onNote={setNote}
          />
        ))}
      </div>

      <OutcomeBand meeting={meeting} record={record} outcome={outcome} onSave={save} />
    </div>
  );
}

// Who is on the phone, and how long they have been on it.
function Header({
  meeting,
  elapsed,
  onLeave,
}: {
  meeting: SalesMeeting;
  elapsed: string;
  onLeave: () => void;
}) {
  const source = sourceLabel(meeting.source);
  const facts = [
    whenLabel(meeting.scheduledAt),
    source === "Calendar" ? "From the calendar" : source,
    meeting.calendarName || null,
    meeting.bookedBy ? `Set by ${meeting.bookedBy}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="pk-card mb-4">
      <button
        type="button"
        onClick={onLeave}
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-text"
      >
        <ArrowLeft size={13} aria-hidden />
        Pick a different call
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            {meeting.prospectName || "Unnamed prospect"}
            {meeting.businessName ? (
              <span className="ml-2.5 text-[15px] font-normal text-muted">
                {meeting.businessName}
              </span>
            ) : null}
          </div>
          <div className="mt-1 font-mono text-[13.5px] text-muted">
            {meeting.phone || "No number"}
          </div>
          <div className="mt-1.5 text-[12px] text-faint">{facts.join(" · ")}</div>
          {/* What was already said, on a call being taken for the second time.
              It is the whole reason a follow-up is not a cold call. */}
          {meeting.notes && (
            <div className="mt-2.5 max-w-[62ch] whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-muted">
              {meeting.notes}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 text-[26px] font-semibold leading-none tabular-nums">
            <Clock size={18} aria-hidden className="text-faint" />
            {elapsed}
          </div>
          <div className="mt-1.5 text-[11px] uppercase tracking-wider text-muted">On this call</div>
          {meeting.outcome && (
            <div
              className="mt-2 text-[12px] font-semibold"
              style={{ color: OUTCOME_TONE[meeting.outcome] }}
            >
              Already recorded: {outcomeLabel(meeting.outcome)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// One of the three. A heading that says how far through it you are, then the
// prompts, each with somewhere to put what they answered.
function Column({
  section,
  items,
  ticked,
  notes,
  onToggle,
  onNote,
}: {
  section: PlaybookSectionDef;
  items: PlaybookItem[];
  ticked: string[];
  notes: Record<string, string>;
  onToggle: (id: string) => void;
  onNote: (id: string, value: string) => void;
}) {
  const { covered, total } = sectionProgress(items, ticked);
  // An empty column is not a finished one. Without this an unwritten section
  // would show a green 0/0 as though it had been worked through.
  const done = total > 0 && covered === total;

  return (
    <section className="pk-card !p-0">
      <header className="border-b border-[var(--divider)] px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            {section.label}
          </h2>
          <span
            className={`text-[12px] font-semibold tabular-nums ${done ? "text-[var(--positive)]" : "text-faint"}`}
          >
            {covered}/{total}
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-faint">{section.blurb}</p>
      </header>

      <div className="px-5 py-2">
        {items.length === 0 && (
          <p className="py-4 text-[12.5px] text-faint">
            Nothing written for this part of the call yet. Add prompts on the Playbook page.
          </p>
        )}
        {items.map((item) => {
          const on = ticked.includes(item.id);
          return (
            <div key={item.id} className="border-b border-[var(--divider)] py-3 last:border-b-0">
              <div className="flex items-start gap-2.5">
                {/* The tick is the control, so the whole prompt is the hit area
                    rather than a 16px box you have to aim at mid-conversation. */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onToggle(item.id)}
                  className="flex flex-1 items-start gap-2.5 text-left"
                >
                  <span
                    aria-hidden
                    className={[
                      "mt-[2px] grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border transition-colors",
                      on
                        ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                        : "border-[var(--border)]",
                    ].join(" ")}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span
                    className={[
                      "text-[13.5px] font-medium leading-snug transition-colors",
                      on ? "text-faint line-through decoration-1" : "text-text",
                    ].join(" ")}
                  >
                    {item.prompt}
                  </span>
                </button>
              </div>

              {item.hint && (
                <div className="ml-[27px] mt-1 text-[11.5px] leading-snug text-faint">
                  {item.hint}
                </div>
              )}

              <input
                className="pk-input !mt-2 ml-[27px] !w-[calc(100%-27px)] !py-1.5 !text-[12.5px]"
                value={notes[item.id] ?? ""}
                onChange={(e) => onNote(item.id, e.target.value)}
                placeholder={section.placeholder}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// How the call ends. The same five outcomes and the same panel as Sales Calls,
// opened out flat instead of behind a click on a row.
function OutcomeBand({
  meeting,
  record,
  outcome,
  onSave,
}: {
  meeting: SalesMeeting;
  record: ReturnType<typeof useRecordSalesCallOutcome>;
  outcome: ReturnType<typeof useOutcomeDraft>;
  onSave: (chosen: NonNullable<SalesMeeting["outcome"]>) => void;
}) {
  return (
    <div className="pk-card mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Outcome</h2>
        <span className="text-[11.5px] text-faint">
          Recording it tags the contact and moves the card. The notes above stay in this browser.
        </span>
      </div>

      {outcome.pending === null ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Showed</span>
          {SHOWED_CHOICES.map((c) => {
            const Icon = c.icon;
            const on = meeting.outcome === c.outcome;
            return (
              <button
                key={c.outcome}
                type="button"
                disabled={record.isPending}
                onClick={() => outcome.choose(c.outcome)}
                className={[
                  "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5",
                  "text-[13px] font-semibold leading-none transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  on ? "" : "border-border text-text hover:bg-surface-2",
                ].join(" ")}
                style={
                  on
                    ? {
                        borderColor: c.tone,
                        background: `color-mix(in srgb, ${c.tone} 12%, transparent)`,
                        color: c.tone,
                      }
                    : undefined
                }
              >
                <Icon size={15} aria-hidden style={{ color: c.tone }} />
                {c.label}
              </button>
            );
          })}

          <span className="mx-1 h-6 w-px shrink-0 bg-[var(--border)]" aria-hidden />

          <button
            type="button"
            disabled={record.isPending}
            onClick={() => outcome.choose(NO_SHOW_CHOICE.outcome)}
            className={[
              "inline-flex shrink-0 items-center gap-2 rounded-xl border border-border px-3.5 py-2.5",
              "text-[13px] font-semibold leading-none text-text transition-colors hover:bg-surface-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            <NO_SHOW_CHOICE.icon
              size={15}
              aria-hidden
              style={{ color: NO_SHOW_CHOICE.tone }}
            />
            {NO_SHOW_CHOICE.label}
          </button>
        </div>
      ) : (
        <RecordPanel
          meeting={meeting}
          outcome={outcome.pending}
          draft={outcome.draft}
          set={outcome.set}
          saving={record.isPending}
          onSave={() => outcome.pending && onSave(outcome.pending)}
          onCancel={outcome.cancel}
        />
      )}
    </div>
  );
}

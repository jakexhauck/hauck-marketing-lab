import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, Sigma } from "lucide-react";
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
  groupItems,
  type PlaybookCategory,
  type PlaybookGroup,
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
import {
  buildFacts,
  factOrder,
  factsSummary,
  renderText,
  type Facts,
} from "../../../lib/callFacts";

// Sales > On Call.
//
// The page that is open WHILE the call is happening. Sales Calls is the list of
// meetings and the place an outcome is recorded after the fact; this is the
// half hour in between, which until now happened on paper.
//
// Two columns in the order the call runs (discovery, then pitch), a
// tick and a line of notes against every prompt, and the same outcome recorder
// Sales Calls uses at the bottom. It writes nothing new: the ticks and notes
// live in this browser until an outcome is recorded, at which point they are
// thrown away and the outcome goes where it always went.
//
// What was typed does not stay where it was typed. A question can be filed
// under a key ("installs"), and any later row can say {installs} in its own
// words: forty minutes after Jake asks how many jobs they ran, the timeline
// line reads itself back to him with the number already in it. The calcs go
// further and do the arithmetic he was doing in his head while someone talked
// at him. All of that is buildFacts (src/lib/callFacts.ts); this page only
// draws it.
//
// What is drawn in the three columns comes from sales_playbook_items (0074) and
// is edited on Sales > Playbook. Nothing about the call is hardcoded here: this
// page knows the shape (three sections, tick, note, outcome) and the playbook
// knows the words.

const PARAM = "meeting";

// The one frame before localStorage has been read. A shared constant rather
// than a fresh {} each render, so the facts are not rebuilt for nothing.
const NO_NOTES: Record<string, string> = {};

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
      categories={playbook.data?.categories ?? []}
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
  categories,
  record,
  onLeave,
}: {
  meeting: SalesMeeting;
  items: PlaybookItem[];
  categories: PlaybookCategory[];
  record: ReturnType<typeof useRecordSalesCallOutcome>;
  onLeave: () => void;
}) {
  // Each column cut into its headings, with whatever is unfiled last. The ids
  // across all of them are what a stored tick is checked against, so a prompt
  // retired mid-call takes its tick with it rather than leaving a column
  // reading 6 of 5.
  const columns = useMemo(
    () =>
      PLAYBOOK_SECTIONS.map((s) => ({ section: s, groups: groupItems(items, categories, s.id) })),
    [items, categories],
  );
  const knownIds = useMemo(
    () => columns.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => i.id))),
    [columns],
  );

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

  // The keys that are known before anyone types, straight off the booking.
  // first_name is split here rather than asked for: "I will say Mike" is the
  // line, and "I will say Mike Trelasky" is not.
  const seed = useMemo(
    () => ({
      name: meeting.prospectName,
      first_name: meeting.prospectName.trim().split(/\s+/)[0] ?? "",
      business: meeting.businessName,
      phone: meeting.phone,
    }),
    [meeting.prospectName, meeting.businessName, meeting.phone],
  );

  // Rebuilt on every keystroke, deliberately. It is a few dozen string reads
  // and half a dozen four-token formulas, and the alternative is a cache that
  // can be one letter behind what is on the screen during the one half hour
  // where that matters.
  const notes = store?.id === meeting.id ? store.state.notes : NO_NOTES;
  const facts = useMemo(() => buildFacts({ items, notes, seed }), [items, notes, seed]);
  const order = useMemo(() => factOrder(items), [items]);

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
    // Full width. It was capped at a 72-character measure, which is the right
    // answer for a page of prose and the wrong one here: a sales script is
    // mostly one-line questions, so the cap bought a comfortable line length
    // nothing was long enough to need and paid for it in half a screen of
    // margin. The header, the script and the outcome share one left edge, which
    // is what actually makes it read as a document.
    <div className="w-full">
      <Header meeting={meeting} elapsed={elapsedLabel(state.startedAt, now)} onLeave={onLeave} />

      {/* The call, top to bottom, as one document at reading width.
          It was two boards of cards, which is the right shape for a checklist
          and the wrong one for a script: this is read OUT LOUD, and a page you
          read down is the shape it was written in. Nothing here is a card, a
          box or a border between two sentences. */}
      <div>
        {columns.map(({ section, groups }) => (
          <ScriptSection
            key={section.id}
            section={section}
            groups={groups}
            ticked={state.ticked}
            notes={state.notes}
            facts={facts}
            onToggle={toggle}
            onNote={setNote}
          />
        ))}
      </div>

      <OutcomeBand
        meeting={meeting}
        record={record}
        outcome={outcome}
        summary={factsSummary(facts, order)}
        onSave={save}
      />
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

// A prompt with its blanks filled in.
//
// Split rather than string-replaced so a filled token can be drawn as an answer
// and an empty one as a grey placeholder. Mid-call that difference is the whole
// point: you can see the gap coming a line before you read into it, instead of
// saying "adding dollar sign X a month" out loud to a prospect.
//
// Still text. Every part goes through React as a child, never as markup, which
// is the same trust boundary the playbook has always had.
function PromptText({ text, facts }: { text: string; facts: Facts }) {
  const parts = renderText(text, facts);
  return (
    <>
      {parts.map((part, i) =>
        part.t === "text" ? (
          <span key={i}>{part.value}</span>
        ) : (
          <span
            key={i}
            title={part.filled ? part.key : `${part.key} has not been answered yet`}
            className={
              part.filled
                ? "font-semibold text-[var(--brand)]"
                : "rounded border border-dashed border-[var(--border)] px-1 text-faint"
            }
          >
            {part.value}
          </span>
        ),
      )}
    </>
  );
}

// Where their answer is written down.
//
// Not a form field. A form field in the middle of a script is a page you fill
// in, and this is a page you read: the box is a line ruled under the question,
// and what is typed on it reads as handwriting on the script rather than as
// data in a box.
//
// Still a textarea, and still grows: "tell me about that" is a paragraph, and a
// one-line box that scrolls sideways cannot be read back at the recap.
function AnswerBox({
  value,
  placeholder,
  answerKey,
  onChange,
}: {
  value: string;
  placeholder: string;
  answerKey: string | null;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Before paint, so a restored answer on a mid-call refresh is never drawn at
  // one line and then jumped to three.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    // The one thing that does NOT span the page. An answer is a few words or a
    // number, and a rule running the full width under every question would be
    // the page's loudest element by a mile, drawn for content that never fills
    // it.
    <div className="mt-1 max-w-[52ch]">
      <textarea
        ref={ref}
        rows={1}
        className={[
          "w-full resize-none border-0 border-b border-dashed bg-transparent px-0 py-0.5",
          "text-[14.5px] leading-[1.6] outline-none transition-colors",
          "placeholder:text-faint/70 focus:border-solid focus:border-[var(--brand)]",
          value
            ? "border-[var(--border)] text-[var(--brand)]"
            : "border-[var(--border)] text-text",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={answerKey ? `Answer, saved as ${answerKey}` : "Answer"}
      />
      {/* Where this answer goes. Only on the three that go anywhere, and only
          once something is in it: it is the one thing on the page that explains
          why a number typed here turns up in a sentence two headings down, and
          on the other eighteen questions it would be noise. */}
      {answerKey && value !== "" && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">
          used later as {answerKey}
        </div>
      )}
    </div>
  );
}

// One half of the call, read down the page.
function ScriptSection({
  section,
  groups,
  ticked,
  notes,
  facts,
  onToggle,
  onNote,
}: {
  section: PlaybookSectionDef;
  groups: PlaybookGroup[];
  ticked: string[];
  notes: Record<string, string>;
  facts: Facts;
  onToggle: (id: string) => void;
  onNote: (id: string, value: string) => void;
}) {
  // The column's count is the whole column, headings and loose prompts
  // together. A per-heading count would be four numbers to read mid-call where
  // the only question is "have I finished discovery".
  //
  // Calcs are left out of it. There is nothing to do to a calc, so counting one
  // would mean a column that can never reach the end of itself.
  const all = groups.flatMap((g) => g.items).filter((i) => i.kind !== "calc");
  const { covered, total } = sectionProgress(all, ticked);
  // An empty column is not a finished one. Without this an unwritten section
  // would show a green 0/0 as though it had been worked through.
  const done = total > 0 && covered === total;

  return (
    <section className="mb-14 last:mb-4">
      {/* The half of the call you are in. A title over a rule, the way a
          document announces a chapter, rather than a card header. */}
      <header className="mb-6 flex items-baseline justify-between gap-4 border-b border-[var(--divider)] pb-2.5">
        <h2 className="text-[15px] font-semibold uppercase tracking-[0.16em] text-text">
          {section.label}
        </h2>
        <span
          className={`shrink-0 text-[12px] font-semibold tabular-nums ${done ? "text-[var(--positive)]" : "text-faint"}`}
        >
          {covered}/{total}
        </span>
      </header>

      {groups.every((g) => g.items.length === 0) && (
        <p className="text-[13.5px] text-faint">
          Nothing written for this part of the call yet. Add prompts on the Playbook page.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.category?.id ?? "__loose"} className="mb-8 last:mb-0">
          {/* The heading Jake wrote, set as a heading. Nothing when the block
              is the unfiled remainder: a heading that said "no heading" would
              be noise on a column he has not sorted yet, and a label on the
              loose block only earns its place when there is a real heading
              above it to distinguish it from. */}
          {/* The heading, with a rule running from the end of the word to the
              edge of the page. At full width a bare heading floats over a
              column of lines with nothing tying it to them; the rule is what
              makes each block findable at a glance mid-call. */}
          {group.category && (
            <h3 className="mb-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
              {group.category.name}
              <span className="h-px flex-1 bg-[var(--divider)]" aria-hidden />
            </h3>
          )}
          {!group.category && groups.length > 1 && (
            <h3 className="mb-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
              Anything else
              <span className="h-px flex-1 bg-[var(--divider)]" aria-hidden />
            </h3>
          )}

          {group.items.map((item) => (
            <Line
              key={item.id}
              item={item}
              section={section}
              facts={facts}
              on={ticked.includes(item.id)}
              note={notes[item.id] ?? ""}
              onToggle={() => onToggle(item.id)}
              onNote={(value) => onNote(item.id, value)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

// ===== One line of the script =====

// Three shapes, one line of script. A question is asked and answered, a script
// line is read out, a calc is a number that appeared while you were talking.
//
// The tick lives in a gutter to the LEFT of the text rather than inline with
// it. That is the whole difference between a checklist and a script: the words
// all start at the same place down the page, so your eye runs down one edge
// instead of stepping in and out around controls.
const GUTTER = "pl-8";

function Line({
  item,
  section,
  facts,
  on,
  note,
  onToggle,
  onNote,
}: {
  item: PlaybookItem;
  section: PlaybookSectionDef;
  facts: Facts;
  on: boolean;
  note: string;
  onToggle: () => void;
  onNote: (value: string) => void;
}) {
  // A calc has nothing to tick and nothing to type. Set quietly, to the side,
  // as a number that turned up: it is glanced at, not worked through, and a
  // line that looked like the ones around it would invite a click that does
  // nothing.
  if (item.kind === "calc") {
    const fact = item.answerKey ? facts.get(item.answerKey) : undefined;
    const value = fact?.display ?? "";
    return (
      <div className={`${GUTTER} flex items-baseline gap-3 py-2`}>
        <Sigma size={11} aria-hidden className="shrink-0 translate-y-[1px] text-faint" />
        <span className="text-[13px] text-muted">{item.prompt}</span>
        <span className="h-px min-w-4 flex-1 self-center bg-[var(--divider)]" aria-hidden />
        <span
          className={[
            "shrink-0 text-[16px] font-semibold tabular-nums",
            value ? "text-[var(--brand)]" : "text-faint",
          ].join(" ")}
        >
          {/* Blank, not zero. Nothing has been answered yet, and a zero would
              be a claim about their business. */}
          {value || "not yet"}
        </span>
      </div>
    );
  }

  const isScript = item.kind === "script";

  return (
    <div className="relative py-2.5">
      {/* Absolute rather than a flex sibling, so the text below it (the hint,
          the answer) lines up with the words above rather than with a control. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={on ? "Covered" : "Mark covered"}
        onClick={onToggle}
        className="absolute left-0 top-[13px] grid h-[18px] w-[18px] place-items-center"
      >
        <span
          aria-hidden
          className={[
            "grid h-[15px] w-[15px] place-items-center rounded-full border transition-colors",
            on
              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
              : "border-[var(--border)] hover:border-[var(--brand)]",
          ].join(" ")}
        >
          {on && <Check size={10} strokeWidth={3} />}
        </span>
      </button>

      <div className={GUTTER}>
        <p
          className={[
            // Set for reading aloud: bigger than a UI label, and loose enough
            // that your eye finds the next line without hunting for it.
            "text-[15px] leading-[1.65] transition-colors",
            // A script line keeps its own line breaks and stays regular
            // weight, because it is a paragraph you say. A question is set in
            // medium so it stands out as the thing you ask.
            isScript ? "whitespace-pre-wrap font-normal" : "font-medium",
            on ? "text-faint" : "text-text",
          ].join(" ")}
        >
          <PromptText text={item.prompt} facts={facts} />
        </p>

        {/* The direction, not the line. Set small and grey so it is never
            mistaken for something to read out. */}
        {item.hint && (
          <p className="mt-0.5 text-[12px] italic leading-snug text-faint">
            <PromptText text={item.hint} facts={facts} />
          </p>
        )}

        {/* A script line has no box. There is no answer to a paragraph you read
            out, and an empty box under every one of them made the pre-pitch
            look unfinished for the whole call. */}
        {!isScript && (
          <AnswerBox
            value={note}
            placeholder={section.placeholder}
            answerKey={item.answerKey}
            onChange={onNote}
          />
        )}
      </div>
    </div>
  );
}

// How the call ends. The same five outcomes and the same panel as Sales Calls,
// opened out flat instead of behind a click on a row.
function OutcomeBand({
  meeting,
  record,
  outcome,
  summary,
  onSave,
}: {
  meeting: SalesMeeting;
  record: ReturnType<typeof useRecordSalesCallOutcome>;
  outcome: ReturnType<typeof useOutcomeDraft>;
  // The call facts as text, ready to go into the notes. Empty when nothing was
  // answered, which is the case a no-show lands in.
  summary: string;
  onSave: (chosen: NonNullable<SalesMeeting["outcome"]>) => void;
}) {
  // Choosing an outcome writes the facts into the notes box, where they can be
  // read and edited before saving.
  //
  // The per-question answers are still binned with the rest of the call state.
  // These are the six or eight things the half hour actually established, and
  // they are worth carrying onto the contact; the half-typed line under
  // "how's that working for you" is not.
  //
  // Appended UNDER whatever the meeting already had, never over it. A
  // follow-up call's notes are the reason it is not a cold call.
  const chooseWithFacts = (chosen: NonNullable<SalesMeeting["outcome"]>) => {
    outcome.choose(chosen);
    if (!summary) return;
    const existing = (meeting.notes ?? "").trim();
    outcome.set({ notes: existing ? `${existing}\n\n${summary}` : summary });
  };

  return (
    <div className="pk-card mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Outcome</h2>
        <span className="text-[11.5px] text-faint">
          {summary
            ? "Recording it tags the contact and moves the card. The call facts go into the notes; the rest stays in this browser."
            : "Recording it tags the contact and moves the card. The notes above stay in this browser."}
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
                onClick={() => chooseWithFacts(c.outcome)}
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
            onClick={() => chooseWithFacts(NO_SHOW_CHOICE.outcome)}
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

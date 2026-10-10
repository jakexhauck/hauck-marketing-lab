import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarPlus, Clock3, HelpCircle, Phone, PhoneMissed, X } from "lucide-react";
import Avatar from "../Avatar";
import { cn } from "../../lib/cn";
import { useToast } from "../../context/ToastContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useMoveLead, useNoAnswer } from "../../hooks/useLeadBoard";
import {
  LOST_REASONS,
  askFor,
  carriesFollowUp,
  currentBooking,
  leadFlags,
  lostLabel,
  matchesFocus,
  stageKeyOf,
  type BoardLead,
  type BoardPayload,
  type BoardStage,
  type Focus,
  type LostReason,
  type MoveRequest,
  type StageKey,
} from "../../lib/leadBoard";

// The Leads board: the client's GHL "Sales Pipeline" as columns. Drag a card,
// or tap it and pick, and the same rules run either way (Jake, 2026-10-08):
//   Follow Up        day + time (+ note); red once past
//   Estimate/Job     day + time. No GHL calendar: the app holds the booking
//   Won              dollar amount
//   Lost             one-tap reason
//   Cancelled        a plain move; bookings untouched
// Closing a picker cancels the move. On top: the Needs-you strip, "How did it
// go?" on bookings whose time has passed, and "What happened?" after a call.
//
// Follow Up and Long Term Nurture are not columns: they sit in a rail on the
// right, still drop targets, so they stop eating board width (Jake,
// 2026-10-10). Trash is not shown at all: a dead lead goes to Lost.

type Pending =
  | { kind: "ask"; lead: BoardLead; stage: BoardStage }
  | { kind: "outcome"; lead: BoardLead }
  | { kind: "afterCall"; lead: BoardLead };

const FOCUS: { id: Focus; label: string; urgent: boolean }[] = [
  { id: "new", label: "New", urgent: true },
  { id: "follow", label: "Follow-ups due", urgent: true },
  { id: "today", label: "Today", urgent: false },
  { id: "outcome", label: "How did it go?", urgent: true },
];

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// Card chips: "Oct 9, 10:30 AM". The weekday is dropped so it fits a column
// one-ninth of the screen wide; the sheets keep the long form.
const fmtShort = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, d.getMinutes() ? { hour: "numeric", minute: "2-digit" } : { hour: "numeric" });
  return `${day}, ${time}`;
};
const ago = (iso: string, now: number) => {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 60) return `${Math.max(m, 0)}m`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h`;
  return fmtDate(iso);
};

type ParkedKey = "followUp" | "noAnswer" | "nurture";
const PARKED: ParkedKey[] = ["followUp", "noAnswer", "nurture"];

export default function PipelineBoard({ data }: { data: BoardPayload }) {
  // Trash stays in GHL but never reaches the board, nor do the leads in it.
  const stages = useMemo(() => data.stages.filter((s) => s.key !== "trash"), [data.stages]);
  const leads = useMemo(
    () => data.leads.filter((l) => stages.some((s) => s.id === l.stageId)),
    [data.leads, stages],
  );
  const move = useMoveLead();
  const noAnswer = useNoAnswer();
  const { showToast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [calling, setCalling] = useState<string | null>(null);
  const now = Date.now();
  const isMobile = useIsMobile();
  const [dragging, setDragging] = useState(false);

  const byKey = (k: StageKey) => stages.find((s) => s.key === k) ?? null;
  const keyOf = (l: BoardLead) => stageKeyOf(stages, l.stageId);
  const flagsOf = (l: BoardLead) => leadFlags(l, keyOf(l), now);

  const fail = () => showToast("Could not move that lead. Try again.");

  const send = (m: MoveRequest, onDone?: () => void) => move.mutate(m, { onError: fail, onSuccess: onDone });

  // Every move, drag or tap, starts here.
  const requestMove = (leadId: string, stageId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    const stage = stages.find((s) => s.id === stageId);
    if (!lead || !stage) return;
    const ask = askFor(stage.key);
    // Same stage is a no-op, except where the stage carries a time: tapping
    // Estimate on a booked estimate is how a phone reschedules it.
    if (lead.stageId === stageId && ask !== "datetime" && ask !== "followUp") return;
    if (ask !== "none") return setPending({ kind: "ask", lead, stage });
    send({ id: lead.id, stageId });
    setOpenId(null);
  };

  const askStage = (lead: BoardLead, k: StageKey) => {
    const stage = byKey(k);
    if (stage) setPending({ kind: "ask", lead, stage });
  };

  // A booked lead whose time has passed asks how it went instead of opening.
  const openLead = (id: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    if (flagsOf(lead).needsOutcome) return setPending({ kind: "outcome", lead });
    setOpenId(id);
  };

  // Back from a call: open "What happened?". A phone blurs when the dialer
  // takes over and focuses on return; a desktop with no dialer never blurs, so
  // a short fallback opens it anyway.
  useEffect(() => {
    if (!calling) return;
    const lead = leads.find((l) => l.id === calling);
    let left = false;
    const show = () => {
      if (lead) setPending({ kind: "afterCall", lead });
      setOpenId(null);
      setCalling(null);
    };
    const onBlur = () => {
      left = true;
    };
    const onFocus = () => left && show();
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    const t = window.setTimeout(() => !left && show(), 1500);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(t);
    };
  }, [calling, leads]);

  const done = () => {
    setPending(null);
    setOpenId(null);
  };

  const shown = useMemo(
    () => (focus ? leads.filter((l) => matchesFocus(focus, stageKeyOf(stages, l.stageId), leadFlags(l, stageKeyOf(stages, l.stageId), now))) : leads),
    [focus, leads, stages, now],
  );
  const open = leads.find((l) => l.id === openId) ?? null;
  const counts = FOCUS.map((f) => ({
    ...f,
    n: leads.filter((l) => matchesFocus(f.id, keyOf(l), flagsOf(l))).length,
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isMobile ? (
        // Phone: a thin count bar, stage tabs, one full-width list. Nine
        // columns never fit across a phone, and a sideways-swiping board hid
        // every stage but one (Jake, 2026-10-08). Moves happen in the sheet.
        <>
          <MobileStrip counts={counts} value={focus} onChange={setFocus} />
          <MobileBoard
            stages={stages}
            leads={leads}
            shown={shown}
            focused={focus !== null}
            now={now}
            onOpen={openLead}
            onCall={setCalling}
          />
        </>
      ) : (
        <RailBoard
          stages={stages}
          leads={leads}
          shown={shown}
          counts={counts}
          focus={focus}
          onFocus={setFocus}
          dragging={dragging}
          onDragging={setDragging}
          now={now}
          onOpen={openLead}
          onMove={requestMove}
        />
      )}

      {open && !pending && (
        <LeadSheet
          lead={open}
          stages={stages}
          onClose={() => setOpenId(null)}
          onMove={(s) => requestMove(open.id, s)}
          onCall={() => setCalling(open.id)}
        />
      )}

      {pending?.kind === "ask" && (
        <AskSheet
          lead={pending.lead}
          stage={pending.stage}
          onClose={() => setPending(null)}
          onConfirm={(extra) => {
            send({ id: pending.lead.id, stageId: pending.stage.id, ...extra });
            done();
          }}
        />
      )}

      {pending?.kind === "outcome" && (
        <OutcomeSheet
          lead={pending.lead}
          isJob={keyOf(pending.lead) === "job"}
          onClose={() => setPending(null)}
          onPick={(k) => {
            if (k === "cancelled") {
              const stage = byKey("cancelled");
              if (stage) send({ id: pending.lead.id, stageId: stage.id });
              return done();
            }
            askStage(pending.lead, k);
          }}
        />
      )}

      {pending?.kind === "afterCall" && (
        <AfterCallSheet
          lead={pending.lead}
          onClose={done}
          onNoAnswer={() => {
            noAnswer.mutate(pending.lead.id, { onError: fail });
            done();
          }}
          onPick={(k) => askStage(pending.lead, k)}
        />
      )}
    </div>
  );
}

// ---------- phone ----------

const SHORT_LABEL: Record<Focus, string> = {
  new: "New",
  follow: "Follow-ups",
  today: "Today",
  outcome: "Check in",
};

function MobileStrip({
  counts,
  value,
  onChange,
}: {
  counts: { id: Focus; urgent: boolean; n: number }[];
  value: Focus | null;
  onChange: (f: Focus | null) => void;
}) {
  return (
    <div className="mx-5 mb-3 grid shrink-0 grid-cols-4 overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)]">
      {counts.map((f, i) => {
        const active = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(active ? null : f.id)}
            className={cn(
              "min-w-0 px-1 py-2 text-center transition-colors",
              i > 0 && "border-l border-[var(--divider)]",
              active && "bg-[var(--brand-tint)]",
            )}
          >
            <div
              className={cn(
                "font-display text-[18px] font-bold leading-none tnum",
                f.urgent && f.n > 0 ? "text-rose-600 dark:text-rose-400" : "text-[var(--text)]",
              )}
            >
              {f.n}
            </div>
            <div
              className={cn(
                "mt-1 truncate text-[11px] font-semibold",
                active ? "text-[var(--brand-text)]" : "text-[var(--text-muted)]",
              )}
            >
              {SHORT_LABEL[f.id]}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MobileBoard({
  stages,
  leads,
  shown,
  focused,
  now,
  onOpen,
  onCall,
}: {
  stages: BoardStage[];
  leads: BoardLead[];
  shown: BoardLead[];
  focused: boolean;
  now: number;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
}) {
  const [stageId, setStageId] = useState(() => stages.find((s) => s.key === "lead")?.id ?? stages[0]?.id ?? "");
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [stageId]);

  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  // A count in the strip shows its leads across every stage, each tagged with
  // the stage it sits in. Otherwise the tab picks the stage.
  const rows = focused ? shown : leads.filter((l) => l.stageId === stage?.id);
  if (!focused && carriesFollowUp(stage?.key ?? null)) {
    rows.sort((a, b) => (a.followUp?.at ?? "").localeCompare(b.followUp?.at ?? ""));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!focused && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-5 pb-3 [scrollbar-width:none]">
          {stages.map((s) => {
            const n = leads.filter((l) => l.stageId === s.id).length;
            const active = s.id === stage?.id;
            return (
              <button
                key={s.id}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => setStageId(s.id)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                  active
                    ? "border-transparent bg-[var(--text)] text-[var(--surface)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]",
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? "var(--text-faint)" }} />
                {s.name}
                <span className={cn("tnum", active ? "opacity-70" : "text-[var(--text-faint)]")}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-6">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-[var(--text-muted)]">No leads.</div>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {rows.map((l, i) => {
                const key = stageKeyOf(stages, l.stageId);
                return (
                  <MobileRow
                    key={l.id}
                    lead={l}
                    stage={focused ? stages.find((s) => s.id === l.stageId) ?? null : null}
                    stageKey={key}
                    flags={leadFlags(l, key, now)}
                    now={now}
                    last={i === rows.length - 1}
                    onOpen={() => onOpen(l.id)}
                    onCall={() => onCall(l.id)}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileRow({
  lead,
  stage,
  stageKey,
  flags,
  now,
  last,
  onOpen,
  onCall,
}: {
  lead: BoardLead;
  stage: BoardStage | null;
  stageKey: StageKey | null;
  flags: ReturnType<typeof leadFlags>;
  now: number;
  last: boolean;
  onOpen: () => void;
  onCall: () => void;
}) {
  const booking = currentBooking(lead, stageKey);
  const follow = carriesFollowUp(stageKey) ? lead.followUp : null;
  const lostReason = stageKey === "lost" ? lead.lostReason : null;
  const quiet = !stage && !booking && !follow && !lead.value && !lostReason;
  // Two targets side by side, not nested: the row opens the lead, the phone
  // button rings them (and "What happened?" waits for their return).
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", !last && "border-b border-[var(--divider)]")}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={lead.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-[14.5px] font-bold text-[var(--text)]">{lead.name}</span>
            <span
              className={cn(
                "shrink-0 text-[12px] tnum",
                flags.staleNew ? "font-semibold text-rose-600 dark:text-rose-400" : "text-[var(--text-faint)]",
              )}
            >
              {stageKey === "lead" ? ago(lead.createdAt, now) : fmtDate(lead.createdAt)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {stage && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stage.color ?? "var(--text-faint)" }} />
                {stage.name}
              </span>
            )}
            {booking &&
              (flags.needsOutcome ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <HelpCircle size={12} strokeWidth={2.4} />
                  How did it go?
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-tint)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--brand-text)]">
                  <CalendarPlus size={12} strokeWidth={2.4} />
                  {fmtShort(booking.at)}
                </span>
              ))}
            {follow && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
                  flags.followOverdue
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
                )}
              >
                <Clock3 size={12} strokeWidth={2.4} />
                {fmtShort(follow.at)}
              </span>
            )}
            {carriesFollowUp(stageKey) && lead.attempts > 0 && (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--text-muted)]">
                <PhoneMissed size={12} strokeWidth={2.2} />
                {lead.attempts}
              </span>
            )}
            {lostReason && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11.5px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {lostLabel(lostReason)}
              </span>
            )}
            {lead.value ? (
              <span className="text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400 tnum">
                ${lead.value.toLocaleString()}
              </span>
            ) : null}
            {quiet && lead.phone && (
              <span className="truncate text-[12.5px] text-[var(--text-muted)] tnum">{lead.phone}</span>
            )}
          </div>
        </div>
      </button>
      {lead.phone && (
        <a
          href={`tel:${lead.phone}`}
          onClick={onCall}
          aria-label={`Call ${lead.name}`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--brand-text)] active:bg-[var(--brand-tint)]"
        >
          <Phone size={17} strokeWidth={2.2} />
        </a>
      )}
    </li>
  );
}

// ---------- desktop: board + rail ----------

function RailBoard({
  stages,
  leads,
  shown,
  counts,
  focus,
  onFocus,
  dragging,
  onDragging,
  now,
  onOpen,
  onMove,
}: {
  stages: BoardStage[];
  leads: BoardLead[];
  shown: BoardLead[];
  counts: { id: Focus; label: string; urgent: boolean; n: number }[];
  focus: Focus | null;
  onFocus: (f: Focus | null) => void;
  dragging: boolean;
  onDragging: (d: boolean) => void;
  now: number;
  onOpen: (id: string) => void;
  onMove: (id: string, stageId: string) => void;
}) {
  const boardStages = stages.filter((s) => !PARKED.includes(s.key as ParkedKey));
  const stageOf = (k: ParkedKey) => stages.find((s) => s.key === k) ?? null;
  const parkedLeads = (k: ParkedKey, from: BoardLead[]) => {
    const st = stageOf(k);
    const rows = from.filter((l) => l.stageId === st?.id);
    return carriesFollowUp(k)
      ? rows.sort((a, b) => (a.followUp?.at ?? "").localeCompare(b.followUp?.at ?? ""))
      : rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };
  const overdue = (k: ParkedKey) => parkedLeads(k, leads).filter((l) => leadFlags(l, k, now).followOverdue).length;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragStart={() => onDragging(true)}
      onDragEnd={() => onDragging(false)}
      onDrop={() => onDragging(false)}
    >
      <NeedsStrip counts={counts} value={focus} onChange={onFocus} />
      <div className="flex min-h-0 flex-1 pr-4">
        <Columns stages={boardStages} leads={shown} now={now} onOpen={onOpen} onMove={onMove} />
        <aside className="flex w-[280px] shrink-0 flex-col gap-1.5 pb-6 pt-1">
          {PARKED.map((k) => {
            const st = stageOf(k);
            if (!st) return null;
            return (
              <DropZone
                key={k}
                stageId={st.id}
                onMove={onMove}
                armed={dragging}
                className={cn(
                  "flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]",
                  k === "nurture" ? "flex-[2]" : "flex-[3]",
                )}
              >
                <header className="flex items-center gap-1.5 px-3 pb-1.5 pt-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.color ?? "var(--text-faint)" }} />
                  <span className="font-display text-[12.5px] font-bold text-[var(--text)]">{st.name}</span>
                  {overdue(k) > 0 && <OverdueDot n={overdue(k)} />}
                  <span className="ml-auto text-[11.5px] font-semibold text-[var(--text-muted)] tnum">
                    {parkedLeads(k, leads).length}
                  </span>
                </header>
                <div className="mx-1.5 mb-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <RailList stageKey={k} leads={parkedLeads(k, shown)} now={now} onOpen={onOpen} />
                </div>
              </DropZone>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

function OverdueDot({ n }: { n: number }) {
  return (
    <span
      title="Overdue"
      className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white tnum"
    >
      {n}
    </span>
  );
}

function DropZone({
  stageId,
  onMove,
  armed,
  className,
  children,
}: {
  stageId: string | null;
  onMove: (id: string, stageId: string) => void;
  armed: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id && stageId) onMove(id, stageId);
        setOver(false);
      }}
      className={cn(
        "transition-shadow",
        armed && "ring-2 ring-[var(--brand-primary)]/40",
        over && "ring-2 ring-[var(--brand-primary)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function RailList({
  stageKey,
  leads,
  now,
  onOpen,
}: {
  stageKey: ParkedKey;
  leads: BoardLead[];
  now: number;
  onOpen: (id: string) => void;
}) {
  if (leads.length === 0) return <div className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">No leads.</div>;
  return (
    <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {leads.map((l, i) => {
        const flags = leadFlags(l, stageKey, now);
        const follow = carriesFollowUp(stageKey) ? l.followUp : null;
        return (
          // Draggable both ways: a rail row can be dropped onto a column.
          <li
            key={l.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
            onClick={() => onOpen(l.id)}
            className={cn(
              "flex cursor-pointer items-center gap-2 px-2.5 py-2 hover:bg-[var(--surface-2)]",
              i < leads.length - 1 && "border-b border-[var(--divider)]",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-display text-[12.5px] font-bold text-[var(--text)]">{l.name}</span>
                {carriesFollowUp(stageKey) && l.attempts > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] font-medium text-[var(--text-muted)]">
                    <PhoneMissed size={11} strokeWidth={2.2} />
                    {l.attempts}
                  </span>
                )}
              </div>
              {follow?.note && <div className="truncate text-[11.5px] text-[var(--text-muted)]">{follow.note}</div>}
            </div>
            {follow ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
                  flags.followOverdue
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
                )}
              >
                <Clock3 size={12} strokeWidth={2.4} />
                {fmtShort(follow.at)}
              </span>
            ) : (
              <span className="shrink-0 text-[11.5px] text-[var(--text-faint)] tnum">{fmtDate(l.createdAt)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- strip + columns ----------

function NeedsStrip({
  counts,
  value,
  onChange,
}: {
  counts: { id: Focus; label: string; urgent: boolean; n: number }[];
  value: Focus | null;
  onChange: (f: Focus | null) => void;
}) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 px-5 pb-3 sm:grid-cols-4 lg:max-w-3xl lg:px-6">
      {counts.map((f) => {
        const active = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(active ? null : f.id)}
            className={cn(
              "flex flex-col items-start rounded-2xl border px-3.5 py-2.5 text-left transition-colors",
              active
                ? "border-[var(--brand-primary)] bg-[var(--brand-tint)]"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
            )}
          >
            <span
              className={cn(
                "font-display text-[22px] font-bold leading-none tnum",
                f.urgent && f.n > 0 ? "text-rose-600 dark:text-rose-400" : "text-[var(--text)]",
              )}
            >
              {f.n}
            </span>
            <span className="mt-1 text-[12.5px] font-semibold text-[var(--text-muted)]">{f.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Columns({
  stages,
  leads,
  now,
  onOpen,
  onMove,
}: {
  stages: BoardStage[];
  leads: BoardLead[];
  now: number;
  onOpen: (id: string) => void;
  onMove: (id: string, stageId: string) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  return (
    // Desktop: every stage shares the width, so the whole pipeline is on screen
    // with no sideways scroll (Jake, 2026-10-08). Phone: fixed-width columns
    // that swipe, since nine will never fit across a phone.
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 pb-6 pt-1 lg:gap-1.5 lg:overflow-x-hidden lg:px-4">
      {stages.map((s) => {
        const col = leads.filter((l) => l.stageId === s.id);
        if (s.key === "followUp") col.sort((a, b) => (a.followUp?.at ?? "").localeCompare(b.followUp?.at ?? ""));
        const total = col.reduce((n, l) => n + (l.value ?? 0), 0);
        const flags = col.map((l) => leadFlags(l, s.key, now));
        const alert =
          s.key === "followUp"
            ? flags.filter((f) => f.followOverdue).length
            : s.key === "lead"
              ? flags.filter((f) => f.staleNew).length
              : 0;
        return (
          <section
            key={s.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) onMove(id, s.id);
              setOver(null);
            }}
            className={cn(
              "flex w-[264px] shrink-0 flex-col rounded-2xl border bg-[var(--surface-2)] transition-colors lg:w-auto lg:min-w-0 lg:flex-1 lg:shrink lg:rounded-xl",
              over === s.id ? "border-[var(--brand-primary)]" : "border-[var(--border)]",
            )}
          >
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 pb-2 pt-3 lg:px-2 lg:pt-2.5">
              <span className="flex min-w-0 items-center gap-1.5 lg:w-full">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color ?? "var(--text-faint)" }} />
                <span
                  title={s.name}
                  className="truncate font-display text-[13.5px] font-bold text-[var(--text)] lg:line-clamp-2 lg:whitespace-normal lg:text-[12.5px] lg:leading-tight"
                >
                  {/* A break point after "/" so "Job/Estimate Cancelled" wraps
                      at the slash instead of being cut mid-word. */}
                  {s.name.replace(/\//g, "/" + ZERO_WIDTH_SPACE)}
                </span>
              </span>
              {alert > 0 && (
                <span
                  title={s.key === "followUp" ? "Overdue" : "Waiting over an hour"}
                  className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white tnum"
                >
                  {alert}
                </span>
              )}
              <span className="ml-auto shrink-0 text-[12px] font-semibold text-[var(--text-muted)] tnum lg:ml-0 lg:text-[11.5px]">
                {col.length}
                {total > 0 && ` · $${total.toLocaleString()}`}
              </span>
            </header>
            <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5 lg:gap-1.5 lg:px-1.5 lg:pb-1.5">
              {col.map((l, i) => (
                <LeadCard key={l.id} lead={l} stageKey={s.key} flags={flags[i]} now={now} onOpen={() => onOpen(l.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LeadCard({
  lead,
  stageKey,
  flags,
  now,
  onOpen,
}: {
  lead: BoardLead;
  stageKey: StageKey | null;
  flags: ReturnType<typeof leadFlags>;
  now: number;
  onOpen: () => void;
}) {
  const booking = currentBooking(lead, stageKey);
  const showFollow = carriesFollowUp(stageKey) && lead.followUp;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
      onClick={onOpen}
      title={lead.name}
      className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left shadow-[var(--shadow-sm)] transition-transform active:scale-[0.98] lg:rounded-lg lg:px-2 lg:py-2"
    >
      <div className="flex items-center justify-between gap-2 lg:flex-col lg:items-start lg:gap-0">
        <span className="max-w-full truncate font-display text-[14px] font-bold text-[var(--text)] lg:line-clamp-2 lg:whitespace-normal lg:break-words lg:text-[12.5px] lg:leading-tight">{lead.name}</span>
        <span
          className={cn(
            "shrink-0 text-[11.5px] tnum lg:text-[11px]",
            flags.staleNew ? "font-semibold text-rose-600 dark:text-rose-400" : "text-[var(--text-faint)]",
          )}
        >
          {stageKey === "lead" ? ago(lead.createdAt, now) : fmtDate(lead.createdAt)}
        </span>
      </div>
      {lead.phone && <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)] tnum lg:hidden">{lead.phone}</div>}
      {booking &&
        (flags.needsOutcome ? (
          <div className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full lg:rounded-md bg-amber-100 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <HelpCircle size={12} strokeWidth={2.4} className="shrink-0" />
            <span className="truncate lg:whitespace-normal lg:leading-tight">How did it go?</span>
          </div>
        ) : (
          <div className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full lg:rounded-md bg-[var(--brand-tint)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--brand-text)]">
            <CalendarPlus size={12} strokeWidth={2.4} className="shrink-0" />
            <span className="truncate lg:whitespace-normal lg:leading-tight">{fmtShort(booking.at)}</span>
          </div>
        ))}
      {showFollow && (
        <div
          className={cn(
            "mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full lg:rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
            flags.followOverdue
              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
          )}
        >
          <Clock3 size={12} strokeWidth={2.4} className="shrink-0" />
          <span className="truncate lg:whitespace-normal lg:leading-tight">{fmtShort(lead.followUp!.at)}</span>
        </div>
      )}
      {carriesFollowUp(stageKey) && lead.attempts > 0 && (
        <div className="mt-1 flex items-center gap-1 text-[11.5px] font-medium text-[var(--text-muted)]">
          <PhoneMissed size={12} strokeWidth={2.2} />
          {lead.attempts} {lead.attempts === 1 ? "try" : "tries"}
        </div>
      )}
      {stageKey === "lost" && lead.lostReason && (
        <div className="mt-1.5 inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11.5px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {lostLabel(lead.lostReason)}
        </div>
      )}
      {lead.value ? (
        <div className="mt-1.5 text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400 tnum">
          ${lead.value.toLocaleString()}
        </div>
      ) : null}
    </button>
  );
}

// ---------- sheets ----------

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-[rgba(15,18,48,0.42)] sm:place-items-center sm:p-5" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:max-w-[460px] sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function SheetHead({ lead, title, onClose }: { lead: BoardLead; title?: string; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 px-5 pb-3 pt-5">
      <Avatar name={lead.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[17px] font-bold text-[var(--text)]">{title ?? lead.name}</div>
        <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)] tnum">{title ? lead.name : lead.phone}</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function LeadSheet({
  lead,
  stages,
  onClose,
  onMove,
  onCall,
}: {
  lead: BoardLead;
  stages: BoardStage[];
  onClose: () => void;
  onMove: (stageId: string) => void;
  onCall: () => void;
}) {
  const est = stages.find((s) => s.key === "estimate");
  const job = stages.find((s) => s.key === "job");
  return (
    <Sheet label={lead.name} onClose={onClose}>
      <SheetHead lead={lead} onClose={onClose} />
      <div className="grid grid-cols-3 gap-2 px-5">
        {lead.phone ? (
          <a
            href={`tel:${lead.phone}`}
            onClick={onCall}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] text-[14px] font-semibold text-[var(--brand-text)]"
          >
            <Phone size={16} strokeWidth={2.3} />
            Call
          </a>
        ) : (
          <span />
        )}
        {est && (
          <button
            type="button"
            onClick={() => onMove(est.id)}
            className="flex h-11 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-[14px] font-semibold text-white"
          >
            Estimate
          </button>
        )}
        {job && (
          <button
            type="button"
            onClick={() => onMove(job.id)}
            className="flex h-11 items-center justify-center rounded-xl border border-[var(--border)] text-[14px] font-semibold text-[var(--text)]"
          >
            Job
          </button>
        )}
      </div>
      <div className="px-5 pb-2 pt-4 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Stage</div>
      <div className="grid grid-cols-1 gap-1.5 px-5 pb-5 sm:grid-cols-2">
        {stages.map((s) => {
          const active = s.id === lead.stageId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onMove(s.id)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl border px-3 text-left text-[13.5px] font-semibold transition-colors",
                active
                  ? "border-[var(--brand-primary)] bg-[var(--brand-tint)] text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color ?? "var(--text-faint)" }} />
              <span className="truncate">{s.name}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// What a stage asks for before a lead can land in it.
function AskSheet({
  lead,
  stage,
  onClose,
  onConfirm,
}: {
  lead: BoardLead;
  stage: BoardStage;
  onClose: () => void;
  onConfirm: (extra: Partial<MoveRequest>) => void;
}) {
  const ask = askFor(stage.key);
  if (ask === "value") return <WonSheet lead={lead} title={stage.name} onClose={onClose} onConfirm={(value) => onConfirm({ value })} />;
  if (ask === "reason")
    return <LostSheet lead={lead} title={stage.name} onClose={onClose} onConfirm={(lostReason) => onConfirm({ lostReason })} />;
  const isFollow = ask === "followUp";
  const confirm = stage.key === "estimate" ? "Book estimate" : stage.key === "job" ? "Book job" : "Set follow up";
  return (
    <DateTimeSheet
      lead={lead}
      title={stage.name}
      confirm={confirm}
      withNote={isFollow}
      initialNote={isFollow ? lead.followUp?.note ?? "" : ""}
      onClose={onClose}
      onConfirm={(at, note) => onConfirm(isFollow ? { at, note } : { at })}
    />
  );
}

function nextDays(n: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (out.length < n) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const QUICK_TIMES = [
  { label: "9 AM", value: "09:00" },
  { label: "11 AM", value: "11:00" },
  { label: "1 PM", value: "13:00" },
  { label: "3 PM", value: "15:00" },
];

function QuickRow({ options }: { options: { label: string; on: boolean; pick: () => void }[] }) {
  return (
    <div className="flex gap-2 px-5 pb-3">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={o.pick}
          className={cn(
            "h-9 flex-1 rounded-full border text-[13px] font-semibold",
            o.on
              ? "border-transparent bg-[var(--text)] text-[var(--surface)]"
              : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ConfirmButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="px-5 pb-5">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="h-11 w-full rounded-xl bg-[var(--brand-primary)] text-[14.5px] font-semibold text-white disabled:opacity-40"
      >
        {children}
      </button>
    </div>
  );
}

function DateTimeSheet({
  lead,
  title,
  confirm,
  withNote,
  initialNote,
  onClose,
  onConfirm,
}: {
  lead: BoardLead;
  title: string;
  confirm: string;
  withNote: boolean;
  initialNote: string;
  onClose: () => void;
  onConfirm: (at: string, note: string) => void;
}) {
  const days = useMemo(() => nextDays(21), []);
  const [dayIdx, setDayIdx] = useState(1);
  const [time, setTime] = useState("10:00");
  const [note, setNote] = useState(initialNote);

  const when = () => {
    const [h, m] = time.split(":").map(Number);
    const t = new Date(days[dayIdx]);
    t.setHours(h, m, 0, 0);
    return t.toISOString();
  };

  return (
    <Sheet label={`${title}: ${lead.name}`} onClose={onClose}>
      <SheetHead lead={lead} title={title} onClose={onClose} />
      <QuickRow
        options={[
          { label: "Tomorrow", on: dayIdx === 1, pick: () => setDayIdx(1) },
          { label: "3 days", on: dayIdx === 3, pick: () => setDayIdx(3) },
          { label: "Next week", on: dayIdx === 7, pick: () => setDayIdx(7) },
        ]}
      />
      <div className="flex gap-2 overflow-x-auto px-5 pb-3">
        {days.map((d, i) => (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => setDayIdx(i)}
            className={cn(
              "flex w-[60px] shrink-0 flex-col items-center rounded-xl border py-2",
              i === dayIdx ? "border-[var(--brand-primary)] bg-[var(--brand-tint)]" : "border-[var(--border)]",
            )}
          >
            <span className="text-[11.5px] font-semibold text-[var(--text-muted)]">
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <span className="font-display text-[17px] font-bold text-[var(--text)] tnum">{d.getDate()}</span>
          </button>
        ))}
      </div>
      <QuickRow options={QUICK_TIMES.map((t) => ({ label: t.label, on: time === t.value, pick: () => setTime(t.value) }))} />
      <div className="flex flex-col gap-2 px-5 pb-4">
        <input
          type="time"
          aria-label="Time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[14.5px] font-semibold text-[var(--text)] tnum focus:border-[var(--brand-primary)] focus:outline-none"
        />
        {withNote && (
          <input
            type="text"
            aria-label="Note"
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text)] focus:border-[var(--brand-primary)] focus:outline-none"
          />
        )}
      </div>
      <ConfirmButton disabled={!time} onClick={() => onConfirm(when(), note.trim())}>
        {confirm}
      </ConfirmButton>
    </Sheet>
  );
}

function WonSheet({
  lead,
  title,
  onClose,
  onConfirm,
}: {
  lead: BoardLead;
  title: string;
  onClose: () => void;
  onConfirm: (value: number) => void;
}) {
  const [raw, setRaw] = useState(lead.value ? String(lead.value) : "");
  const value = Number(raw.replace(/[^0-9.]/g, ""));
  const ok = raw.trim() !== "" && Number.isFinite(value) && value > 0;
  return (
    <Sheet label={`${title}: ${lead.name}`} onClose={onClose}>
      <SheetHead lead={lead} title={title} onClose={onClose} />
      <div className="px-5 pb-4">
        <label className="relative flex">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] font-semibold text-[var(--text-muted)]">
            $
          </span>
          <input
            autoFocus
            inputMode="decimal"
            aria-label="Job amount"
            placeholder="0"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ok && onConfirm(value)}
            className="h-14 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 font-display text-[22px] font-bold text-[var(--text)] tnum focus:border-[var(--brand-primary)] focus:outline-none"
          />
        </label>
      </div>
      <ConfirmButton disabled={!ok} onClick={() => onConfirm(value)}>
        Mark won
      </ConfirmButton>
    </Sheet>
  );
}

function LostSheet({
  lead,
  title,
  onClose,
  onConfirm,
}: {
  lead: BoardLead;
  title: string;
  onClose: () => void;
  onConfirm: (reason: LostReason) => void;
}) {
  return (
    <Sheet label={`${title}: ${lead.name}`} onClose={onClose}>
      <SheetHead lead={lead} title={title} onClose={onClose} />
      <div className="grid grid-cols-2 gap-2 px-5 pb-5">
        {LOST_REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onConfirm(r.id)}
            className="h-11 rounded-xl border border-[var(--border)] text-[14px] font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
          >
            {r.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ChoiceGrid({ choices }: { choices: { label: string; tone?: string; onClick: () => void }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 px-5 pb-5">
      {choices.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onClick}
          className={cn(
            "h-12 rounded-xl border border-[var(--border)] text-[14px] font-semibold hover:bg-[var(--surface-2)]",
            c.tone ?? "text-[var(--text)]",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

const WIN = "text-emerald-600 dark:text-emerald-400";
const LOSE = "text-rose-600 dark:text-rose-400";

function OutcomeSheet({
  lead,
  isJob,
  onClose,
  onPick,
}: {
  lead: BoardLead;
  isJob: boolean;
  onClose: () => void;
  onPick: (k: StageKey) => void;
}) {
  const booking = lead.bookings.find((b) => b.kind === (isJob ? "job" : "estimate"));
  return (
    <Sheet label={`How did it go: ${lead.name}`} onClose={onClose}>
      <SheetHead lead={lead} title="How did it go?" onClose={onClose} />
      {booking && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[13px] font-semibold text-[var(--text-muted)]">
          <CalendarPlus size={15} strokeWidth={2.3} />
          {isJob ? "Job" : "Estimate"} · {fmtWhen(booking.at)}
        </div>
      )}
      <ChoiceGrid
        choices={
          isJob
            ? [
                { label: "Done", tone: WIN, onClick: () => onPick("won") },
                { label: "Rescheduled", onClick: () => onPick("job") },
                { label: "Cancelled", tone: LOSE, onClick: () => onPick("cancelled") },
              ]
            : [
                // No "Sold": a sold estimate is a job to book, and the won stage
                // (Job Completed) is for work that is done.
                { label: "Job booked", tone: WIN, onClick: () => onPick("job") },
                { label: "Follow up", onClick: () => onPick("followUp") },
                { label: "Lost", tone: LOSE, onClick: () => onPick("lost") },
              ]
        }
      />
    </Sheet>
  );
}

function AfterCallSheet({
  lead,
  onClose,
  onNoAnswer,
  onPick,
}: {
  lead: BoardLead;
  onClose: () => void;
  onNoAnswer: () => void;
  onPick: (k: StageKey) => void;
}) {
  return (
    <Sheet label={`What happened: ${lead.name}`} onClose={onClose}>
      <SheetHead lead={lead} title="What happened?" onClose={onClose} />
      <ChoiceGrid
        choices={[
          { label: "No answer", onClick: onNoAnswer },
          { label: "Estimate booked", onClick: () => onPick("estimate") },
          { label: "Follow up", onClick: () => onPick("followUp") },
          { label: "Not interested", tone: LOSE, onClick: () => onPick("lost") },
        ]}
      />
    </Sheet>
  );
}

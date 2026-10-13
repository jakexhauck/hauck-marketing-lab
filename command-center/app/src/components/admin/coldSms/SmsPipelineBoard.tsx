import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Check, ChevronsLeft, Loader2, Search, X } from "lucide-react";
import BoardScrollbar from "../../BoardScrollbar";
import Toast from "../../Toast";
import { stageTone } from "../../../lib/setterModel";
import { timeAgo } from "../../../lib/timeAgo";
import { dayKeyOf } from "../../../lib/coldSmsWeek";
import { ApiError, type ColdSmsCard, type ColdSmsFollowUpInput, type ColdSmsVerdict } from "../../../lib/api";
import {
  hasContacted,
  useColdSmsBoardQuery,
  useBookedSweep,
  useContactedToggle,
  useFollowUp,
  useLoadMoreStage,
  useMoveCard,
  useRemoveCards,
  useReplyClassifier,
} from "../../../hooks/useColdSmsBoard";
import SmsProspectPanel from "./SmsProspectPanel";
import { VerdictBadge } from "./VerdictBadge";
import {
  FOLLOW_UP_NOTE_MAX,
  addDays,
  followUpLabel,
  followUpState,
  timeLabel,
} from "../../../../functions/lib/coldSmsFollowUp";

// Cold SMS > Pipeline (Jake, 2026-10-12). The agency's "Cold SMS" pipeline in
// GoHighLevel as a board: drag a card to move it in GHL, click it for the
// prospect, the thread, a reply box and the booking wizard.
//
// GHL's workflow moves a prospect to Replied when they text back. Claude reads
// the reply, the card wears its verdict, and the server moves it on: positive to
// Positive Reply, negative and stop to Negative Reply (Jake, 2026-10-13). Check
// stays in Replied for Jake.

type Filter = "all" | ColdSmsVerdict;

const FIRST = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "positive", label: "Positive" },
  { id: "negative", label: "Negative" },
  { id: "check", label: "Check" },
  { id: "stop", label: "Stop" },
];

// Collapsed columns (Jake, 2026-10-13: hide the stages he does not need). A
// per-viewer convenience, so browser storage; the board works without it.
const COLLAPSED_KEY = "coldSms.collapsedStages";

function readCollapsed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(ids: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* private window or storage off: collapse still works until reload */
  }
}

// "Today", "Yesterday", else "Thu, Oct 9". The key is a calendar date already in
// Jake's zone, so it is formatted as UTC to keep it from shifting a day.
function dayLabel(day: string, zone: string): string {
  const today = dayKeyOf(Date.now(), zone);
  const yesterday = dayKeyOf(Date.now() - 864e5, zone);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

export default function SmsPipelineBoard() {
  // The day filter rides in ?day= so a refresh stays on it. Days are by the
  // first text sent, in Jake's zone (Jake, 2026-10-12).
  const [params, setParams] = useSearchParams();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") ?? "") ? params.get("day")! : "";
  const setDay = (d: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (d) next.set("day", d);
        else next.delete("day");
        return next;
      },
      { replace: true },
    );
  const board = useColdSmsBoardQuery(day);
  const classifier = useReplyClassifier(Boolean(board.data?.stages));
  useBookedSweep(Boolean(board.data?.stages));
  const more = useLoadMoreStage();
  const move = useMoveCard();
  const removeCards = useRemoveCards();
  const contacted = useContactedToggle();
  const followUp = useFollowUp();
  const [menu, setMenu] = useState<{ card: ColdSmsCard; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<ColdSmsCard | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const toggleCollapsed = (stageId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      saveCollapsed(next);
      return next;
    });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const now = Date.now();
  const zone = board.data?.timezone ?? "America/New_York";
  const today = dayKeyOf(now, zone);

  const stages = board.data?.stages ?? [];
  const pipelineId = board.data?.pipeline?.id ?? "";

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return (c: ColdSmsCard) => {
      if (filter !== "all" && c.verdict !== filter) return false;
      if (!q) return true;
      return (
        c.business.toLowerCase().includes(q) ||
        c.person.toLowerCase().includes(q) ||
        (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits))
      );
    };
  }, [filter, query]);

  const openCard = useMemo(() => {
    for (const s of stages) for (const c of s.cards) if (c.id === openId) return c;
    return null;
  }, [stages, openId]);

  const saveFollowUp = (card: ColdSmsCard, f: ColdSmsFollowUpInput) =>
    followUp.mutate(
      { card, f },
      {
        onSuccess: (res) =>
          setToast(
            res.taskFailed
              ? "Follow up saved. GHL did not take the task."
              : f.day
                ? `Follow up ${followUpLabel(f.day)}${f.time ? `, ${timeLabel(f.time)}` : ""}`
                : f.note
                  ? "Note saved"
                  : "Follow up cleared",
          ),
        onError: () => setToast("Follow up did not save"),
      },
    );

  // Drag targets: an open column's card list, or a collapsed column's strip.
  const dropProps = (stage: { id: string; name: string }) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (overStage !== stage.id) setOverStage(stage.id);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverStage(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOverStage(null);
      const id = e.dataTransfer.getData("text/plain");
      const card = stages.flatMap((s) => s.cards).find((c) => c.id === id);
      if (card) doMove(card, pipelineId, stage.id, stage.name);
    },
  });

  const doMove = (card: ColdSmsCard, toPipeline: string, toStage: string, label: string) => {
    if (toPipeline === pipelineId && toStage === card.stageId) return;
    move.mutate(
      { card, pipelineId: toPipeline, stageId: toStage },
      {
        onSuccess: () => setToast(`Moved to ${label}`),
        onError: (e) =>
          setToast(e instanceof ApiError && e.status === 400 ? "That stage no longer exists in GHL" : "GHL did not take the move. Put back."),
      },
    );
  };

  if (board.isLoading) return <div className="pk-empty">Reading the board...</div>;
  if (board.isError) {
    const upstream = board.error instanceof ApiError && board.error.status === 502;
    return <div className="pk-empty">{upstream ? "GoHighLevel did not answer. Try again in a minute." : "The board did not load."}</div>;
  }
  if (!board.data?.configured) return <div className="pk-empty">The agency GoHighLevel account is not connected.</div>;
  if (board.data.missing) return <div className="pk-empty">No pipeline named "Cold SMS" in GoHighLevel.</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-label="First texted"
          className="rounded-xl border border-[var(--border)] bg-surface px-3 py-2 text-[13px] font-semibold text-text outline-none focus:border-[var(--brand)]"
        >
          <option value="">All days</option>
          {(board.data.days ?? []).map((d) => (
            <option key={d.day} value={d.day}>
              {dayLabel(d.day, board.data?.timezone ?? "America/New_York")} · {d.texted.toLocaleString()}
            </option>
          ))}
        </select>
        {board.isFetching && !board.isLoading && <Loader2 size={14} className="animate-spin text-faint" aria-label="Loading" />}
        <label className="relative flex items-center">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-3 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search business or phone"
            aria-label="Search business or phone"
            className="w-[260px] rounded-xl border border-[var(--border)] bg-surface py-2 pl-8 pr-3 text-[13px] text-text outline-none focus:border-[var(--brand)]"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reply filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                filter === f.id
                  ? "border-[var(--brand)] bg-[var(--brand-tint)] text-text"
                  : "border-[var(--border)] bg-surface text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {classifier.running && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-faint">
            <Loader2 size={13} className="animate-spin" aria-hidden />
            Sorting replies{classifier.remaining ? ` (${classifier.remaining})` : ""}
          </span>
        )}
        {classifier.failed && <span className="text-[12px] font-semibold text-[var(--warning)]">Replies not sorted</span>}
      </div>

      <div ref={scrollRef} className="no-scrollbar flex items-start gap-3 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const tone = stageTone(stage.name);
          const shown = stage.cards.filter(matches);
          if (collapsed.has(stage.id)) {
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => toggleCollapsed(stage.id)}
                aria-label={`Expand ${stage.name}`}
                title={stage.name}
                {...dropProps(stage)}
                className="flex w-[44px] shrink-0 flex-col items-center gap-2 rounded-2xl bg-surface-2 py-3 hover:bg-[color-mix(in_srgb,var(--surface-2)_80%,var(--brand))]"
                style={{
                  boxShadow: `inset 0 3px 0 ${tone}`,
                  outline: overStage === stage.id ? "2px dashed var(--brand)" : "2px dashed transparent",
                  outlineOffset: -2,
                  minHeight: 220,
                }}
              >
                <span
                  className="font-data rounded-full px-1.5 text-[12px] font-bold"
                  style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
                >
                  {stage.total.toLocaleString()}
                </span>
                <span
                  className="font-display text-[13px] font-bold text-text"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {stage.name}
                </span>
              </button>
            );
          }
          return (
            <section key={stage.id} className="flex w-[290px] shrink-0 flex-col gap-2">
              <header className="flex items-baseline justify-between gap-2 px-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} aria-hidden />
                  <span className="truncate font-display text-[14px] font-bold text-text" title={stage.name}>
                    {stage.name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span
                    className="font-data rounded-full px-1.5 text-[12px] font-bold"
                    style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
                  >
                    {stage.total.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(stage.id)}
                    aria-label={`Collapse ${stage.name}`}
                    title="Collapse"
                    className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-text"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                </span>
              </header>

              <div
                {...dropProps(stage)}
                className="flex max-h-[calc(100vh-260px)] min-h-[110px] flex-col gap-2 overflow-y-auto rounded-2xl bg-surface-2 p-2 transition-[outline-color]"
                style={{
                  boxShadow: `inset 0 3px 0 ${tone}`,
                  outline: overStage === stage.id ? "2px dashed var(--brand)" : "2px dashed transparent",
                  outlineOffset: -2,
                }}
              >
                {shown.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[12px] text-faint">
                    {stage.cards.length ? "No match" : "Empty"}
                  </p>
                ) : (
                  shown.map((card) => (
                    <BoardCard
                      key={card.id}
                      card={card}
                      tone={tone}
                      now={now}
                      today={today}
                      selected={card.id === openId}
                      onOpen={() => setOpenId(card.id)}
                      onMenu={(x, y) => setMenu({ card, x, y })}
                    />
                  ))
                )}
                {stage.cursor && (
                  <button
                    type="button"
                    disabled={more.loading === stage.id}
                    onClick={() => more.load(stage.id, stage.cursor!)}
                    className="rounded-xl py-2 text-[12px] font-semibold text-muted hover:bg-surface hover:text-text disabled:opacity-60"
                  >
                    {more.loading === stage.id ? "Loading..." : `Load more (${(stage.total - stage.cards.length).toLocaleString()})`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <BoardScrollbar scrollRef={scrollRef} className="px-1" />

      {openCard && (
        <SmsProspectPanel
          key={openCard.id}
          card={openCard}
          pipelines={board.data.pipelines ?? []}
          boardPipelineId={pipelineId}
          onMove={(toPipeline, toStage, label) => doMove(openCard, toPipeline, toStage, label)}
          onClose={() => setOpenId(null)}
          onToast={setToast}
          onRemoved={(ids) => {
            removeCards(ids);
            setOpenId(null);
          }}
        />
      )}
      {menu && (
        <CardMenu
          x={menu.x}
          y={menu.y}
          stages={stages}
          currentStage={menu.card.stageId}
          contacted={hasContacted(menu.card.tags)}
          today={today}
          followUpOn={menu.card.followUpOn ?? null}
          // Quick days keep the time and note already on the card.
          onFollowUp={(day) =>
            saveFollowUp(menu.card, {
              day,
              time: menu.card.followUpTime ?? null,
              note: menu.card.followUpNote ?? "",
            })
          }
          onFollowUpEdit={() => setEditing(menu.card)}
          onMove={(stageId, name) => doMove(menu.card, pipelineId, stageId, name)}
          onContacted={(on) =>
            contacted.mutate(
              { contactId: menu.card.contactId, on },
              { onError: () => setToast("GHL did not take the tag. Put back.") },
            )
          }
          onClose={() => setMenu(null)}
        />
      )}
      {editing && (
        <FollowUpDialog
          card={editing}
          today={today}
          onSave={(f) => {
            saveFollowUp(editing, f);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function BoardCard({
  card,
  tone,
  now,
  today,
  selected,
  onOpen,
  onMenu,
}: {
  card: ColdSmsCard;
  tone: string;
  now: number;
  today: string;
  selected: boolean;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const when = card.reply?.at ? timeAgo(new Date(card.reply.at).toISOString(), now) : card.movedAt ? timeAgo(card.movedAt, now) : "";
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      className={`block w-full cursor-grab rounded-xl bg-surface p-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--surface)_85%,var(--brand))] active:cursor-grabbing ${
        selected ? "ring-2 ring-[var(--brand)]" : ""
      }`}
      style={{ boxShadow: `inset 2px 0 0 ${tone}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[13px] font-semibold leading-snug text-text">{card.business}</span>
        {card.verdict && <VerdictBadge verdict={card.verdict} />}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-faint">
        {hasContacted(card.tags) && (
          <span className="rounded-md bg-[var(--brand-tint)] px-1.5 font-semibold text-text">Contacted</span>
        )}
        {card.variation && (
          <span className="rounded-md bg-surface-2 px-1.5 font-semibold text-muted">{card.variation}</span>
        )}
        {card.person && <span className="text-muted">{card.person}</span>}
        {when && <span>{when}</span>}
      </div>
      {/* Their whole last message, never clipped (Jake, 2026-10-13). */}
      {(card.followUpOn || card.followUpNote) && (
        <FollowUpLine
          day={card.followUpOn ?? null}
          time={card.followUpTime ?? null}
          note={card.followUpNote ?? ""}
          today={today}
        />
      )}
      {card.reply?.body && (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[12.5px] leading-snug text-muted">{card.reply.body}</p>
      )}
      {card.firstContactedAt && (
        <p className="mt-1.5 text-[11px] text-faint">First contacted {FIRST.format(new Date(card.firstContactedAt))}</p>
      )}
    </button>
  );
}

// Right-click on a card (Jake, 2026-10-13): move it to any column, or mark it
// contacted. Kept inside the window, closed by any click, Escape or scroll.
function CardMenu({
  x,
  y,
  stages,
  currentStage,
  contacted,
  today,
  followUpOn,
  onMove,
  onContacted,
  onFollowUp,
  onFollowUpEdit,
  onClose,
}: {
  x: number;
  y: number;
  stages: { id: string; name: string }[];
  currentStage: string;
  contacted: boolean;
  today: string;
  followUpOn: string | null;
  onFollowUp: (day: string | null) => void;
  onFollowUpEdit: () => void;
  onMove: (stageId: string, name: string) => void;
  onContacted: (on: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  // The parent hands a fresh onClose each render; read it through a ref so the
  // effect below runs once per open, not on every board re-render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({
        left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
      });
    }
    const close = (e: Event) => {
      if (e.type === "mousedown" && ref.current?.contains(e.target as Node)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [x, y]);

  const item =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold text-text hover:bg-surface-2 disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent";

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[70] min-w-[220px] rounded-xl border border-[var(--border)] bg-surface p-1 shadow-2xl"
      style={pos}
    >
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={contacted}
        className={item}
        onClick={() => {
          onContacted(!contacted);
          onClose();
        }}
      >
        <span className="grid w-4 place-items-center">{contacted && <Check size={14} />}</span>
        Contacted
      </button>
      <div className="my-1 h-px bg-[var(--border)]" />
      <p className="px-2.5 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-faint">
        Follow up{followUpOn ? ` · ${followUpLabel(followUpOn)}` : ""}
      </p>
      {[
        { label: "Tomorrow", day: addDays(today, 1) },
        { label: "In 3 days", day: addDays(today, 3) },
        { label: "In 1 week", day: addDays(today, 7) },
      ].map((o) => (
        <button
          key={o.label}
          type="button"
          role="menuitemradio"
          aria-checked={followUpOn === o.day}
          className={item}
          onClick={() => {
            onFollowUp(o.day);
            onClose();
          }}
        >
          <span className="grid w-4 place-items-center">{followUpOn === o.day && <Check size={14} />}</span>
          {o.label}
          <span className="ml-auto pl-3 text-[11.5px] font-medium text-faint">{followUpLabel(o.day)}</span>
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          onFollowUpEdit();
          onClose();
        }}
      >
        <span className="w-4" />
        Date, time and note...
      </button>
      {followUpOn && (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() => {
            onFollowUp(null);
            onClose();
          }}
        >
          <span className="w-4" />
          Clear follow up
        </button>
      )}
      <div className="my-1 h-px bg-[var(--border)]" />
      <p className="px-2.5 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-faint">Move to</p>
      {stages.map((s) => (
        <button
          key={s.id}
          type="button"
          role="menuitem"
          disabled={s.id === currentStage}
          className={item}
          onClick={() => {
            onMove(s.id, s.name);
            onClose();
          }}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stageTone(s.name) }} aria-hidden />
          <span className="truncate">{s.name}</span>
        </button>
      ))}
    </div>
  );
}

// "Follow up Fri, Oct 16, 2:00 PM" plus Jake's note: quiet before the day, amber
// on it, red once past. A note with no date is just the note.
function FollowUpLine({
  day,
  time,
  note,
  today,
}: {
  day: string | null;
  time: string | null;
  note: string;
  today: string;
}) {
  const state = day ? followUpState(day, today) : "later";
  const color = state === "overdue" ? "var(--danger)" : state === "due" ? "var(--warning)" : "var(--text-muted)";
  return (
    <div className="mt-1.5 rounded-lg px-2 py-1.5" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      {day && (
        <p className="text-[11.5px] font-semibold" style={{ color }}>
          Follow up {state === "due" ? "today" : followUpLabel(day)}
          {time ? `, ${timeLabel(time)}` : ""}
        </p>
      )}
      {note && (
        <p className={`${day ? "mt-0.5 " : ""}whitespace-pre-wrap break-words text-[12px] leading-snug text-text`}>{note}</p>
      )}
    </div>
  );
}

// Right-click > Date, time and note: a follow-up with the detail Jake wants on
// the card. Time is optional (the GHL task is due 9am without one), and so is
// the date: a note alone is kept on the card with no task (Jake, 2026-10-13).
function FollowUpDialog({
  card,
  today,
  onSave,
  onClose,
}: {
  card: ColdSmsCard;
  today: string;
  onSave: (f: ColdSmsFollowUpInput) => void;
  onClose: () => void;
}) {
  // Opens on the day already set; a card with only a note opens with no date.
  const [day, setDay] = useState(card.followUpOn ?? (card.followUpNote ? "" : addDays(today, 1)));
  const [time, setTime] = useState(card.followUpTime ?? "");
  const [note, setNote] = useState(card.followUpNote ?? "");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    noteRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const field =
    "rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[14px] text-text outline-none focus:border-[var(--brand)]";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] bg-black/40" onClick={onClose} aria-hidden />
      <form
        role="dialog"
        aria-label={`Follow up ${card.business}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (day || note.trim()) onSave({ day: day || null, time: day && time ? time : null, note: note.trim() });
        }}
        className="fixed left-1/2 top-1/2 z-[81] flex w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl border border-[var(--border)] bg-surface p-5 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3">
          <h2 className="font-display text-[16px] font-semibold leading-snug text-text">Follow up · {card.business}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted hover:text-text"
          >
            <X size={15} />
          </button>
        </header>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-faint">
            Date
            <input type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-faint">
            Time
            <input
              type="time"
              value={time}
              disabled={!day}
              onChange={(e) => setTime(e.target.value)}
              className={`${field} disabled:opacity-50`}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-faint">
          Note
          <textarea
            ref={noteRef}
            value={note}
            maxLength={FOLLOW_UP_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
            rows={4}
            className={`${field} resize-y font-normal`}
          />
        </label>
        <footer className="flex items-center gap-2">
          {(card.followUpOn || card.followUpNote) && (
            <button
              type="button"
              onClick={() => onSave({ day: null, time: null, note: "" })}
              className="rounded-xl px-3 py-2 text-[13px] font-semibold text-[var(--danger)] hover:bg-surface-2"
            >
              Clear
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-[13px] font-semibold text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!day && !note.trim()}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-[var(--brand-fg,#fff)] disabled:opacity-50"
          >
            Save
          </button>
        </footer>
      </form>
    </>,
    document.body,
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addWeeks,
  buildWeek,
  dayHours,
  describeDay,
  formatHours,
  gridSlots,
  hasSlot,
  isHourStart,
  sameSlots,
  setSlot,
  slotLabel,
  slotsFor,
  toISO,
  weekHours,
  weekLabel,
  weekStart,
  type WeekAvailability,
} from "../../../lib/availabilityWeek";
import {
  useAvailabilityQuery,
  useSaveAvailabilityDay,
} from "../../../hooks/useColdCallAvailability";

// Cold Call > Availability: the week a caller marks to say when they are on the
// phones.
//
// A painted grid rather than a list of start/end pickers. Availability is a
// shape, and the fastest way to say "mornings, plus Thursday afternoon" is to
// drag across it and see the block appear.
//
// The unit of storage is the DAY: painting never crosses a column, so a drag
// saves the one or more days it touched and leaves the rest alone. Two people
// editing different days of the same week cannot overwrite each other.
//
// Times are the agency's local clock, said plainly under the grid. A caller
// three timezones away still marks the hours the prospects are awake, which is
// the only reading of "available to cold call" that means anything.

interface CellRef {
  day: string;
  slot: number;
}

export default function ColdCallAvailability({
  callerId = "",
  isOwner,
}: {
  // "" means the signed-in person. An owner picks someone in the section header.
  callerId?: string;
  isOwner: boolean;
}) {
  const todayISO = useMemo(() => toISO(new Date()), []);
  const [monday, setMonday] = useState(() => weekStart(todayISO));

  const days = useMemo(() => buildWeek(monday, todayISO), [monday, todayISO]);
  const rows = useMemo(() => gridSlots(), []);
  const sunday = days[6].iso;

  // An owner looking at "Everyone" has no week to draw: availability belongs to
  // a person, and merging two people's hours into one paintable grid would make
  // every cell ambiguous about whose it is.
  const needsPerson = isOwner && !callerId;

  const query = useAvailabilityQuery(callerId, needsPerson ? "" : monday, sunday);
  const save = useSaveAvailabilityDay();

  // The painted state on screen. Seeded from the server and edited locally, so
  // a drag paints at pointer speed instead of at request speed.
  const [draft, setDraft] = useState<WeekAvailability>({});
  const draftRef = useRef<WeekAvailability>({});
  const serverRef = useRef<WeekAvailability>({});
  const dragRef = useRef<{ on: boolean } | null>(null);
  const touchedRef = useRef<Set<string>>(new Set());

  // Adopt whatever the server last said. Skipped mid-drag: a refetch landing
  // while a range is being painted would yank the cells out from under it.
  useEffect(() => {
    if (!query.data) return;
    if (dragRef.current) return;
    serverRef.current = query.data.days;
    draftRef.current = query.data.days;
    setDraft(query.data.days);
  }, [query.data]);

  const gridRef = useRef<HTMLDivElement | null>(null);

  // Save every day the drag touched, and only those whose slots actually moved.
  const commit = useCallback(() => {
    const touched = [...touchedRef.current];
    touchedRef.current.clear();
    for (const day of touched) {
      const next = slotsFor(draftRef.current, day);
      const before = slotsFor(serverRef.current, day);
      if (sameSlots(next, before)) continue;
      serverRef.current = { ...serverRef.current, [day]: next };
      save.mutate({ callerId, weekFrom: monday, day, slots: next });
    }
  }, [callerId, monday, save]);

  // The ref is written SYNCHRONOUSLY, not from an effect watching `draft`.
  // A single click is pointerdown then pointerup with no render guaranteed in
  // between, so a ref that only caught up on re-render would hand commit() the
  // state from before the click and save the cell away again.
  const apply = useCallback((cell: CellRef, on: boolean) => {
    const next = setSlot(draftRef.current, cell.day, cell.slot, on);
    // setSlot returns the same object when the cell is already in the wanted
    // state, which is most cells in a drag across an already-painted range.
    if (next === draftRef.current) return;
    draftRef.current = next;
    touchedRef.current.add(cell.day);
    setDraft(next);
  }, []);

  // The cell under a point. Read from the document rather than from per-cell
  // handlers because a touch drag captures the pointer to the element it
  // started on, so pointerenter never fires on the cells it crosses.
  const cellAt = (x: number, y: number): CellRef | null => {
    const el = document.elementFromPoint(x, y);
    const cell = el instanceof Element ? el.closest<HTMLElement>("[data-day]") : null;
    if (!cell || !gridRef.current?.contains(cell)) return null;
    const day = cell.dataset.day;
    const slot = Number(cell.dataset.slot);
    if (!day || !Number.isInteger(slot)) return null;
    return { day, slot };
  };

  // A drag can end anywhere, including outside the window, so the release is
  // watched on the document rather than on the grid.
  useEffect(() => {
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      commit();
    };
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [commit]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (needsPerson) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    // The first cell decides the direction for the whole drag: starting on a
    // marked cell erases, starting on a blank one paints. Without this, dragging
    // across a mixed range would flip each cell and scramble it.
    const on = !hasSlot(draftRef.current, cell.day, cell.slot);
    dragRef.current = { on };
    apply(cell, on);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell) apply(cell, dragRef.current.on);
  };

  // Keyboard toggling saves on the spot: there is no drag to end, so nothing
  // else would ever call commit().
  const onCellKeyDown = (e: React.KeyboardEvent, day: string, slot: number) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    const on = !hasSlot(draftRef.current, day, slot);
    const next = setSlot(draftRef.current, day, slot, on);
    draftRef.current = next;
    setDraft(next);
    touchedRef.current.add(day);
    commit();
  };

  if (needsPerson) {
    return (
      <div className="pk-empty">
        Pick a person above to see when they are available to call.
      </div>
    );
  }

  if (query.isLoading) return <div className="pk-empty">Loading availability...</div>;
  if (query.isError) {
    return (
      <div className="pk-empty">Could not load availability. Reload to try again.</div>
    );
  }

  const total = weekHours(draft, days);

  return (
    <div className="cca">
      <AvailabilityStyle />

      <div className="cca-bar">
        <div className="cca-nav">
          <button
            type="button"
            className="cca-navbtn"
            aria-label="Previous week"
            onClick={() => setMonday((m) => addWeeks(m, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="cca-weeklabel">{weekLabel(days)}</span>
          <button
            type="button"
            className="cca-navbtn"
            aria-label="Next week"
            onClick={() => setMonday((m) => addWeeks(m, 1))}
          >
            <ChevronRight size={18} />
          </button>
          {monday !== weekStart(todayISO) && (
            <button
              type="button"
              className="cca-today"
              onClick={() => setMonday(weekStart(todayISO))}
            >
              This week
            </button>
          )}
        </div>

        <div className="cca-total">
          <CalendarClock size={15} aria-hidden />
          <span>
            <strong>{formatHours(total)}</strong> {total === 1 ? "hour" : "hours"} on the
            phones
          </span>
          <span className={`cca-save${save.isPending ? " on" : ""}`} aria-live="polite">
            {save.isPending ? "Saving..." : save.isError ? "Not saved" : ""}
          </span>
        </div>
      </div>

      {save.isError && (
        <p className="cca-error" role="alert">
          That change did not save. Check your connection and paint it again.
        </p>
      )}

      <div className="cca-scroll">
        <div
          className="cca-grid"
          ref={gridRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
        >
          <div className="cca-corner" />
          {days.map((d) => (
            <div
              key={d.iso}
              className={`cca-head${d.isToday ? " today" : ""}${d.isWeekend ? " weekend" : ""}`}
            >
              <span className="cca-dow">{d.dowLabel}</span>
              <span className="cca-daynum">{d.dayNum}</span>
              <span className="cca-dayhrs">{formatHours(dayHours(draft, d.iso))}h</span>
            </div>
          ))}

          {rows.map((slot) => (
            <Row
              key={slot}
              slot={slot}
              days={days}
              draft={draft}
              onKeyDown={onCellKeyDown}
            />
          ))}
        </div>
      </div>

      <div className="cca-legend">
        <span className="cca-swatch" aria-hidden />
        Available to call. Drag to paint a block, drag across marked cells to clear them.
        Times are the agency&apos;s local clock.
      </div>

      <ul className="cca-summary">
        {days.map((d) => {
          const text = describeDay(draft, d.iso);
          return (
            <li key={d.iso} className={d.isToday ? "today" : undefined}>
              <span className="cca-sday">
                {d.dowLabel} {d.dayNum}
              </span>
              <span className="cca-stext">{text || "Not available"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// One half-hour row across all seven days. Split out so painting a cell
// re-renders one row rather than the whole grid mid-drag.
function Row({
  slot,
  days,
  draft,
  onKeyDown,
}: {
  slot: number;
  days: ReturnType<typeof buildWeek>;
  draft: WeekAvailability;
  onKeyDown: (e: React.KeyboardEvent, day: string, slot: number) => void;
}) {
  const hourStart = isHourStart(slot);
  return (
    <>
      <div className={`cca-time${hourStart ? " hour" : ""}`}>
        {hourStart ? slotLabel(slot) : ""}
      </div>
      {days.map((d) => {
        const on = hasSlot(draft, d.iso, slot);
        return (
          <button
            key={d.iso}
            type="button"
            data-day={d.iso}
            data-slot={slot}
            aria-pressed={on}
            aria-label={`${d.dowLabel} ${d.dayNum}, ${slotLabel(slot)}${on ? ", available" : ""}`}
            onKeyDown={(e) => onKeyDown(e, d.iso, slot)}
            className={[
              "cca-cell",
              on ? "on" : "",
              hourStart ? "hour" : "",
              d.isWeekend ? "weekend" : "",
              d.isPast ? "past" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        );
      })}
    </>
  );
}

function AvailabilityStyle() {
  return (
    <style>{`
      .cca { --cca-rowh: 17px; }

      .cca-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .cca-nav { display: flex; align-items: center; gap: 6px; }
      .cca-navbtn { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text-muted); cursor: pointer; padding: 0; }
      .cca-navbtn:hover { border-color: var(--brand); color: var(--brand-text); }
      .cca-weeklabel { font-family: var(--font-display); font-size: 14.5px; font-weight: 600; color: var(--text); min-width: 168px; text-align: center; }
      .cca-today { border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-muted); cursor: pointer; }
      .cca-today:hover { border-color: var(--brand); color: var(--brand-text); }

      .cca-total { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
      .cca-total strong { color: var(--text); font-family: var(--font-display); font-size: 15px; }
      .cca-save { font-size: 12px; color: var(--text-faint); min-width: 62px; }
      .cca-error { margin: 0 0 12px; font-size: 13px; color: var(--danger); }

      /* Seven columns plus a time gutter stop being readable well before a phone
         width, so the grid keeps its size and scrolls sideways inside its own
         box. The page itself never scrolls horizontally. */
      .cca-scroll { overflow-x: auto; }

      /* Time gutter + seven day columns. */
      .cca-grid {
        min-width: 620px;
        display: grid;
        grid-template-columns: 62px repeat(7, minmax(0, 1fr));
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
        background: var(--surface);
        /* The grid is a paint surface: browser text selection and touch
           scrolling both fight a drag, so both are turned off inside it. */
        user-select: none;
        touch-action: none;
      }

      .cca-corner { background: var(--surface-2); border-bottom: 1px solid var(--border); }
      .cca-head { background: var(--surface-2); border-bottom: 1px solid var(--border); border-left: 1px solid var(--divider); padding: 7px 4px 6px; text-align: center; }
      .cca-head.weekend { background: var(--surface); }
      .cca-dow { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
      .cca-daynum { display: block; font-family: var(--font-display); font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.3; }
      .cca-dayhrs { display: block; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-faint); }
      .cca-head.today .cca-dow, .cca-head.today .cca-daynum { color: var(--brand-text); }

      .cca-time { height: var(--cca-rowh); font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); text-align: right; padding-right: 7px; background: var(--surface-2); }
      .cca-time.hour { border-top: 1px solid var(--divider); line-height: var(--cca-rowh); }

      .cca-cell { height: var(--cca-rowh); border: 0; border-left: 1px solid var(--divider); background: transparent; padding: 0; cursor: pointer; transition: background-color .08s; }
      .cca-cell.hour { border-top: 1px solid var(--divider); }
      .cca-cell.weekend { background: color-mix(in srgb, var(--surface-2) 55%, transparent); }
      .cca-cell.past { opacity: 0.55; }
      .cca-cell:hover { background: var(--brand-tint); }
      .cca-cell.on { background: var(--brand); }
      .cca-cell.on:hover { background: color-mix(in srgb, var(--brand) 82%, black); }
      .cca-cell:focus-visible { outline: 2px solid var(--brand-text); outline-offset: -2px; z-index: 1; position: relative; }

      .cca-legend { display: flex; align-items: center; gap: 8px; margin-top: 11px; font-size: 12.5px; color: var(--text-muted); }
      .cca-swatch { width: 13px; height: 13px; border-radius: 3px; background: var(--brand); flex-shrink: 0; }

      .cca-summary { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 1px; background: var(--divider); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
      .cca-summary li { display: flex; gap: 14px; padding: 8px 14px; background: var(--surface); font-size: 13px; }
      .cca-summary li.today { background: var(--brand-tint); }
      .cca-sday { flex: 0 0 64px; font-weight: 600; color: var(--text); }
      .cca-stext { color: var(--text-muted); }

      /* On a phone the written summary carries the answer, so it sits closer to
         the grid it is describing. */
      @media (max-width: 760px) {
        .cca-summary { margin-top: 12px; }
      }
    `}</style>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  filterBySources,
  CALENDAR_SOURCE_ORDER,
  type CalendarItem,
  type CalendarSource,
} from "../../lib/calendarModel";
import { toIso, isoToLocalDate } from "../../lib/jobsPipeline";
import { demoMode } from "../../demo/demoMode";
import { SourceLegend } from "./SourceLegend";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { AgendaView } from "./AgendaView";

// The Month / Week / Agenda calendar body, fed a ready list of CalendarItems.
// Lifted out of the old standalone CalendarDesktop so the Jobs tab can host it
// as one of its views (the Jobs tab owns the view switcher and passes `view`
// down). This component owns only the calendar's own navigation + source
// filter state; it never fetches.

export type CalendarView = "month" | "week" | "agenda";

export default function CalendarViews({
  items,
  connected,
  view,
  onRangeChange,
  onSlotClick,
}: {
  items: CalendarItem[];
  connected: Record<CalendarSource, boolean>;
  view: CalendarView;
  // Reports the dates currently on screen whenever the anchor or view moves.
  // This component still never fetches: the host decides what, if anything, to
  // load for the visible range.
  onRangeChange?: (startIso: string, endIso: string) => void;
  // Setter Suite only. Passed straight to WeekView; when absent the week grid
  // renders no slot layer and stays read-only, as the client Jobs tab needs.
  onSlotClick?: (iso: string, startMinutes: number) => void;
}) {
  const demo = demoMode();

  // Anchor: demo pins to July 2026 so the preview is populated; real uses today.
  const todayIso = demo ? "2026-07-01" : toIso(new Date());
  const [anchor, setAnchor] = useState<string>(todayIso);
  const [selectedIso, setSelectedIso] = useState<string>(todayIso);

  const [active, setActive] = useState<Set<CalendarSource>>(
    () => new Set(CALENDAR_SOURCE_ORDER),
  );
  const toggle = (s: CalendarSource) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const counts = useMemo(() => {
    // Seed every source from the canonical order. Seeding a literal here means
    // a newly added source increments undefined into NaN, and the `as` cast
    // hides it from the compiler.
    const c = Object.fromEntries(
      CALENDAR_SOURCE_ORDER.map((s) => [s, 0]),
    ) as Record<CalendarSource, number>;
    for (const i of items) c[i.source]++;
    return c;
  }, [items]);

  const visible = useMemo(
    () => filterBySources(items, active),
    [items, active],
  );

  const anchorDate = isoToLocalDate(anchor);
  const stepMonth = (delta: number) =>
    setAnchor(
      toIso(
        new Date(anchorDate.getFullYear(), anchorDate.getMonth() + delta, 1),
      ),
    );
  const stepWeek = (delta: number) =>
    setAnchor(
      toIso(
        new Date(
          anchorDate.getFullYear(),
          anchorDate.getMonth(),
          anchorDate.getDate() + delta * 7,
        ),
      ),
    );
  const step = (delta: number) =>
    view === "month" ? stepMonth(delta) : stepWeek(delta);
  const goToday = () => {
    setAnchor(todayIso);
    setSelectedIso(todayIso);
  };

  // The dates on screen. Month and agenda pad by a week either side because the
  // month grid spills into neighbouring months; week is exactly its own week.
  const [rangeStart, rangeEnd] = useMemo<[string, string]>(() => {
    const y = anchorDate.getFullYear();
    const m = anchorDate.getMonth();
    if (view === "week") {
      const sun = new Date(y, m, anchorDate.getDate() - anchorDate.getDay());
      const sat = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 6);
      return [toIso(sun), toIso(sat)];
    }
    return [toIso(new Date(y, m, -7)), toIso(new Date(y, m + 1, 7))];
  }, [anchor, view]);

  useEffect(() => {
    onRangeChange?.(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd, onRangeChange]);

  const rangeLabel =
    view === "month"
      ? anchorDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      : weekRangeLabel(anchor);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={goToday}
          className="rounded-[10px] border border-border bg-surface px-3 py-1.5 font-display text-[12px] font-semibold text-text hover:bg-surface-2"
        >
          Today
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="grid h-8 w-8 place-items-center rounded-[9px] border border-border bg-surface text-muted hover:bg-surface-2"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[150px] text-center font-display text-[15px] font-semibold text-text">
            {rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="grid h-8 w-8 place-items-center rounded-[9px] border border-border bg-surface text-muted hover:bg-surface-2"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="ml-auto">
          <SourceLegend
            active={active}
            counts={counts}
            connected={connected}
            onToggle={toggle}
          />
        </div>
      </div>

      {/* Body */}
      {view === "agenda" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AgendaView items={visible} todayIso={todayIso} />
        </div>
      ) : view === "week" ? (
        <WeekView
          items={visible}
          anchorIso={anchor}
          todayIso={todayIso}
          onSlotClick={onSlotClick}
        />
      ) : (
        <MonthView
          items={visible}
          year={anchorDate.getFullYear()}
          month={anchorDate.getMonth()}
          todayIso={todayIso}
          selectedIso={selectedIso}
          onSelectDay={setSelectedIso}
        />
      )}
    </div>
  );
}

function weekRangeLabel(anchorIso: string): string {
  const d = isoToLocalDate(anchorIso);
  const sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  const sat = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(sun)} - ${fmt(sat)}`;
}

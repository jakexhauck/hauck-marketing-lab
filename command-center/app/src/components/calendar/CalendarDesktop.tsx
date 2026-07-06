import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Segmented } from "../ui";
import { useAuth } from "../../context/AuthContext";
import { useCalendarItems } from "../../hooks/useCalendarItems";
import { demoMode } from "../../demo/demoMode";
import {
  filterBySources,
  CALENDAR_SOURCE_ORDER,
  type CalendarSource,
} from "../../lib/calendarModel";
import { toIso, isoToLocalDate } from "../../lib/jobsPipeline";
import { SourceLegend } from "./SourceLegend";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { AgendaView } from "./AgendaView";

// The Atelier desktop Calendar: one unified schedule (appointments, jobs) in
// three switchable views. The phone keeps its own NavyHero list below lg;
// this file renders only inside `hidden lg:flex`.

type View = "month" | "week" | "agenda";
const VIEW_KEY = "hml_cal_view";

function initialView(): View {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    if (v === "month" || v === "week" || v === "agenda") return v;
  } catch {
    /* ignore */
  }
  return "week";
}

export default function CalendarDesktop() {
  const { session } = useAuth();
  const demo = demoMode();
  const data = useCalendarItems(Boolean(session) || demo);

  const [view, setView] = useState<View>(initialView);
  const setViewPersist = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

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
    const c = { appointment: 0, job: 0 } as Record<CalendarSource, number>;
    for (const i of data.items) c[i.source]++;
    return c;
  }, [data.items]);

  const visible = useMemo(
    () => filterBySources(data.items, active),
    [data.items, active],
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

  const rangeLabel =
    view === "month"
      ? anchorDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      : weekRangeLabel(anchor);

  return (
    <DesktopPage
      title="Calendar"
      subtitle="Everything on the books, one place"
      flush
      actions={
        <Segmented<View>
          options={[
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
            { value: "agenda", label: "Agenda" },
          ]}
          value={view}
          onChange={setViewPersist}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-6">
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
              connected={data.connected}
              onToggle={toggle}
            />
          </div>
        </div>

        {/* Body */}
        {data.isError ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            Failed to load calendar. {data.error?.message ?? "Try again."}
          </div>
        ) : data.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
          </div>
        ) : view === "agenda" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AgendaView items={visible} todayIso={todayIso} />
          </div>
        ) : view === "week" ? (
          <WeekView items={visible} anchorIso={anchor} todayIso={todayIso} />
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
    </DesktopPage>
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

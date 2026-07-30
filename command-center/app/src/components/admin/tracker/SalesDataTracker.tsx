import { useCallback, useMemo, useState } from "react";
import DailyTracker, { TrackerMonthNav, type TrackerRow } from "./DailyTracker";
import FullFunnel from "../sales/FullFunnel";
import { NoReasons, SourceSplit } from "../sales/monthBreakdown";
import { PillarTitleActions } from "../../pillars/PillarKit";
import { useSalesDataQuery } from "../../../hooks/useApi";
import type { SalesDataResponse } from "../../../lib/api";
import type { DerivedSalesDay } from "../../../../functions/lib/salesDataRollup";
import {
  buildMonthDays,
  monthKey,
  cursorForToday,
  type MonthCursor,
  type TodayRef,
} from "../../../lib/trackerMonth";
import { SALES_COLUMNS, computeSalesRow, computeSalesRollup } from "../../../lib/salesTracker";

// The Sales pillar's Sales Data tab: the agency's daily sales-call funnel.
//
// This page used to be a form. Somebody counted their own month and typed it
// into a grid, which meant the same question had two answers: the one typed
// here and the one the outcomes recorded on Sales Calls already knew. It is now
// a REPORT, and it has no editing loop at all: opening it reconciles the
// GoHighLevel calendars, the meetings are counted a day at a time
// (functions/lib/salesDataRollup.ts), and every cell is read-only.
//
// What that buys, beyond one less thing to remember: the funnel on this page
// and the funnel on Sales Calls are now the same arithmetic over the same rows,
// so they cannot drift. What it costs is that selling done entirely outside the
// app is invisible here, which is the honest trade: a number nobody measured
// should not appear beside numbers that were measured.

export default function SalesDataTracker() {
  // "Today" is read once on mount and then injected everywhere, so the month
  // math stays deterministic and a tab left open overnight does not quietly
  // disagree with itself mid-render.
  const [today] = useState<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  });
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorForToday(today));

  const month = monthKey(cursor);
  const { data, isPending, isError } = useSalesDataQuery(month);

  const byDay = useMemo(() => {
    const map = new Map<string, DerivedSalesDay>();
    for (const row of data?.days ?? []) map.set(row.day, row);
    return map;
  }, [data]);

  // The table's row identity. Nothing on this grid is typed, so a row carries
  // only the day it is; the counts are looked up from it in computeRow.
  const getRow = useCallback((iso: string): TrackerRow => ({ day: iso }), []);

  const computeRow = useCallback(
    (row: TrackerRow) => computeSalesRow(byDay.get(row.day) ?? null),
    [byDay],
  );

  // The footer and the tiles read the same days the table renders, over the
  // whole month rather than only the days that came back, so an average is per
  // worked day and never per row-that-happens-to-exist.
  const monthDays = useMemo(
    () => buildMonthDays(cursor, today).map((d) => byDay.get(d.iso) ?? null),
    [cursor, today, byDay],
  );
  const rollup = useMemo(
    () => computeSalesRollup(monthDays.filter((d): d is DerivedSalesDay => d !== null)),
    [monthDays],
  );

  // The tile row is gone: the funnel strip below says everything those four
  // tiles said and three steps more, and a page carrying both would be stating
  // the same month twice in two shapes.
  return (
    <div className="sdt">
      <SalesDataLayoutStyle />

      {/* The month stepper rides on the page's title line rather than taking a
          band of its own above the tiles, which is what lets the tiles sit
          straight under the title and the table take the height that frees. */}
      <PillarTitleActions>
        <TrackerMonthNav cursor={cursor} today={today} onMonthChange={setCursor} />
      </PillarTitleActions>

      {isError && (
        <div className="pk-empty">
          Sales Data could not be loaded. Nothing has been lost: reload to try again.
        </div>
      )}

      <StatusLine data={data ?? null} awaiting={rollup.totals.awaiting} />

      {/* The month, dialing through to cash. Above the grid, because the grid
          is the detail behind it. */}
      <FullFunnel
        dials={data?.dials ?? { dials: 0, talked: 0, pitched: 0, booked: 0 }}
        totals={rollup.totals}
        rates={rollup.rates}
      />

      <DailyTracker
        title="Daily sales funnel"
        subtitle={
          isPending && !data
            ? "Reading the calendar"
            : "One row per day, counted from the meetings themselves. Nothing here is typed."
        }
        columns={SALES_COLUMNS}
        cursor={cursor}
        today={today}
        statTiles={[]}
        getRow={getRow}
        computeRow={computeRow}
        rollup={{ average: rollup.average, total: rollup.total }}
        // Nothing is editable, so no edit can arrive. Required by the shared
        // tracker's contract; kept as an explicit no-op rather than a cast.
        onEdit={() => {}}
        onMonthChange={setCursor}
        hideMonthNav
        readOnly
      />

      {/* The two breakdowns the grid cannot show: a grid has one row per day, and
          both of these are counted per meeting. Under the table because they are
          the month read a different way, not a detail of it. Each hides itself
          when it has nothing to say. */}
      <SourceSplit sources={data?.sources ?? []} />
      <NoReasons reasons={data?.reasons ?? {}} />
    </div>
  );
}

// What the page just did, and anything that makes a count on it mean less than
// it looks. Same job as the Sales Calls status line: a month that silently
// failed to reach the calendar looks exactly like a quiet month.
//
// No read button, same as Sales Calls and the Sales board: the month reconciles
// itself on load, on focus and on a timer (useSalesDataQuery), so nothing here
// is waiting to be asked.
function StatusLine({
  data,
  awaiting,
}: {
  data: SalesDataResponse | null;
  awaiting: number;
}) {
  const warnings: string[] = [];
  const sync = data?.sync ?? null;

  if (data && !data.configured) {
    warnings.push(
      "The agency GoHighLevel account is not connected, so this month is only what was already stored.",
    );
  } else if (sync && sync.ok === false) {
    warnings.push(`The calendar could not be read: ${sync.error}`);
  } else if (sync && sync.ok && sync.calendarsRead === 0) {
    warnings.push(
      "No sales calendar was found in GoHighLevel. Name one demo, discovery or sales, or set AGENCY_SALES_CALENDAR_IDS.",
    );
  }

  if (sync && sync.ok && sync.failedCalendarIds.length > 0) {
    warnings.push(
      `${sync.failedCalendarIds.length} calendar could not be read, so meetings may be missing from this month.`,
    );
  }

  if (awaiting > 0) {
    warnings.push(
      `${awaiting} ${awaiting === 1 ? "meeting has" : "meetings have"} no outcome recorded, so ${awaiting === 1 ? "it is" : "they are"} counted in neither the shows nor the no-shows. Record ${awaiting === 1 ? "it" : "them"} on Sales Calls.`,
    );
  }

  if (data && data.undated > 0) {
    warnings.push(
      `${data.undated} ${data.undated === 1 ? "meeting has" : "meetings have"} no time on the calendar, so ${data.undated === 1 ? "it belongs" : "they belong"} to no day and ${data.undated === 1 ? "is" : "are"} not counted here.`,
    );
  }

  const changed =
    sync && sync.ok && (sync.added > 0 || sync.updated > 0)
      ? [
          sync.added > 0 ? `${sync.added} new` : null,
          sync.updated > 0 ? `${sync.updated} updated` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      {changed &&<span className="text-[12px] text-muted">{changed} from the calendar.</span>}

      {warnings.length === 0 && data?.configured && (
        <span className="text-[12px] text-faint">
          Counted from your meetings. Nothing on this page is typed.
        </span>
      )}

      {warnings.map((w) => (
        <span key={w} className="text-[12px] font-semibold text-[var(--warning)]">
          {w}
        </span>
      ))}
    </div>
  );
}

// Scoped to this surface so the shared tracker engine is unchanged everywhere
// else it is mounted.
function SalesDataLayoutStyle() {
  return (
    <style>{`
      /* No month band above them any more, so the tiles start at the top. */
      .pk-kit .sdt .adt-stats { margin-top: 0; }
      /* And the table takes the height that frees up. */
      .pk-kit .sdt .adt-scroll { max-height: min(72vh, 880px); }
      /* The Meetings column is the only text cell on a numeric grid; left-align
         it and let it be the one column that gets the room. */
      .pk-kit .sdt .adt-card td:last-child,
      .pk-kit .sdt .adt-card th:last-child { text-align: left; min-width: 150px; }
    `}</style>
  );
}

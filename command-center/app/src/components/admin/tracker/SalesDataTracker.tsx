import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { PhoneCall, UserCheck, CheckCircle2, DollarSign } from "lucide-react";
import DailyTracker, { type TrackerRow, type StatTile } from "./DailyTracker";
import { useSalesDataQuery, useSaveSalesDataDay } from "../../../hooks/useApi";
import type { SalesDataPatch, SalesDataRow } from "../../../lib/api";
import {
  buildMonthDays,
  monthKey,
  cursorForToday,
  formatNum,
  formatPct,
  type MonthCursor,
  type TodayRef,
} from "../../../lib/trackerMonth";
import {
  SALES_COLUMNS,
  computeSalesRow,
  computeSalesRollup,
  formatMoney,
  toMoney,
} from "../../../lib/salesTracker";

// The Sales pillar's Sales Data tab: the agency's daily sales-call funnel,
// typed by hand. The month grid, the rate math and the table chrome are all
// shared (trackerMonth / salesTracker / DailyTracker); what lives here is the
// bit that is genuinely this surface's own, which is the editing loop:
//
//   type -> show the keystroke immediately (draft)
//        -> debounce, then PATCH that day
//        -> on settle, drop the draft so the server's stored value takes over
//
// Drafts are what make the table feel like a spreadsheet instead of a form. They
// are deliberately dropped once their save settles: the server coerces what you
// type ("9.7" becomes 9, "$4,500" becomes 4500), and the cell should end up
// showing what is actually stored rather than what was typed at it.

const SAVE_DEBOUNCE_MS = 600;

// A stored day -> the raw strings the table edits. null is an empty cell, not a
// zero: an unlogged day must stay visibly blank.
function toTrackerRow(row: SalesDataRow): TrackerRow {
  const cell = (v: number | string | null) => (v === null ? "" : String(v));
  return {
    callsOnCalendar: cell(row.callsOnCalendar),
    rescheduledCancelled: cell(row.rescheduledCancelled),
    callsTaken: cell(row.callsTaken),
    qualified: cell(row.qualified),
    closed: cell(row.closed),
    cashCollected: cell(row.cashCollected),
    notes: cell(row.notes),
  };
}

// A typed cell -> the value the API stores. Emptying a cell clears it to null
// rather than writing a 0.
function toPatchValue(field: string, raw: string): number | string | null {
  const trimmed = raw.trim();
  if (field === "notes") return trimmed === "" ? null : trimmed;
  if (trimmed === "") return null;
  // Send the parsed number so the optimistic cache holds the same shape the
  // server will return. Anything unparseable lands as 0, matching the display
  // math rather than silently disagreeing with it.
  return toMoney(trimmed);
}

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
  const save = useSaveSalesDataDay();

  // Unsaved keystrokes, by ISO day then field. Merged over the server rows so a
  // cell shows what you just typed, not what was last fetched.
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  // Saves waiting on the debounce, and the in-flight count per cell. The count
  // is what stops a settled save from wiping a draft the user has since typed
  // over again.
  const pendingRef = useRef<Map<string, SalesDataPatch>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Map<string, number>>(new Map());

  const rowsByDay = useMemo(() => {
    const map = new Map<string, TrackerRow>();
    for (const row of data ?? []) map.set(row.day, toTrackerRow(row));
    return map;
  }, [data]);

  const getRow = useCallback(
    (iso: string): TrackerRow => ({ ...rowsByDay.get(iso), ...drafts[iso] }),
    [rowsByDay, drafts],
  );

  const clearDraftCell = useCallback((iso: string, field: string) => {
    setDrafts((prev) => {
      const day = prev[iso];
      if (!day || !(field in day)) return prev;
      const { [field]: _dropped, ...rest } = day;
      const next = { ...prev };
      if (Object.keys(rest).length) next[iso] = rest;
      else delete next[iso];
      return next;
    });
  }, []);

  const flush = useCallback(() => {
    timerRef.current = null;
    const pending = Array.from(pendingRef.current.entries());
    pendingRef.current = new Map();

    for (const [day, patch] of pending) {
      const fields = Object.keys(patch);
      for (const f of fields) {
        const key = `${day}:${f}`;
        inflightRef.current.set(key, (inflightRef.current.get(key) ?? 0) + 1);
      }
      save.mutate(
        { day, patch },
        {
          onSettled: () => {
            for (const f of fields) {
              const key = `${day}:${f}`;
              const left = (inflightRef.current.get(key) ?? 1) - 1;
              if (left > 0) {
                inflightRef.current.set(key, left);
              } else {
                // Last save for this cell has landed and nothing newer is
                // queued, so the stored value can take the cell back.
                inflightRef.current.delete(key);
                clearDraftCell(day, f);
              }
            }
          },
        },
      );
    }
  }, [save, clearDraftCell]);

  const handleEdit = useCallback(
    (iso: string, field: string, value: string) => {
      setDrafts((prev) => ({ ...prev, [iso]: { ...prev[iso], [field]: value } }));

      const patch = pendingRef.current.get(iso) ?? {};
      pendingRef.current.set(iso, {
        ...patch,
        [field]: toPatchValue(field, value),
      } as SalesDataPatch);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Changing month must not strand a half-typed day in the debounce window.
  const handleMonthChange = useCallback(
    (next: MonthCursor) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        flush();
      }
      setCursor(next);
    },
    [flush],
  );

  // Same guarantee when the tab is closed or navigated away from mid-edit.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        flush();
      }
    };
    // Intentionally mount/unmount only: re-running on every flush identity
    // change would fire the pending save on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The footer and the tiles read the same merged rows the table renders, so
  // they move with the keystroke rather than lagging a save behind.
  const monthRows = useMemo(
    () => buildMonthDays(cursor, today).map((d) => getRow(d.iso)),
    [cursor, today, getRow],
  );
  const rollup = useMemo(() => computeSalesRollup(monthRows), [monthRows]);

  const statTiles: StatTile[] = [
    {
      key: "taken",
      tone: "indigo",
      icon: <PhoneCall />,
      label: "Calls Taken MTD",
      value: formatNum(rollup.totals.callsTaken),
      sub: `${rollup.filledDays} ${rollup.filledDays === 1 ? "day" : "days"} logged`,
    },
    {
      key: "showup",
      tone: "sky",
      icon: <UserCheck />,
      label: "Show-Up %",
      value: formatPct(rollup.rates.showUpPct),
      sub: `${formatNum(rollup.totals.callsOnCalendar)} booked`,
    },
    {
      key: "closed",
      tone: "green",
      icon: <CheckCircle2 />,
      label: "Closed",
      value: formatNum(rollup.totals.closed),
      sub: `${formatPct(rollup.rates.closePct)} of calls taken`,
    },
    {
      key: "cash",
      tone: "amber",
      icon: <DollarSign />,
      label: "Cash Collected",
      value: formatMoney(rollup.totals.cashCollected),
      sub: `${formatNum(rollup.totals.qualified)} qualified`,
    },
  ];

  return (
    <>
      {isError && (
        <div className="pk-empty">
          Sales Data could not be loaded. Nothing has been lost: reload to try again.
        </div>
      )}
      {save.isError && (
        <div className="pk-empty">
          That last edit did not save. The cell has been put back to its stored value.
        </div>
      )}
      <DailyTracker
        title="Daily sales funnel"
        subtitle={
          isPending && !data
            ? "Loading this month"
            : "One row per day. Type the counts; the rates are computed."
        }
        columns={SALES_COLUMNS}
        cursor={cursor}
        today={today}
        statTiles={statTiles}
        getRow={getRow}
        computeRow={computeSalesRow}
        rollup={{ average: rollup.average, total: rollup.total }}
        onEdit={handleEdit}
        onMonthChange={handleMonthChange}
      />
    </>
  );
}

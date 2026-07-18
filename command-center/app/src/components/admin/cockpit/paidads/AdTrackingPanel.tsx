import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DailyTracker, {
  type TrackerRow,
} from "../../tracker/DailyTracker";
import RollingSummaryStrip from "./RollingSummaryStrip";
import {
  useAdminAdTrackingQuery,
  useAdminAdTrackingSaveMutation,
} from "../../../../hooks/useApi";
import {
  AD_TRACKING_COLUMNS,
  AD_TRACKING_GROUPS,
  AD_TRACKING_INPUT_KEYS,
  buildTrackerRollup,
  computeRowCells,
  rollupWindow,
  sumInputs,
  windowIsoDates,
  type SummaryWindow,
} from "../../../../lib/adTrackingMetrics";
import { buildMonthDays, type MonthCursor, type TodayRef } from "../../../../lib/trackerMonth";
import type { AdTrackingDay, AdTrackingInput } from "../../../../lib/api";

// Paid Ads > Ad Tracking. One client's daily paid-ad funnel: 26 columns in four
// bands, one row per calendar day of the selected month, with a rolling summary
// strip above and an Avg / Total footer below.
//
// Phase 1 is manual entry. 13 cells are typed and stored; the other 13 are
// ratios derived live in adTrackingMetrics.ts and never persisted.
//
// Typing is buffered: a keystroke updates local state immediately (so the row's
// ratios, the footer and the chips all recompute as you type) and the day's row
// is upserted once the typing settles, rather than firing a write per keystroke.
const SAVE_DEBOUNCE_MS = 600;

// The mockup's table wants this much room before it starts scrolling sideways.
const TABLE_MIN_WIDTH = 1720;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function monthParam(cursor: MonthCursor): string {
  return `${cursor.year}-${pad2(cursor.month + 1)}`;
}

// A stored day -> the tracker's string cells. A zero renders blank, not "0", so
// an untouched day reads as empty rather than as a logged zero.
function rowFromDay(day: AdTrackingDay): TrackerRow {
  const row: TrackerRow = {};
  for (const key of AD_TRACKING_INPUT_KEYS) {
    const value = day[key];
    row[key] = value ? String(value) : "";
  }
  return row;
}

export default function AdTrackingPanel({ tenantId }: { tenantId: string }) {
  const today = useMemo<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, []);

  const [cursor, setCursor] = useState<MonthCursor>({
    year: today.year,
    month: today.month,
  });
  const [summaryWindow, setSummaryWindow] = useState<SummaryWindow>("mtd");

  const month = monthParam(cursor);
  const trackerQuery = useAdminAdTrackingQuery(tenantId, month);
  const save = useAdminAdTrackingSaveMutation(tenantId, month);

  // Cells typed since the last flush, layered over the server rows. Cleared when
  // the month or the client changes, so a draft never leaks across views.
  const [drafts, setDrafts] = useState<Record<string, TrackerRow>>({});
  useEffect(() => {
    setDrafts({});
  }, [month, tenantId]);

  const serverRows = useMemo(() => {
    const byIso: Record<string, TrackerRow> = {};
    for (const day of trackerQuery.data?.days ?? []) byIso[day.date] = rowFromDay(day);
    return byIso;
  }, [trackerQuery.data]);

  const rows = useMemo(() => {
    const merged: Record<string, TrackerRow> = { ...serverRows };
    for (const [iso, draft] of Object.entries(drafts)) {
      merged[iso] = { ...(serverRows[iso] ?? {}), ...draft };
    }
    return merged;
  }, [serverRows, drafts]);

  // The debounced flush reads the newest merged rows, not the ones captured when
  // the timer was set.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const flush = useCallback(
    (iso: string) => {
      const row = rowsRef.current[iso] ?? {};
      // Send the whole day: every input as a number, so clearing a cell writes a
      // real 0 rather than leaving the old value behind.
      const metrics: Record<string, number> = {};
      for (const key of AD_TRACKING_INPUT_KEYS) {
        const raw = String(row[key] ?? "").trim();
        const n = raw === "" ? 0 : Number(raw);
        metrics[key] = Number.isFinite(n) ? Math.max(0, n) : 0;
      }
      save.mutate({ date: iso, ...metrics } as AdTrackingInput);
    },
    [save],
  );

  const onEdit = useCallback(
    (iso: string, field: string, value: string) => {
      setDrafts((prev) => ({ ...prev, [iso]: { ...prev[iso], [field]: value } }));
      clearTimeout(timers.current[iso]);
      timers.current[iso] = setTimeout(() => flush(iso), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Never leave a typed value unsaved because the tab unmounted mid-debounce.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of Object.values(pending)) clearTimeout(timer);
    };
  }, []);

  const monthDays = useMemo(() => buildMonthDays(cursor, today), [cursor, today]);

  // The footer covers the whole month; the strip covers the chosen window.
  const footer = useMemo(() => {
    const { sums, filledDays } = sumInputs(monthDays.map((d) => rows[d.iso] ?? {}));
    return buildTrackerRollup(sums, filledDays);
  }, [monthDays, rows]);

  const windowRollup = useMemo(
    () => rollupWindow(rows, windowIsoDates(cursor, summaryWindow, today)),
    [rows, cursor, summaryWindow, today],
  );

  const getRow = useCallback((iso: string) => rows[iso] ?? {}, [rows]);

  if (trackerQuery.isLoading) {
    return <div className="pk-empty">Loading ad tracking...</div>;
  }

  if (trackerQuery.isError) {
    return <div className="pk-empty">Could not load this client's ad tracking.</div>;
  }

  const loggedDays = sumInputs(monthDays.map((d) => rows[d.iso] ?? {})).filledDays;

  return (
    <DailyTracker
      title="Daily Paid-Ad Funnel"
      subtitle={
        loggedDays === 1 ? "1 day logged this month." : `${loggedDays} days logged this month.`
      }
      columns={AD_TRACKING_COLUMNS}
      columnGroups={AD_TRACKING_GROUPS}
      variant="wide"
      minWidth={TABLE_MIN_WIDTH}
      cursor={cursor}
      today={today}
      statTiles={[]}
      aboveTable={
        <RollingSummaryStrip
          window={summaryWindow}
          onWindowChange={setSummaryWindow}
          sums={windowRollup.sums}
          ratios={windowRollup.ratios}
        />
      }
      getRow={getRow}
      computeRow={computeRowCells}
      rollup={footer}
      onEdit={onEdit}
      onMonthChange={setCursor}
    />
  );
}

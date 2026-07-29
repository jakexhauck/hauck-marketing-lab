import { useCallback, useMemo, useState } from "react";
import DailyTracker, { TrackerMonthNav, type TrackerRow } from "./DailyTracker";
import { PillarTitleActions } from "../../pillars/PillarKit";
import { useColdCallDataQuery } from "../../../hooks/useSalesCalls";
import type { ColdCallDataCaller } from "../../../lib/api";
import type { RecordedCounts } from "../../../../functions/lib/coldCallDials";
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
  COLD_CALL_DATA_COLUMNS,
  computeColdCallRollup,
  computeColdCallRow,
  emptyCounts,
} from "../../../lib/coldCallData";

// Sales > Cold Call Data: the agency's whole month on the phones.
//
// A CHANNEL page. It sits beside Sales Data because the two are halves of one
// funnel, and it exists separately because they answer different questions:
// this one is "is the dialing working", Sales Data is "is the selling working".
// Ads and Cold SMS get pages of their own here as they are wired up.
//
// Not to be confused with Acquisition > Cold Call > Tracker. That is a CALLER'S
// own month, scoped to whoever is signed in, and its cells can be typed over
// for dialing done off-app. This is every caller at once and nothing on it is
// typeable: it is what the app measured, which is the only version worth
// reading a channel's performance off.

export default function ColdCallDataTracker() {
  const [today] = useState<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  });
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorForToday(today));

  const month = monthKey(cursor);
  const { data, isPending, isError } = useColdCallDataQuery(month);

  const byDay = useMemo(() => {
    const map = new Map<string, RecordedCounts>();
    for (const row of data?.days ?? []) {
      map.set(row.day, {
        callsMade: row.callsMade,
        pickups: row.pickups,
        passThrough: row.passThrough,
        meetingsBooked: row.meetingsBooked,
        reasons: row.reasons ?? {},
      });
    }
    return map;
  }, [data]);

  // Nothing on this grid is typed, so a row carries only the day it is.
  const getRow = useCallback((iso: string): TrackerRow => ({ day: iso }), []);
  const computeRow = useCallback(
    (row: TrackerRow) => computeColdCallRow(byDay.get(row.day) ?? null),
    [byDay],
  );

  const rollup = useMemo(
    () =>
      computeColdCallRollup(
        buildMonthDays(cursor, today).map((d) => byDay.get(d.iso) ?? emptyCounts()),
      ),
    [cursor, today, byDay],
  );

  return (
    <div className="ccd">
      <ColdCallDataStyle />

      <PillarTitleActions>
        <TrackerMonthNav cursor={cursor} today={today} onMonthChange={setCursor} />
      </PillarTitleActions>

      {isError && (
        <div className="pk-empty">
          The dialing could not be loaded. Reload to try again.
        </div>
      )}

      <DialFunnel totals={rollup.totals} rates={rollup.rates} workedDays={rollup.workedDays} />

      <DailyTracker
        title="Daily dialing"
        subtitle={
          isPending && !data
            ? "Reading the month"
            : "One row per day, every caller, counted from the calls logged on the call card."
        }
        columns={COLD_CALL_DATA_COLUMNS}
        cursor={cursor}
        today={today}
        statTiles={[]}
        getRow={getRow}
        computeRow={computeRow}
        rollup={{ average: rollup.average, total: rollup.total }}
        onEdit={() => {}}
        onMonthChange={setCursor}
        hideMonthNav
        readOnly
      />

      <Callers callers={data?.callers ?? []} />
    </div>
  );
}

// The month in one line, with the rates drawn as the links between the counts
// rather than as counts of their own.
function DialFunnel({
  totals,
  rates,
  workedDays,
}: {
  totals: RecordedCounts;
  rates: ReturnType<typeof computeColdCallRollup>["rates"];
  workedDays: number;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-1 gap-y-3 rounded-[var(--radius-lg)] border border-border px-5 py-4">
      <Step value={formatNum(totals.callsMade)} label="Dials" />
      <Link value={formatPct(rates.answerPct)} label="answered" />
      <Step value={formatNum(totals.pickups)} label="Talked" />
      <Link value={formatPct(rates.pitchPct)} label="pitched" />
      <Step value={formatNum(totals.passThrough)} label="Pitched" />
      <Link value={formatPct(rates.bookPct)} label="booked" />
      <Step value={formatNum(totals.meetingsBooked)} label="Booked" />

      <div className="ml-auto text-right">
        <div className="font-data text-[22px] font-semibold leading-none">{workedDays}</div>
        <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">
          {workedDays === 1 ? "Day dialled" : "Days dialled"}
        </div>
      </div>
    </div>
  );
}

function Step({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-2">
      <div className="font-data text-[22px] font-semibold leading-none">{value}</div>
      <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function Link({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-1 pb-1 text-center">
      <div className="text-[12px] font-semibold text-muted">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

// Who was on the phones. Only when somebody was: a heading over an empty table
// is a question nobody asked.
function Callers({ callers }: { callers: ColdCallDataCaller[] }) {
  if (callers.length === 0) return null;
  return (
    <>
      <div className="pk-list-sec-h">Who dialled ({callers.length})</div>
      <div className="pk-list">
        {callers.map((c) => (
          <div key={c.id} className="pk-li">
            <div className="pk-li-main">
              <div className="pk-li-label">{c.name}</div>
              <div className="pk-li-sub">
                {formatNum(c.talked)} answered, {formatNum(c.pitched)} pitched
              </div>
            </div>
            <div className="pk-li-meta">
              <div style={{ textAlign: "right" }}>
                <div className="font-data text-[15px] font-semibold">{formatNum(c.dials)}</div>
                <div className="text-[11.5px] uppercase tracking-wider text-muted">Dials</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 70 }}>
                <div
                  className="font-data text-[15px] font-semibold"
                  style={{ color: c.booked > 0 ? "var(--positive)" : undefined }}
                >
                  {formatNum(c.booked)}
                </div>
                <div className="text-[11.5px] uppercase tracking-wider text-muted">Booked</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ColdCallDataStyle() {
  return (
    <style>{`
      /* The month band moved onto the title line, so the funnel starts at the top. */
      .pk-kit .ccd .adt-card { margin-top: 0; }
      .pk-kit .ccd .adt-scroll { max-height: min(58vh, 640px); }
      /* The objections cell is prose on a numeric grid: left-align it and give
         it the room the numbers do not need. */
      .pk-kit .ccd .adt-card td:last-child,
      .pk-kit .ccd .adt-card th:last-child { text-align: left; min-width: 180px; }
    `}</style>
  );
}

import { useMemo, useState } from "react";
import DailyTracker, { type TrackerColumn, type TrackerRow } from "../tracker/DailyTracker";
import MonthlyEconomicsTable from "./MonthlyEconomicsTable";
import { buildMonthDays, type MonthCursor, type TodayRef } from "../../../lib/trackerMonth";
import { computeDailyRollup, computeDailyRow } from "../../../lib/coldSms";
import {
  useColdSmsDailyQuery,
  useColdSmsDailyUpsert,
  type ColdSmsDailyField,
} from "../../../hooks/useColdSms";

// Cold Call > Cold SMS. A copy of the SMS Tracking tab of the Master Data
// Tracker sheet (Jake, 2026-10-01): the daily table and, under it, the monthly
// one. The sheet has them side by side; the monthly table is too wide for that
// on a screen, so it stacks. Every number is typed by hand, nothing is synced,
// and every rate is computed from those counts, never stored.
//
// The month is owned by ColdCallSection, whose header row carries the stepper.
// The monthly table is all-time and ignores it.

// Column names are the sheet's own.
const DAILY_COLUMNS: TrackerColumn[] = [
  { key: "smsSent", label: "Initial SMS Sent", kind: "input" },
  { key: "positiveReplies", label: "Positive Replies", kind: "input" },
  { key: "replyPct", label: "Positive Reply Rate", kind: "computed" },
  { key: "meetingsBooked", label: "Meetings Booked", kind: "input" },
  { key: "replyToBookPct", label: "Replies to Booking %", kind: "computed" },
  { key: "bookToSentPct", label: "Booking To Sent %", kind: "computed" },
  { key: "note", label: "Notes", kind: "text" },
];

const EMPTY_DAY: TrackerRow = {
  smsSent: "",
  positiveReplies: "",
  meetingsBooked: "",
  note: "",
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// "YYYY-MM" for the daily query.
function monthParam(cursor: MonthCursor): string {
  return `${cursor.year}-${pad2(cursor.month + 1)}`;
}

function todayRef(): TodayRef {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

// null stays "" so a blank cell round-trips as blank, never as a fabricated 0.
function cell(value: number | null): string {
  return value === null || value === undefined ? "" : String(value);
}

export default function ColdSmsSurface({ cursor }: { cursor: MonthCursor }) {
  const [today] = useState<TodayRef>(todayRef);
  // Exactly what was typed, keyed by ISO day, so a half-typed number is never
  // round-tripped through a parse while the cursor is still in the cell.
  const [drafts, setDrafts] = useState<Record<string, TrackerRow>>({});

  const month = monthParam(cursor);
  const daily = useColdSmsDailyQuery(month);
  const upsert = useColdSmsDailyUpsert();

  const serverRows = useMemo(() => {
    const byDay: Record<string, TrackerRow> = {};
    for (const row of daily.data?.rows ?? []) {
      byDay[row.day] = {
        smsSent: cell(row.smsSent),
        positiveReplies: cell(row.positiveReplies),
        meetingsBooked: cell(row.meetingsBooked),
        note: row.note ?? "",
      };
    }
    return byDay;
  }, [daily.data]);

  const getRow = (iso: string): TrackerRow => ({
    ...EMPTY_DAY,
    ...(serverRows[iso] ?? {}),
    ...(drafts[iso] ?? {}),
  });

  const onEdit = (iso: string, field: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [iso]: { ...getRow(iso), [field]: value } }));
    upsert.mutate({ month, day: iso, field: field as ColdSmsDailyField, value });
  };

  // Every day of the month, so the rollup averages over the whole grid rather
  // than only the days that happen to be persisted.
  const rollup = useMemo(
    () => computeDailyRollup(buildMonthDays(cursor, today).map((d) => getRow(d.iso))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor, today, serverRows, drafts],
  );

  return (
    <div className="cs cs-stack">
      <ColdSmsStyle />
      {daily.isError && <div className="cs-empty">Could not load this month.</div>}
      <DailyTracker
        title="Daily"
        columns={DAILY_COLUMNS}
        cursor={cursor}
        today={today}
        statTiles={[]}
        getRow={getRow}
        computeRow={computeDailyRow}
        rollup={rollup}
        onEdit={onEdit}
        // The stepper lives in ColdCallSection's header row.
        onMonthChange={() => {}}
        hideMonthNav
      />
      <MonthlyEconomicsTable />
    </div>
  );
}

// Bento Bold styles ported from command-center/docs/mockups/admin-redesign/
// cold-sms-B.html and scoped to .pk-kit so they read the admin theme tokens in
// light and dark. The Monthly table shares this block and only ever mounts inside
// this surface.
function ColdSmsStyle() {
  return (
    <style>{`
      .pk-kit {
        --cs-indigo: #6366f1; --cs-indigo-tint: #eef0ff;
        --cs-head-bg: #fafbfc; --cs-hover: #fbfbfd; --cs-input-hover: #f1f2f6;
      }
      [data-theme="dark"] .pk-kit {
        --cs-indigo-tint: rgba(99,102,241,.18);
        --cs-head-bg: color-mix(in srgb, var(--surface) 80%, transparent);
        --cs-hover: rgba(255,255,255,.03);
        --cs-input-hover: rgba(255,255,255,.06);
      }


      .pk-kit .cs-card {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        display: flex; flex-direction: column; box-shadow: var(--shadow-md); overflow: hidden;
      }
      .pk-kit .cs-head {
        display: flex; align-items: flex-start; justify-content: space-between;
        padding: 16px 20px 12px; gap: 12px; flex-wrap: wrap;
      }
      .pk-kit .cs-title { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text); }
      .pk-kit .cs-tsub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
      .pk-kit .cs-headright { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .pk-kit .cs-legend { display: flex; gap: 14px; font-size: 11.5px; color: var(--text-faint); align-items: center; }
      .pk-kit .cs-legend b { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; }
      .pk-kit .cs-dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
      .pk-kit .cs-dot.type { background: var(--cs-indigo); }
      .pk-kit .cs-dot.calc { background: var(--text-faint); }

      .pk-kit .cs-add { display: inline-flex; align-items: center; gap: 8px; }
      .pk-kit .cs-add input {
        border: 1px solid var(--border); background: var(--surface); color: var(--text);
        border-radius: 10px; padding: 7px 10px; font: inherit; font-size: 12.5px; min-width: 148px;
      }
      .pk-kit .cs-add input:focus { outline: 0; box-shadow: 0 0 0 2px var(--cs-indigo); }
      .pk-kit .cs-addbtn {
        display: inline-flex; align-items: center; gap: 6px; border: 0; cursor: pointer;
        background: var(--cs-indigo-tint); color: var(--cs-indigo); font-family: inherit;
        font-weight: 600; font-size: 12.5px; padding: 8px 12px; border-radius: 10px;
      }
      .pk-kit .cs-addbtn:hover:not(:disabled) { filter: brightness(.97); }
      .pk-kit .cs-addbtn:disabled { opacity: .5; cursor: not-allowed; }

      .pk-kit .cs-empty {
        padding: 26px 20px 30px; font-size: 13px; color: var(--text-muted); text-align: center;
      }

      .pk-kit .cs-scroll { overflow: auto; max-height: min(66vh, 760px); }
      .pk-kit .cs-card table { width: 100%; border-collapse: collapse; }
      .pk-kit .cs-card thead th {
        position: sticky; top: 0; z-index: 2; background: var(--cs-head-bg);
        font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
        color: var(--text-faint); text-align: right; padding: 11px 14px; white-space: nowrap;
        border-bottom: 1px solid var(--border);
      }
      .pk-kit .cs-card thead th:first-child { text-align: left; padding-left: 16px; }
      .pk-kit .cs-card tbody td {
        padding: 4px 8px; font-size: 13.5px; text-align: right; white-space: nowrap;
        border-bottom: 1px solid var(--border);
      }
      .pk-kit .cs-card tbody td:first-child { text-align: left; }
      .pk-kit .cs-card tbody tr:hover td { background: var(--cs-hover); }
      .pk-kit .cs-card td.cs-rowlabel {
        padding-left: 16px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums;
      }
      .pk-kit .cs-card td.calc { color: var(--text-muted); font-variant-numeric: tabular-nums; padding-right: 14px; }

      .pk-kit .cs-card td input {
        width: 100%; min-width: 60px; border: 0; background: transparent; font: inherit;
        color: var(--text); text-align: right; font-variant-numeric: tabular-nums;
        padding: 5px 7px; border-radius: 8px; font-weight: 600;
        transition: background .12s, box-shadow .12s;
      }
      .pk-kit .cs-card td.cs-namecol { padding-left: 12px; }
      .pk-kit .cs-card td.cs-namecol input {
        text-align: left; font-weight: 600; color: var(--text); min-width: 190px;
      }
      .pk-kit .cs-card td input::placeholder { color: var(--text-faint); font-weight: 400; }
      .pk-kit .cs-card td input:hover { background: var(--cs-input-hover); }
      .pk-kit .cs-card td input:focus {
        outline: 0; background: var(--surface); box-shadow: 0 0 0 2px var(--cs-indigo);
        position: relative; z-index: 1;
      }

      .pk-kit .cs-card td.cs-rowaction { padding-right: 12px; }
      .pk-kit .cs-del {
        border: 0; background: transparent; cursor: pointer; color: var(--text-faint);
        border-radius: 8px; padding: 5px; display: inline-grid; place-items: center; transition: .15s;
      }
      .pk-kit .cs-del:hover { color: #ef4444; background: rgba(239,68,68,.12); }

      .pk-kit .cs-card tfoot td {
        padding: 12px 14px; font-size: 13.5px; text-align: right; font-variant-numeric: tabular-nums;
        border-top: 2px solid var(--border); background: var(--cs-head-bg);
        position: sticky; bottom: 0; font-weight: 700; color: var(--text);
      }
      .pk-kit .cs-card tfoot td:first-child {
        text-align: left; font-family: var(--font-display); font-weight: 600; letter-spacing: .02em;
        text-transform: uppercase; font-size: 11.5px; color: var(--text-muted); padding-left: 16px;
      }

      .pk-kit .cs .adt-card { margin-top: 0; }
      .pk-kit .cs-stack { display: flex; flex-direction: column; gap: 20px; }

      @media (max-width: 720px) {
        .pk-kit .cs-headright { width: 100%; }
      }
    `}</style>
  );
}

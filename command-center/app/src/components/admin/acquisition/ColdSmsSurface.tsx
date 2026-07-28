import { useMemo, useState } from "react";
import { CalendarDays, MessageSquare, Percent, Table2, TrendingUp } from "lucide-react";
import DailyTracker, {
  TrackerMonthNav,
  type StatTile,
  type TrackerColumn,
  type TrackerRow,
} from "../tracker/DailyTracker";
import MonthlyEconomicsTable from "./MonthlyEconomicsTable";
import ScriptTestTable from "./ScriptTestTable";
import { PillarTitleActions } from "../../pillars/PillarKit";
import {
  buildMonthDays,
  cursorForToday,
  formatPct,
  type MonthCursor,
  type TodayRef,
} from "../../../lib/trackerMonth";
import { computeDailyRollup, computeDailyRow, formatCount } from "../../../lib/coldSms";
import {
  useColdSmsDailyQuery,
  useColdSmsDailyUpsert,
  useColdSmsScriptQuery,
  type ColdSmsDailyField,
} from "../../../hooks/useColdSms";

// The Cold SMS tab body (Acquisition > SMS). One page, three sub-views behind
// an in-page sub-nav: Daily, Monthly and Script Test.
//
// The month nav belongs to the Daily view alone (Monthly and Script are
// all-time), so it is lifted out of the DailyTracker engine and rendered inline
// with the sub-nav, on the Daily view only. That is the same move Cold Call
// makes, and it buys back the whole row the nav used to take above the tiles.
// Nothing here fabricates data: an unlogged month renders the shared engine's
// auto-generated empty day template.

type SubView = "daily" | "monthly" | "script";

const DAILY_COLUMNS: TrackerColumn[] = [
  { key: "smsSent", label: "SMS Sent", kind: "input" },
  { key: "positiveReplies", label: "Positive Replies", kind: "input" },
  { key: "replyPct", label: "Reply %", kind: "computed" },
  { key: "meetingsBooked", label: "Meetings Booked", kind: "input" },
  { key: "replyToBookPct", label: "Reply to Book %", kind: "computed" },
  { key: "bookToSentPct", label: "Book to Sent %", kind: "computed" },
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

export default function ColdSmsSurface() {
  const [view, setView] = useState<SubView>("daily");
  const [today] = useState<TodayRef>(todayRef);
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorForToday(todayRef()));
  // Exactly what was typed, keyed by ISO day, so a half-typed number is never
  // round-tripped through a parse while the cursor is still in the cell.
  const [drafts, setDrafts] = useState<Record<string, TrackerRow>>({});

  const month = monthParam(cursor);
  const daily = useColdSmsDailyQuery(month);
  const upsert = useColdSmsDailyUpsert();
  // Shared cache with ScriptTestTable, so the count pill costs no extra fetch.
  const script = useColdSmsScriptQuery();

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

  const statTiles: StatTile[] = [
    {
      key: "sent",
      tone: "indigo",
      icon: <MessageSquare />,
      label: "SMS Sent",
      value: formatCount(rollup.totals.smsSent),
      sub: "month to date",
    },
    {
      key: "reply",
      tone: "green",
      icon: <TrendingUp />,
      label: "Reply %",
      value: formatPct(rollup.rates.replyPct),
      sub: `${formatCount(rollup.totals.positiveReplies)} of ${formatCount(rollup.totals.smsSent)}`,
    },
    {
      key: "booked",
      tone: "sky",
      icon: <CalendarDays />,
      label: "Meetings Booked",
      value: formatCount(rollup.totals.meetingsBooked),
      sub: "month to date",
    },
    {
      key: "bookToSent",
      tone: "amber",
      icon: <Percent />,
      label: "Book to Sent %",
      value: formatPct(rollup.rates.bookToSentPct),
      sub: "per message",
    },
  ];

  const subtitle = daily.isError
    ? "Could not load this month."
    : rollup.filledDays > 0
      ? `${rollup.filledDays} days logged this month`
      : "No days logged yet. Type into any row to start.";

  const variationCount = script.data?.rows.length ?? 0;

  return (
    <div className="cs">
      <ColdSmsStyle />

      {/* The sub-nav and the month stepper ride on the page's own title line,
          beside "SMS", rather than in a band of their own. That is a whole row
          of vertical space the tiles and the table get back. */}
      <PillarTitleActions>
        <div className="cs-subnav" role="tablist" aria-label="Cold SMS views">
          <SubTab
            id="daily"
            view={view}
            onSelect={setView}
            icon={<CalendarDays size={16} />}
            label="Daily"
          />
          <SubTab
            id="monthly"
            view={view}
            onSelect={setView}
            icon={<TrendingUp size={16} />}
            label="Monthly"
          />
          <SubTab
            id="script"
            view={view}
            onSelect={setView}
            icon={<Table2 size={16} />}
            label="Script Test"
            count={variationCount}
          />
          {/* Daily only: the other two views are all-time. */}
          {view === "daily" && (
            <TrackerMonthNav cursor={cursor} today={today} onMonthChange={setCursor} />
          )}
        </div>
      </PillarTitleActions>

      <div className="cs-views">
        {view === "daily" && (
          <DailyTracker
            title="SMS Outreach Tracker"
            subtitle={subtitle}
            columns={DAILY_COLUMNS}
            cursor={cursor}
            today={today}
            statTiles={statTiles}
            getRow={getRow}
            computeRow={computeDailyRow}
            rollup={rollup}
            onEdit={onEdit}
            onMonthChange={setCursor}
            hideMonthNav
          />
        )}
        {view === "monthly" && <MonthlyEconomicsTable />}
        {view === "script" && <ScriptTestTable />}
      </div>

      <div className="cs-footnote">
        Every rate on this page is computed from the counts you type. Nothing is stored derived.
      </div>
    </div>
  );
}

function SubTab({
  id,
  view,
  onSelect,
  icon,
  label,
  count,
}: {
  id: SubView;
  view: SubView;
  onSelect: (v: SubView) => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  const on = view === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      className={`cs-subtab${on ? " on" : ""}`}
      onClick={() => onSelect(id)}
    >
      {icon}
      {label}
      {count !== undefined && <span className="cs-cnt">{count}</span>}
    </button>
  );
}

// Bento Bold styles ported from command-center/docs/mockups/admin-redesign/
// cold-sms-B.html and scoped to .pk-kit so they read the admin theme tokens in
// light and dark. The Monthly and Script tables share this block: they are the
// same static-row editable table, and they only ever mount inside this surface.
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

      /* The sub-nav now lives in .pk-titleactions, on the title line. It keeps
         its underline-tab look but carries no rule of its own: the title row
         bottom-aligns it, so the active underline reads against the h1. */
      .pk-kit .cs-subnav {
        display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      }
      .pk-kit .cs-subnav .adt-monthnav { margin-left: 0; }

      /* Nothing sits between the title line and the tiles now, so the tiles
         start the body and the table takes back both freed rows. */
      .pk-kit .cs .adt-stats { margin-top: 0; }
      .pk-kit .cs .adt-scroll { max-height: min(80vh, 1040px); }
      .pk-kit .cs-subtab {
        border: 0; background: transparent; cursor: pointer; font-family: inherit;
        font-size: 13.5px; font-weight: 600; color: var(--text-faint); padding: 9px 2px;
        border-bottom: 2.5px solid transparent; transition: .15s;
        display: inline-flex; align-items: center; gap: 7px;
      }
      .pk-kit .cs-subtab:hover { color: var(--text); }
      .pk-kit .cs-subtab.on { color: var(--cs-indigo); border-bottom-color: var(--cs-indigo); }
      .pk-kit .cs-cnt {
        font-size: 11px; font-weight: 700; background: var(--cs-indigo-tint);
        color: var(--cs-indigo); padding: 1px 7px; border-radius: 999px;
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

      .pk-kit .cs-footnote { font-size: 11px; color: var(--text-faint); padding: 12px 2px 4px; }

      @media (max-width: 720px) {
        .pk-kit .cs-subnav { gap: 10px; }
        .pk-kit .cs-headright { width: 100%; }
      }
    `}</style>
  );
}

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, Rows3 } from "lucide-react";
import {
  LEVERAGE_TIERS,
  TASK_TYPES,
  SLOT_COUNT,
  slotLabel,
  weekRollup,
  cycleTaskType,
  mondayOf,
  addWeeks,
  dayOfWeekDate,
  formatWeekRange,
  money,
  taskFor,
  tierFor,
  type TimeAuditBlock,
} from "../../../lib/timeAudit";
import { useAdminTimeAuditWeek, useAdminTimeAuditTag } from "../../../hooks/useApi";

// The Operations "Time Audit" surface: a Mon to Sun grid of 30-minute blocks
// from 6:00 AM to 10:00 PM. Clicking a cell cycles its task tag; the task's
// default leverage tier colours the cell and prices the half hour.
//
// This is a view only. Every number (day totals, week value, high-leverage
// share) comes from weekRollup() in ../../../lib/timeAudit, and every write goes
// through the optimistic tag mutation, so a click feels instant. An untagged
// week renders an empty grid and $0: nothing here invents data.
//
// Ported from docs/mockups/admin-redesign/time-audit-A.html (Layout A). The
// kicker, title and the Operations tab bar come from the shared PillarPage
// shell, so this renders the controls row, the grid card and the rail only.

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// A day whose tagged blocks clear this much is called out in green.
const STRONG_DAY = 800;

function cellKey(dayOfWeek: number, slot: number): string {
  return `${dayOfWeek}-${slot}`;
}

// "This week" reads better than a date when it is the current week, and the
// range is always shown next to it either way.
function weekName(weekStart: string, thisWeek: string): string {
  if (weekStart === thisWeek) return "This week";
  if (weekStart === addWeeks(thisWeek, -1)) return "Last week";
  if (weekStart === addWeeks(thisWeek, 1)) return "Next week";
  return "Week of";
}

export default function TimeAuditGrid() {
  // Seeded once from the local calendar day; nav is pure string math after that.
  const [thisWeek] = useState(() => mondayOf(new Date()));
  const [weekStart, setWeekStart] = useState(thisWeek);

  const week = useAdminTimeAuditWeek(weekStart);
  const tag = useAdminTimeAuditTag();

  const blocks = useMemo<TimeAuditBlock[]>(() => week.data?.blocks ?? [], [week.data]);
  const byCell = useMemo(() => {
    const map = new Map<string, TimeAuditBlock>();
    for (const b of blocks) map.set(cellKey(b.dayOfWeek, b.slot), b);
    return map;
  }, [blocks]);

  const rollup = useMemo(() => weekRollup(blocks), [blocks]);

  function handleCellClick(dayOfWeek: number, slot: number) {
    const current = byCell.get(cellKey(dayOfWeek, slot))?.taskType ?? null;
    const next = cycleTaskType(current);
    if (next === null) {
      tag.mutate({ weekStart, dayOfWeek, slot, taskType: null });
      return;
    }
    tag.mutate({
      weekStart,
      dayOfWeek,
      slot,
      leverage: taskFor(next).defaultLeverage,
      taskType: next,
    });
  }

  return (
    <div className="ta">
      <TimeAuditStyle />

      <div className="ta-controls">
        <div className="ta-weekpill">
          <button
            type="button"
            className="ta-wbtn"
            aria-label="Previous week"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
          >
            <ChevronLeft size={17} />
          </button>
          <span className="ta-wlabel">
            {weekName(weekStart, thisWeek)} <span>{formatWeekRange(weekStart)}</span>
          </span>
          <button
            type="button"
            className="ta-wbtn"
            aria-label="Next week"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
          >
            <ChevronRight size={17} />
          </button>
          {weekStart !== thisWeek && (
            <button type="button" className="ta-thisweek" onClick={() => setWeekStart(thisWeek)}>
              This week
            </button>
          )}
        </div>
      </div>

      <div className="ta-board">
        <div className="ta-gridcard">
          <div className="ta-gc-head">
            <div>
              <div className="ta-gc-title">Weekly Time Grid</div>
              <div className="ta-gc-sub">
                30-minute blocks, 6:00 AM to 10:00 PM. Colour = leverage.
              </div>
            </div>
            <div className="ta-hint">Click any block to cycle its tag</div>
          </div>

          <div className="ta-scroll">
            <table className="ta-grid">
              <thead>
                <tr>
                  <th className="ta-timecol">Time</th>
                  {DAY_LABELS.map((label, d) => {
                    const date = dayOfWeekDate(weekStart, d);
                    return (
                      <th key={label}>
                        <b>{label}</b>
                        {`${MONTH_ABBR[date.getUTCMonth()]} ${date.getUTCDate()}`}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: SLOT_COUNT }, (_, slot) => {
                  const time = slotLabel(slot);
                  return (
                    <tr key={slot} className={time.isHourStart ? "ta-hour" : undefined}>
                      <td className="ta-timecol">
                        {time.text}
                        {time.isHourStart && <span className="ta-ampm"> {time.ampm}</span>}
                      </td>
                      {DAY_LABELS.map((label, d) => (
                        <Cell
                          key={label}
                          dayOfWeek={d}
                          slot={slot}
                          time={`${time.text} ${time.ampm}`}
                          dayLabel={label}
                          block={byCell.get(cellKey(d, slot))}
                          onClick={handleCellClick}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="ta-timecol">Total $ / day</td>
                  {rollup.dayTotals.map((total, d) => (
                    <td
                      key={DAY_LABELS[d]}
                      className={total >= STRONG_DAY ? "ta-hi" : total === 0 ? "ta-lo" : undefined}
                    >
                      {money(total)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <aside className="ta-rail">
          <div className="ta-panel ta-valuetile">
            <div className="ta-vlbl">Value of your week</div>
            <div className="ta-vval">{money(rollup.weekTotal)}</div>
            <div className="ta-vsub">
              {blocks.length === 0
                ? "Nothing tagged yet"
                : `${rollup.pctHighLeverage}% of tagged time is high-leverage`}
            </div>
          </div>

          <div className="ta-panel">
            <h3>
              <span className="ta-ic ta-ic-indigo" aria-hidden>
                <TrendingUp size={14} />
              </span>
              Leverage
            </h3>
            {LEVERAGE_TIERS.map((tier) => (
              <div key={tier.label} className="ta-lev-row">
                <span
                  className="ta-lev-sw"
                  style={{ background: tier.tint, boxShadow: `inset 4px 0 0 ${tier.solid}` }}
                />
                <span className="ta-lname">{tier.displayLabel}</span>
                <span className="ta-lrate">${tier.ratePer30m}/30m</span>
              </div>
            ))}
          </div>

          <div className="ta-panel">
            <h3>
              <span className="ta-ic ta-ic-sky" aria-hidden>
                <Rows3 size={14} />
              </span>
              Task types
            </h3>
            {TASK_TYPES.map((task) => (
              <div key={task.label} className="ta-task-row">
                <span className="ta-tsw" style={{ background: task.color }} />
                {task.label}
                <span className="ta-tlev">{tierFor(task.defaultLeverage).displayLabel}</span>
              </div>
            ))}
            <p className="ta-note">
              Each tag carries a default leverage. Higher leverage, higher dollar value per half
              hour.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

interface CellProps {
  dayOfWeek: number;
  slot: number;
  time: string;
  dayLabel: string;
  block: TimeAuditBlock | undefined;
  onClick: (dayOfWeek: number, slot: number) => void;
}

function Cell({ dayOfWeek, slot, time, dayLabel, block, onClick }: CellProps) {
  const label = `${dayLabel} ${time}, ${block ? block.taskType : "untagged"}`;

  if (!block) {
    return (
      <td className="ta-cell ta-empty" aria-label={label} onClick={() => onClick(dayOfWeek, slot)}>
        ·
      </td>
    );
  }

  const tier = tierFor(block.leverage);
  const task = taskFor(block.taskType);
  return (
    <td
      className="ta-cell"
      aria-label={label}
      style={{ background: tier.tint, boxShadow: `inset 3px 0 0 ${tier.solid}` }}
      onClick={() => onClick(dayOfWeek, slot)}
    >
      <span className="ta-tag" style={{ color: task.color }}>
        <span className="ta-tdot" style={{ background: task.color }} />
        {task.label}
      </span>
    </td>
  );
}

// Bento Bold styles ported from docs/mockups/admin-redesign/time-audit-A.html,
// scoped to .pk-kit .ta so they read the admin theme tokens and cannot collide
// with the other admin surfaces. Cell tints come from LEVERAGE_TIERS as inline
// styles (the mockup palette is light-only), so the dark overrides here only
// need to handle chrome.
function TimeAuditStyle() {
  return (
    <style>{`
      .pk-kit .ta {
        --ta-indigo: #6366f1; --ta-indigo-tint: #eef0ff;
        --ta-sky: #0ea5e9;
        --ta-green-tint: #e7f7f0; --ta-green-ink: #0a7d58;
        --ta-head-bg: #fafbfc; --ta-cellline: #eceef2; --ta-hairline: #e3e6ec;
      }
      [data-theme="dark"] .pk-kit .ta {
        --ta-indigo-tint: rgba(99,102,241,.18);
        --ta-green-tint: rgba(16,185,129,.15); --ta-green-ink: #34d399;
        --ta-head-bg: color-mix(in srgb, var(--surface) 80%, transparent);
        --ta-cellline: var(--border); --ta-hairline: var(--border);
      }

      .pk-kit .ta-controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .pk-kit .ta-weekpill {
        margin-left: auto; display: inline-flex; align-items: center; gap: 4px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 14px; padding: 5px 6px; box-shadow: var(--shadow-sm);
      }
      .pk-kit .ta-wbtn {
        width: 32px; height: 32px; border-radius: 10px; border: 0; background: transparent;
        cursor: pointer; color: var(--text-muted); display: grid; place-items: center; transition: .15s;
      }
      .pk-kit .ta-wbtn:hover { background: var(--ta-indigo-tint); color: var(--ta-indigo); }
      .pk-kit .ta-wlabel {
        font-family: var(--font-display); font-weight: 600; font-size: 14px;
        color: var(--text); padding: 0 6px; white-space: nowrap;
      }
      .pk-kit .ta-wlabel span { color: var(--text-faint); font-weight: 500; font-size: 12px; margin-left: 4px; }
      .pk-kit .ta-thisweek {
        border: 0; background: var(--ta-indigo-tint); color: var(--ta-indigo);
        font-weight: 600; font-size: 12.5px; font-family: inherit; padding: 7px 12px;
        border-radius: 10px; cursor: pointer; margin-left: 2px;
      }
      .pk-kit .ta-thisweek:hover { filter: brightness(.97); }

      .pk-kit .ta-board { display: flex; gap: 16px; margin-top: 16px; align-items: flex-start; }
      .pk-kit .ta-gridcard {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        flex: 1; min-width: 0; display: flex; flex-direction: column;
        box-shadow: var(--shadow-md); overflow: hidden;
      }
      .pk-kit .ta-gc-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px 12px; gap: 12px; }
      .pk-kit .ta-gc-title { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text); }
      .pk-kit .ta-gc-sub { font-size: 12px; color: var(--text-faint); margin-top: 1px; }
      .pk-kit .ta-hint {
        font-size: 11.5px; color: var(--ta-indigo); background: var(--ta-indigo-tint);
        font-weight: 600; padding: 5px 11px; border-radius: 999px; white-space: nowrap;
      }

      .pk-kit .ta-scroll { overflow: auto; max-height: min(66vh, 760px); }
      .pk-kit table.ta-grid { width: 100%; min-width: 700px; border-collapse: collapse; }
      .pk-kit .ta-grid thead th {
        position: sticky; top: 0; z-index: 3; background: var(--ta-head-bg);
        font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
        color: var(--text-faint); text-align: center; padding: 10px 8px; white-space: nowrap;
        border-bottom: 1px solid var(--ta-hairline);
      }
      .pk-kit .ta-grid thead th:first-child { text-align: right; left: 0; z-index: 4; }
      .pk-kit .ta-grid thead th b {
        display: block; font-family: var(--font-display); font-weight: 600; font-size: 13px;
        color: var(--text); text-transform: none; letter-spacing: 0;
      }
      .pk-kit .ta-grid .ta-timecol {
        position: sticky; left: 0; z-index: 2; background: var(--surface); text-align: right;
        padding: 0 12px 0 16px; font-size: 11px; color: var(--text-faint); white-space: nowrap;
        width: 78px; border-right: 1px solid var(--ta-hairline); font-variant-numeric: tabular-nums;
      }
      .pk-kit .ta-grid tr.ta-hour .ta-timecol { color: var(--text-muted); font-weight: 600; }
      .pk-kit .ta-grid .ta-ampm { opacity: .6; }
      .pk-kit .ta-grid td.ta-cell {
        height: 27px; padding: 2px 4px; border-bottom: 1px solid var(--ta-cellline);
        border-right: 1px solid var(--ta-cellline); text-align: left; cursor: pointer;
        transition: filter .12s; position: relative;
      }
      .pk-kit .ta-grid td.ta-cell:hover { filter: brightness(.97); }
      .pk-kit .ta-grid tr.ta-hour td.ta-cell { border-top: 1px solid var(--ta-hairline); }
      .pk-kit .ta-grid td.ta-empty { color: var(--text-faint); text-align: center; font-size: 13px; }
      .pk-kit .ta-grid td.ta-cell .ta-tag {
        display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600;
        letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
      }
      .pk-kit .ta-grid td.ta-cell .ta-tdot { width: 6px; height: 6px; border-radius: 2px; flex-shrink: 0; }

      .pk-kit .ta-grid tfoot td {
        position: sticky; bottom: 0; background: var(--ta-head-bg);
        border-top: 2px solid var(--ta-hairline); padding: 11px 8px; text-align: center;
        font-family: var(--font-display); font-weight: 700; font-size: 13px;
        font-variant-numeric: tabular-nums; color: var(--text);
      }
      .pk-kit .ta-grid tfoot td.ta-timecol {
        text-align: right; font-family: var(--font-display); font-weight: 600;
        text-transform: uppercase; font-size: 10.5px; letter-spacing: .04em;
        color: var(--text-muted); background: var(--ta-head-bg);
      }
      .pk-kit .ta-grid tfoot td.ta-hi { color: var(--ta-green-ink); }
      .pk-kit .ta-grid tfoot td.ta-lo { color: var(--text-faint); }

      .pk-kit .ta-rail { width: 262px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }
      .pk-kit .ta-panel {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        padding: 16px 18px; box-shadow: var(--shadow-md);
      }
      .pk-kit .ta-panel h3 {
        font-family: var(--font-display); font-weight: 600; font-size: 13px; color: var(--text);
        margin-bottom: 12px; display: flex; align-items: center; gap: 7px;
      }
      .pk-kit .ta-ic { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; color: #fff; }
      .pk-kit .ta-ic-indigo { background: var(--ta-indigo); }
      .pk-kit .ta-ic-sky { background: var(--ta-sky); }
      .pk-kit .ta-lev-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
      .pk-kit .ta-lev-sw { width: 26px; height: 18px; border-radius: 6px; flex-shrink: 0; }
      .pk-kit .ta-lname { font-size: 12.5px; font-weight: 600; flex: 1; color: var(--text); }
      .pk-kit .ta-lrate { font-size: 11.5px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
      .pk-kit .ta-task-row {
        display: flex; align-items: center; gap: 10px; padding: 5px 0;
        font-size: 12.5px; font-weight: 500; color: var(--text);
      }
      .pk-kit .ta-tsw { width: 11px; height: 11px; border-radius: 4px; flex-shrink: 0; }
      .pk-kit .ta-tlev { margin-left: auto; color: var(--text-faint); font-size: 11px; font-weight: 600; }
      .pk-kit .ta-valuetile { background: var(--ta-green-tint); }
      .pk-kit .ta-vlbl { font-size: 12px; font-weight: 600; color: var(--text-muted); }
      .pk-kit .ta-vval {
        font-family: var(--font-display); font-weight: 700; font-size: 30px;
        letter-spacing: -.02em; margin-top: 2px; color: var(--ta-green-ink);
        font-variant-numeric: tabular-nums;
      }
      .pk-kit .ta-vsub { font-size: 11.5px; color: var(--text-faint); margin-top: 3px; }
      .pk-kit .ta-note { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; margin-top: 10px; }

      @media (max-width: 980px) {
        .pk-kit .ta-board { flex-direction: column; }
        .pk-kit .ta-rail { width: 100%; flex-direction: row; flex-wrap: wrap; }
        .pk-kit .ta-rail .ta-panel { flex: 1; min-width: 200px; }
      }
      @media (max-width: 720px) { .pk-kit .ta-weekpill { margin-left: 0; } }
    `}</style>
  );
}

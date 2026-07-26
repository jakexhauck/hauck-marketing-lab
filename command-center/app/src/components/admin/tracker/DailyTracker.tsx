import { type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildMonthDays,
  monthLabel,
  prevMonth,
  nextMonth,
  cursorForToday,
  type MonthCursor,
  type TodayRef,
} from "../../../lib/trackerMonth";

// The shared Bento Bold daily-funnel tracker. Cold Call, Cold SMS (daily),
// Sales Data, and Ad Tracking's day grid all render through this one component:
// a month of auto-generated day rows, editable input cells, interleaved
// computed-rate cells, a sticky Average / Total footer, a stat-tile row and
// month nav.
//
// This component is deliberately dumb: it renders a column schema and calls
// back for edits and month changes. All the funnel logic (rate math, rollups,
// day generation) lives in ../../../lib/trackerMonth and in the compute
// functions each surface supplies, so it stays unit-tested and this stays a
// pure view. Nothing here fabricates data: an empty month shows the
// auto-generated empty template.

export type TrackerColumnKind = "input" | "text" | "computed";

export interface TrackerColumn {
  key: string;
  label: string;
  // input = numeric cell you type; text = free-text cell; computed = read-only
  // rate cell filled from computeRow().
  kind: TrackerColumnKind;
  // Which band this column belongs to, in the "wide" variant only. Columns of a
  // band must be contiguous: the grouped header row spans each run.
  group?: string;
}

// A band of columns in the "wide" variant (Spend / Funnel / Qualify / Revenue).
export interface TrackerGroup {
  id: string;
  label: string;
  tone: StatTone;
}

// One day's editable data: field key -> raw string value (as typed).
export type TrackerRow = Record<string, string>;

// A per-column display map (footer rows, and per-row computed cells).
export type RollupCells = Record<string, string>;

export type StatTone = "indigo" | "green" | "sky" | "amber";

export interface StatTile {
  key: string;
  tone: StatTone;
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  chip?: { text: string; ok: boolean };
}

export interface DailyTrackerProps {
  title: string;
  subtitle?: string;
  columns: TrackerColumn[];
  cursor: MonthCursor;
  today: TodayRef | null;
  statTiles: StatTile[];
  // Data source + compute. The surface owns the data and the math; it passes
  // the current cursor's rows in via getRow and the precomputed footer in via
  // rollup, using the trackerMonth helpers.
  getRow: (iso: string) => TrackerRow;
  computeRow: (row: TrackerRow) => RollupCells;
  rollup: { average: RollupCells; total: RollupCells };
  onEdit: (iso: string, field: string, value: string) => void;
  onMonthChange: (cursor: MonthCursor) => void;
  // Hide the built-in month row when the page renders TrackerMonthNav itself.
  hideMonthNav?: boolean;

  // "standard" (default) is the original single-band table. "wide" adds the
  // grouped two-row header, the frozen Date column and a horizontal scroller,
  // for surfaces with too many columns to fit (Ad Tracking's 26). Purely
  // presentational: the edit contract is identical in both.
  variant?: "standard" | "wide";
  // The bands, in order, for the "wide" variant's grouped header row.
  columnGroups?: TrackerGroup[];
  // How wide the wide table wants to be before it starts scrolling.
  minWidth?: number;
  // Rendered between the month nav and the table (the rolling summary strip).
  aboveTable?: ReactNode;

  // Per-cell decoration, for surfaces where a cell's value has a provenance
  // worth showing. Cold Call uses it to mark a count that was typed over the
  // one the app recorded. Optional: every other tracker renders as before.
  cellClass?: (iso: string, field: string) => string | undefined;
  cellTitle?: (iso: string, field: string) => string | undefined;
  // Which cells are read-only because their value is derived somewhere else.
  // Sales Data uses it for the days whose counts come from demo calls logged on
  // the Sales Calls page: a day with two numbers is a day with no number.
  cellLocked?: (iso: string, field: string) => boolean;
  // An extra entry for the "You type / Computed" legend.
  legendExtra?: ReactNode;
}

// The month stepper. Exported so a surface can lift it into its own header row
// (Cold Call puts it beside the Dialing script button) rather than stacking it
// above the tiles, which costs a whole row of vertical space before any data.
export function TrackerMonthNav({
  cursor,
  today,
  onMonthChange,
}: {
  cursor: MonthCursor;
  today?: TodayRef | null;
  onMonthChange: (cursor: MonthCursor) => void;
}) {
  return (
    <div className="adt-monthnav">
      <button
        type="button"
        className="adt-mbtn"
        aria-label="Previous month"
        onClick={() => onMonthChange(prevMonth(cursor))}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="adt-mlabel">{monthLabel(cursor)}</span>
      <button
        type="button"
        className="adt-mbtn"
        aria-label="Next month"
        onClick={() => onMonthChange(nextMonth(cursor))}
      >
        <ChevronRight size={18} />
      </button>
      {today && (
        <button
          type="button"
          className="adt-today-btn"
          onClick={() => onMonthChange(cursorForToday(today))}
        >
          Today
        </button>
      )}
    </div>
  );
}

export default function DailyTracker({
  title,
  subtitle,
  columns,
  cursor,
  today,
  statTiles,
  getRow,
  computeRow,
  rollup,
  onEdit,
  onMonthChange,
  hideMonthNav = false,
  variant = "standard",
  columnGroups,
  minWidth,
  aboveTable,
  cellClass,
  cellTitle,
  cellLocked,
  legendExtra,
}: DailyTrackerProps) {
  const days = buildMonthDays(cursor, today);
  const wide = variant === "wide" && !!columnGroups?.length;

  // Each band's run of columns, so the grouped header can span it. Built from
  // the column order itself, so a band is whatever run of columns declares it.
  const bands = wide ? buildBands(columns, columnGroups!) : [];
  // The first column of each band takes the divider rule.
  const bandStarts = new Set(bands.map((b) => b.firstIndex));

  return (
    <div className={`adt${wide ? " adt-wide" : ""}`}>
      <TrackerStyle />

      {!hideMonthNav && (
        <div className="adt-controls">
          <TrackerMonthNav cursor={cursor} today={today} onMonthChange={onMonthChange} />
        </div>
      )}

      {statTiles.length > 0 && (
        <div className="adt-stats">
          {statTiles.map((s) => (
            <div key={s.key} className={`adt-stat ${s.tone}`}>
              <div className="adt-ico" aria-hidden>
                {s.icon}
              </div>
              <div className="adt-lbl">{s.label}</div>
              <div className="adt-val">{s.value}</div>
              {s.sub && <div className="adt-sub">{s.sub}</div>}
              {s.chip && (
                <span className={`adt-chip ${s.chip.ok ? "ok" : "bad"}`}>
                  {s.chip.text}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {aboveTable}

      <div className="adt-card">
        <div className="adt-head">
          <div>
            <div className="adt-title">{title}</div>
            {subtitle && <div className="adt-tsub">{subtitle}</div>}
          </div>
          <div className="adt-legend">
            <b>
              <span className="adt-dot type" /> You type
            </b>
            <b>
              <span className="adt-dot calc" /> Computed
            </b>
            {legendExtra}
          </div>
        </div>

        <div className="adt-scroll">
          <table style={wide && minWidth ? { minWidth: `${minWidth}px` } : undefined}>
            <thead>
              {wide ? (
                <>
                  <tr>
                    <th className="date" rowSpan={2}>
                      Date
                    </th>
                    {bands.map((b) => (
                      <th key={b.id} className={`gh ${b.tone}`} colSpan={b.span}>
                        {b.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {columns.map((c, i) => (
                      <th
                        key={c.key}
                        className={[
                          "crow",
                          c.kind === "input" ? "inh" : "",
                          bandStarts.has(i) ? "grp-start" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </>
              ) : (
                <tr>
                  <th>Date</th>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {days.map((d) => {
                const row = getRow(d.iso);
                const computed = computeRow(row);
                const cls = [d.isWeekend ? "weekend" : "", d.isToday ? "today" : ""]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr key={d.iso} className={cls || undefined}>
                    <td className="date">
                      <span className="dow">
                        {d.dowLabel} {d.day}
                      </span>
                      {d.isToday && <span className="todaypill">TODAY</span>}
                    </td>
                    {columns.map((c, i) => {
                      const divider = bandStarts.has(i) ? "grp-start" : "";
                      if (c.kind === "computed") {
                        return (
                          <td key={c.key} className={`calc ${divider}`.trim()}>
                            {computed[c.key] ?? "-"}
                          </td>
                        );
                      }
                      const isText = c.kind === "text";
                      const extra = cellClass?.(d.iso, c.key);
                      const title = cellTitle?.(d.iso, c.key);
                      // A cell whose value is derived elsewhere. Read-only
                      // rather than disabled so it stays selectable and
                      // screen-reader reachable: the number is real, it just is
                      // not this table's to change.
                      const locked = cellLocked?.(d.iso, c.key) ?? false;
                      return (
                        <td
                          key={c.key}
                          className={
                            [isText ? "txtcol" : "", divider, locked ? "locked" : "", extra ?? ""]
                              .filter(Boolean)
                              .join(" ") || undefined
                          }
                        >
                          <input
                            inputMode={isText ? undefined : "numeric"}
                            type="text"
                            value={row[c.key] ?? ""}
                            placeholder={isText ? "" : "·"}
                            aria-label={`${c.label}, ${d.dowLabel} ${d.day}`}
                            title={title}
                            readOnly={locked}
                            onChange={(e) => {
                              if (locked) return;
                              onEdit(d.iso, c.key, e.target.value);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="avg">
                <td className={wide ? "date" : undefined}>Average / day</td>
                {columns.map((c, i) => (
                  <td key={c.key} className={bandStarts.has(i) ? "grp-start" : undefined}>
                    {rollup.average[c.key] ?? ""}
                  </td>
                ))}
              </tr>
              <tr className="total">
                <td className={wide ? "date" : undefined}>Total MTD</td>
                {columns.map((c, i) => (
                  <td key={c.key} className={bandStarts.has(i) ? "grp-start" : undefined}>
                    {rollup.total[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

interface Band {
  id: string;
  label: string;
  tone: StatTone;
  span: number;
  firstIndex: number;
}

// Collapse the column list into the runs each band occupies, so the grouped
// header row can span them. Derived from the column order rather than declared
// counts, so a band header can never drift out of sync with its columns. A
// column whose group is unknown is skipped by the header but still renders.
function buildBands(columns: TrackerColumn[], groups: TrackerGroup[]): Band[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const bands: Band[] = [];
  columns.forEach((c, i) => {
    const group = c.group ? byId.get(c.group) : undefined;
    if (!group) return;
    const last = bands[bands.length - 1];
    if (last && last.id === group.id) {
      last.span++;
      return;
    }
    bands.push({ id: group.id, label: group.label, tone: group.tone, span: 1, firstIndex: i });
  });
  return bands;
}

// Bento Bold styles, ported from command-center/docs/mockups/admin-redesign/
// cold-calling.html and scoped to .pk-kit so they read the admin theme tokens
// and work in light and dark. The four stat tones carry their own tint vars
// (with dark overrides) since the mockup palette is light-only.
function TrackerStyle() {
  return (
    <style>{`
      .pk-kit {
        --adt-indigo: #6366f1; --adt-indigo-tint: #eef0ff;
        --adt-green: #10b981;  --adt-green-tint: #e7f7f0;
        --adt-sky: #0ea5e9;    --adt-sky-tint: #e6f5fd;
        --adt-amber: #f59e0b;  --adt-amber-tint: #fdf3e2;
        --adt-zebra: #fcfcfd;  --adt-hover: #fbfbfd;
        --adt-head-bg: #fafbfc; --adt-input-hover: #f1f2f6;
      }
      [data-theme="dark"] .pk-kit {
        --adt-indigo-tint: rgba(99,102,241,.18);
        --adt-green-tint: rgba(16,185,129,.15);
        --adt-sky-tint: rgba(14,165,233,.15);
        --adt-amber-tint: rgba(245,158,11,.15);
        --adt-zebra: rgba(255,255,255,.02);
        --adt-hover: rgba(255,255,255,.03);
        --adt-head-bg: color-mix(in srgb, var(--surface) 80%, transparent);
        --adt-input-hover: rgba(255,255,255,.06);
      }

      .pk-kit .adt-controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .pk-kit .adt-monthnav {
        margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 14px; padding: 5px 6px; box-shadow: var(--shadow-sm);
      }
      .pk-kit .adt-mbtn {
        width: 34px; height: 34px; border-radius: 10px; border: 0; background: transparent;
        cursor: pointer; color: var(--text-muted); display: grid; place-items: center; transition: .15s;
      }
      .pk-kit .adt-mbtn:hover { background: var(--adt-indigo-tint); color: var(--adt-indigo); }
      .pk-kit .adt-mlabel {
        font-family: var(--font-display); font-weight: 600; font-size: 14.5px;
        min-width: 132px; text-align: center; color: var(--text);
      }
      .pk-kit .adt-today-btn {
        border: 0; background: var(--adt-indigo-tint); color: var(--adt-indigo);
        font-weight: 600; font-size: 12.5px; font-family: inherit; padding: 8px 12px;
        border-radius: 10px; cursor: pointer; margin-left: 2px;
      }
      .pk-kit .adt-today-btn:hover { filter: brightness(.97); }

      .pk-kit .adt-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 18px; }
      .pk-kit .adt-stat { border-radius: 22px; padding: 16px 18px; }
      .pk-kit .adt-stat.indigo { background: var(--adt-indigo-tint); }
      .pk-kit .adt-stat.green { background: var(--adt-green-tint); }
      .pk-kit .adt-stat.sky { background: var(--adt-sky-tint); }
      .pk-kit .adt-stat.amber { background: var(--adt-amber-tint); }
      .pk-kit .adt-ico { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; color: #fff; margin-bottom: 10px; }
      .pk-kit .adt-stat.indigo .adt-ico { background: var(--adt-indigo); }
      .pk-kit .adt-stat.green .adt-ico { background: var(--adt-green); }
      .pk-kit .adt-stat.sky .adt-ico { background: var(--adt-sky); }
      .pk-kit .adt-stat.amber .adt-ico { background: var(--adt-amber); }
      .pk-kit .adt-ico svg { width: 18px; height: 18px; }
      .pk-kit .adt-lbl { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
      .pk-kit .adt-val { font-family: var(--font-display); font-weight: 700; font-size: 30px; letter-spacing: -.02em; margin-top: 2px; color: var(--text); font-variant-numeric: tabular-nums; }
      .pk-kit .adt-sub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
      .pk-kit .adt-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; margin-top: 9px; }
      .pk-kit .adt-chip.ok { background: rgba(16,185,129,.16); color: #0a7d58; }
      .pk-kit .adt-chip.bad { background: rgba(239,68,68,.14); color: #c23434; }
      [data-theme="dark"] .pk-kit .adt-chip.ok { color: #34d399; }
      [data-theme="dark"] .pk-kit .adt-chip.bad { color: #f87171; }

      .pk-kit .adt-card {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        margin-top: 16px; display: flex; flex-direction: column; box-shadow: var(--shadow-md); overflow: hidden;
      }
      .pk-kit .adt-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 12px; gap: 12px; }
      .pk-kit .adt-title { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text); }
      .pk-kit .adt-tsub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
      .pk-kit .adt-legend { display: flex; gap: 14px; font-size: 11.5px; color: var(--text-faint); align-items: center; }
      .pk-kit .adt-legend b { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; }
      .pk-kit .adt-dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
      .pk-kit .adt-dot.type { background: var(--adt-indigo); }
      .pk-kit .adt-dot.calc { background: var(--text-faint); }
      .pk-kit .adt-dot.rec { background: var(--adt-green); }

      .pk-kit .adt-scroll { overflow: auto; max-height: min(62vh, 720px); }
      .pk-kit .adt-card table { width: 100%; border-collapse: collapse; }
      .pk-kit .adt-card thead th {
        position: sticky; top: 0; z-index: 2; background: var(--adt-head-bg);
        font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
        color: var(--text-faint); text-align: right; padding: 11px 14px; white-space: nowrap;
        border-bottom: 1px solid var(--border);
      }
      .pk-kit .adt-card thead th:first-child { text-align: left; padding-left: 16px; }
      .pk-kit .adt-card tbody td { padding: 4px 8px; font-size: 13.5px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--border); }
      .pk-kit .adt-card tbody td:first-child { text-align: left; }
      .pk-kit .adt-card tbody td.date { padding-left: 16px; font-weight: 600; color: var(--text); }
      .pk-kit .adt-card td.date .dow { color: var(--text-faint); font-weight: 500; margin-right: 7px; font-variant-numeric: tabular-nums; }
      .pk-kit .adt-card td.calc { color: var(--text-muted); font-variant-numeric: tabular-nums; padding-right: 14px; }
      .pk-kit .adt-card tbody tr:hover td { background: var(--adt-hover); }
      .pk-kit .adt-card tr.weekend td { background: var(--adt-zebra); }
      .pk-kit .adt-card tr.today td { background: var(--adt-indigo-tint) !important; }
      .pk-kit .adt-card tr.today td.date { box-shadow: inset 3px 0 0 var(--adt-indigo); }
      .pk-kit .adt-card .todaypill { font-size: 10px; font-weight: 700; color: #fff; background: var(--adt-indigo); padding: 1px 7px; border-radius: 999px; margin-left: 8px; letter-spacing: .03em; }

      .pk-kit .adt-card td input {
        width: 100%; min-width: 54px; border: 0; background: transparent; font: inherit;
        color: var(--text); text-align: right; font-variant-numeric: tabular-nums; padding: 5px 7px;
        border-radius: 8px; font-weight: 600; transition: background .12s, box-shadow .12s;
      }
      .pk-kit .adt-card td.txtcol input { text-align: left; font-weight: 400; color: var(--text-muted); min-width: 90px; }
      .pk-kit .adt-card td input::placeholder { color: var(--text-faint); font-weight: 400; }
      /* A cell whose value was typed rather than measured (Cold Call, 0052).
         Marked in the typing colour with a dotted rule, so a hand-entered count
         never reads as a recorded one at a glance. */
      .pk-kit .adt-card td.typed input {
        color: var(--adt-indigo);
        text-decoration: underline dotted;
        text-underline-offset: 3px;
        text-decoration-thickness: 1px;
      }
      .pk-kit .adt-card td input:hover { background: var(--adt-input-hover); }
      .pk-kit .adt-card td input:focus { outline: 0; background: var(--surface); box-shadow: 0 0 0 2px var(--adt-indigo); position: relative; z-index: 1; }

      /* A cell whose value is derived elsewhere. Reads as settled rather than
         broken: no hover affordance, a cursor that says "not here", and the
         number itself at full contrast because it is real data, just not this
         table's to edit. */
      .pk-kit .adt-card td.locked input { cursor: default; color: var(--text-muted); }
      .pk-kit .adt-card td.locked input:hover { background: transparent; }
      .pk-kit .adt-card td.locked input:focus { box-shadow: none; background: transparent; }

      .pk-kit .adt-card tfoot td {
        padding: 12px 14px; font-size: 13.5px; text-align: right; font-variant-numeric: tabular-nums;
        border-top: 2px solid var(--border); background: var(--adt-head-bg); position: sticky; bottom: 0;
      }
      .pk-kit .adt-card tfoot td:first-child {
        text-align: left; font-family: var(--font-display); font-weight: 600; letter-spacing: .02em;
        text-transform: uppercase; font-size: 11.5px; color: var(--text-muted); padding-left: 16px;
      }
      .pk-kit .adt-card tfoot tr.total td { font-weight: 700; color: var(--text); }
      .pk-kit .adt-card tfoot tr.avg td { color: var(--text-muted); border-top: 0; }

      /* ---- "wide" variant: grouped bands + frozen Date column ----
         Ported from docs/mockups/admin-redesign/ad-tracking-A.html. The table
         scrolls inside .adt-scroll; the page body never scrolls sideways. */
      .pk-kit .adt-wide { --adt-grp-h: 30px; }
      .pk-kit .adt-wide .adt-card table { border-collapse: separate; border-spacing: 0; }

      /* Band header row */
      .pk-kit .adt-wide .adt-card thead th.gh {
        position: sticky; top: 0; z-index: 4; height: var(--adt-grp-h);
        font-family: var(--font-display); font-weight: 600; font-size: 11px;
        letter-spacing: .06em; text-transform: uppercase; text-align: left;
        padding: 0 12px; border-bottom: 1px solid var(--border);
      }
      .pk-kit .adt-wide .adt-card thead th.gh.indigo { background: var(--adt-indigo-tint); color: var(--adt-indigo); }
      .pk-kit .adt-wide .adt-card thead th.gh.sky { background: var(--adt-sky-tint); color: var(--adt-sky); }
      .pk-kit .adt-wide .adt-card thead th.gh.amber { background: var(--adt-amber-tint); color: var(--adt-amber); }
      .pk-kit .adt-wide .adt-card thead th.gh.green { background: var(--adt-green-tint); color: var(--adt-green); }

      /* Column label row, offset below the band row */
      .pk-kit .adt-wide .adt-card thead th.crow {
        position: sticky; top: var(--adt-grp-h); z-index: 3; text-align: right;
        font-size: 10.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase;
        color: var(--text-faint); padding: 8px 12px; white-space: nowrap;
        background: var(--adt-head-bg); border-bottom: 1px solid var(--border);
      }
      /* Typed columns read indigo, so "you type here" is obvious at a glance. */
      .pk-kit .adt-wide .adt-card thead th.crow.inh { color: var(--adt-indigo); }

      /* Frozen Date column. Higher z-index than the band row so it stays on top
         at the corner where the two sticky axes cross. */
      .pk-kit .adt-wide .adt-card thead th.date {
        position: sticky; left: 0; top: 0; z-index: 6; text-align: left; vertical-align: bottom;
        padding: 0 14px 8px; font-size: 10.5px; font-weight: 600; letter-spacing: .03em;
        text-transform: uppercase; color: var(--text-faint);
        background: var(--adt-head-bg);
        border-bottom: 1px solid var(--border); border-right: 1px solid var(--border);
      }
      .pk-kit .adt-wide .adt-card tbody td.date {
        position: sticky; left: 0; z-index: 2; background: var(--surface);
        border-right: 1px solid var(--border);
      }
      .pk-kit .adt-wide .adt-card tbody tr:hover td.date { background: var(--adt-hover); }
      .pk-kit .adt-wide .adt-card tr.weekend td.date { background: var(--adt-zebra); }
      .pk-kit .adt-wide .adt-card tr.today td.date { background: var(--adt-indigo-tint); }

      .pk-kit .adt-wide .adt-card .grp-start { border-left: 1px solid var(--border); }
      .pk-kit .adt-wide .adt-card tbody td { padding: 3px 8px; font-size: 13px; }
      .pk-kit .adt-wide .adt-card td input { min-width: 50px; padding: 5px 6px; }

      /* Sticky footer, with its own frozen Date cell */
      .pk-kit .adt-wide .adt-card tfoot td { z-index: 3; }
      .pk-kit .adt-wide .adt-card tfoot td.date {
        position: sticky; left: 0; bottom: 0; z-index: 4;
        background: var(--adt-head-bg); border-right: 1px solid var(--border);
      }

      @media (max-width: 1120px) { .pk-kit .adt-stats { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 720px) { .pk-kit .adt-stats { grid-template-columns: 1fr 1fr; gap: 10px; } .pk-kit .adt-monthnav { margin-left: 0; } }
    `}</style>
  );
}

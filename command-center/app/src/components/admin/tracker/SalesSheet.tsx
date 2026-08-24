import { useMemo } from "react";
import { DollarSign, Wallet, Target, UserX } from "lucide-react";
import type { SheetCall } from "../../../../functions/lib/salesSheetRows";
import {
  SHEET_COLUMNS,
  HEADLINE_TILES,
  FUNNEL_CELLS,
  columnWidths,
  bandTotals,
  sheetRow,
  zoneLabel,
} from "../../../lib/salesSheet";

// Sales Data, in the Command Center's own design.
//
// Three things, in the order they answer a question. The four tiles say how the
// month went. The strip under them says what happened to the calls that made
// it. The table is the detail behind both, one row per call.
//
// Everything rendered here comes from ../../../lib/salesSheet: the columns, the
// tones, the totals. Nothing is decided in this file, which is what keeps the
// numbers unit-tested and this a view.

const TILE_ICONS: Record<string, typeof DollarSign> = {
  revenue: DollarSign,
  cash: Wallet,
  closingRate: Target,
  noShowRate: UserX,
};

export default function SalesSheet({
  calls,
  timeZone,
}: {
  calls: SheetCall[];
  timeZone: string;
}) {
  const totals = useMemo(() => bandTotals(calls), [calls]);
  const rows = useMemo(() => calls.map((c) => sheetRow(c, timeZone)), [calls, timeZone]);
  const widths = useMemo(() => columnWidths(), []);
  // Read off a call in the month rather than off today, so a month viewed in
  // winter does not get labelled with summer's abbreviation.
  const zone = useMemo(
    () => zoneLabel(timeZone, calls.find((c) => c.scheduledAt)?.scheduledAt),
    [timeZone, calls],
  );

  return (
    <div className="ssh">
      <SheetStyle />

      <div className="ssh-tiles">
        {HEADLINE_TILES.map((tile) => {
          const Icon = TILE_ICONS[tile.key] ?? DollarSign;
          const sub = tile.sub?.(totals);
          return (
            <div key={tile.key} className={`ssh-tile ${tile.tone}`}>
              <div className="ssh-ico" aria-hidden>
                <Icon />
              </div>
              <div className="ssh-tlabel">{tile.label}</div>
              <div className="ssh-tval">{tile.value(totals)}</div>
              {sub && <div className="ssh-tsub">{sub}</div>}
            </div>
          );
        })}
      </div>

      <div className="ssh-funnel">
        {FUNNEL_CELLS.map((cell) => (
          <div key={cell.key} className={`ssh-fcell${cell.tone ? ` t-${cell.tone}` : ""}`}>
            <div className="ssh-fval">{cell.value(totals)}</div>
            <div className="ssh-flabel">{cell.label}</div>
          </div>
        ))}
      </div>

      <div className="ssh-card">
        <div className="ssh-scroll">
          <table>
            <colgroup>
              {SHEET_COLUMNS.map((c, i) => (
                <col key={c.key} style={{ width: widths[i] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {SHEET_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={c.numeric ? "num" : undefined}
                  >
                    {/* The zone is named once, on the column whose values are
                        in it, rather than repeated on every row. */}
                    {c.key === "date" && zone ? `${c.label} · ${zone}` : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="ssh-date">{row.date}</td>
                  <td className="ssh-name">{row.name}</td>
                  <td>
                    <span className={`ssh-pill t-${row.outcome.tone}`}>{row.outcome.label}</span>
                  </td>
                  {SHEET_COLUMNS.slice(3).map((c) => {
                    // The form link is a control, not a value: it opens the
                    // prospect's prefilled disposition form in a new tab.
                    if (c.key === "postCallForm") {
                      return (
                        <td key={c.key}>
                          {row.formUrl ? (
                            <a
                              className="ssh-formlink"
                              href={row.formUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open form
                            </a>
                          ) : (
                            <span className="ssh-none">-</span>
                          )}
                        </td>
                      );
                    }
                    const value = row.cells[c.key] ?? "";
                    return (
                      <td
                        key={c.key}
                        className={c.numeric ? "num" : undefined}
                        // So a value the column is too narrow to show whole is
                        // still readable, rather than lost behind an ellipsis.
                        title={value || undefined}
                      >
                        {value || <span className="ssh-none">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div className="ssh-empty">No sales calls were booked this month.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Scoped to .ssh, built from the app's own tokens and the tracker's accent set,
// so this page reads as part of the Command Center in both themes.
function SheetStyle() {
  return (
    <style>{`
      .pk-kit .ssh {
        --ssh-indigo: #6366f1; --ssh-green: #10b981; --ssh-sky: #0ea5e9; --ssh-amber: #f59e0b;
        --ssh-red: #ef4444;
        --ssh-indigo-tint: #eef0ff; --ssh-green-tint: #e7f7f0;
        --ssh-sky-tint: #e6f5fd; --ssh-amber-tint: #fdf3e2;
        --ssh-head-bg: #fafbfc; --ssh-hover: #fbfbfd;
      }
      [data-theme="dark"] .pk-kit .ssh {
        --ssh-indigo-tint: rgba(99,102,241,.18); --ssh-green-tint: rgba(16,185,129,.15);
        --ssh-sky-tint: rgba(14,165,233,.15); --ssh-amber-tint: rgba(245,158,11,.15);
        --ssh-head-bg: color-mix(in srgb, var(--surface) 80%, transparent);
        --ssh-hover: rgba(255,255,255,.03);
      }

      /* ===== the four headline tiles ===== */
      .pk-kit .ssh-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
      .pk-kit .ssh-tile { border-radius: 22px; padding: 16px 18px; }
      .pk-kit .ssh-tile.indigo { background: var(--ssh-indigo-tint); }
      .pk-kit .ssh-tile.green { background: var(--ssh-green-tint); }
      .pk-kit .ssh-tile.sky { background: var(--ssh-sky-tint); }
      .pk-kit .ssh-tile.amber { background: var(--ssh-amber-tint); }
      .pk-kit .ssh-ico { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; color: #fff; margin-bottom: 10px; }
      .pk-kit .ssh-ico svg { width: 18px; height: 18px; }
      .pk-kit .ssh-tile.indigo .ssh-ico { background: var(--ssh-indigo); }
      .pk-kit .ssh-tile.green .ssh-ico { background: var(--ssh-green); }
      .pk-kit .ssh-tile.sky .ssh-ico { background: var(--ssh-sky); }
      .pk-kit .ssh-tile.amber .ssh-ico { background: var(--ssh-amber); }
      .pk-kit .ssh-tlabel { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
      .pk-kit .ssh-tval { font-family: var(--font-display); font-weight: 700; font-size: 30px; letter-spacing: -.02em; margin-top: 2px; color: var(--text); font-variant-numeric: tabular-nums; }
      .pk-kit .ssh-tsub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }

      /* ===== the funnel strip ===== */
      .pk-kit .ssh-funnel {
        display: grid; grid-template-columns: repeat(8, 1fr); gap: 1px; margin-top: 14px;
        background: var(--border); border: 1px solid var(--border); border-radius: 18px;
        overflow: hidden; box-shadow: var(--shadow-sm);
      }
      .pk-kit .ssh-fcell { background: var(--surface); padding: 13px 14px; }
      .pk-kit .ssh-fval { font-family: var(--font-display); font-weight: 700; font-size: 21px; letter-spacing: -.01em; color: var(--text); font-variant-numeric: tabular-nums; line-height: 1.1; }
      .pk-kit .ssh-flabel { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); margin-top: 3px; }
      .pk-kit .ssh-fcell.t-good .ssh-fval { color: var(--ssh-green); }
      .pk-kit .ssh-fcell.t-info .ssh-fval { color: var(--ssh-indigo); }
      .pk-kit .ssh-fcell.t-warn .ssh-fval { color: var(--ssh-amber); }
      .pk-kit .ssh-fcell.t-bad .ssh-fval { color: var(--ssh-red); }
      .pk-kit .ssh-fcell.t-muted .ssh-fval { color: var(--text-faint); }

      /* ===== the table ===== */
      .pk-kit .ssh-card {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        margin-top: 16px; box-shadow: var(--shadow-md); overflow: hidden;
      }
      /* Fluid, so the month fits the page. It only scrolls below a width no
         desktop has, which is there so the table degrades on a phone rather
         than crushing itself to nothing. */
      .pk-kit .ssh-scroll { overflow: auto; max-height: min(64vh, 760px); }
      .pk-kit .ssh-card table { width: 100%; min-width: 1150px; border-collapse: collapse; table-layout: fixed; }
      .pk-kit .ssh-card thead th {
        position: sticky; top: 0; z-index: 2; background: var(--ssh-head-bg);
        font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
        color: var(--text-faint); text-align: left; padding: 11px 12px; white-space: nowrap;
        border-bottom: 1px solid var(--border);
      }
      .pk-kit .ssh-card thead th:first-child { padding-left: 18px; }
      .pk-kit .ssh-card thead th.num { text-align: right; }
      .pk-kit .ssh-card tbody td {
        padding: 9px 12px; font-size: 13px; color: var(--text-muted);
        border-bottom: 1px solid var(--border);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pk-kit .ssh-card tbody tr:last-child td { border-bottom: 0; }
      .pk-kit .ssh-card tbody td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text); }
      .pk-kit .ssh-card tbody tr:hover td { background: var(--ssh-hover); }
      .pk-kit .ssh-card td.ssh-date { padding-left: 18px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
      .pk-kit .ssh-card td.ssh-name { font-weight: 600; color: var(--text); }
      /* A column with nothing in it yet. Faint enough to read as waiting. */
      .pk-kit .ssh-none { color: var(--text-faint); opacity: .55; }
      /* The disposition form link, styled like a quiet control so ten of them
         down the sheet do not turn into a wall of buttons. */
      .pk-kit .ssh-formlink {
        display: inline-flex; align-items: center;
        font-size: 12px; font-weight: 600; color: var(--brand);
        background: var(--brand-tint);
        padding: 3px 10px; border-radius: 999px; white-space: nowrap;
      }
      .pk-kit .ssh-formlink:hover { background: var(--brand-tint-strong); }

      /* ===== the outcome pill ===== */
      .pk-kit .ssh-pill { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
      .pk-kit .ssh-pill.t-good { background: rgba(16,185,129,.16); color: #0a7d58; }
      .pk-kit .ssh-pill.t-info { background: rgba(99,102,241,.16); color: #4649c4; }
      .pk-kit .ssh-pill.t-warn { background: rgba(245,158,11,.18); color: #a86a06; }
      .pk-kit .ssh-pill.t-bad { background: rgba(239,68,68,.14); color: #c23434; }
      .pk-kit .ssh-pill.t-muted { background: color-mix(in srgb, var(--text-faint) 16%, transparent); color: var(--text-faint); }
      [data-theme="dark"] .pk-kit .ssh-pill.t-good { color: #34d399; }
      [data-theme="dark"] .pk-kit .ssh-pill.t-info { color: #a5b4fc; }
      [data-theme="dark"] .pk-kit .ssh-pill.t-warn { color: #fbbf24; }
      [data-theme="dark"] .pk-kit .ssh-pill.t-bad { color: #f87171; }

      .pk-kit .ssh-empty { padding: 44px 20px; text-align: center; font-size: 13.5px; color: var(--text-faint); }

      @media (max-width: 1100px) {
        .pk-kit .ssh-tiles { grid-template-columns: repeat(2, 1fr); }
        .pk-kit .ssh-funnel { grid-template-columns: repeat(4, 1fr); }
      }
      @media (max-width: 620px) {
        .pk-kit .ssh-tiles { grid-template-columns: 1fr; }
        .pk-kit .ssh-funnel { grid-template-columns: repeat(2, 1fr); }
      }
    `}</style>
  );
}

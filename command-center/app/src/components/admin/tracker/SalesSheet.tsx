import { useMemo, useState } from "react";
import { DollarSign, Wallet, Target, UserX, X } from "lucide-react";
import type { SheetCall } from "../../../../functions/lib/salesSheetRows";
import {
  SHEET_COLUMNS,
  HEADLINE_TILES,
  FUNNEL_CELLS,
  columnWidths,
  bandTotals,
  sheetRow,
  formsOwed,
  zoneLabel,
  type SheetRow,
} from "../../../lib/salesSheet";
import { useSetSalesCallExcluded } from "../../../hooks/useApi";
import SalesCallForm from "./SalesCallForm";

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
  // Read per render on purpose: a meeting passing its time starts asking for a
  // form on the next refetch without anything else changing.
  const now = Date.now();
  const rows = calls.filter((c) => !c.excluded).map((c) => sheetRow(c, timeZone, now));
  const removed = calls.filter((c) => c.excluded).map((c) => sheetRow(c, timeZone, now));
  const owed = formsOwed(calls, now);
  const widths = useMemo(() => columnWidths(), []);
  // Read off a call in the month rather than off today, so a month viewed in
  // winter does not get labelled with summer's abbreviation.
  const zone = useMemo(
    () => zoneLabel(timeZone, calls.find((c) => c.scheduledAt)?.scheduledAt),
    [timeZone, calls],
  );

  const exclude = useSetSalesCallExcluded();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const openCall = openId ? calls.find((c) => c.id === openId) : undefined;
  const openRow = openId ? [...rows, ...removed].find((r) => r.id === openId) : undefined;

  const renderRow = (row: SheetRow, isRemoved: boolean) => (
    <tr key={row.id} className={isRemoved ? "ssh-removed" : undefined}>
      <td className="ssh-date">{row.date}</td>
      <td className="ssh-name">{row.name}</td>
      <td>
        <span className={`ssh-pill t-${row.outcome.tone}`}>{row.outcome.label}</span>
      </td>
      {SHEET_COLUMNS.slice(3).map((c) => {
        if (c.key === "postCallForm") {
          return (
            <td key={c.key}>
              {!isRemoved && (
                <button
                  type="button"
                  className={`ssh-formlink${row.needsForm ? " is-owed" : ""}`}
                  onClick={() => setOpenId(row.id)}
                >
                  Open form
                </button>
              )}
            </td>
          );
        }
        if (c.key === "exit") {
          return (
            <td key={c.key} className="ssh-exitcell">
              {isRemoved ? (
                <button
                  type="button"
                  className="ssh-restore"
                  disabled={exclude.isPending}
                  onClick={() => exclude.mutate({ id: row.id, excluded: false })}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="ssh-exit"
                  aria-label={`Remove ${row.name} from sales data`}
                  title="Remove from sales data"
                  disabled={exclude.isPending}
                  onClick={() => exclude.mutate({ id: row.id, excluded: true })}
                >
                  <X aria-hidden />
                </button>
              )}
            </td>
          );
        }
        const value = row.cells[c.key] ?? "";
        if (c.key === "recordingLink" && /^https?:\/\//i.test(value)) {
          return (
            <td key={c.key}>
              <a className="ssh-reclink" href={value} target="_blank" rel="noreferrer" title={value}>
                Watch
              </a>
            </td>
          );
        }
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
  );

  return (
    <div className="ssh">
      <SheetStyle />

      {owed > 0 && (
        <div className="ssh-owed" role="status">
          {owed} need{owed === 1 ? "s" : ""} a form
        </div>
      )}

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
            <tbody>{rows.map((row) => renderRow(row, false))}</tbody>
            {showRemoved && removed.length > 0 && (
              <tbody>{removed.map((row) => renderRow(row, true))}</tbody>
            )}
          </table>

          {rows.length === 0 && (
            <div className="ssh-empty">No sales calls were booked this month.</div>
          )}
        </div>
      </div>

      {removed.length > 0 && (
        <button type="button" className="ssh-showremoved" onClick={() => setShowRemoved((v) => !v)}>
          {showRemoved ? "Hide removed" : `Show removed (${removed.length})`}
        </button>
      )}

      {openCall && openRow && (
        <SalesCallForm call={openCall} date={openRow.date} onClose={() => setOpenId(null)} />
      )}
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
      /* 1150 -> 1300 when the Name column took the width a company name needs.
         The share each column gets is relative, so without this the extra came
         out of Date and the timestamps started clipping instead. */
      .pk-kit .ssh-card table { width: 100%; min-width: 1300px; border-collapse: collapse; table-layout: fixed; }
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
      /* The one cell allowed to wrap. Everything else on the sheet is short
         enough to clip safely; a company name is not, and half of one is no
         use to anybody reading down the month. */
      .pk-kit .ssh-card td.ssh-name {
        font-weight: 600; color: var(--text);
        white-space: normal; overflow-wrap: anywhere; line-height: 1.35;
      }
      /* A column with nothing in it yet. Faint enough to read as waiting. */
      .pk-kit .ssh-none { color: var(--text-faint); opacity: .55; }
      /* The post-call form button, quiet so thirty of them down the sheet do
         not turn into a wall of buttons. A meeting that has happened with
         nothing recorded gets the loud version. */
      .pk-kit .ssh-formlink {
        display: inline-flex; align-items: center;
        font-size: 12px; font-weight: 600; color: var(--brand);
        background: var(--brand-tint);
        padding: 3px 10px; border-radius: 999px; white-space: nowrap;
        border: 0; cursor: pointer;
      }
      .pk-kit .ssh-formlink:hover { background: var(--brand-tint-strong); }
      .pk-kit .ssh-formlink.is-owed { background: var(--ssh-amber); color: #fff; }
      .pk-kit .ssh-formlink.is-owed:hover { filter: brightness(1.06); }
      .pk-kit .ssh-reclink { font-size: 12.5px; font-weight: 600; color: var(--brand); }
      .pk-kit .ssh-reclink:hover { text-decoration: underline; }

      /* The owed count, above the tiles. */
      .pk-kit .ssh-owed {
        display: inline-flex; align-items: center; margin-bottom: 12px;
        font-size: 12.5px; font-weight: 600; color: #a86a06;
        background: var(--ssh-amber-tint); padding: 5px 12px; border-radius: 999px;
      }
      [data-theme="dark"] .pk-kit .ssh-owed { color: #fbbf24; }

      /* The exit X: faint until the row is hovered, so it never competes with
         the numbers. */
      .pk-kit .ssh-card td.ssh-exitcell { padding-left: 4px; padding-right: 10px; text-align: right; }
      .pk-kit .ssh-exit {
        display: inline-grid; place-items: center; width: 24px; height: 24px;
        border: 0; border-radius: 8px; background: transparent; cursor: pointer;
        color: var(--text-faint); opacity: .35; transition: opacity .15s, background .15s, color .15s;
      }
      .pk-kit .ssh-exit svg { width: 14px; height: 14px; }
      .pk-kit .ssh-card tbody tr:hover .ssh-exit { opacity: 1; }
      .pk-kit .ssh-exit:hover { background: rgba(239,68,68,.12); color: var(--ssh-red); }
      .pk-kit .ssh-exit:focus-visible { opacity: 1; }
      .pk-kit .ssh-restore {
        border: 0; background: transparent; cursor: pointer; white-space: nowrap;
        font-size: 12px; font-weight: 600; color: var(--brand);
      }
      .pk-kit .ssh-removed td { opacity: .5; }
      .pk-kit .ssh-removed td.ssh-exitcell { opacity: 1; }
      .pk-kit .ssh-showremoved {
        margin-top: 10px; border: 0; background: transparent; cursor: pointer;
        font-size: 12.5px; font-weight: 600; color: var(--text-faint);
      }
      .pk-kit .ssh-showremoved:hover { color: var(--text); }

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

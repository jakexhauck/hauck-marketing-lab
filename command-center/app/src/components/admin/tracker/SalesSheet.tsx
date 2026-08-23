import { useMemo } from "react";
import type { SheetCall } from "../../../../functions/lib/salesSheetRows";
import {
  SHEET_COLUMNS,
  BAND_CELLS,
  SHEET_RULE,
  CHIP_EMPTY,
  columnWidths,
  bandTotals,
  bandValues,
  sheetRow,
  type SheetCellValue,
} from "../../../lib/salesSheet";

// The Sales Data sheet.
//
// ONE table, because the thing being cloned is one grid: rows 1 and 2 are the
// summary band, row 3 is the red rule, row 4 is the column headers, and every
// row under it is a call. Splitting the band into its own table would let the
// two fall out of alignment the first time a column width changed, which is the
// one thing a spreadsheet clone cannot afford.
//
// Everything this renders comes from ../../../lib/salesSheet: the columns, the
// fills, the chips, and the band arithmetic. Nothing is decided here. That is
// what keeps the numbers unit-tested and this file a view.

// The sheet is drawn out to thirty rows whether or not there are thirty calls,
// because an empty month in the sheet is thirty empty coloured rows and a page
// that collapsed to a header would not read as the same object.
const MIN_ROWS = 30;

export default function SalesSheet({
  calls,
  timeZone,
}: {
  calls: SheetCall[];
  timeZone: string;
}) {
  const band = useMemo(() => bandValues(bandTotals(calls)), [calls]);
  const rows = useMemo(() => calls.map((c) => sheetRow(c, timeZone)), [calls, timeZone]);
  const padding = Math.max(0, MIN_ROWS - rows.length);
  const widths = useMemo(() => columnWidths(), []);

  return (
    <div className="shs-wrap">
      <SheetStyle />
      <table className="shs">
        <colgroup>
          {SHEET_COLUMNS.map((c, i) => (
            <col key={c.key} style={{ width: widths[i] }} />
          ))}
        </colgroup>

        <tbody>
          {/* Rows 1 and 2: the band, riding the table's own column grid. */}
          <tr className="shs-band">
            {BAND_CELLS.map((cell) => (
              <td
                key={cell.key}
                className={`shs-band-label${cell.emphasis ? " shs-em" : ""}`}
                style={{ background: cell.labelFill }}
              >
                {cell.label}
              </td>
            ))}
          </tr>
          <tr className="shs-band">
            {BAND_CELLS.map((cell) => (
              <td
                key={cell.key}
                className={`shs-band-value${cell.emphasis ? " shs-em" : ""}`}
                style={{ background: cell.valueFill }}
              >
                {band[cell.key]}
              </td>
            ))}
          </tr>

          {/* Row 3: the divider. It is what makes the clone read as the sheet
              at a glance, so it spans the whole grid exactly as it does there. */}
          <tr className="shs-rule">
            <td colSpan={SHEET_COLUMNS.length} style={{ background: SHEET_RULE }} />
          </tr>

          {/* Row 4: the column headers. */}
          <tr className="shs-head">
            {SHEET_COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={{ background: c.headerFill, color: c.headerInk ?? "#000000" }}
              >
                {c.label}
              </th>
            ))}
          </tr>

          {rows.map((row, i) => (
            <tr key={i}>
              {SHEET_COLUMNS.map((c) => {
                const value = row[c.key];
                return (
                  <td
                    key={c.key}
                    className={c.align === "right" ? "shs-right" : undefined}
                    style={{ background: c.bodyFill }}
                    // So a value the column is too narrow to show whole is still
                    // readable, rather than lost behind an ellipsis.
                    title={value?.kind === "text" ? value.text || undefined : undefined}
                  >
                    <Cell value={value} />
                  </td>
                );
              })}
            </tr>
          ))}

          {Array.from({ length: padding }, (_, i) => (
            <tr key={`pad-${i}`}>
              {SHEET_COLUMNS.map((c) => (
                <td key={c.key} style={{ background: c.bodyFill }}>
                  {/* The two black dropdown columns keep their unset chip on
                      every row, filled or not, exactly as the sheet does. */}
                  {c.key === "closer" || c.key === "setBy" || c.key === "paymentsComplete" ? (
                    <Cell value={{ kind: "empty-chip" }} />
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value }: { value: SheetCellValue | undefined }) {
  if (!value) return null;
  if (value.kind === "empty-chip") return <span className="shs-chip shs-chip-empty" />;
  if (value.kind === "chip") {
    return (
      <span className="shs-chip" style={{ background: value.fill, color: value.ink }}>
        {value.text}
      </span>
    );
  }
  return <>{value.text}</>;
}

// Scoped to .shs. The sheet's own look, which is deliberately not the app's:
// Arial, hairline grey gridlines, tight rows, black text on the sampled fills.
function SheetStyle() {
  return (
    <style>{`
      /* The whole sheet has to be readable at once, so the table is fluid and
         fills whatever the page gives it. The wrapper still scrolls, but only
         below the min-width, which is narrower than any desktop: it is there so
         the sheet degrades on a phone rather than crushing itself to nothing. */
      .shs-wrap { overflow-x: auto; overflow-y: visible; border: 1px solid var(--border); border-radius: 10px; background: #fff; }
      .shs { width: 100%; min-width: 1020px; border-collapse: collapse; table-layout: fixed; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; }
      .shs td, .shs th { border: 1px solid #d0d7de; padding: 3px 5px; height: 21px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      /* The band. Its labels are bold and centred, its values sit under them.
         Labels wrap, because "Total No Show Rate (%)" over a narrow column is
         two lines in the sheet as well. */
      .shs-band-label { font-weight: 700; text-align: center; height: 32px; white-space: normal; line-height: 1.15; vertical-align: middle; }
      .shs-band-value { font-weight: 700; text-align: center; height: 30px; font-size: 13px; }
      /* The four rate cells are the loudest thing on the sheet, on purpose. */
      .shs-band-label.shs-em { font-size: 10px; }
      .shs-band-value.shs-em { font-size: 16px; letter-spacing: .01em; }

      .shs-rule td { height: 6px; padding: 0; border: 0; }

      /* Headers wrap rather than truncate: a column whose name is cut in half
         is a column you have to guess at, and there are seventeen of them. */
      .shs-head th { font-weight: 700; text-align: left; height: 38px; white-space: normal; vertical-align: middle; line-height: 1.15; }

      .shs-right { text-align: right; }

      /* The one cell with a genuinely long value. It wraps instead of ending in
         an ellipsis, because a date you cannot read is not a date. */
      .shs td:first-child { white-space: normal; line-height: 1.25; }

      /* The sheet's dropdown pills. */
      .shs-chip { display: inline-block; min-width: 54px; max-width: 100%; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; line-height: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
      .shs-chip-empty { background: ${CHIP_EMPTY}; min-height: 15px; }

      /* Sticky only matters below the min-width, where the sheet does scroll. */
      .shs td:first-child, .shs th:first-child { position: sticky; left: 0; z-index: 1; }
      .shs-rule td:first-child { position: static; }
    `}</style>
  );
}

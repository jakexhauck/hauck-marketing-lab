import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import {
  computeMonthlyRollup,
  computeMonthlyRow,
  formatCount,
  formatMoney,
  type Cells,
} from "../../../lib/coldSms";
import { formatPct, MONTH_NAMES } from "../../../lib/trackerMonth";
import {
  useColdSmsMonthlyQuery,
  useColdSmsMonthlyUpsert,
  type ColdSmsMonthlyField,
} from "../../../hooks/useColdSms";
import type { ColdSmsMonthlyRow } from "../../../lib/api";

// Cold SMS > Monthly economics. One editable row per month: VA plus SMS spend
// against calls booked, showed and closed. All-time, so this view is not month
// scoped and carries no month nav.
//
// Styles live in the sibling ColdSmsSurface.tsx (.cs-*), which is the only
// place this table is ever mounted.

// The typed input columns, in the mockup's order. Money columns show a $
// placeholder; counts show a dot.
const MONEY_FIELDS: ColdSmsMonthlyField[] = ["vaCost", "smsCost", "cashCollected", "ltv"];

// "2026-07-01" -> "July 2026".
function monthLabelFor(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

// The persisted row as raw editable cells. null stays "" so a blank cell is
// blank, never a fabricated 0.
function toCells(row: ColdSmsMonthlyRow): Cells {
  const cell = (v: number | null) => (v === null || v === undefined ? "" : String(v));
  return {
    totalSmsSent: cell(row.totalSmsSent),
    vaCost: cell(row.vaCost),
    callsBooked: cell(row.callsBooked),
    callsShowed: cell(row.callsShowed),
    smsCost: cell(row.smsCost),
    newClients: cell(row.newClients),
    cashCollected: cell(row.cashCollected),
    ltv: cell(row.ltv),
  };
}

// Today's month as "YYYY-MM", the sensible default for the add control.
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthlyEconomicsTable() {
  const { data, isLoading, isError } = useColdSmsMonthlyQuery();
  const upsert = useColdSmsMonthlyUpsert();
  // Exactly what was typed, keyed "<month>:<field>", so a half-typed number is
  // never round-tripped through a parse while the cursor is still in the cell.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newMonth, setNewMonth] = useState(currentMonth);

  const rows = data?.rows ?? [];

  const valueFor = (row: ColdSmsMonthlyRow, field: ColdSmsMonthlyField): string =>
    drafts[`${row.month}:${field}`] ?? toCells(row)[field] ?? "";

  const cellsFor = (row: ColdSmsMonthlyRow): Cells => {
    const base = toCells(row);
    for (const field of Object.keys(base) as ColdSmsMonthlyField[]) {
      const draft = drafts[`${row.month}:${field}`];
      if (draft !== undefined) base[field] = draft;
    }
    return base;
  };

  const edit = (row: ColdSmsMonthlyRow, field: ColdSmsMonthlyField, value: string) => {
    setDrafts((prev) => ({ ...prev, [`${row.month}:${field}`]: value }));
    upsert.mutate({ month: row.month, field, value });
  };

  const addMonth = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(newMonth)) return;
    upsert.mutate({ month: newMonth });
  };

  const rollup = computeMonthlyRollup(rows.map(cellsFor));

  const numCell = (row: ColdSmsMonthlyRow, field: ColdSmsMonthlyField) => (
    <td key={field}>
      <input
        type="text"
        inputMode="numeric"
        value={valueFor(row, field)}
        placeholder={MONEY_FIELDS.includes(field) ? "$" : "·"}
        aria-label={`${field}, ${monthLabelFor(row.month)}`}
        onChange={(e) => edit(row, field, e.target.value)}
      />
    </td>
  );

  return (
    <div className="cs-card cs-fill">
      <div className="cs-head">
        <div>
          <div className="cs-title">Monthly Economics</div>
          <div className="cs-tsub">
            One row per month. VA plus SMS spend against booked, showed and closed.
          </div>
        </div>
        <div className="cs-headright">
          <div className="cs-legend">
            <b>
              <span className="cs-dot type" /> You type
            </b>
            <b>
              <span className="cs-dot calc" /> Computed
            </b>
          </div>
          <form className="cs-add" onSubmit={addMonth}>
            <input
              type="month"
              value={newMonth}
              aria-label="Month to add"
              onChange={(e) => setNewMonth(e.target.value)}
            />
            <button type="submit" className="cs-addbtn">
              <Plus size={14} /> Add month
            </button>
          </form>
        </div>
      </div>

      {isLoading && <div className="cs-empty">Loading months.</div>}
      {isError && !isLoading && (
        <div className="cs-empty">Could not load the monthly economics.</div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="cs-empty">No months logged yet. Add a month to start.</div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="cs-scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Total SMS Sent</th>
                <th>VA Cost</th>
                <th>Calls Booked</th>
                <th>Calls Showed</th>
                <th>Show Rate</th>
                <th>SMS / Client</th>
                <th>SMS Cost</th>
                <th>Total Cost</th>
                <th>Cost / Call</th>
                <th>Cost / Showed</th>
                <th>New Clients</th>
                <th>Cash Collected</th>
                <th>CAC</th>
                <th>ROI</th>
                <th>LTV</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const c = computeMonthlyRow(cellsFor(row));
                return (
                  <tr key={row.id}>
                    <td className="cs-rowlabel">{monthLabelFor(row.month)}</td>
                    {numCell(row, "totalSmsSent")}
                    {numCell(row, "vaCost")}
                    {numCell(row, "callsBooked")}
                    {numCell(row, "callsShowed")}
                    <td className="calc">{formatPct(c.showRate)}</td>
                    <td className="calc">
                      {c.smsPerClient === null ? "-" : formatCount(Math.round(c.smsPerClient))}
                    </td>
                    {numCell(row, "smsCost")}
                    <td className="calc">{formatMoney(c.totalCost)}</td>
                    <td className="calc">{formatMoney(c.costPerCall)}</td>
                    <td className="calc">{formatMoney(c.costPerShowed)}</td>
                    {numCell(row, "newClients")}
                    {numCell(row, "cashCollected")}
                    <td className="calc">{formatMoney(c.cac)}</td>
                    <td className="calc">{formatPct(c.roi)}</td>
                    {numCell(row, "ltv")}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td>All months</td>
                <td>{formatCount(rollup.totals.totalSmsSent)}</td>
                <td>{formatMoney(rollup.totals.vaCost)}</td>
                <td>{formatCount(rollup.totals.callsBooked)}</td>
                <td>{formatCount(rollup.totals.callsShowed)}</td>
                <td>{formatPct(rollup.computed.showRate)}</td>
                <td>
                  {rollup.computed.smsPerClient === null
                    ? "-"
                    : formatCount(Math.round(rollup.computed.smsPerClient))}
                </td>
                <td>{formatMoney(rollup.totals.smsCost)}</td>
                <td>{formatMoney(rollup.computed.totalCost)}</td>
                <td>{formatMoney(rollup.computed.costPerCall)}</td>
                <td>{formatMoney(rollup.computed.costPerShowed)}</td>
                <td>{formatCount(rollup.totals.newClients)}</td>
                <td>{formatMoney(rollup.totals.cashCollected)}</td>
                <td>{formatMoney(rollup.computed.cac)}</td>
                <td>{formatPct(rollup.computed.roi)}</td>
                <td>{formatMoney(rollup.ltvAverage)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

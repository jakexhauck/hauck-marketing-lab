import { useMemo, useState } from "react";
import { computeMonthlyRow, formatCount, formatMoney, type Cells } from "../../../lib/coldSms";
import { sheetMonthLabel, sheetMonths, sheetPct } from "../../../lib/coldSmsSheet";
import {
  useColdSmsMonthlyQuery,
  useColdSmsMonthlyUpsert,
  type ColdSmsMonthlyField,
} from "../../../hooks/useColdSms";
import type { ColdSmsMonthlyRow } from "../../../lib/api";

// Cold SMS > Monthly: columns K to AA of the sheet's SMS Tracking tab, boxed
// in black, with the sheet's blue and green formula cells. Every month row is
// there to type into, the way the sheet's empty rows are; typing into one
// creates it.

const FIELDS: ColdSmsMonthlyField[] = [
  "totalSmsSent",
  "vaCost",
  "callsBooked",
  "callsShowed",
  "smsCost",
  "newClients",
  "cashCollected",
  "ltv",
];

const WIDTHS = [120, 133, 133, 133, 133, 133, 121, 121, 100, 100, 100, 164, 100, 100, 100, 100, 100];

function localTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function toCells(row: ColdSmsMonthlyRow | undefined): Cells {
  const out: Cells = {};
  for (const f of FIELDS) {
    const v = row?.[f];
    out[f] = v === null || v === undefined ? "" : String(v);
  }
  return out;
}

export default function SmsMonthlySheet() {
  const { data, isError } = useColdSmsMonthlyQuery();
  const upsert = useColdSmsMonthlyUpsert();
  const [todayIso] = useState(localTodayIso);
  // Exactly what was typed, keyed "<YYYY-MM>:<field>".
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const byMonth = useMemo(() => {
    const map: Record<string, ColdSmsMonthlyRow> = {};
    for (const row of data?.rows ?? []) map[row.month.slice(0, 7)] = row;
    return map;
  }, [data]);

  const months = useMemo(
    () => sheetMonths(Object.keys(byMonth), todayIso),
    [byMonth, todayIso],
  );

  const cellsFor = (month: string): Cells => {
    const cells = toCells(byMonth[month]);
    for (const f of FIELDS) {
      const draft = drafts[`${month}:${f}`];
      if (draft !== undefined) cells[f] = draft;
    }
    return cells;
  };

  const edit = (month: string, field: ColdSmsMonthlyField, value: string) => {
    setDrafts((prev) => ({ ...prev, [`${month}:${field}`]: value }));
    upsert.mutate({ month, field, value });
  };

  const input = (month: string, field: ColdSmsMonthlyField, cells: Cells) => (
    <input
      type="text"
      inputMode="decimal"
      value={cells[field]}
      aria-label={`${field} ${month}`}
      onChange={(e) => edit(month, field, e.target.value)}
    />
  );

  return (
    <div className="sms-sheet">
      <table>
        <colgroup>
          {WIDTHS.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="bx">Month</th>
            <th className="bx">Total Initial SMS Sent</th>
            <th className="bx">VA Cost</th>
            <th className="bx">Calls Booked</th>
            <th className="bx">Calls Showed</th>
            <th className="bx">Show Rate</th>
            <th className="bx">Booking to Sent %</th>
            <th className="bx">SMS/New Client</th>
            <th className="bx">SMS Cost</th>
            <th className="bx">Total Cost</th>
            <th className="bx">Cost Per Call</th>
            <th className="bx">Cost Per Showed Call</th>
            <th className="bx">New Clients</th>
            <th className="bx">Cash Collected</th>
            <th className="bx">CAC</th>
            <th className="bx">ROI</th>
            <th className="bx">LTV</th>
          </tr>
        </thead>
        <tbody>
          {isError && (
            <tr>
              <td className="g empty" colSpan={17}>
                Could not load the monthly numbers.
              </td>
            </tr>
          )}
          {months.map((month) => {
            const cells = cellsFor(month);
            const c = computeMonthlyRow(cells);
            return (
              <tr key={month}>
                <td className="bx">{sheetMonthLabel(month)}</td>
                <td className="bx">{input(month, "totalSmsSent", cells)}</td>
                <td className="bx">{input(month, "vaCost", cells)}</td>
                <td className="bx blu">{input(month, "callsBooked", cells)}</td>
                <td className="bx blu">{input(month, "callsShowed", cells)}</td>
                <td className="bx bluf">{sheetPct(c.showRate)}</td>
                <td className="bx bluf">{sheetPct(c.bookToSentPct)}</td>
                <td className="bx bluf">
                  {c.smsPerClient === null ? "" : formatCount(Math.round(c.smsPerClient))}
                </td>
                <td className="bx blu">{input(month, "smsCost", cells)}</td>
                <td className="bx blu">{c.totalCost === null ? "" : formatMoney(c.totalCost)}</td>
                <td className="bx bluf">{c.costPerCall === null ? "" : formatMoney(c.costPerCall)}</td>
                <td className="bx bluf">
                  {c.costPerShowed === null ? "" : formatMoney(c.costPerShowed)}
                </td>
                <td className="bx">{input(month, "newClients", cells)}</td>
                <td className="bx">{input(month, "cashCollected", cells)}</td>
                <td className="bx">{c.cac === null ? "" : formatMoney(c.cac)}</td>
                <td className="bx lime">{sheetPct(c.roi)}</td>
                <td className="bx">{input(month, "ltv", cells)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

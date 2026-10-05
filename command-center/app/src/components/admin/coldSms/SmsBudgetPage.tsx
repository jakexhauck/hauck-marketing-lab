import { useMemo, useState } from "react";
import { SheetStyle } from "./SheetStyle";
import { useColdSmsBudgetQuery, useColdSmsBudgetSave, useColdSmsMonthlyQuery } from "../../../hooks/useColdSms";
import {
  computeBudget,
  normalizeInputs,
  normalizeSubscriptions,
  startingBudget,
  type BudgetInputKey,
} from "../../../lib/coldSmsBudget";
import { sheetMonthLabel } from "../../../lib/coldSmsSheet";
import { formatCount } from "../../../lib/coldSms";
import type { ColdSmsBudgetRow } from "../../../lib/api";

// Acquisition > SMS Budget (Jake, 2026-10-05): the month's planned cold SMS
// spend, in the Cold SMS sheet look (blue cells typed, the rest worked out).
// Plan vs Actual reads the Monthly table's typed numbers; nothing is synced.
//
// The open month lives in local state and is written whole on blur, so a
// half-typed "0.00" is never saved or reformatted under the cursor. A month
// with no row shows a copy of the last saved month and is only written once a
// cell is changed.

const VOLUME: [BudgetInputKey, string][] = [
  ["leadsToCheck", "Leads to check"],
  ["textableRate", "Textable %"],
  ["textsPerContact", "Texts per contact"],
  ["segmentsPerContact", "Segments per contact"],
  ["replyRate", "Reply %"],
  ["inboundSegmentsPerReply", "Segments per reply"],
  ["phoneNumbers", "Phone numbers"],
];

const RATES: [BudgetInputKey, string][] = [
  ["lookupRate", "Twilio Lookup / number"],
  ["outboundRate", "GHL outbound / segment"],
  ["carrierFee", "Carrier fee / segment"],
  ["inboundRate", "GHL inbound / segment"],
  ["numberMonthly", "Phone number / month"],
  ["a2pMonthly", "A2P campaign / month"],
  ["a2pOneTime", "A2P one-time fee"],
];

type Cells = Record<BudgetInputKey, string>;
interface SubCells {
  name: string;
  amount: string;
}

function money(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function count(v: number | null): string {
  return v === null ? "" : formatCount(Math.round(v));
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function stepMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function SmsBudgetPage() {
  const [month, setMonth] = useState(thisMonth);
  const { data, isLoading, isError } = useColdSmsBudgetQuery();

  return (
    <>
      <SheetStyle />
      <style>{`
        .sms-budget { padding: 12px; max-height: none; }
        .sms-budget .bud-grid { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
        .sms-budget .bud-month { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-weight: bold; font-size: 12pt; }
        .sms-budget button { font: inherit; background: #ffffff; border: 1px solid #000000; cursor: pointer; padding: 0 8px; height: 22px; }
        .sms-budget button:hover { background: #f1f3f4; }
        .sms-budget td.x { text-align: center; padding: 0; }
        .sms-budget td.x button { border: 0; width: 100%; height: 20px; }
        .sms-budget tr.tot td { font-weight: bold; background: #d9ead3; }
        .sms-budget td.neg { color: #cc0000; }
      `}</style>
      <div className="sms-sheet sms-budget">
        <div className="bud-month">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => stepMonth(m, -1))}>
            ‹
          </button>
          <span style={{ minWidth: 150, textAlign: "center" }}>{sheetMonthLabel(month)}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth((m) => stepMonth(m, 1))}>
            ›
          </button>
        </div>
        {isError ? (
          <div>Could not load the budget.</div>
        ) : isLoading || !data ? null : (
          <BudgetMonth key={month} month={month} rows={data.rows} />
        )}
      </div>
    </>
  );
}

function BudgetMonth({
  month,
  rows,
}: {
  month: string;
  rows: ColdSmsBudgetRow[];
}) {
  const save = useColdSmsBudgetSave();
  const monthly = useColdSmsMonthlyQuery();

  // Seeded once per month (the component is keyed by month).
  const [cells, setCells] = useState<Cells>(() => {
    const start = startingBudget(rows, month).inputs;
    const out = {} as Cells;
    for (const [k, v] of Object.entries(start)) out[k as BudgetInputKey] = v === null ? "" : String(v);
    return out;
  });
  const [subs, setSubs] = useState<SubCells[]>(() =>
    startingBudget(rows, month).subscriptions.map((s) => ({
      name: s.name,
      amount: s.amount === null ? "" : String(s.amount),
    })),
  );
  const [dirty, setDirty] = useState(false);

  const inputs = useMemo(() => normalizeInputs(cells), [cells]);
  const subscriptions = useMemo(() => normalizeSubscriptions(subs), [subs]);
  const b = useMemo(() => computeBudget(inputs, subscriptions), [inputs, subscriptions]);

  const persist = (nextSubs: SubCells[] = subs) => {
    save.mutate({ month: `${month}-01`, inputs, subscriptions: normalizeSubscriptions(nextSubs) });
    setDirty(false);
  };

  const onBlur = () => {
    if (dirty) persist();
  };

  const actualRow = monthly.data?.rows.find((r) => r.month.slice(0, 7) === month);
  const actualSent = actualRow?.totalSmsSent ?? null;
  const actualCost = actualRow?.smsCost ?? null;

  const inputRow = ([key, label]: [BudgetInputKey, string]) => (
    <tr key={key}>
      <td className="bx" style={{ width: 190 }}>
        {label}
      </td>
      <td className="bx blu r" style={{ width: 100 }}>
        <input
          type="text"
          inputMode="decimal"
          value={cells[key]}
          aria-label={label}
          onChange={(e) => {
            setCells((prev) => ({ ...prev, [key]: e.target.value }));
            setDirty(true);
          }}
          onBlur={onBlur}
        />
      </td>
    </tr>
  );

  const costRow = (label: string, value: number) => (
    <tr key={label}>
      <td className="bx" style={{ width: 190 }}>
        {label}
      </td>
      <td className="bx bluf r" style={{ width: 100 }}>
        {money(value)}
      </td>
    </tr>
  );

  const diff = (plan: number, actual: number | null) => (actual === null ? null : actual - plan);
  const sentDiff = diff(b.contactsTexted, actualSent);
  const costDiff = diff(b.total, actualCost);

  return (
    <div className="bud-grid">
      <table>
        <thead>
          <tr>
            <th className="bx" colSpan={2}>
              Volume
            </th>
          </tr>
        </thead>
        <tbody>{VOLUME.map(inputRow)}</tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th className="bx" colSpan={2}>
              Rates
            </th>
          </tr>
        </thead>
        <tbody>{RATES.map(inputRow)}</tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th className="bx" colSpan={3}>
              Subscriptions
            </th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s, i) => (
            <tr key={i}>
              <td className="bx blu" style={{ width: 170 }}>
                <input
                  type="text"
                  value={s.name}
                  aria-label={`Subscription ${i + 1} name`}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSubs((prev) => prev.map((p, j) => (j === i ? { ...p, name: v } : p)));
                    setDirty(true);
                  }}
                  onBlur={onBlur}
                />
              </td>
              <td className="bx blu r" style={{ width: 90 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={s.amount}
                  aria-label={`Subscription ${i + 1} amount`}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSubs((prev) => prev.map((p, j) => (j === i ? { ...p, amount: v } : p)));
                    setDirty(true);
                  }}
                  onBlur={onBlur}
                />
              </td>
              <td className="bx x" style={{ width: 28 }}>
                <button
                  type="button"
                  aria-label={`Remove subscription ${i + 1}`}
                  onClick={() => {
                    const next = subs.filter((_, j) => j !== i);
                    setSubs(next);
                    persist(next);
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td className="bx x" colSpan={3}>
              <button type="button" onClick={() => setSubs((prev) => [...prev, { name: "", amount: "" }])}>
                + Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th className="bx" colSpan={2}>
              Budget
            </th>
          </tr>
        </thead>
        <tbody>
          {costRow("Twilio Lookup", b.lines.lookup)}
          {costRow("Outbound texts", b.lines.outbound)}
          {costRow("Carrier fees", b.lines.carrier)}
          {costRow("Inbound replies", b.lines.inbound)}
          {costRow("Phone numbers", b.lines.numbers)}
          {costRow("A2P", b.lines.a2p)}
          {costRow("Subscriptions", b.lines.subscriptions)}
          <tr className="tot">
            <td className="bx">Total</td>
            <td className="bx r">{money(b.total)}</td>
          </tr>
          <tr>
            <td className="bx">Contacts texted</td>
            <td className="bx bluf r">{count(b.contactsTexted)}</td>
          </tr>
          <tr>
            <td className="bx">Texts sent</td>
            <td className="bx bluf r">{count(b.textsSent)}</td>
          </tr>
          <tr>
            <td className="bx">Segments sent</td>
            <td className="bx bluf r">{count(b.segmentsOut)}</td>
          </tr>
          <tr>
            <td className="bx">Cost per contact</td>
            <td className="bx bluf r">{money(b.perContact)}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th className="bx" style={{ width: 150 }} />
            <th className="bx" style={{ width: 90 }}>
              Plan
            </th>
            <th className="bx" style={{ width: 90 }}>
              Actual
            </th>
            <th className="bx" style={{ width: 90 }}>
              Difference
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bx">Initial SMS sent</td>
            <td className="bx r">{count(b.contactsTexted)}</td>
            <td className="bx r">{count(actualSent)}</td>
            <td className="bx r">{sentDiff === null ? "" : `${sentDiff > 0 ? "+" : ""}${count(sentDiff)}`}</td>
          </tr>
          <tr>
            <td className="bx">SMS cost</td>
            <td className="bx r">{money(b.total)}</td>
            <td className="bx r">{money(actualCost)}</td>
            <td className={`bx r${costDiff !== null && costDiff > 0 ? " neg" : ""}`}>
              {costDiff === null ? "" : `${costDiff > 0 ? "+" : ""}${money(costDiff)}`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

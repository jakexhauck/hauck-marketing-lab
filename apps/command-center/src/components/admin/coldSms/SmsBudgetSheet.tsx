import { useMemo, useState } from "react";
import { useColdSmsBudgetQuery, useColdSmsBudgetSave, useColdSmsMonthlyQuery } from "../../../hooks/useColdSms";
import {
  computeBudget,
  normalizeInputs,
  startingBudget,
  type BudgetInputKey,
} from "../../../lib/coldSmsBudget";
import { sheetMonthLabel } from "../../../lib/coldSmsSheet";
import { formatMoney } from "../../../lib/coldSms";
import type { ColdSmsBudgetRow } from "../../../lib/api";

// Cold SMS > SMS Budget, the last table on the Cold SMS page (Jake,
// 2026-10-05: inline, "very easy to look at", then "horizontal"). One band:
// three blue cells, the big estimated monthly cost, the cost lines, and what
// Monthly says was actually spent. Everything else (percentages and prices) is folded away
// under Rates. Same sheet look as the tables above it.
//
// The open month lives in local state and is written whole on blur, so a
// half-typed "0.00" is never saved or reformatted under the cursor. A month
// with no row shows a copy of the last saved month (or Jake's defaults) and is
// only written once a cell is changed.

const MAIN: [BudgetInputKey, string][] = [
  ["contactsPerDay", "Texts / day"],
  ["sendDays", "Send days"],
  ["phoneNumbers", "Numbers"],
];

const RATES: [BudgetInputKey, string][] = [
  ["textableRate", "Textable %"],
  ["textsPerContact", "Texts per prospect"],
  ["segmentsPerText", "Segments per text"],
  ["replyRate", "Reply %"],
  ["inboundSegmentsPerReply", "Segments per reply"],
  ["lookupRate", "Twilio Lookup / number"],
  ["outboundRate", "GHL text / segment"],
  ["carrierFee", "Carrier fee / segment"],
  ["inboundRate", "GHL reply / segment"],
  ["carrierFeeIn", "Carrier fee / reply segment"],
  ["numberMonthly", "Phone number / month"],
  ["a2pMonthly", "A2P / month"],
  ["a2pOneTime", "A2P one-time"],
  ["otherMonthly", "Other / month"],
];

type Cells = Record<BudgetInputKey, string>;

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function stepMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function BudgetStyle() {
  return (
    <style>{`
      .sms-budget { max-height: none; border: 1px solid #000000; }
      .sms-budget .bh {
        display: flex; align-items: center; justify-content: space-between;
        background: #000000; color: #ffffff; font-weight: bold; padding: 6px 10px;
      }
      .sms-budget .bh button {
        background: transparent; color: #ffffff; border: 0; font: inherit;
        font-size: 14pt; line-height: 1; padding: 0 8px; cursor: pointer;
      }
      .sms-budget .bh .mo { display: flex; align-items: center; gap: 4px; }
      .sms-budget .bh .mo span { min-width: 130px; text-align: center; }
      /* One horizontal band: inputs, the total, the cost lines, actual. */
      .sms-budget .band { display: flex; flex-wrap: wrap; border-top: 1px solid #000000; }
      .sms-budget .band > div {
        flex: 1 1 96px; min-width: 0; padding: 8px 10px;
        border-right: 1px solid #000000; display: flex; flex-direction: column; justify-content: center;
      }
      .sms-budget .band > div:last-child { border-right: 0; }
      .sms-budget .band > div.edge { border-right: 2px solid #000000; }
      .sms-budget .lab { font-size: 9pt; color: #434343; white-space: nowrap; }
      .sms-budget .v { font-size: 13pt; white-space: nowrap; }
      .sms-budget .band input {
        display: block; width: 100%; border: 0; padding: 0; margin: 0;
        background: transparent; color: #2563eb; font: inherit; font-size: 16pt;
      }
      .sms-budget input:focus { outline: 2px solid #1a73e8; outline-offset: 1px; }
      .sms-budget .band > div.total { flex: 2 1 170px; background: #d9ead3; text-align: center; }
      .sms-budget .total .big { font-size: 24pt; font-weight: bold; line-height: 1.1; }
      .sms-budget .strong { font-weight: bold; }
      .sms-budget .neg { color: #cc0000; }
      .sms-budget details { border-top: 1px solid #000000; }
      .sms-budget summary { cursor: pointer; padding: 6px 10px; font-weight: bold; background: #f3f3f3; }
      .sms-budget .rates { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
      .sms-budget .rates label {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        border-top: 1px solid #e2e3e3; padding: 3px 10px;
      }
      .sms-budget .rates input {
        width: 80px; border: 0; padding: 0; background: #dbeafe; color: #2563eb;
        font: inherit; text-align: right;
      }
    `}</style>
  );
}

export default function SmsBudgetSheet() {
  const [month, setMonth] = useState(thisMonth);
  const { data, isLoading, isError } = useColdSmsBudgetQuery();

  return (
    <>
      <BudgetStyle />
      <div className="sms-sheet sms-budget">
        <div className="bh">
          <span>SMS BUDGET</span>
          <div className="mo">
            <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => stepMonth(m, -1))}>
              ‹
            </button>
            <span>{sheetMonthLabel(month)}</span>
            <button type="button" aria-label="Next month" onClick={() => setMonth((m) => stepMonth(m, 1))}>
              ›
            </button>
          </div>
        </div>
        {isError ? (
          <div style={{ padding: 10 }}>Could not load the budget.</div>
        ) : isLoading || !data ? null : (
          <BudgetMonth key={month} month={month} rows={data.rows} />
        )}
      </div>
    </>
  );
}

function BudgetMonth({ month, rows }: { month: string; rows: ColdSmsBudgetRow[] }) {
  const save = useColdSmsBudgetSave();
  const monthly = useColdSmsMonthlyQuery();

  // Seeded once per month (the component is keyed by month).
  const [cells, setCells] = useState<Cells>(() => {
    const out = {} as Cells;
    for (const [k, v] of Object.entries(startingBudget(rows, month))) {
      out[k as BudgetInputKey] = v === null ? "" : String(v);
    }
    return out;
  });
  const [dirty, setDirty] = useState(false);

  const inputs = useMemo(() => normalizeInputs(cells), [cells]);
  const b = useMemo(() => computeBudget(inputs), [inputs]);

  const onBlur = () => {
    if (!dirty) return;
    save.mutate({ month: `${month}-01`, inputs });
    setDirty(false);
  };

  const field = (key: BudgetInputKey, label: string) => (
    <input
      type="text"
      inputMode="decimal"
      value={cells[key]}
      aria-label={label}
      onChange={(e) => {
        const v = e.target.value;
        setCells((prev) => ({ ...prev, [key]: v }));
        setDirty(true);
      }}
      onBlur={onBlur}
    />
  );

  const actual = monthly.data?.rows.find((r) => r.month.slice(0, 7) === month)?.smsCost ?? null;
  const remaining = b.total - (actual ?? 0);

  const lines: [string, number][] = [
    ["Lookup", b.lines.lookup],
    ["Texts", b.lines.texts],
    ["Carrier", b.lines.carrier],
    ["Replies", b.lines.replies],
    ["Number", b.lines.numbers],
    ["A2P", b.lines.a2p],
  ];
  if (b.lines.other) lines.push(["Other", b.lines.other]);

  return (
    <>
      <div className="band">
        {MAIN.map(([key, label], i) => (
          <div key={key} className={i === MAIN.length - 1 ? "edge" : undefined}>
            <div className="lab">{label}</div>
            {field(key, label)}
          </div>
        ))}
        <div className="total edge">
          <div className="lab">Estimated monthly cost</div>
          <div className="big">{formatMoney(b.total)}</div>
        </div>
        {lines.map(([label, value], i) => (
          <div key={label} className={i === lines.length - 1 ? "edge" : undefined}>
            <div className="lab">{label}</div>
            <div className="v">{formatMoney(value)}</div>
          </div>
        ))}
        <div>
          <div className="lab">Actual so far</div>
          <div className="v strong">{formatMoney(actual ?? 0)}</div>
        </div>
        <div>
          <div className="lab">Remaining</div>
          <div className={`v strong${remaining < 0 ? " neg" : ""}`}>
            {remaining < 0 ? `-${formatMoney(-remaining)}` : formatMoney(remaining)}
          </div>
        </div>
      </div>

      <details>
        <summary>Rates</summary>
        <div className="rates">
          {RATES.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              {field(key, label)}
            </label>
          ))}
        </div>
      </details>
    </>
  );
}

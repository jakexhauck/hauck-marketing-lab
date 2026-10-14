import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  useAgencyBudgetQuery,
  useAgencyBudgetSave,
  useSmsCostQuery,
  useRecurringQuery,
  useRecurringSave,
  type AgencyBudgetRow,
  type SmsCost,
} from "../../../hooks/useAgencyBudget";
import {
  budgetTotal,
  categoryTotals,
  knownCategories,
  newItemId,
  normalizeItems,
  parseAmount,
  previousItems,
  isActiveIn,
  normalizeRecurring,
  removeRecurring,
  stepMonth,
  type BudgetItem,
  type RecurringItem,
} from "../../../lib/agencyBudget";
import { sheetMonthLabel } from "../../../lib/coldSmsSheet";

// Operations > Budget: what the agency spent this month (Jake, 2026-10-06).
// Line items (name, category, amount); the big total and the category split
// are computed, never stored. The open month lives in local state and is
// written whole on blur (or at once for add/delete/copy), the same pattern as
// the SMS Budget, so a half-typed amount is never reformatted under the cursor.

// A row as typed: amount stays a string until it is saved.
interface Draft {
  id: string;
  name: string;
  category: string;
  amount: string;
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function toDraft(i: BudgetItem): Draft {
  return { id: i.id, name: i.name, category: i.category, amount: i.amount ? String(i.amount) : "" };
}

// The automatic cold SMS lines (texts from GHL, Lookup from Twilio, flat
// number + A2P fees from the SMS Budget). Shown as locked rows and counted in
// the total, never saved as items.
interface AutoRow {
  id: string;
  name: string;
  detail: string;
  amount: number | null;
}

function autoRows(c: SmsCost | undefined): AutoRow[] {
  if (!c) return [];
  const count = (n: number) => n.toLocaleString("en-US");
  return [
    {
      id: "auto-texts",
      name: "Cold SMS texts",
      detail: `${count(c.texts.outCount)} sent, ${count(c.texts.inCount)} replies`,
      amount: c.texts.cost,
    },
    {
      id: "auto-lookup",
      name: "Twilio Lookup",
      detail: c.lookup ? `${count(c.lookup.count)} lookups` : "Not connected",
      amount: c.lookup ? c.lookup.cost : null,
    },
    { id: "auto-fixed", name: "Cold SMS number + A2P", detail: "", amount: c.fixed },
  ];
}

// A recurring row as typed. The whole list (ended rows too) is held so a
// write can send it back whole.
interface RecDraft extends Draft {
  start: string;
  end: string | null;
}

function toRecDraft(i: RecurringItem): RecDraft {
  return { ...toDraft(i), start: i.start, end: i.end };
}

function toRecItems(drafts: RecDraft[]): RecurringItem[] {
  return normalizeRecurring(drafts.map((d) => ({ ...d, amount: parseAmount(d.amount) })));
}

function toItems(drafts: Draft[]): BudgetItem[] {
  return normalizeItems(drafts.map((d) => ({ ...d, amount: parseAmount(d.amount) })));
}

function BudgetStyle() {
  return (
    <style>{`
      .bud { display: flex; flex-direction: column; gap: 16px; max-width: 900px; }
      .bud-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .bud-month { display: flex; align-items: center; gap: 4px; font-weight: 600; }
      .bud-month span { min-width: 140px; text-align: center; }
      .bud-icon {
        display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
        border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); cursor: pointer;
      }
      .bud-icon:hover { color: var(--text); }
      .bud-total { font-family: var(--font-display); font-size: 40px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
      .bud-cats { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 12px; font-size: 13.5px; }
      .bud-cats span { color: var(--text-muted); margin-right: 6px; }
      .bud-table { width: 100%; border-collapse: collapse; }
      .bud-table th { text-align: left; font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); padding: 0 6px 8px; }
      .bud-table td { padding: 4px 6px; }
      .bud-table td.amt { width: 140px; }
      .bud-table td.del { width: 40px; text-align: right; }
      .bud-table .pk-input.num { text-align: right; }
      .bud-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
      .bud-btn {
        display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px;
        border: 1px solid var(--border); background: transparent; color: var(--text); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
      }
      .bud-btn:hover { border-color: var(--text-faint); }
      .bud-auto td { color: var(--text-muted); font-size: 13.5px; padding: 8px 6px; }
      .bud-auto td.name { color: var(--text); }
      .bud-auto td.amt { text-align: right; color: var(--text); padding-right: 12px; }
      .bud-tag { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); color: var(--text-muted); font-size: 11px; font-weight: 600; }
      .bud-err { color: var(--danger, #c0392b); font-size: 13px; }
      @media (max-width: 640px) {
        .bud-total { font-size: 32px; }
        .bud-table td.amt { width: 100px; }
      }
    `}</style>
  );
}

export default function BudgetTab() {
  const [month, setMonth] = useState(thisMonth);
  const { data, isLoading, isError } = useAgencyBudgetQuery();
  const recurring = useRecurringQuery();

  return (
    <div className="bud">
      <BudgetStyle />
      <div className="bud-top">
        <div className="bud-month">
          <button type="button" className="bud-icon" aria-label="Previous month" onClick={() => setMonth((m) => stepMonth(m, -1))}>
            <ChevronLeft size={16} />
          </button>
          <span>{sheetMonthLabel(month)}</span>
          <button type="button" className="bud-icon" aria-label="Next month" onClick={() => setMonth((m) => stepMonth(m, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {isError || recurring.isError ? (
        <div className="pk-empty">Could not load the budget.</div>
      ) : isLoading || !data || !recurring.data ? null : (
        <BudgetBody month={month} rows={data.rows} recurring={recurring.data.items} />
      )}
    </div>
  );
}

// Holds the recurring list across month changes (seeded once), so the month
// view and the Recurring card read the same rows.
function BudgetBody({
  month,
  rows,
  recurring,
}: {
  month: string;
  rows: AgencyBudgetRow[];
  recurring: RecurringItem[];
}) {
  const [recDrafts, setRecDrafts] = useState<RecDraft[]>(() => recurring.map(toRecDraft));
  const active = useMemo(
    () => toRecItems(recDrafts).filter((i) => isActiveIn(i, month)),
    [recDrafts, month],
  );
  const suggestions = useMemo(
    () => knownCategories([...rows, { items: toRecItems(recDrafts) }]),
    [rows, recDrafts],
  );

  return (
    <>
      <BudgetMonth key={month} month={month} rows={rows} recurring={active} suggestions={suggestions} />
      <RecurringCard month={month} drafts={recDrafts} setDrafts={setRecDrafts} suggestions={suggestions} />
    </>
  );
}

function RecurringCard({
  month,
  drafts,
  setDrafts,
  suggestions,
}: {
  month: string;
  drafts: RecDraft[];
  setDrafts: Dispatch<SetStateAction<RecDraft[]>>;
  suggestions: string[];
}) {
  const save = useRecurringSave();
  const [dirty, setDirty] = useState(false);
  const shown = drafts.filter((d) => isActiveIn(d, month));

  const write = (next: RecDraft[]) => {
    save.mutate(toRecItems(next));
    setDirty(false);
  };

  const edit = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setDirty(true);
  };

  const onBlur = () => {
    if (dirty) write(drafts);
  };

  const add = () => {
    // Starts in the month on screen. Saved once something is typed (blur).
    setDrafts((prev) => [...prev, { id: newItemId(), name: "", category: "", amount: "", start: month, end: null }]);
  };

  const remove = (id: string) => {
    const next = removeRecurring(drafts, id, month);
    setDrafts(next);
    write(next);
  };

  const listId = "bud-cats-recurring";

  return (
    <div className="pk-card">
      <div className="pk-section-h">Recurring</div>
      <datalist id={listId}>
        {suggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {shown.length > 0 && (
        <table className="bud-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th style={{ textAlign: "right" }}>Per month</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <td>
                  <input
                    className="pk-input"
                    value={d.name}
                    aria-label="Name"
                    onChange={(e) => edit(d.id, { name: e.target.value })}
                    onBlur={onBlur}
                  />
                </td>
                <td>
                  <input
                    className="pk-input"
                    value={d.category}
                    list={listId}
                    aria-label="Category"
                    onChange={(e) => edit(d.id, { category: e.target.value })}
                    onBlur={onBlur}
                  />
                </td>
                <td className="amt">
                  <input
                    className="pk-input num"
                    inputMode="decimal"
                    value={d.amount}
                    placeholder="$0"
                    aria-label="Per month"
                    onChange={(e) => edit(d.id, { amount: e.target.value })}
                    onBlur={onBlur}
                  />
                </td>
                <td className="del">
                  <button type="button" className="bud-icon" aria-label="Remove" onClick={() => remove(d.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="bud-actions">
        <button type="button" className="bud-btn" onClick={add}>
          <Plus size={15} /> Add recurring
        </button>
      </div>
      {save.isError && <div className="bud-err">Could not save. Try again.</div>}
    </div>
  );
}

function BudgetMonth({
  month,
  rows,
  recurring,
  suggestions,
}: {
  month: string;
  rows: AgencyBudgetRow[];
  recurring: BudgetItem[];
  suggestions: string[];
}) {
  const save = useAgencyBudgetSave();
  const saved = rows.find((r) => r.month.slice(0, 7) === month);

  // Seeded once per month (the component is keyed by month).
  const [drafts, setDrafts] = useState<Draft[]>(() => (saved?.items ?? []).map(toDraft));
  const [dirty, setDirty] = useState(false);

  const items = useMemo(() => toItems(drafts), [drafts]);
  const smsCost = useSmsCostQuery(month);
  const auto = useMemo(() => autoRows(smsCost.data), [smsCost.data]);
  const counted = useMemo(
    () => [
      ...items,
      ...recurring,
      ...auto.filter((a) => a.amount).map((a) => ({ id: a.id, name: a.name, category: "SMS", amount: a.amount ?? 0 })),
    ],
    [items, recurring, auto],
  );
  const total = budgetTotal(counted);
  const cats = categoryTotals(counted);
  const syncing = (smsCost.data?.pendingDays ?? 0) > 0 && !smsCost.data?.error;
  const previous = useMemo(() => previousItems(rows, month), [rows, month]);

  const write = (next: Draft[]) => {
    save.mutate({ month: `${month}-01`, items: toItems(next) });
    setDirty(false);
  };

  const edit = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setDirty(true);
  };

  const onBlur = () => {
    if (dirty) write(drafts);
  };

  const add = () => {
    // Not saved until something is typed into it (blur writes it).
    setDrafts((prev) => [...prev, { id: newItemId(), name: "", category: "", amount: "" }]);
  };

  const remove = (id: string) => {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    write(next);
  };

  const copyLast = () => {
    if (!previous) return;
    const next = previous.map((i) => toDraft({ ...i, id: newItemId() }));
    setDrafts(next);
    write(next);
  };

  const listId = `bud-cats-${month}`;

  return (
    <>
      <div className="pk-card">
        <div className="bud-total">{money(total)}</div>
        {cats.length > 0 && (
          <div className="bud-cats">
            {cats.map((c) => (
              <div key={c.category}>
                <span>{c.category}</span>
                {money(c.total)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pk-card">
        <div className="pk-section-h">This month</div>
        <datalist id={listId}>
          {suggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {(drafts.length > 0 || auto.length > 0) && (
          <table className="bud-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {auto.map((a) => (
                <tr key={a.id} className="bud-auto">
                  <td className="name">
                    {a.name}
                    <span className="bud-tag">{syncing ? "Syncing" : "Auto"}</span>
                  </td>
                  <td>{a.detail}</td>
                  <td className="amt">{a.amount === null ? "" : money(a.amount)}</td>
                  <td />
                </tr>
              ))}
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td>
                    <input
                      className="pk-input"
                      value={d.name}
                      aria-label="Name"
                      onChange={(e) => edit(d.id, { name: e.target.value })}
                      onBlur={onBlur}
                    />
                  </td>
                  <td>
                    <input
                      className="pk-input"
                      value={d.category}
                      list={listId}
                      aria-label="Category"
                      onChange={(e) => edit(d.id, { category: e.target.value })}
                      onBlur={onBlur}
                    />
                  </td>
                  <td className="amt">
                    <input
                      className="pk-input num"
                      inputMode="decimal"
                      value={d.amount}
                      placeholder="$0"
                      aria-label="Amount"
                      onChange={(e) => edit(d.id, { amount: e.target.value })}
                      onBlur={onBlur}
                    />
                  </td>
                  <td className="del">
                    <button type="button" className="bud-icon" aria-label="Delete" onClick={() => remove(d.id)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="bud-actions">
          <button type="button" className="bud-btn" onClick={add}>
            <Plus size={15} /> Add
          </button>
          {drafts.length === 0 && previous && (
            <button type="button" className="bud-btn" onClick={copyLast}>
              Copy last month
            </button>
          )}
        </div>
        {save.isError && <div className="bud-err">Could not save. Try again.</div>}
        {(smsCost.isError || smsCost.data?.error) && <div className="bud-err">Could not sync cold SMS cost.</div>}
      </div>
    </>
  );
}

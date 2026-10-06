import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useAgencyBudgetQuery, useAgencyBudgetSave, type AgencyBudgetRow } from "../../../hooks/useAgencyBudget";
import {
  budgetTotal,
  categoryTotals,
  knownCategories,
  newItemId,
  normalizeItems,
  parseAmount,
  previousItems,
  type BudgetItem,
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

function stepMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function toDraft(i: BudgetItem): Draft {
  return { id: i.id, name: i.name, category: i.category, amount: i.amount ? String(i.amount) : "" };
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
      {isError ? (
        <div className="pk-empty">Could not load the budget.</div>
      ) : isLoading || !data ? null : (
        <BudgetMonth key={month} month={month} rows={data.rows} />
      )}
    </div>
  );
}

function BudgetMonth({ month, rows }: { month: string; rows: AgencyBudgetRow[] }) {
  const save = useAgencyBudgetSave();
  const saved = rows.find((r) => r.month.slice(0, 7) === month);

  // Seeded once per month (the component is keyed by month).
  const [drafts, setDrafts] = useState<Draft[]>(() => (saved?.items ?? []).map(toDraft));
  const [dirty, setDirty] = useState(false);

  const items = useMemo(() => toItems(drafts), [drafts]);
  const total = budgetTotal(items);
  const cats = categoryTotals(items);
  const suggestions = useMemo(() => knownCategories(rows), [rows]);
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
        <datalist id={listId}>
          {suggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {drafts.length > 0 && (
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
      </div>
    </>
  );
}

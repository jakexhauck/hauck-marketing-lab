import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  computeScriptRollup,
  computeScriptRow,
  formatCount,
  type Cells,
} from "../../../lib/coldSms";
import { formatPct } from "../../../lib/trackerMonth";
import {
  useColdSmsScriptCreate,
  useColdSmsScriptDelete,
  useColdSmsScriptQuery,
  useColdSmsScriptUpdate,
  type ColdSmsScriptField,
} from "../../../hooks/useColdSms";
import type { ColdSmsScriptRow } from "../../../lib/api";

// Cold SMS > A/B script test. One editable row per opener variation, plus an
// "All variations" footer. Booking % is measured against Total Sent, not
// replies: see computeScriptRow in src/lib/coldSms.ts.
//
// Styles live in the sibling ColdSmsSurface.tsx (.cs-*), which is the only
// place this table is ever mounted.

const COUNT_FIELDS: ColdSmsScriptField[] = [
  "totalSent",
  "positiveReplies",
  "callsBooked",
  "clientsClosed",
];

// The persisted row as raw editable cells. null stays "" so a blank cell is
// blank, never a fabricated 0.
function toCells(row: ColdSmsScriptRow): Cells {
  const cell = (v: number | null) => (v === null || v === undefined ? "" : String(v));
  return {
    totalSent: cell(row.totalSent),
    positiveReplies: cell(row.positiveReplies),
    callsBooked: cell(row.callsBooked),
    clientsClosed: cell(row.clientsClosed),
  };
}

export default function ScriptTestTable() {
  const { data, isLoading, isError } = useColdSmsScriptQuery();
  const update = useColdSmsScriptUpdate();
  const create = useColdSmsScriptCreate();
  const remove = useColdSmsScriptDelete();
  // Exactly what was typed, keyed "<id>:<field>".
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");

  const rows = data?.rows ?? [];

  const cellsFor = (row: ColdSmsScriptRow): Cells => {
    const base = toCells(row);
    for (const field of COUNT_FIELDS) {
      const draft = drafts[`${row.id}:${field}`];
      if (draft !== undefined) base[field] = draft;
    }
    return base;
  };

  const nameFor = (row: ColdSmsScriptRow): string => drafts[`${row.id}:name`] ?? row.name;

  const edit = (row: ColdSmsScriptRow, field: ColdSmsScriptField, value: string) => {
    setDrafts((prev) => ({ ...prev, [`${row.id}:${field}`]: value }));
    // The endpoint rejects an empty name, so an in-progress rename is held
    // locally until there is something to save.
    if (field === "name" && !value.trim()) return;
    update.mutate({ id: row.id, field, value });
  };

  const addVariation = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    create.mutate(name);
    setNewName("");
  };

  const rollup = computeScriptRollup(rows.map(cellsFor));

  return (
    <div className="cs-card cs-fill">
      <div className="cs-head">
        <div>
          <div className="cs-title">A/B Script Test</div>
          <div className="cs-tsub">
            One row per opener variation. Rates recompute as you edit.
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
          <form className="cs-add" onSubmit={addVariation}>
            <input
              type="text"
              value={newName}
              placeholder="Variation name"
              aria-label="New variation name"
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="cs-addbtn" disabled={!newName.trim()}>
              <Plus size={14} /> Add variation
            </button>
          </form>
        </div>
      </div>

      {isLoading && <div className="cs-empty">Loading variations.</div>}
      {isError && !isLoading && (
        <div className="cs-empty">Could not load the script test.</div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="cs-empty">No variations yet. Add one to start the test.</div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="cs-scroll">
          <table>
            <thead>
              <tr>
                <th>Variation</th>
                <th>Total Sent</th>
                <th>Positive Replies</th>
                <th>Positive Reply %</th>
                <th>Calls Booked</th>
                <th>Booking %</th>
                <th>Clients Closed</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const cells = cellsFor(row);
                const c = computeScriptRow(cells);
                const numCell = (field: ColdSmsScriptField) => (
                  <td key={field}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cells[field] ?? ""}
                      placeholder="·"
                      aria-label={`${field}, ${nameFor(row)}`}
                      onChange={(e) => edit(row, field, e.target.value)}
                    />
                  </td>
                );
                return (
                  <tr key={row.id}>
                    <td className="cs-namecol">
                      <input
                        type="text"
                        value={nameFor(row)}
                        placeholder="Variation name"
                        aria-label="Variation name"
                        onChange={(e) => edit(row, "name", e.target.value)}
                      />
                    </td>
                    {numCell("totalSent")}
                    {numCell("positiveReplies")}
                    <td className="calc">{formatPct(c.replyPct)}</td>
                    {numCell("callsBooked")}
                    <td className="calc">{formatPct(c.bookingPct)}</td>
                    {numCell("clientsClosed")}
                    <td className="cs-rowaction">
                      <button
                        type="button"
                        className="cs-del"
                        aria-label={`Remove ${nameFor(row)}`}
                        onClick={() => remove.mutate(row.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td>All variations</td>
                <td>{formatCount(rollup.totals.totalSent)}</td>
                <td>{formatCount(rollup.totals.positiveReplies)}</td>
                <td>{formatPct(rollup.computed.replyPct)}</td>
                <td>{formatCount(rollup.totals.callsBooked)}</td>
                <td>{formatPct(rollup.computed.bookingPct)}</td>
                <td>{formatCount(rollup.totals.clientsClosed)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

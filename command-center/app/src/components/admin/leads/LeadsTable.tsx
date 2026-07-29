import { useState, type ReactNode } from "react";
import { Plus, ChevronUp, ChevronDown } from "lucide-react";
import type { AdminLead } from "../../../lib/api";
import { sortLeads, type LeadSortKey, type LeadSortDir } from "../../../lib/adminLeads";
import LeadRow, { LEAD_COLUMNS, LEAD_COLUMN_COUNT, type LeadPatch } from "./LeadRow";

// The lead spreadsheet: one card, sortable headers, click-to-edit cells, an
// add-row footer. Shared by the Leads book and by every Cold Call stage page, so
// the format is identical everywhere by construction rather than by discipline.
//
// It owns only sort state. Which leads to show, and whether they can be edited,
// belong to the surface above it.

interface SortState {
  key: LeadSortKey;
  dir: LeadSortDir;
}

interface LeadsTableProps {
  leads: AdminLead[];
  title: string;
  subtitle: string;
  emptyText: string;
  loading?: boolean;
  error?: boolean;
  // Demo rows: rendered, never editable.
  readOnly?: boolean;
  autoFocusFirst?: boolean;
  headerAction?: ReactNode;
  onPatch?: (id: string, fields: LeadPatch) => void;
  onDelete?: (id: string) => void;
  // Omitted on a read-only table, which hides the add row entirely.
  onAdd?: () => void;
  addDisabled?: boolean;
}

export default function LeadsTable({
  leads,
  title,
  subtitle,
  emptyText,
  loading,
  error,
  readOnly,
  autoFocusFirst,
  headerAction,
  onPatch,
  onDelete,
  onAdd,
  addDisabled,
}: LeadsTableProps) {
  const [sort, setSort] = useState<SortState | null>(null);

  const visible = sort ? sortLeads(leads, sort.key, sort.dir) : leads;

  const toggleSort = (key: LeadSortKey) => {
    setSort((prev) =>
      prev && prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  // A new row is always the first stage, so drop any sort that would bury it.
  const add = () => {
    setSort(null);
    onAdd?.();
  };

  return (
    <div className="adl-card">
      <div className="adl-head">
        <div>
          <div className="adl-title">{title}</div>
          <div className="adl-sub">{loading ? "Loading leads." : subtitle}</div>
        </div>
        {headerAction}
      </div>

      {error && (
        <div className="adl-error">Could not load leads. Reload the tab to try again.</div>
      )}

      <div className="adl-scroll">
        <table>
          <thead>
            <tr>
              {LEAD_COLUMNS.map((col) => {
                const sorted = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={[col.rt ? "rt" : "", sorted ? "sorted" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-sort={
                      sorted ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                    }
                  >
                    <button type="button" className="adl-sorter" onClick={() => toggleSort(col.key)}>
                      {col.label}
                      <span className="adl-caret" aria-hidden>
                        {sorted && sort.dir === "desc" ? (
                          <ChevronDown size={12} strokeWidth={2.4} />
                        ) : (
                          <ChevronUp size={12} strokeWidth={2.4} />
                        )}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th className="adl-actionhead">
                <span className="adl-sronly">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {visible.map((lead, i) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                readOnly={readOnly}
                autoFocus={autoFocusFirst && i === 0}
                onPatch={(fields) => onPatch?.(lead.id, fields)}
                onDelete={() => onDelete?.(lead.id)}
              />
            ))}

            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={LEAD_COLUMN_COUNT}>
                  <div className="adl-empty">{emptyText}</div>
                </td>
              </tr>
            )}
          </tbody>

          {onAdd && !readOnly && (
            <tfoot>
              <tr className="adl-addrow">
                <td colSpan={LEAD_COLUMN_COUNT}>
                  <button type="button" onClick={add} disabled={addDisabled}>
                    <Plus size={15} strokeWidth={2.4} aria-hidden />
                    Add lead
                  </button>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

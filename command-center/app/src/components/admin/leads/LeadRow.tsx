import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { AdminLead, AdminLeadStatus } from "../../../lib/api";
import type { LeadSortKey } from "../../../lib/adminLeads";
import LeadStatusPill from "./LeadStatusPill";

// One editable row of the leads spreadsheet. Every cell except Status is an
// inline input; text and numeric cells commit on blur so a burst of keystrokes
// is a single PATCH, and date cells commit on change. Ported from the tbody
// markup in docs/mockups/admin-redesign/leads-B.html.

export type LeadColumnKind = "text" | "date" | "num" | "status";

export interface LeadColumn {
  key: LeadSortKey;
  label: string;
  kind: LeadColumnKind;
  // Extra cell class from the mockup: name (bold), mono (tabular), wide (notes).
  cls?: string;
  // Right-aligned numeric column.
  rt?: boolean;
}

// The column order of the table, shared by the header (sorting) and the rows.
export const LEAD_COLUMNS: LeadColumn[] = [
  { key: "firstName", label: "First Name", kind: "text", cls: "name" },
  { key: "lastName", label: "Last Name", kind: "text", cls: "name" },
  { key: "phone", label: "Phone", kind: "text", cls: "mono" },
  { key: "timezone", label: "Timezone", kind: "text" },
  { key: "status", label: "Status", kind: "status" },
  { key: "firstContactDate", label: "First Contact", kind: "date", cls: "mono" },
  { key: "source", label: "Source", kind: "text" },
  { key: "appointmentDate", label: "Appointment Date", kind: "date", cls: "mono" },
  { key: "noAnswer", label: "No Answer", kind: "num", rt: true },
  { key: "lastContact", label: "Last Contact", kind: "date", cls: "mono" },
  { key: "followUpDate", label: "Follow Up Date", kind: "date", cls: "mono" },
  { key: "email", label: "Email", kind: "text" },
  { key: "notes", label: "Notes", kind: "text", cls: "wide" },
];

// One extra cell for the row action, so the footer and empty row span correctly.
export const LEAD_COLUMN_COUNT = LEAD_COLUMNS.length + 1;

export type LeadPatch = Partial<Omit<AdminLead, "id" | "createdAt">>;

interface LeadRowProps {
  lead: AdminLead;
  onPatch: (fields: LeadPatch) => void;
  onDelete: () => void;
  // Focus the first cell: set on a freshly added row.
  autoFocus?: boolean;
}

export default function LeadRow({ lead, onPatch, onDelete, autoFocus }: LeadRowProps) {
  const who = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "New lead";

  return (
    <tr>
      {LEAD_COLUMNS.map((col, i) => {
        const cls = [col.rt ? "rt" : "", col.cls ?? ""].filter(Boolean).join(" ") || undefined;
        const ariaLabel = `${col.label}, ${who}`;

        if (col.kind === "status") {
          return (
            <td key={col.key}>
              <LeadStatusPill
                status={lead.status}
                label={who}
                onChange={(status: AdminLeadStatus) => onPatch({ status })}
              />
            </td>
          );
        }

        if (col.kind === "date") {
          const value = lead[col.key] as string | null;
          return (
            <td key={col.key} className={cls}>
              <input
                type="date"
                value={value ?? ""}
                aria-label={ariaLabel}
                onChange={(e) => onPatch({ [col.key]: e.target.value || null } as LeadPatch)}
              />
            </td>
          );
        }

        if (col.kind === "num") {
          return (
            <td key={col.key} className={cls}>
              <NumCell
                value={lead.noAnswer}
                ariaLabel={ariaLabel}
                onCommit={(noAnswer) => onPatch({ noAnswer })}
              />
            </td>
          );
        }

        const value = lead[col.key] as string;
        return (
          <td key={col.key} className={cls}>
            <TextCell
              value={value}
              ariaLabel={ariaLabel}
              autoFocus={autoFocus && i === 0}
              onCommit={(next) => onPatch({ [col.key]: next } as LeadPatch)}
            />
          </td>
        );
      })}
      <td className="adl-actioncell">
        <DeleteCell onDelete={onDelete} who={who} />
      </td>
    </tr>
  );
}

// A free-text cell. The typed value lives locally until blur so the list is not
// re-sorted, and no PATCH is sent, on every keystroke.
function TextCell({
  value,
  ariaLabel,
  autoFocus,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  autoFocus?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Adopt a value that changed underneath us (another tab, or the saved row
  // replacing an optimistic one). Typing does not change the prop, so this
  // never fights the cursor.
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      type="text"
      value={draft}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      placeholder="-"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

// The no-answer attempt counter: digits only, blank reads as 0.
function NumCell({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number;
  ariaLabel: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const next = draft.trim() === "" ? 0 : Math.max(0, Math.floor(Number(draft)));
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    if (next !== value) onCommit(next);
    setDraft(String(next));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      aria-label={ariaLabel}
      placeholder="0"
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

// Soft delete with a lightweight two-step confirm: the first click arms the
// button, the second removes the row. It disarms itself after a few seconds so
// a stray click never leaves a live trigger sitting in the table.
function DeleteCell({ onDelete, who }: { onDelete: () => void; who: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (armed) {
    return (
      <button
        type="button"
        className="adl-del armed"
        onClick={() => {
          if (timer.current) clearTimeout(timer.current);
          onDelete();
        }}
      >
        Delete
      </button>
    );
  }

  return (
    <button
      type="button"
      className="adl-del"
      aria-label={`Delete ${who}`}
      onClick={() => {
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 4000);
      }}
    >
      <Trash2 size={15} />
    </button>
  );
}

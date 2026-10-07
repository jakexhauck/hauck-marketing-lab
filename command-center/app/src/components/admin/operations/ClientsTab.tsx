import { useState } from "react";
import { useClientTrackerQuery, useClientTrackerSave } from "../../../hooks/useApi";
import type { AdminClientBilling, ClientTrackerRow } from "../../../lib/api";
import { formatMoney, parseMoneyInput } from "../../../lib/billing";
import { isStaleTouchpoint } from "../../../lib/clientTracker";

// Operations > Clients (back 2026-10-07, Jake): the "Client List" tab of the
// Client Tracker Google Sheet, column for column (A First Name to P Ad
// Tracking Sheet), one row per client we have right now. Every cell is that
// client's client_billing record, the same one Management's Billing cards
// edit, and saves on blur one field at a time.
//
// Looks like the sheet on purpose, as Cold SMS does: the sheet's orange
// header (#ff6d01), banded white/#f3f3f3 rows, Arial, white in dark mode too.
// One deviation: a Company column leads, since an owner's first name alone
// does not say which client the row is.

type TextKey =
  | "firstName"
  | "lastName"
  | "lastTouchpoint"
  | "source"
  | "dateClosed"
  | "billingDate"
  | "renewalDate"
  | "paymentArrangement"
  | "service"
  | "notes"
  | "churnDate"
  | "adTrackingSheet";
type MoneyKey = "upfrontCash" | "remainingCash" | "totalCashCollected";

type Col =
  | { kind: "text"; key: TextKey; label: string; width: number; align?: "c" }
  | { kind: "money"; key: MoneyKey; label: string; width: number }
  | { kind: "status"; label: string; width: number };

// Widths are the sheet's own, read off its published view.
const COLS: Col[] = [
  { kind: "text", key: "firstName", label: "First Name", width: 88 },
  { kind: "text", key: "lastName", label: "Last Name", width: 88, align: "c" },
  { kind: "text", key: "lastTouchpoint", label: "Last TP Date", width: 88, align: "c" },
  { kind: "text", key: "source", label: "Source", width: 88, align: "c" },
  { kind: "text", key: "dateClosed", label: "Date Closed", width: 88, align: "c" },
  { kind: "money", key: "upfrontCash", label: "Upfront Cash Collected", width: 152 },
  { kind: "money", key: "remainingCash", label: "Remaining Cash to Collect", width: 175 },
  { kind: "money", key: "totalCashCollected", label: "Total Cash Collected", width: 175 },
  { kind: "text", key: "billingDate", label: "Billing Date", width: 120, align: "c" },
  { kind: "text", key: "renewalDate", label: "Renewal Date", width: 120, align: "c" },
  { kind: "text", key: "paymentArrangement", label: "Payment Arrangment", width: 260 },
  { kind: "text", key: "service", label: "Service", width: 200, align: "c" },
  { kind: "text", key: "notes", label: "Notes", width: 220 },
  { kind: "status", label: "Status", width: 88 },
  { kind: "text", key: "churnDate", label: "Churn Date", width: 88, align: "c" },
  { kind: "text", key: "adTrackingSheet", label: "Ad Tracking Sheet", width: 180 },
];

function TrackerStyle() {
  return (
    <style>{`
      .ct-sheet {
        background: #ffffff; color: #000000; overflow: auto;
        max-height: calc(100vh - 190px); border: 1px solid #c0c0c0;
        font-family: Arial, sans-serif; font-size: 10pt;
      }
      .ct-sheet table { border-collapse: collapse; table-layout: fixed; }
      .ct-sheet th, .ct-sheet td {
        height: 21px; padding: 0 3px; overflow: hidden; white-space: nowrap;
        border: 1px solid #e2e3e3; text-align: left; vertical-align: middle;
      }
      .ct-sheet thead th {
        position: sticky; top: 0; z-index: 2; background: #ff6d01; color: #000000;
        font-weight: bold; text-align: center;
      }
      .ct-sheet tbody tr:nth-child(odd) td { background: #ffffff; }
      .ct-sheet tbody tr:nth-child(even) td { background: #f3f3f3; }
      .ct-sheet .co { position: sticky; left: 0; z-index: 1; font-weight: bold; }
      .ct-sheet thead th.co { z-index: 3; }
      .ct-sheet td.c { text-align: center; }
      .ct-sheet td.r { text-align: right; }
      .ct-sheet tbody tr td.red { background: #ff0000; }
      .ct-sheet td input, .ct-sheet td select {
        display: block; width: 100%; height: 20px; border: 0; padding: 0; margin: 0;
        background: transparent; color: inherit; font: inherit; text-align: inherit;
      }
      .ct-sheet td select { text-align-last: center; cursor: pointer; }
      .ct-sheet td input:focus, .ct-sheet td select:focus { outline: 2px solid #1a73e8; outline-offset: 1px; }
      .ct-sheet td a { color: #1155cc; text-decoration: underline; }
      .ct-sheet td.empty { color: #5f6368; text-align: center; height: 60px; }
    `}</style>
  );
}

// A typed cell. Holds what is typed while the cursor is in it and saves once
// on blur, only if it changed. `show` is what the cell reads when it is not
// being edited (the money cells format "$2,000").
function Cell({
  value,
  show,
  label,
  onSave,
}: {
  value: string;
  show?: string;
  label: string;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      aria-label={label}
      value={draft ?? show ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() !== value) onSave(draft.trim());
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

// The ad sheet column shows a link when it holds one; clicking the cell
// anywhere but the link edits it.
function LinkCell({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing || !/^https?:\/\//i.test(value)) {
    return (
      <Cell
        value={value}
        label="Ad Tracking Sheet"
        onSave={(next) => {
          setEditing(false);
          onSave(next);
        }}
      />
    );
  }
  return (
    <div onDoubleClick={() => setEditing(true)}>
      <a href={value} target="_blank" rel="noreferrer">
        Open sheet
      </a>
    </div>
  );
}

function Row({ row, today }: { row: ClientTrackerRow; today: Date }) {
  const save = useClientTrackerSave();
  const b = row.billing;
  const put = (patch: Partial<AdminClientBilling>) => save.mutate({ tenantId: row.tenantId, patch });

  return (
    <tr>
      <td className="co" title={row.name}>
        {row.name}
      </td>
      {COLS.map((col) => {
        if (col.kind === "status") {
          return (
            <td key="status" className="c">
              <select
                aria-label={`Status ${row.name}`}
                value={b.status}
                onChange={(e) => put({ status: e.target.value as AdminClientBilling["status"] })}
              >
                <option value="active">Active</option>
                <option value="churned">Churned</option>
              </select>
            </td>
          );
        }
        if (col.kind === "money") {
          const n = b[col.key];
          return (
            <td key={col.key} className="r">
              <Cell
                value={n ? String(n) : ""}
                show={n ? `$${formatMoney(n)}` : ""}
                label={`${col.label} ${row.name}`}
                onSave={(next) => put({ [col.key]: parseMoneyInput(next) })}
              />
            </td>
          );
        }
        if (col.key === "adTrackingSheet") {
          return (
            <td key={col.key}>
              <LinkCell value={b.adTrackingSheet} onSave={(next) => put({ adTrackingSheet: next })} />
            </td>
          );
        }
        const stale = col.key === "lastTouchpoint" && isStaleTouchpoint(b.lastTouchpoint, today);
        const cls = [col.align === "c" ? "c" : "", stale ? "red" : ""].filter(Boolean).join(" ");
        return (
          <td key={col.key} className={cls || undefined} title={b[col.key] || undefined}>
            <Cell
              value={b[col.key]}
              label={`${col.label} ${row.name}`}
              onSave={(next) => put({ [col.key]: next })}
            />
          </td>
        );
      })}
    </tr>
  );
}

export default function ClientsTab() {
  const tracker = useClientTrackerQuery();
  const [today] = useState(() => new Date());
  const clients = tracker.data?.clients ?? [];
  const width = 180 + COLS.reduce((sum, c) => sum + c.width, 0);

  return (
    <div className="mt-5">
      <TrackerStyle />
      <div className="ct-sheet">
        <table style={{ width }}>
          <colgroup>
            <col style={{ width: 180 }} />
            {COLS.map((c) => (
              <col key={c.label} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="co">Company</th>
              {COLS.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tracker.isLoading ? (
              <tr>
                <td className="empty" colSpan={COLS.length + 1}>
                  Loading...
                </td>
              </tr>
            ) : tracker.isError ? (
              <tr>
                <td className="empty" colSpan={COLS.length + 1}>
                  The list did not load.
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td className="empty" colSpan={COLS.length + 1}>
                  No clients yet.
                </td>
              </tr>
            ) : (
              clients.map((row) => <Row key={row.tenantId} row={row} today={today} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

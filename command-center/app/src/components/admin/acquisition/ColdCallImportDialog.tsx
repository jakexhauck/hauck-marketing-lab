import { useMemo, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import {
  buildImportRows,
  parseCsv,
  suggestMapping,
  IMPORT_FIELDS,
  type LeadField,
  type ParsedCsv,
} from "../../../lib/csvLeads";
import { useAssignableCallersQuery, useImportLeads } from "../../../hooks/useLeadAssignment";

// Import a prospect list from a CSV, in three steps on one screen: pick the
// file, confirm which column is which, choose whose queue it lands on.
//
// The mapping step exists because every exported list has different headers. The
// guess is usually right, and it is always editable: a wrong guess that silently
// imports five hundred phone numbers into the notes field is a bad hour.
//
// Nothing is sent until "Import" is pressed, and the button says exactly how
// many rows will land, so the count is agreed before the write rather than
// discovered after it.

interface Props {
  onClose: () => void;
  onImported: (summary: string) => void;
  // Fired when the first batch goes out, so the page behind can say it is still
  // filling rather than showing a list that is only partly there.
  onStart?: () => void;
}

// Rows per request. Small enough that a batch of GoHighLevel upserts finishes
// well inside a worker's budget, big enough that a 500-row list is 20 requests
// rather than 500.
const IMPORT_BATCH = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function ColdCallImportDialog({ onClose, onImported, onStart }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<number, LeadField>>({});
  const [assignedTo, setAssignedTo] = useState("");
  // Rows confirmed landed, for the progress line.
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const callers = useAssignableCallersQuery();
  const importLeads = useImportLeads();

  const prepared = useMemo(
    () => (parsed ? buildImportRows(parsed, mapping) : null),
    [parsed, mapping],
  );
  const phoneMapped = Object.values(mapping).includes("phone");

  const readFile = async (file: File) => {
    setError(null);
    const text = await file.text();
    const next = parseCsv(text);
    if (next.headers.length === 0 || next.rows.length === 0) {
      setParsed(null);
      setError("That file has no rows in it.");
      return;
    }
    setFileName(file.name);
    setParsed(next);
    setMapping(suggestMapping(next.headers));
  };

  const setColumn = (index: number, value: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[index];
        return next;
      }
      const field = value as LeadField;
      // One field, one column, except notes which is allowed to collect several.
      if (field !== "notes") {
        for (const [key, existing] of Object.entries(next)) {
          if (existing === field) delete next[Number(key)];
        }
      }
      next[index] = field;
      return next;
    });
  };

  // One batch at a time. Every imported row is also a GoHighLevel contact
  // upsert plus a tag, so a thousand-row file is a couple of thousand calls: far
  // more than one request can carry. Batching is also what makes the progress
  // real, since each response is rows that have genuinely landed.
  const submit = async () => {
    if (!prepared || prepared.rows.length === 0) return;
    setError(null);
    setDone(0);
    onStart?.();

    const totals = { imported: 0, skippedDuplicate: 0, skippedNoPhone: 0, pushed: 0, pushFailed: 0 };
    let notConfigured = false;

    try {
      for (const batch of chunk(prepared.rows, IMPORT_BATCH)) {
        const result = await importLeads.mutateAsync({
          rows: batch,
          assignedTo: assignedTo || null,
        });
        totals.imported += result.imported;
        totals.skippedDuplicate += result.skippedDuplicate;
        totals.skippedNoPhone += result.skippedNoPhone;
        totals.pushed += result.pushed ?? 0;
        totals.pushFailed += result.pushFailed ?? 0;
        if (result.notConfigured) notConfigured = true;
        setDone((n) => n + batch.length);
      }

      const parts = [`${totals.imported} imported`];
      if (totals.skippedDuplicate > 0) parts.push(`${totals.skippedDuplicate} already in the book`);
      if (totals.skippedNoPhone + prepared.skippedNoPhone > 0) {
        parts.push(`${totals.skippedNoPhone + prepared.skippedNoPhone} with no phone number`);
      }
      // Say what did NOT reach the CRM. Silence here would read as success, and
      // an untagged prospect never reaches the board.
      if (notConfigured) parts.push("GoHighLevel not connected, so none were tagged");
      else if (totals.pushFailed > 0) parts.push(`${totals.pushFailed} did not reach GoHighLevel`);
      onImported(parts.join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that file.");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-[16px] font-semibold">Import leads from a CSV</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted hover:text-text"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* 1. The file */}
          <div className="pk-section-h" style={{ marginTop: 0 }}>
            1. The file
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="pk-link" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden />
              Choose a CSV
            </button>
            {fileName && (
              <span className="text-[13px] text-muted">
                {fileName} · {parsed?.rows.length ?? 0} rows
              </span>
            )}
          </div>

          {parsed && (
            <>
              {/* 2. The columns */}
              <div className="pk-section-h">2. What each column is</div>
              <div className="overflow-hidden rounded-[var(--radius)] border border-border">
                {parsed.headers.map((header, index) => (
                  <div
                    key={`${header}-${index}`}
                    className="flex flex-wrap items-center gap-3 border-b border-divider px-3 py-2 last:border-b-0"
                  >
                    <span className="min-w-[140px] flex-1 truncate text-[13px] font-medium">
                      {header || `Column ${index + 1}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-faint">
                      {parsed.rows[0]?.[index] || "empty"}
                    </span>
                    <select
                      className="pk-select !w-auto"
                      value={mapping[index] ?? ""}
                      onChange={(e) => setColumn(index, e.target.value)}
                    >
                      <option value="">Skip this column</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f.field} value={f.field}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!phoneMapped && (
                <div className="pk-needs" style={{ marginTop: 10 }}>
                  Nothing is mapped to Phone yet. A prospect with no number cannot be called, so
                  no rows will import until one column is the phone number.
                </div>
              )}

              {/* 3. Whose list */}
              <div className="pk-section-h">3. Whose list is this</div>
              <select
                className="pk-select"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">Nobody yet, leave them in the book</option>
                {(callers.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[12.5px] text-muted">
                Assigned leads appear on that person&apos;s call queue straight away. You can
                always hand them out later from the list.
              </p>
            </>
          )}

          {error && <div className="pk-form-error">{error}</div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <span className="text-[12.5px] text-muted">
            {prepared
              ? `${prepared.rows.length} ready${
                  prepared.skippedNoPhone > 0 ? `, ${prepared.skippedNoPhone} with no number` : ""
                }`
              : "No file chosen"}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="pk-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="pk-btn-save"
              disabled={!prepared || prepared.rows.length === 0 || importLeads.isPending}
              onClick={() => void submit()}
            >
              {importLeads.isPending
                ? prepared
                  ? `Importing ${done} of ${prepared.rows.length}...`
                  : "Importing..."
                : prepared && prepared.rows.length > 0
                  ? `Import ${prepared.rows.length}`
                  : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

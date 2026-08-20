import { useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import {
  buildImportRows,
  parseCsv,
  suggestMapping,
  IMPORT_FIELDS,
  type LeadField,
  type ParsedCsv,
} from "../../../lib/csvLeads";
import { useImportScrapedLeads, type ImportResult } from "../../../hooks/useLeadScraper";

// The upload half of Import leads. Pick a file, confirm which column is which,
// import. The list of what landed is the Leads table underneath, unchanged, so
// an imported lead is worked exactly like a scraped one.
//
// The mapping step is here for the reason it is in the Cold Call importer: every
// external scraper writes different headers, the guess is usually right, and a
// wrong guess that quietly files five hundred phone numbers under "city" is an
// hour nobody gets back. Nothing is sent until Import is pressed, and the button
// says how many rows will land.
//
// Only the columns this list actually uses are offered. The person fields the
// Cold Call importer needs (first name, email, timezone) are not asked for,
// because a scraped business row does not have them and offering a slot invites
// somebody to put something in it.
const FIELDS = IMPORT_FIELDS.filter((f) =>
  ["businessName", "phone", "city", "state", "website", "niche"].includes(f.field),
);

export default function ImportLeadsPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<number, LeadField>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const importer = useImportScrapedLeads();

  const built = useMemo(
    () => (parsed ? buildImportRows(parsed, mapping) : { rows: [], skippedNoPhone: 0 }),
    [parsed, mapping],
  );
  const hasPhone = Object.values(mapping).includes("phone");

  const onFile = async (file: File) => {
    setError("");
    setResult(null);
    const text = await file.text();
    const next = parseCsv(text);
    if (next.headers.length === 0 || next.rows.length === 0) {
      setParsed(null);
      setError("That file had no rows in it.");
      return;
    }
    setFileName(file.name);
    setParsed(next);
    setMapping(suggestMapping(next.headers));
  };

  const doImport = () => {
    setError("");
    importer.mutate(
      built.rows.map((r) => ({
        phone: r.phone,
        businessName: r.businessName,
        city: r.city,
        state: r.state,
        website: r.website,
        niche: r.niche,
      })),
      {
        onSuccess: (res) => {
          setResult(res);
          setParsed(null);
          setMapping({});
          setFileName("");
          if (fileRef.current) fileRef.current.value = "";
        },
        onError: (e) => setError(e instanceof Error ? e.message : "That import did not go through."),
      },
    );
  };

  return (
    <div className="il">
      <ImportStyle />

      <div className="il-bar">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="il-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <button type="button" className="ls-primary sm" onClick={() => fileRef.current?.click()}>
          <Upload size={14} />
          Choose CSV
        </button>
        {fileName && (
          <span className="il-file-name">
            <FileSpreadsheet size={13} />
            {fileName}
          </span>
        )}
      </div>

      {error && <div className="il-note warn">{error}</div>}

      {result && (
        <div className="il-note ok">
          {result.imported} imported
          {result.alreadyHad > 0 && `, ${result.alreadyHad} already had`}
          {result.noPhone > 0 && `, ${result.noPhone} with no phone number`}
          {result.duplicateInFile > 0 && `, ${result.duplicateInFile} repeated in the file`}
        </div>
      )}

      {parsed && (
        <div className="il-map">
          <div className="il-map-grid">
            {parsed.headers.map((header, i) => (
              <label key={i} className="il-map-row">
                <span className="il-col">
                  {header || `Column ${i + 1}`}
                  <em>{parsed.rows[0]?.[i] || ""}</em>
                </span>
                <select
                  className="ls-select"
                  value={mapping[i] ?? ""}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (!e.target.value) delete next[i];
                    else next[i] = e.target.value as LeadField;
                    setMapping(next);
                  }}
                >
                  <option value="">Ignore</option>
                  {FIELDS.map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="il-actions">
            {!hasPhone && <span className="il-warn">Point one column at Phone.</span>}
            {hasPhone && built.skippedNoPhone > 0 && (
              <span className="il-warn">{built.skippedNoPhone} rows have no phone and will be left out.</span>
            )}
            <button
              type="button"
              className="ls-primary sm"
              disabled={!hasPhone || built.rows.length === 0 || importer.isPending}
              onClick={doImport}
            >
              {importer.isPending ? "Importing..." : `Import ${built.rows.length}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportStyle() {
  return (
    <style>{`
      .pk-kit .il { display: flex; flex-direction: column; gap: 12px; }
      .pk-kit .il-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .pk-kit .il-file { display: none; }
      .pk-kit .il-file-name { display: inline-flex; align-items: center; gap: 6px;
        font-size: 12.5px; color: var(--pk-muted, #64748b); }
      .pk-kit .il-note { padding: 9px 12px; border-radius: 8px; font-size: 13px; }
      .pk-kit .il-note.ok { background: #ecfdf5; color: #065f46; }
      .pk-kit .il-note.warn { background: #fef2f2; color: #b91c1c; }
      .pk-kit .il-map { display: flex; flex-direction: column; gap: 12px;
        border: 1px solid var(--pk-line, #e2e8f0); border-radius: 10px; padding: 14px; }
      .pk-kit .il-map-grid { display: grid; gap: 10px;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
      .pk-kit .il-map-row { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
      .pk-kit .il-col { display: flex; flex-direction: column; font-size: 12.5px; font-weight: 600; }
      .pk-kit .il-col em { font-style: normal; font-weight: 400; font-size: 11.5px;
        color: var(--pk-muted, #94a3b8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pk-kit .il-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .pk-kit .il-warn { font-size: 12.5px; color: #b45309; }
    `}</style>
  );
}

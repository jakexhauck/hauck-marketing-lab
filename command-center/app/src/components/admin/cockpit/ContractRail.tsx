import { useEffect, useRef, useState } from "react";
import { FileText, Pencil, RefreshCw, Upload } from "lucide-react";
import type { ContractDto } from "../../../../functions/lib/clientContract";
import {
  openClientContract,
  useAdminClientContractQuery,
  useAdminClientContractRead,
  useAdminClientContractSave,
} from "../../../hooks/useApi";
import {
  endLabel,
  formatContractDate,
  formatDollars,
  lengthLabel,
  termProgress,
} from "../../../lib/contract";

// Management's Contract rail (0148, layout B picked 2026-10-06).
//
// Upload the signed PDF and Claude reads the terms into the row; nothing is
// typed. Edit corrects whatever it got wrong. The rail sticks on desktop so
// the end date stays in view while the Cash and Account cards scroll.

type EditForm = {
  lengthMonths: string;
  startDate: string;
  endDate: string;
  monthlyFee: string;
  setupFee: string;
  payment: string;
  noticeDays: string;
  autoRenew: string;
  adSpend: string;
  guarantee: string;
  clauses: string;
};

const num = (n: number | null) => (n === null ? "" : String(n));
const digits = (s: string) => {
  const d = s.replace(/[^0-9]/g, "");
  return d === "" ? null : Number(d);
};

function formFrom(c: ContractDto): EditForm {
  return {
    lengthMonths: num(c.lengthMonths),
    startDate: c.startDate ?? "",
    endDate: c.endDate ?? "",
    monthlyFee: num(c.monthlyFee),
    setupFee: num(c.setupFee),
    payment: c.payment,
    noticeDays: num(c.noticeDays),
    autoRenew: c.autoRenew,
    adSpend: c.adSpend,
    guarantee: c.guarantee,
    clauses: c.clauses.join("\n"),
  };
}

function patchFrom(f: EditForm): Partial<ContractDto> {
  return {
    lengthMonths: digits(f.lengthMonths),
    startDate: f.startDate || null,
    endDate: f.endDate || null,
    monthlyFee: digits(f.monthlyFee),
    setupFee: digits(f.setupFee),
    payment: f.payment,
    noticeDays: digits(f.noticeDays),
    autoRenew: f.autoRenew,
    adSpend: f.adSpend,
    guarantee: f.guarantee,
    clauses: f.clauses.split("\n").map((c) => c.trim()).filter(Boolean),
  };
}

export default function ContractRail({ tenantId }: { tenantId: string }) {
  const query = useAdminClientContractQuery(tenantId);
  const read = useAdminClientContractRead(tenantId);
  const save = useAdminClientContractSave(tenantId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(null);
    read.reset();
    save.reset();
    setOpenError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const pick = (file: File | undefined | null) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      read.reset();
      setOpenError("That needs to be a PDF.");
      return;
    }
    setOpenError(null);
    setEditing(null);
    read.mutate(file);
  };

  const onOpen = async () => {
    // Opened before the await so the browser treats it as the click's own
    // window rather than a pop-up.
    const win = window.open("", "_blank");
    try {
      const url = await openClientContract(tenantId);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      win?.close();
      setOpenError((err as Error).message);
    }
  };

  const onSave = () => {
    if (!editing) return;
    save.mutate(patchFrom(editing), { onSuccess: () => setEditing(null) });
  };

  const c = query.data?.contract;
  const now = new Date();
  const ends = c ? endLabel(c.endDate, now) : null;
  const progress = c ? termProgress(c.startDate, c.endDate, now) : null;
  const error =
    openError ??
    (read.isError ? (read.error as Error).message : null) ??
    (save.isError ? (save.error as Error).message : null);

  const hiddenInput = (
    <input
      ref={fileInput}
      type="file"
      accept="application/pdf"
      hidden
      onChange={(e) => {
        pick(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  return (
    <aside className="ctr">
      <ContractStyle />
      {hiddenInput}

      <div className="ctr-head">
        <h2 className="ctr-title">Contract</h2>
        {ends && !read.isPending && <span className={`ctr-pill${ends.soon ? " soon" : ""}`}>{ends.text}</span>}
      </div>

      {query.isLoading ? (
        <div className="ctr-muted">Loading...</div>
      ) : query.isError ? (
        <div className="ctr-err">Could not load the contract.</div>
      ) : read.isPending ? (
        <div className="ctr-reading" role="status">
          <RefreshCw size={18} className="ctr-spin" aria-hidden />
          Reading the contract
        </div>
      ) : !c?.hasFile && !editing ? (
        <button
          type="button"
          className={`ctr-drop${dragging ? " on" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          <Upload size={20} aria-hidden />
          Upload contract PDF
        </button>
      ) : (
        <>
          {c?.hasFile && (
            <button type="button" className="ctr-pdf" onClick={onOpen} title="Open PDF">
              <span className="ctr-pdf-ico" aria-hidden>
                <FileText size={18} />
              </span>
              <span className="ctr-pdf-text">
                <span className="ctr-pdf-name">{c.fileName}</span>
                {c.uploadedAt && (
                  <span className="ctr-pdf-date">
                    {formatContractDate(c.uploadedAt.slice(0, 10))}
                  </span>
                )}
              </span>
            </button>
          )}

          {editing ? (
            <EditFields form={editing} onChange={setEditing} />
          ) : (
            c && (
              <>
                <div className="ctr-money">
                  <div className="ctr-lbl">Monthly</div>
                  <div className="ctr-big">{formatDollars(c.monthlyFee) || "Not set"}</div>
                </div>

                {progress !== null && (
                  <div className="ctr-tl">
                    <div className="ctr-bar">
                      <div className="ctr-fill" style={{ width: `${progress * 100}%` }} />
                      <div className="ctr-now" style={{ left: `${progress * 100}%` }} />
                    </div>
                    <div className="ctr-tl-l">
                      <span>{formatContractDate(c.startDate)}</span>
                      <span>{formatContractDate(c.endDate)}</span>
                    </div>
                  </div>
                )}

                <dl className="ctr-kv">
                  <Row k="Length" v={lengthLabel(c.lengthMonths)} />
                  <Row k="Start" v={formatContractDate(c.startDate)} />
                  <Row k="Ends" v={formatContractDate(c.endDate)} />
                  <Row k="Setup fee" v={formatDollars(c.setupFee)} />
                  <Row k="Payment" v={c.payment} />
                  <Row k="Notice" v={c.noticeDays === null ? "" : `${c.noticeDays} days`} />
                  <Row k="Auto-renew" v={c.autoRenew} />
                  <Row k="Ad spend" v={c.adSpend} />
                  <Row k="Guarantee" v={c.guarantee} />
                </dl>

                {c.clauses.length > 0 && (
                  <ul className="ctr-clauses">
                    {c.clauses.map((cl, i) => (
                      <li key={i}>{cl}</li>
                    ))}
                  </ul>
                )}
              </>
            )
          )}

          <div className="ctr-actions">
            {editing ? (
              <>
                <button type="button" className="ctr-btn primary" onClick={onSave} disabled={save.isPending}>
                  {save.isPending ? "Saving..." : "Save"}
                </button>
                <button type="button" className="ctr-btn" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ctr-btn" onClick={() => c && setEditing(formFrom(c))}>
                  <Pencil size={14} aria-hidden />
                  Edit
                </button>
                <button type="button" className="ctr-btn" onClick={() => fileInput.current?.click()}>
                  <Upload size={14} aria-hidden />
                  {c?.hasFile ? "Replace PDF" : "Upload PDF"}
                </button>
                {c?.hasFile && read.isError && (
                  <button type="button" className="ctr-btn" onClick={() => read.mutate(null)}>
                    <RefreshCw size={14} aria-hidden />
                    Read again
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {error && <p className="ctr-err">{error}</p>}
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="ctr-row">
      <dt>{k}</dt>
      <dd>{v || "-"}</dd>
    </div>
  );
}

function EditFields({ form, onChange }: { form: EditForm; onChange: (f: EditForm) => void }) {
  const field = (key: keyof EditForm, label: string, type = "text", inputMode?: "numeric") => (
    <label className="ctr-field">
      <span>{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={form[key]}
        onChange={(e) => onChange({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="ctr-edit">
      <div className="ctr-edit-two">
        {field("monthlyFee", "Monthly ($)", "text", "numeric")}
        {field("setupFee", "Setup fee ($)", "text", "numeric")}
        {field("lengthMonths", "Length (months)", "text", "numeric")}
        {field("noticeDays", "Notice (days)", "text", "numeric")}
        {field("startDate", "Start", "date")}
        {field("endDate", "Ends", "date")}
      </div>
      {field("payment", "Payment")}
      {field("autoRenew", "Auto-renew")}
      {field("adSpend", "Ad spend")}
      {field("guarantee", "Guarantee")}
      <label className="ctr-field">
        <span>Key terms (one per line)</span>
        <textarea
          value={form.clauses}
          rows={4}
          onChange={(e) => onChange({ ...form, clauses: e.target.value })}
        />
      </label>
    </div>
  );
}

function ContractStyle() {
  return (
    <style>{`
      .pk-kit .ctr {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        box-shadow: var(--shadow-md); padding: 20px 22px 22px; display: flex; flex-direction: column; gap: 16px;
      }
      .pk-kit .ctr-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .pk-kit .ctr-title { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text); margin: 0; }
      .pk-kit .ctr-pill {
        font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
        background: var(--positive-tint); color: var(--positive); white-space: nowrap;
      }
      .pk-kit .ctr-pill.soon { background: var(--warning-tint); color: var(--warning); }
      .pk-kit .ctr-muted { color: var(--text-faint); font-size: 13px; }
      .pk-kit .ctr-err { color: var(--danger); font-size: 12.5px; font-weight: 600; margin: 0; }

      .pk-kit .ctr-drop {
        display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 34px 16px;
        border: 1.5px dashed var(--border); border-radius: 16px; background: var(--surface-2);
        color: var(--text-faint); font: inherit; font-weight: 600; font-size: 13.5px; cursor: pointer; transition: .15s;
      }
      .pk-kit .ctr-drop:hover, .pk-kit .ctr-drop.on { border-color: var(--brand); color: var(--brand-text); background: var(--brand-tint); }
      .pk-kit .ctr-reading {
        display: flex; align-items: center; gap: 10px; padding: 28px 16px; border-radius: 16px;
        background: var(--surface-2); color: var(--text); font-weight: 600; font-size: 13.5px; justify-content: center;
      }
      .pk-kit .ctr-spin { animation: ctr-spin 1s linear infinite; }
      @keyframes ctr-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .pk-kit .ctr-spin { animation: none; } }

      .pk-kit .ctr-pdf {
        display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--border);
        border-radius: 14px; background: var(--surface-2); text-align: left; font: inherit; cursor: pointer; width: 100%;
      }
      .pk-kit .ctr-pdf:hover { border-color: var(--text-faint); }
      .pk-kit .ctr-pdf-ico {
        width: 34px; height: 40px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0;
        background: var(--warning-tint); color: var(--warning);
      }
      .pk-kit .ctr-pdf-text { display: flex; flex-direction: column; min-width: 0; }
      .pk-kit .ctr-pdf-name { font-weight: 600; font-size: 13.5px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pk-kit .ctr-pdf-date { font-size: 12px; color: var(--text-faint); }

      .pk-kit .ctr-lbl { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); }
      .pk-kit .ctr-big { font-family: var(--font-display); font-weight: 600; font-size: 32px; line-height: 1.1; color: var(--text); font-variant-numeric: tabular-nums; }

      .pk-kit .ctr-bar { position: relative; height: 8px; border-radius: 99px; background: var(--surface-2); }
      .pk-kit .ctr-fill { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--brand); }
      .pk-kit .ctr-now { position: absolute; top: -5px; width: 3px; height: 18px; margin-left: -1.5px; border-radius: 2px; background: var(--text); }
      .pk-kit .ctr-tl-l { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: var(--text-faint); }

      .pk-kit .ctr-kv { margin: 0; }
      .pk-kit .ctr-row { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid var(--border); font-size: 13.5px; }
      .pk-kit .ctr-row:first-child { border-top: 0; }
      .pk-kit .ctr-row dt { color: var(--text-faint); flex-shrink: 0; }
      .pk-kit .ctr-row dd { margin: 0; color: var(--text); font-weight: 500; text-align: right; min-width: 0; overflow-wrap: anywhere; }

      .pk-kit .ctr-clauses { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text); line-height: 1.45; }

      .pk-kit .ctr-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .pk-kit .ctr-btn {
        display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--surface);
        color: var(--text); font: inherit; font-weight: 600; font-size: 13px; padding: 8px 12px; border-radius: 10px; cursor: pointer;
      }
      .pk-kit .ctr-btn:hover { border-color: var(--text-faint); }
      .pk-kit .ctr-btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
      .pk-kit .ctr-btn:disabled { opacity: .6; cursor: default; }

      .pk-kit .ctr-edit { display: flex; flex-direction: column; gap: 12px; }
      .pk-kit .ctr-edit-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .pk-kit .ctr-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .pk-kit .ctr-field > span { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); }
      .pk-kit .ctr-field input, .pk-kit .ctr-field textarea {
        width: 100%; border: 1px solid var(--border); background: var(--surface); font: inherit; font-size: 14px;
        color: var(--text); padding: 9px 11px; border-radius: 10px;
      }
      .pk-kit .ctr-field textarea { resize: vertical; line-height: 1.45; }
      .pk-kit .ctr-field input:focus, .pk-kit .ctr-field textarea:focus { outline: 0; box-shadow: 0 0 0 2px var(--brand); border-color: transparent; }
    `}</style>
  );
}

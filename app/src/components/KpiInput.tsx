import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { KpiEntry, KpiWindow } from "../lib/types";

type Props = {
  root: string;
  clientSlug: string;
  latest: KpiEntry | null;
  focusField?: KpiField;
  onClose: () => void;
  onSaved: () => void;
};

export type KpiField = "spend" | "cpm" | "ctr" | "cvr" | "cpa" | "roas";

type FormState = {
  date: string;
  window: KpiWindow;
  spend: string;
  cpm: string;
  ctr: string;
  cvr: string;
  cpa: string;
  roas: string;
};

const FIELD_META: Record<KpiField, { label: string; help: string }> = {
  spend: { label: "Spend ($)", help: "0.00" },
  cpm: { label: "CPM ($)", help: "0.00" },
  ctr: { label: "CTR (%)", help: "1.4" },
  cvr: { label: "CVR (%)", help: "2.8" },
  cpa: { label: "CPA ($)", help: "0.00" },
  roas: { label: "ROAS (×)", help: "1.6" },
};

const FIELD_ORDER: KpiField[] = ["spend", "cpm", "ctr", "cvr", "cpa", "roas"];

function today(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmt(n: number | null): string {
  return n === null || n === undefined ? "" : String(n);
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function initial(latest: KpiEntry | null): FormState {
  return {
    date: today(),
    window: latest?.window ?? "7d",
    spend: fmt(latest?.spend ?? null),
    cpm: fmt(latest?.cpm ?? null),
    ctr: fmt(latest?.ctr ?? null),
    cvr: fmt(latest?.cvr ?? null),
    cpa: fmt(latest?.cpa ?? null),
    roas: fmt(latest?.roas ?? null),
  };
}

export function KpiInput({ root, clientSlug, latest, focusField, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initial(latest));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
    focusRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const entry: KpiEntry = {
      client: clientSlug,
      date: form.date,
      window: form.window,
      spend: parseNum(form.spend),
      cpm: parseNum(form.cpm),
      ctr: parseNum(form.ctr),
      cvr: parseNum(form.cvr),
      cpa: parseNum(form.cpa),
      roas: parseNum(form.roas),
      updated_at: new Date().toISOString(),
    };
    try {
      await api.writeKpiEntry(root, clientSlug, entry);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kpi-modal-overlay" onClick={onClose}>
      <div className="kpi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kpi-modal-head">
          <span className="kpi-modal-title">▸ ENTER KPIS</span>
          <button
            type="button"
            className="kpi-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="kpi-form">
            <div className="kpi-form-row">
              <label className="kpi-form-label">Date</label>
              <input
                className="kpi-form-input"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="kpi-form-row">
              <label className="kpi-form-label">Window</label>
              <select
                className="kpi-form-select"
                value={form.window}
                onChange={(e) => set("window", e.target.value as KpiWindow)}
                disabled={busy}
              >
                <option value="7d">7d</option>
                <option value="14d">14d</option>
                <option value="28d">28d</option>
              </select>
            </div>

            {FIELD_ORDER.map((field) => (
              <div key={field} className="kpi-form-row">
                <label className="kpi-form-label">{FIELD_META[field].label}</label>
                <input
                  ref={field === (focusField ?? "spend") ? focusRef : undefined}
                  className="kpi-form-input"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder={FIELD_META[field].help}
                  value={form[field]}
                  onChange={(e) => set(field, e.target.value)}
                  disabled={busy}
                />
              </div>
            ))}
          </div>

          {error && <div className="kpi-form-err">{error}</div>}

          <div className="kpi-form-foot">
            <span className="kpi-form-hint">Esc to cancel · Enter to save</span>
            <div className="kpi-form-actions">
              <button
                type="button"
                className="kpi-form-btn"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="kpi-form-btn primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

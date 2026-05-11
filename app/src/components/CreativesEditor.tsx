import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { CreativeSignal, CreativeVariant, CreativesManifest } from "../lib/types";

type Props = {
  root: string;
  clientSlug: string;
  current: CreativesManifest | null;
  onClose: () => void;
  onSaved: () => void;
};

type RowState = {
  id: string;
  name: string;
  signal: CreativeSignal;
};

type FormState = {
  min_active: string;
  rows: RowState[];
};

const SIGNAL_OPTIONS: CreativeSignal[] = ["go", "hold", "stop"];

function initial(current: CreativesManifest | null): FormState {
  if (!current) {
    return { min_active: "15", rows: [] };
  }
  return {
    min_active: String(current.min_active),
    rows: current.creatives.map((c) => ({ id: c.id, name: c.name, signal: c.signal })),
  };
}

function parseMin(s: string): number {
  const t = s.trim();
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function CreativesEditor({ root, clientSlug, current, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initial(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
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

  const updateRow = (idx: number, patch: Partial<RowState>) =>
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }));

  const addRow = () =>
    setForm((prev) => ({
      ...prev,
      rows: [...prev.rows, { id: "", name: "", signal: "hold" }],
    }));

  const removeRow = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== idx),
    }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const creatives: CreativeVariant[] = form.rows
      .map((r) => ({ id: r.id.trim(), name: r.name.trim(), signal: r.signal }))
      .filter((r) => r.id !== "" || r.name !== "");
    const manifest: CreativesManifest = {
      client: clientSlug,
      min_active: parseMin(form.min_active),
      creatives,
      updated_at: new Date().toISOString(),
    };
    try {
      await api.writeCreativesManifest(root, clientSlug, manifest);
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
          <span className="kpi-modal-title">▸ CREATIVE DIVERSITY</span>
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
            <div className="kpi-form-row full">
              <label className="kpi-form-label">Min active</label>
              <input
                ref={firstRef}
                className="kpi-form-input"
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                placeholder="15"
                value={form.min_active}
                onChange={(e) => setForm((prev) => ({ ...prev, min_active: e.target.value }))}
                disabled={busy}
              />
            </div>

            <div className="creatives-edit-list">
              {form.rows.length === 0 && (
                <div className="creatives-edit-empty">No creatives yet. Add one below.</div>
              )}
              {form.rows.map((row, idx) => (
                <div className="creatives-edit-row" key={idx}>
                  <input
                    className="kpi-form-input"
                    type="text"
                    placeholder="WW-001"
                    value={row.id}
                    onChange={(e) => updateRow(idx, { id: e.target.value })}
                    disabled={busy}
                  />
                  <input
                    className="kpi-form-input"
                    type="text"
                    placeholder="before/after"
                    value={row.name}
                    onChange={(e) => updateRow(idx, { name: e.target.value })}
                    disabled={busy}
                  />
                  <select
                    className="kpi-form-select"
                    value={row.signal}
                    onChange={(e) =>
                      updateRow(idx, { signal: e.target.value as CreativeSignal })
                    }
                    disabled={busy}
                  >
                    {SIGNAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="creatives-edit-remove"
                    onClick={() => removeRow(idx)}
                    disabled={busy}
                    aria-label="Remove row"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="kpi-form-row full">
              <button
                type="button"
                className="kpi-form-btn"
                onClick={addRow}
                disabled={busy}
              >
                + add row
              </button>
            </div>
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

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { TrackingAudit as TrackingAuditModel, TrackingStatus } from "../lib/types";

type Props = {
  root: string;
  clientSlug: string;
  current: TrackingAuditModel | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  pixel_status: TrackingStatus;
  capi_status: TrackingStatus;
  emq_score: string;
  pulse_note: string;
};

const STATUS_OPTIONS: TrackingStatus[] = ["ok", "warning", "missing"];

function initial(current: TrackingAuditModel | null): FormState {
  return {
    pixel_status: current?.pixel_status ?? "ok",
    capi_status: current?.capi_status ?? "ok",
    emq_score:
      current?.emq_score === null || current?.emq_score === undefined
        ? ""
        : String(current.emq_score),
    pulse_note: current?.pulse_note ?? "",
  };
}

function parseScore(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function TrackingAudit({ root, clientSlug, current, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initial(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const note = form.pulse_note.trim();
    const audit: TrackingAuditModel = {
      client: clientSlug,
      pixel_status: form.pixel_status,
      capi_status: form.capi_status,
      emq_score: parseScore(form.emq_score),
      pulse_note: note === "" ? null : note,
      updated_at: new Date().toISOString(),
    };
    try {
      await api.writeTrackingAudit(root, clientSlug, audit);
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
          <span className="kpi-modal-title">▸ TRACKING AUDIT</span>
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
              <label className="kpi-form-label">Pixel status</label>
              <div className="status-toggle">
                {STATUS_OPTIONS.map((opt, idx) => (
                  <button
                    type="button"
                    key={opt}
                    ref={idx === 0 ? firstRef : undefined}
                    className={`status-toggle-btn ${form.pixel_status === opt ? `active ${opt}` : ""}`}
                    onClick={() => set("pixel_status", opt)}
                    disabled={busy}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="kpi-form-row full">
              <label className="kpi-form-label">CAPI status</label>
              <div className="status-toggle">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`status-toggle-btn ${form.capi_status === opt ? `active ${opt}` : ""}`}
                    onClick={() => set("capi_status", opt)}
                    disabled={busy}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="kpi-form-row full">
              <label className="kpi-form-label">EMQ score (0–10)</label>
              <input
                className="kpi-form-input"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                max="10"
                placeholder="7.2"
                value={form.emq_score}
                onChange={(e) => set("emq_score", e.target.value)}
                disabled={busy}
              />
            </div>

            <div className="kpi-form-row full">
              <label className="kpi-form-label">Pulse note</label>
              <textarea
                className="kpi-form-textarea"
                rows={3}
                placeholder="Server-side events flowing. EMQ could climb…"
                value={form.pulse_note}
                onChange={(e) => set("pulse_note", e.target.value)}
                disabled={busy}
              />
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

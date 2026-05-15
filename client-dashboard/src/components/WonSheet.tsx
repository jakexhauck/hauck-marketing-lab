import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useClient } from "../context/ClientContext";

interface Props {
  open: boolean;
  onCancel: () => void;
  onSave: (value: number) => void;
}

export default function WonSheet({ open, onCancel, onSave }: Props) {
  const { client } = useClient();
  const valueLabel = client.pipeline.valueLabel;
  const [raw, setRaw] = useState("");

  useEffect(() => {
    if (!open) setRaw("");
  }, [open]);

  const numeric = Number(raw);
  const valid = raw.trim() !== "" && Number.isFinite(numeric) && numeric > 0;

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-40 transition-opacity duration-200 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-[var(--surface)] shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="flex flex-col gap-5 px-6 pt-5">
          <div className="mx-auto h-1 w-10 rounded-full bg-[var(--border)]" />
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="label-cap-strong">Record</span>
              <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text)]">
                {valueLabel}
              </h2>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--surface-2)]"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <label
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-within:border-[var(--ring)]"
            aria-label={valueLabel}
          >
            <span className="font-display text-2xl font-bold text-[var(--text-faint)]">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="0"
              className="hero-num w-full bg-transparent text-2xl text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
              style={{ fontWeight: 800 }}
            />
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[13px] font-bold uppercase tracking-wider text-[var(--text-muted)] transition-transform active:scale-[0.98] active:bg-[var(--surface-2)]"
              style={{ minHeight: "52px" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!valid}
              onClick={() => valid && onSave(numeric)}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-[13px] font-bold uppercase tracking-wider text-white transition-transform active:scale-[0.98] active:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:text-[var(--text-faint)]"
              style={{ minHeight: "52px" }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

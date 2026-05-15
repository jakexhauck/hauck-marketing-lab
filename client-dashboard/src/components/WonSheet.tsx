import { useEffect, useState } from "react";
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
        className="absolute inset-0 bg-slate-900/40"
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-white shadow-xl transition-transform duration-200 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="flex flex-col gap-4 px-5 pt-5">
          <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
          <h2 className="text-lg font-semibold text-slate-900">{valueLabel}</h2>
          <label
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 focus-within:border-slate-500"
            aria-label={valueLabel}
          >
            <span className="text-base font-medium text-slate-500">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent text-base text-slate-900 outline-none"
            />
          </label>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 active:bg-slate-50"
              style={{ minHeight: "52px" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!valid}
              onClick={() => valid && onSave(numeric)}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
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

import { useState } from "react";
import { X, Clock, Check } from "lucide-react";

// Minimal date + time picker for actions where any time is valid (no calendar
// availability to honour): Jobs "Reschedule" (PUT an existing appointment to a
// new time) and Leads "Schedule a callback" (a contact task due at a time). The
// parent owns the write; this only collects the chosen instant.
//
// Returns an ISO 8601 instant (UTC Z) parsed from the browser-local input, which
// GHL accepts for both appointment reschedule and task due dates.

interface DateTimeModalProps {
  title: string;
  subtitle?: string;
  confirmLabel: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (iso: string) => void;
}

// Local "YYYY-MM-DDTHH:mm" for the input's default (next hour, on the hour).
function defaultLocal(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimeModal({
  title,
  subtitle,
  confirmLabel,
  pending,
  onClose,
  onConfirm,
}: DateTimeModalProps) {
  const [value, setValue] = useState(defaultLocal());
  const canConfirm = value.length > 0 && !pending;

  function confirm() {
    if (!value) return;
    const iso = new Date(value).toISOString();
    onConfirm(iso);
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border px-[22px] pb-3.5 pt-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand/10 text-brand">
            <Clock size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16.5px] font-semibold text-text">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-[22px] py-4">
          <label className="mb-1.5 block font-display text-[12.5px] font-semibold text-muted">
            Date and time
          </label>
          <input
            type="datetime-local"
            value={value}
            min={nowLocal()}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-[10px] border border-border bg-[var(--bg)] px-3 py-2.5 text-[13px] text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-[22px] py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-border bg-surface px-3.5 py-2 font-display text-[13px] font-semibold text-text hover:border-brand/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
            style={{ backgroundImage: "var(--grad-brand)" }}
          >
            <Check size={15} /> {pending ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

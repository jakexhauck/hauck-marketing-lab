import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, GitBranch } from "lucide-react";

// The mobile pipeline switcher. The desktop board switches pipelines with a
// segmented pill row, but six pipeline names never fit a phone's width, so on
// mobile the same choice is a dropdown, styled to match the Setter Suite's
// client picker (same trigger shape, menu, outside-click + Escape close).
//
// Options arrive already labelled (the caller strips the CRM's numbering
// prefix and "Pipeline" suffix), so this component only renders and selects.

export interface PickerOption {
  value: string;
  label: string;
}

export default function PipelinePicker({
  options,
  value,
  onChange,
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const active = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Pipeline"
        className={
          "flex w-full items-center gap-2.5 rounded-full border bg-surface py-1.5 pl-2 pr-3.5 shadow-[var(--shadow-sm)] transition-colors " +
          (open ? "border-brand/50" : "border-border hover:border-brand/40")
        }
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] text-white"
          style={{ backgroundImage: "var(--grad-brand)" }}
          aria-hidden
        >
          <GitBranch size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-display text-[13px] font-semibold text-text">
          {active?.label ?? "Choose pipeline"}
        </span>
        <ChevronDown
          size={14}
          className={"shrink-0 text-faint transition-transform " + (open ? "rotate-180" : "")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Pipelines"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[65] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-faint">
            Pipeline
          </p>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={
                  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors " +
                  (on ? "bg-brand-tint" : "hover:bg-surface-2")
                }
              >
                <span
                  className={
                    "min-w-0 flex-1 truncate text-[13px] " +
                    (on ? "font-semibold text-brand-text" : "font-medium text-text")
                  }
                >
                  {o.label}
                </span>
                {on && <Check size={14} className="shrink-0 text-brand-text" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

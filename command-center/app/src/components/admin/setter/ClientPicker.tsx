import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";

// The Setter Suite's client picker. A custom dropdown rather than a native
// select because the native popup cannot be styled at all: this one gets the
// suite's surface, radius and hover treatment. The trigger is a real button
// and the menu closes on outside click and Escape, so it stays keyboard
// usable even without full listbox semantics.

export interface PickerClient {
  id: string;
  name: string;
}

export default function ClientPicker({
  clients,
  activeId,
  onSelect,
}: {
  clients: PickerClient[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const active = clients.find((c) => c.id === activeId) ?? null;

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
    <div ref={rootRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Client"
        className={
          "flex items-center gap-2.5 rounded-full border bg-surface py-1.5 pl-2 pr-3.5 shadow-[var(--shadow-sm)] transition-colors " +
          (open ? "border-brand/50" : "border-border hover:border-brand/40")
        }
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] text-white"
          style={{ backgroundImage: "var(--grad-brand)" }}
          aria-hidden
        >
          <Building2 size={13} />
        </span>
        <span className="max-w-[180px] truncate font-display text-[13px] font-semibold text-text">
          {active?.name ?? "Choose client"}
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
          aria-label="Clients"
          className="absolute right-0 top-[calc(100%+6px)] z-[65] min-w-[230px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-faint">
            Working as
          </p>
          {clients.map((c) => {
            const on = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                }}
                className={
                  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors " +
                  (on ? "bg-brand-tint" : "hover:bg-surface-2")
                }
              >
                <span
                  className={
                    "grid h-7 w-7 shrink-0 place-items-center rounded-[9px] font-display text-[11px] font-bold " +
                    (on ? "text-white" : "bg-surface-2 text-muted")
                  }
                  style={on ? { backgroundImage: "var(--grad-brand)" } : undefined}
                  aria-hidden
                >
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <span
                  className={
                    "min-w-0 flex-1 truncate text-[13px] " +
                    (on ? "font-semibold text-brand-text" : "font-medium text-text")
                  }
                >
                  {c.name}
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

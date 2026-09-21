import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

// A filter or picker in the ClientPicker's clothes (components/admin/ClientPicker).
//
// Jake's call on 21 September 2026: every filter and picker reads like the
// client picker on the Fulfillment pages. Same raised surface, same small
// uppercase kicker over the value, same chevron, same panel of rows with a tick
// on the chosen one. A native <select> cannot be dressed like that, so this is a
// button and a listbox.
//
// The panel grows a search box once there are enough options to need one (a
// run list, a trade list); a four-option filter does not get one.

export interface FilterOption {
  value: string;
  label: string;
  sub?: string;
}

const SEARCH_FROM = 8;

export default function FilterPicker({
  kicker,
  value,
  options,
  onChange,
  icon,
  align = "left",
  disabled = false,
}: {
  kicker: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const searchable = options.length >= SEARCH_FROM;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  const selected = options.find((o) => o.value === value) ?? null;

  // Same close rules as the client picker: outside click and Escape, with the
  // listeners only alive while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
    if (!open) setQuery("");
  }, [open, searchable]);

  return (
    <div className={`fp${open ? " open" : ""}`} ref={rootRef}>
      <FilterPickerStyle />

      <button
        type="button"
        className="fp-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${kicker}: ${selected?.label ?? ""}`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {icon && <span className="fp-icon" aria-hidden>{icon}</span>}
        <span className="fp-meta">
          <span className="fp-kicker">{kicker}</span>
          <span className="fp-name">{selected?.label ?? "Pick one"}</span>
        </span>
        <ChevronDown size={15} className="fp-chev" aria-hidden />
      </button>

      {open && (
        <div className={`fp-panel ${align}`} role="listbox" aria-label={kicker}>
          {searchable && (
            <label className="fp-search">
              <Search size={14} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find"
                aria-label={`Find a ${kicker.toLowerCase()}`}
              />
            </label>
          )}

          <div className="fp-list">
            {filtered.length === 0 ? (
              <div className="fp-none">Nothing matches.</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`fp-row${o.value === value ? " on" : ""}`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="fp-who">
                    <b>{o.label}</b>
                    {o.sub && <span>{o.sub}</span>}
                  </span>
                  {o.value === value && <Check size={15} className="fp-tick" aria-hidden />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// The client picker's rules, scaled for a toolbar: a filter sits in a row of
// them, so it is a step smaller than the one control that changes the page.
function FilterPickerStyle() {
  return (
    <style>{`
      .pk-kit .fp { position: relative; }

      .pk-kit .fp-btn {
        display: inline-flex; align-items: center; gap: 9px; cursor: pointer;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 13px; padding: 5px 10px 5px 11px; font: inherit;
        box-shadow: var(--shadow-sm); transition: border-color .15s, box-shadow .15s;
      }
      .pk-kit .fp-btn:hover:not(:disabled) {
        border-color: var(--border-strong); box-shadow: var(--shadow-md);
      }
      .pk-kit .fp-btn:disabled { cursor: default; opacity: .7; }

      .pk-kit .fp-icon {
        width: 28px; height: 28px; border-radius: 9px; flex-shrink: 0; margin-left: -4px;
        display: grid; place-items: center;
        background: var(--brand-tint); color: var(--brand-text);
      }

      .pk-kit .fp-meta { display: flex; flex-direction: column; text-align: left; line-height: 1.25; }
      .pk-kit .fp-kicker {
        font-size: 9.5px; font-weight: 600; letter-spacing: .1em;
        text-transform: uppercase; color: var(--text-faint);
      }
      .pk-kit .fp-name {
        font-family: var(--font-display); font-weight: 600; font-size: 13px; color: var(--text);
        max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pk-kit .fp-chev { color: var(--text-faint); margin-left: 2px; transition: transform .2s; }
      .pk-kit .fp.open .fp-chev { transform: rotate(180deg); }

      .pk-kit .fp-panel {
        position: absolute; top: calc(100% + 8px); width: 280px; z-index: 40;
        background: var(--surface); border: 1px solid var(--border); border-radius: 18px;
        box-shadow: var(--shadow-lg); padding: 8px;
      }
      .pk-kit .fp-panel.left { left: 0; }
      .pk-kit .fp-panel.right { right: 0; }

      .pk-kit .fp-search {
        display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
        border: 1px solid var(--border); border-radius: 11px;
        background: var(--surface-2); padding: 8px 11px; color: var(--text-faint);
      }
      .pk-kit .fp-search:focus-within { border-color: var(--brand); background: var(--surface); }
      .pk-kit .fp-search input {
        flex: 1; min-width: 0; border: 0; background: transparent; font: inherit;
        font-size: 13px; color: var(--text); outline: 0;
      }
      .pk-kit .fp-search input::placeholder { color: var(--text-faint); }

      .pk-kit .fp-list { max-height: 320px; overflow-y: auto; }
      .pk-kit .fp-row {
        display: flex; width: 100%; align-items: center; gap: 11px; cursor: pointer;
        border: 0; background: transparent; border-radius: 12px; padding: 9px 10px;
        text-align: left; font: inherit; transition: background .12s;
      }
      .pk-kit .fp-row:hover { background: var(--surface-2); }
      .pk-kit .fp-row.on { background: var(--brand-tint); }
      .pk-kit .fp-who { min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
      .pk-kit .fp-who b {
        font-weight: 600; font-size: 13.5px; color: var(--text);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pk-kit .fp-who span {
        font-size: 11.5px; color: var(--text-faint);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pk-kit .fp-tick { margin-left: auto; flex-shrink: 0; color: var(--brand-text); }
      .pk-kit .fp-none { padding: 18px 10px; text-align: center; font-size: 13px; color: var(--text-muted); }

      @media (max-width: 560px) {
        .pk-kit .fp-panel { width: min(280px, calc(100vw - 48px)); }
        .pk-kit .fp-name { max-width: 140px; }
      }
    `}</style>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { filterRoster } from "../../lib/deliveryRoster";
import type { AdminClient } from "../../lib/api";

// The client control on a Fulfillment page's title row. It is the old roster
// rail collapsed into one button: the same brand chip, the same search, the
// same rows, in the space a heading leaves spare.
//
// It is the most consequential control on the page (it changes everything
// below it), so it is built as an object rather than a form field: a raised
// surface carrying the client's own brand colour. You should be able to tell
// which client you are looking at without reading.
//
// Nothing here fabricates a client: an agency with no clients gets a disabled
// button saying so, not an empty menu.

export default function ClientPicker({
  clients,
  selected,
  loading,
  error,
  onSelect,
}: {
  clients: AdminClient[];
  selected: AdminClient | null;
  loading: boolean;
  error: boolean;
  onSelect: (tenantId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => filterRoster(clients, query), [clients, query]);

  // Close on outside click and on Escape. Both listeners only exist while the
  // panel is open, so a closed picker costs the page nothing.
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

  // Opening puts the cursor in the search box: with more than a handful of
  // clients, typing is faster than pointing.
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const label = loading
    ? "Loading clients..."
    : error
      ? "Could not load clients"
      : (selected?.name ?? (clients.length === 0 ? "No clients yet" : "Pick a client"));

  const disabled = loading || error || clients.length === 0;

  return (
    <div className={`cp${open ? " open" : ""}`} ref={rootRef}>
      <ClientPickerStyle />

      <button
        type="button"
        className="cp-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="cp-chip"
          style={{ background: selected?.brandColor || "var(--brand-primary)" }}
          aria-hidden
        >
          {selected ? initialsFor(selected) : "--"}
        </span>
        <span className="cp-meta">
          <span className="cp-kicker">Client</span>
          <span className="cp-name">{label}</span>
        </span>
        <ChevronDown size={16} className="cp-chev" aria-hidden />
      </button>

      {open && (
        <div className="cp-panel" role="listbox" aria-label="Choose a client">
          <label className="cp-search">
            <Search size={14} aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a client"
              aria-label="Find a client"
            />
          </label>

          <div className="cp-list">
            {filtered.length === 0 ? (
              <div className="cp-none">No clients match.</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={c.id === selected?.id}
                  className={`cp-row${c.id === selected?.id ? " on" : ""}`}
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="cp-chip sm" style={{ background: c.brandColor }} aria-hidden>
                    {initialsFor(c)}
                  </span>
                  <span className="cp-who">
                    <b>{c.name}</b>
                    <span>{c.niche || c.slug}</span>
                  </span>
                  {c.id === selected?.id && <Check size={16} className="cp-tick" aria-hidden />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function initialsFor(client: AdminClient): string {
  return client.brandInitials || client.name.slice(0, 2).toUpperCase();
}

// Scoped to .pk-kit so it reads the admin theme tokens in light and dark, the
// same way the tracker and Cold SMS styles do.
function ClientPickerStyle() {
  return (
    <style>{`
      .pk-kit .cp { position: relative; }

      .pk-kit .cp-btn {
        display: inline-flex; align-items: center; gap: 11px; cursor: pointer;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 15px; padding: 7px 12px 7px 8px; font: inherit;
        box-shadow: var(--shadow-sm); transition: border-color .15s, box-shadow .15s;
      }
      .pk-kit .cp-btn:hover:not(:disabled) {
        border-color: var(--border-strong); box-shadow: var(--shadow-md);
      }
      .pk-kit .cp-btn:disabled { cursor: default; opacity: .7; }

      .pk-kit .cp-chip {
        width: 34px; height: 34px; border-radius: 11px; flex-shrink: 0;
        display: grid; place-items: center; color: #fff;
        font-family: var(--font-display); font-weight: 700; font-size: 12.5px;
      }
      .pk-kit .cp-chip.sm { width: 30px; height: 30px; border-radius: 10px; font-size: 11.5px; }

      .pk-kit .cp-meta { display: flex; flex-direction: column; text-align: left; line-height: 1.25; }
      .pk-kit .cp-kicker {
        font-size: 10px; font-weight: 600; letter-spacing: .1em;
        text-transform: uppercase; color: var(--text-faint);
      }
      .pk-kit .cp-name {
        font-family: var(--font-display); font-weight: 600; font-size: 14.5px; color: var(--text);
        max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pk-kit .cp-chev { color: var(--text-faint); margin-left: 3px; transition: transform .2s; }
      .pk-kit .cp.open .cp-chev { transform: rotate(180deg); }

      .pk-kit .cp-panel {
        position: absolute; right: 0; top: calc(100% + 8px); width: 316px; z-index: 40;
        background: var(--surface); border: 1px solid var(--border); border-radius: 18px;
        box-shadow: var(--shadow-lg); padding: 8px;
      }

      .pk-kit .cp-search {
        display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
        border: 1px solid var(--border); border-radius: 11px;
        background: var(--surface-2); padding: 8px 11px; color: var(--text-faint);
      }
      .pk-kit .cp-search:focus-within { border-color: var(--brand); background: var(--surface); }
      .pk-kit .cp-search input {
        flex: 1; min-width: 0; border: 0; background: transparent; font: inherit;
        font-size: 13px; color: var(--text); outline: 0;
      }
      .pk-kit .cp-search input::placeholder { color: var(--text-faint); }

      .pk-kit .cp-list { max-height: 320px; overflow-y: auto; }
      .pk-kit .cp-row {
        display: flex; width: 100%; align-items: center; gap: 11px; cursor: pointer;
        border: 0; background: transparent; border-radius: 12px; padding: 8px 9px;
        text-align: left; font: inherit; transition: background .12s;
      }
      .pk-kit .cp-row:hover { background: var(--surface-2); }
      .pk-kit .cp-row.on { background: var(--brand-tint); }
      .pk-kit .cp-who { min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
      .pk-kit .cp-who b {
        font-weight: 600; font-size: 13.5px; color: var(--text);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pk-kit .cp-who span {
        font-size: 11.5px; color: var(--text-faint);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pk-kit .cp-tick { margin-left: auto; flex-shrink: 0; color: var(--brand-text); }
      .pk-kit .cp-none { padding: 18px 10px; text-align: center; font-size: 13px; color: var(--text-muted); }

      @media (max-width: 560px) {
        .pk-kit .cp-panel { width: min(316px, calc(100vw - 48px)); }
        .pk-kit .cp-name { max-width: 150px; }
      }
    `}</style>
  );
}

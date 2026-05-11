import { useEffect, useRef, useState } from "react";
import type { ClientEntry } from "../lib/types";

type Props = {
  clients: ClientEntry[];
  activeSlug: string | null;
  activeName: string;
  onSelectClient: (slug: string) => void;
  onAddClient: () => void;
  onManageClients: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  refreshing: boolean;
};

function formatStamp(d: Date) {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const day = String(d.getDate()).padStart(2, "0");
  const mo = months[d.getMonth()];
  const yr = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${day} ${mo} ${yr} · ${hh}:${mm}:${ss} LOCAL`;
}

export function StatusBar({
  clients,
  activeSlug,
  activeName,
  onSelectClient,
  onAddClient,
  onManageClients,
  onOpenSettings,
  onRefresh,
  refreshing,
}: Props) {
  const [now, setNow] = useState(new Date());
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const handleSelect = (slug: string) => {
    setOpen(false);
    if (slug !== activeSlug) onSelectClient(slug);
  };

  const handleAdd = () => {
    setOpen(false);
    onAddClient();
  };

  const handleManage = () => {
    setOpen(false);
    onManageClients();
  };

  return (
    <div className="statusbar">
      <div className="left">
        <span>
          <span className="pulse-dot" />
          JARVIS · ONLINE
        </span>
        <span>v0.1.0-alpha</span>
      </div>
      <div className="center">{formatStamp(now)}</div>
      <div className="right">
        <button className="refresh-btn" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "syncing…" : "↻ refresh"}
        </button>
        <span>SUBSCRIPTION · CLAUDE MAX</span>
        <button
          className="settings-btn"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <span className="settings-btn-glyph" aria-hidden="true">
            ⚙
          </span>
          <span className="settings-btn-label">SETTINGS</span>
        </button>
        <div className="client-pill-wrap" ref={containerRef}>
          <button
            className={`client-pill-btn${open ? " open" : ""}`}
            onClick={() => setOpen((p) => !p)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <span className="client-pill-caret">{open ? "▾" : "▸"}</span>
            <span className="client-pill-name">{activeName.toUpperCase()}</span>
          </button>
          {open && (
            <div className="client-menu" role="menu">
              <div className="client-menu-label">Clients</div>
              {clients.length === 0 && (
                <div className="client-menu-empty">No clients on file.</div>
              )}
              {clients.map((c) => (
                <button
                  key={c.slug}
                  className={`client-menu-item${c.slug === activeSlug ? " active" : ""}`}
                  role="menuitem"
                  onClick={() => handleSelect(c.slug)}
                >
                  <span className="client-menu-item-name">{c.name}</span>
                  <span className="client-menu-item-slug">{c.slug}</span>
                </button>
              ))}
              <div className="client-menu-divider" />
              <button className="client-menu-item action" role="menuitem" onClick={handleAdd}>
                <span className="client-menu-item-name">+ Add client…</span>
              </button>
              <button
                className="client-menu-item secondary"
                role="menuitem"
                onClick={handleManage}
              >
                <span className="client-menu-item-name">Manage clients…</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

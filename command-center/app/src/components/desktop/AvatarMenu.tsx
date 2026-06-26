import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Settings, Sun, Moon, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useClient } from "../../context/ClientContext";
import { useTheme } from "../../context/ThemeContext";

// Topbar avatar (brand gradient) opening a small menu: Settings, theme, sign
// out. The avatar represents the signed-in user; initials come from the staff
// member's name, or the client brand for an owner session.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AvatarMenu() {
  const { staff, signOut } = useAuth();
  const { client } = useClient();
  const { resolved, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const displayName = staff?.name ?? client.brand.appName;
  const initials = staff ? initialsOf(staff.name) : client.brand.initials;

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="shadow-brand flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold text-white transition-transform active:scale-[0.96]"
        style={{ backgroundImage: "var(--grad-brand)" }}
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)]"
        >
          <div className="border-b border-divider px-4 py-3">
            <div className="truncate text-[13px] font-semibold text-text">
              {displayName}
            </div>
          </div>
          <NavLink
            to="/settings"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-text transition-colors hover:bg-surface-2"
          >
            <Settings size={15} className="text-muted" /> Settings
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              toggle();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-text transition-colors hover:bg-surface-2"
          >
            {resolved === "light" ? (
              <Moon size={15} className="text-muted" />
            ) : (
              <Sun size={15} className="text-muted" />
            )}
            {resolved === "light" ? "Dark mode" : "Light mode"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 border-t border-divider px-4 py-2.5 text-left text-[13px] text-danger transition-colors hover:bg-danger-tint"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

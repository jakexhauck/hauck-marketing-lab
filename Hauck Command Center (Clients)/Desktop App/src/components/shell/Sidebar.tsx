import { NavLink } from "react-router-dom";
import { Command, Sun, Moon, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV, filterNav } from "@/lib/nav";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { usePalette } from "./CommandPalette";

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const { signOut, mode, isOwner, can } = useAuth();
  const brand = useTenant();
  const palette = usePalette();
  const navItems = filterNav(NAV, { isOwner, can });

  return (
    <aside className="flex h-full w-[236px] shrink-0 flex-col border-r border-border bg-rail">
      {/* Brand mark */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[12px] font-bold text-brand-fg"
          style={{ background: "var(--brand)" }}
        >
          {brand.initials}
        </span>
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] leading-tight text-text">
            {brand.appName}
          </div>
          {brand.niche && <div className="truncate text-[11px] text-faint">{brand.niche}</div>}
        </div>
      </div>

      {/* Command trigger */}
      <div className="px-3 pb-2">
        <button
          onClick={palette.open}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          <Command size={15} />
          <span className="flex-1 text-left">Search or jump…</span>
          <kbd className="font-data rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "group relative mb-0.5 flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                isActive ? "bg-brand-tint text-brand-text" : "text-muted hover:bg-surface-2 hover:text-text",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "absolute left-0 h-5 w-0.5 rounded-full bg-brand transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
                <item.icon size={17} className="shrink-0" />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer controls */}
      <div className="border-t border-divider px-3 py-3">
        {mode === "test" && (
          <div className="mb-2 flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-warning-tint px-2.5 py-1.5 text-[11px] font-semibold text-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Test account
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] text-[12.5px] text-muted hover:bg-surface-2 hover:text-text"
          >
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <button
            onClick={() => void signOut()}
            className="flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[12.5px] text-muted hover:bg-danger-tint hover:text-danger"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

import { NavLink } from "react-router-dom";
import { Settings } from "lucide-react";
import { NAV, visibleNav, isNavSection, type NavItem, type NavSection } from "../lib/nav";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";

// A single nav row. Shared by top-level items and group children so the active
// (gradient) and hover treatments stay identical wherever a surface lives.
function NavItemLink({ item, nested = false }: { item: NavItem; nested?: boolean }) {
  return (
    <NavLink
      to={item.to}
      data-tour={`nav-${item.to.slice(1)}`}
      className={({ isActive }) =>
        [
          "group relative mb-0.5 flex items-center gap-3 rounded-[10px] py-2.5 text-[13.5px] font-medium transition-[color,background,transform] duration-200",
          nested ? "pl-[34px] pr-3" : "px-3",
          isActive
            ? "shadow-brand text-white"
            : "text-[var(--text-muted)] hover:translate-x-0.5 hover:bg-white/60 hover:text-[var(--text)] dark:hover:bg-white/5",
        ].join(" ")
      }
      style={({ isActive }) => (isActive ? { backgroundImage: "var(--grad-brand)" } : undefined)}
    >
      <item.icon size={17} className="shrink-0 opacity-80" />
      {item.label}
    </NavLink>
  );
}

// A static (non-collapsible) sidebar section (e.g. Sales): an inline uppercase
// header followed by its rows. No toggle, no chevron, always visible. Grouping
// is purely visual; the rows are ordinary nav links.
function NavSectionBlock({ section }: { section: NavSection }) {
  return (
    <div className="mb-3">
      <div className="px-3 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
        {section.label}
      </div>
      {section.items.map((item) => (
        <NavItemLink key={item.to} item={item} />
      ))}
    </div>
  );
}

// Desktop-only rail (lg+). The phone keeps the bottom tab bar; this is hidden
// below lg via the `hidden lg:flex` wrapper. Same nav source of truth and the
// same permission gate the bottom bar uses, so the two never drift.
export default function Sidebar() {
  const { client } = useClient();
  const { session, isOwner, mode, can } = useAuth();
  const navEntries = visibleNav(NAV, { isOwner, can });
  const brand = client.brand;

  // No rail before sign-in: the login screen also renders inside Shell, and an
  // unauthenticated session would otherwise show a full (owner-default) nav.
  if (!session) return null;

  return (
    <aside className="glass hidden h-dvh w-[244px] shrink-0 flex-col border-r border-white/50 dark:border-white/10 lg:sticky lg:top-0 lg:flex">
      {/* Brand mark */}
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-4">
        <span
          className="shadow-brand flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[12px] font-bold text-white"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          {brand.initials}
        </span>
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-semibold leading-tight text-[var(--text)]">
            {brand.appName}
          </div>
          {client.niche && (
            <div className="truncate text-[11px] text-[var(--text-faint)]">{client.niche}</div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-1">
        {navEntries.map((entry) =>
          isNavSection(entry) ? (
            <NavSectionBlock key={entry.id} section={entry} />
          ) : (
            <NavItemLink key={entry.to} item={entry} />
          ),
        )}
      </nav>

      {/* Footer controls */}
      <div className="border-t border-[var(--divider)] px-3 py-3">
        {mode === "test" && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Test account
          </div>
        )}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            [
              "mb-1 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-[color,background,transform] duration-200",
              isActive
                ? "shadow-brand text-white"
                : "text-[var(--text-muted)] hover:translate-x-0.5 hover:bg-white/60 hover:text-[var(--text)] dark:hover:bg-white/5",
            ].join(" ")
          }
          style={({ isActive }) =>
            isActive ? { backgroundImage: "var(--grad-brand)" } : undefined
          }
        >
          <Settings size={16} className="shrink-0 opacity-80" /> Settings
        </NavLink>
      </div>
    </aside>
  );
}

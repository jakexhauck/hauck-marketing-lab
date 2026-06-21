import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Building2,
  ListChecks,
  BookText,
  Hammer,
  LogOut,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { GREEN_THEME_VARS } from "../../lib/brandTheme";

// The admin console chrome. Mirrors the client Sidebar/Shell format (a left rail
// on desktop, a compact top bar on phones) but is deliberately tenant-free: a
// super-admin has no client branding, so this is the agency's own view across
// every client. Two tabs today, Clients and Tasks; more get added here as the
// console grows into a full business overview.

interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin/clients", label: "Clients", icon: Building2 },
  { to: "/admin/tasks", label: "Tasks", icon: ListChecks },
  { to: "/admin/build", label: "Build Lab", icon: Hammer },
  { to: "/admin/sops", label: "SOP Hub", icon: BookText },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [
    "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
    isActive
      ? "text-[var(--brand-text)]"
      : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
  ].join(" ");
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAuth();
  const { resolved, toggle } = useTheme();

  return (
    <div className="flex min-h-dvh bg-[var(--bg)] text-[var(--text)]" style={GREEN_THEME_VARS}>
      {/* Desktop rail (lg+). Same source-of-truth nav as the mobile bar below. */}
      <aside className="hidden h-dvh w-[236px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:sticky lg:top-0 lg:flex">
        <div className="px-4 pb-3 pt-5">
          <img src="/hauck-wordmark.png" alt="Hauck Marketing" className="h-[22px] w-auto" />
          <div className="mt-2 pl-[2px] text-[11px] text-[var(--text-faint)]">Admin Console</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-1">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={(s) => `${navLinkClass(s)} mb-0.5`}
              style={({ isActive }) =>
                isActive ? { background: "var(--brand-primary-tint)" } : undefined
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className="absolute left-0 h-5 w-0.5 rounded-full transition-opacity"
                    style={{ background: "var(--brand-primary)", opacity: isActive ? 1 : 0 }}
                    aria-hidden
                  />
                  <item.icon size={17} className="shrink-0" />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--divider)] px-3 py-3">
          {admin?.email && (
            <div className="mb-1 truncate px-2.5 text-[11px] text-[var(--text-faint)]">
              {admin.email}
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              {resolved === "light" ? <Moon size={15} /> : <Sun size={15} />}
              {resolved === "light" ? "Dark" : "Light"}
            </button>
            <button
              onClick={() => void signOut()}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-600"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar (below lg): brand, the two tabs, theme + sign out. */}
        <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <img src="/hauck-wordmark.png" alt="Hauck Marketing" className="h-[20px] w-auto shrink-0" />
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                {resolved === "light" ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button
                onClick={() => void signOut()}
                aria-label="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-600"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 px-3 pb-2">
            {ADMIN_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                <item.icon size={16} className="shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* Each admin page renders its own DesktopPage shell (sticky header +
            wide content), matching the client Atelier surfaces. */}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

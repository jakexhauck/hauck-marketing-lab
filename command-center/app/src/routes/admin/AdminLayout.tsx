import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { ShieldCheck, LogOut, Sun, Moon } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

// The admin console chrome. Deliberately separate from the client Shell/Sidebar:
// a super-admin has no tenant, so none of the client-branded, tenant-scoped UI
// applies. One responsive frame (top bar + centered content) that works on
// desktop and phone alike.
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAuth();
  const { resolved, toggle } = useTheme();

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <NavLink to="/admin/clients" className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--brand-fg)]"
              style={{ background: "var(--brand-primary)" }}
            >
              <ShieldCheck size={17} />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-[15px] font-semibold leading-tight text-[var(--text)]">
                Hauck Command Center
              </div>
              <div className="truncate text-[11px] font-medium text-[var(--text-faint)]">
                Admin Console
              </div>
            </div>
          </NavLink>

          <div className="ml-auto flex items-center gap-1">
            {admin?.email && (
              <span className="mr-1 hidden text-[12px] text-[var(--text-muted)] sm:inline">
                {admin.email}
              </span>
            )}
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              {resolved === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              onClick={() => void signOut()}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-600"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

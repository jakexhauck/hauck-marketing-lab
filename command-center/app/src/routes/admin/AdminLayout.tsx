import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Building2,
  ListChecks,
  BookText,
  Hammer,
  FolderOpen,
  LogOut,
  Sun,
  Moon,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

// The admin console chrome. A left rail on desktop, a compact top bar on phones.
// Deliberately tenant-free: a super-admin has no client branding, so this is the
// agency's own view across every client. Runs on the shared neutral light/dark
// tokens (no green wash) with green as a rationed accent. The display face is
// Poppins, inherited from the global --font-display token.

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
  { to: "/admin/assets", label: "Assets", icon: FolderOpen },
  { to: "/admin/messages", label: "Messages", icon: MessageSquare },
];

function NavRow({ item }: { item: AdminNavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          "group relative flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-[14px] font-medium transition-colors",
          isActive
            ? "bg-brand-tint text-brand-text font-semibold"
            : "text-muted hover:bg-surface-2 hover:text-text",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <span
            className="absolute left-0 h-5 w-[3px] rounded-full bg-brand transition-opacity"
            style={{ opacity: isActive ? 1 : 0 }}
            aria-hidden
          />
          <item.icon
            size={18}
            className={isActive ? "text-brand-text" : "opacity-85 transition-transform group-hover:scale-110"}
          />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const isLight = resolved === "light";

  return (
    <div className="flex min-h-dvh bg-bg text-text">
      {/* Desktop rail (lg+). Same source-of-truth nav as the mobile bar below. */}
      <aside className="hidden h-dvh w-[248px] shrink-0 flex-col border-r border-border bg-surface lg:sticky lg:top-0 lg:flex">
        <div className="px-[18px] pb-3 pt-[22px]">
          <div className="flex items-center gap-[10px]">
            <span
              className="grid h-[30px] w-[30px] place-items-center rounded-[9px] font-display text-[15px] font-bold text-brand-fg shadow-[0_4px_14px_rgba(77,187,131,0.4)]"
              style={{ background: "linear-gradient(150deg, var(--brand) 0%, var(--brand-strong) 100%)" }}
              aria-hidden
            >
              H
            </span>
            <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">Hauck</span>
          </div>
          <div className="mt-3 pl-[2px] text-[11px] font-medium text-faint">Admin Console</div>
        </div>

        <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto px-3 py-2.5">
          {ADMIN_NAV.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </nav>

        <div className="flex flex-col gap-2.5 border-t border-divider p-[14px]">
          <div className="flex items-center gap-[11px] px-1 py-0.5">
            <span
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full font-display text-[12.5px] font-bold text-brand-fg"
              style={{ background: "linear-gradient(150deg, var(--brand), var(--brand-strong))" }}
              aria-hidden
            >
              {initials(admin?.email)}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-tight">Admin</div>
              {admin?.email && (
                <div className="truncate text-[11.5px] text-faint">{admin.email}</div>
              )}
            </div>
          </div>
          <div className="flex gap-[7px]">
            <button
              onClick={toggle}
              className="flex flex-1 items-center justify-center gap-[7px] rounded-[var(--radius)] bg-surface-2 px-2 py-2.5 text-[12.5px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-text"
            >
              {isLight ? <Moon size={15} /> : <Sun size={15} />}
              Theme
            </button>
            <button
              onClick={() => void signOut()}
              className="flex flex-1 items-center justify-center gap-[7px] rounded-[var(--radius)] bg-surface-2 px-2 py-2.5 text-[12.5px] font-semibold text-muted transition-colors hover:bg-danger-tint hover:text-danger"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar (below lg): brand, the tabs, theme + sign out. */}
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span
              className="grid h-[26px] w-[26px] place-items-center rounded-[8px] font-display text-[13px] font-bold text-brand-fg"
              style={{ background: "linear-gradient(150deg, var(--brand) 0%, var(--brand-strong) 100%)" }}
              aria-hidden
            >
              H
            </span>
            <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">Hauck</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-surface-2 hover:text-text"
              >
                {isLight ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button
                onClick={() => void signOut()}
                aria-label="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-danger-tint hover:text-danger"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
          <nav className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5">
            {ADMIN_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "flex shrink-0 items-center gap-2 rounded-[var(--radius)] px-3 py-1.5 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-brand-tint text-brand-text font-semibold"
                      : "text-muted hover:bg-surface-2 hover:text-text",
                  ].join(" ")
                }
              >
                <item.icon size={15} className="shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* Each admin page renders its own page shell (sticky header + content). */}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

function initials(email?: string | null): string {
  if (!email) return "HM";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[.\-_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "HM";
}

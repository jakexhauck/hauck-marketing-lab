import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Map, LogOut, Sun, Moon, Search, type LucideIcon } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { orderedPillars, rollUpStatus } from "../../lib/pillarStatus";
import { pillarIcon, StatusDot, PillarStyle } from "../../components/pillars/PillarKit";
import type { PillarStatus } from "../../lib/pillars";

// The admin console chrome, inherited from the Modern Motion design kit's full
// shell: a glass left rail with gradient-fill active nav and a glass topbar
// (search, theme, sign out, avatar). The Modern Motion theme is scoped to
// .pk-kit so it themes the whole admin without touching the client app.
//
// The rail is the org chart: the six pillars (Operations the hub on top, then
// the value chain 01..05) each carrying a rolled-up status dot, then the
// Infrastructure map pinned at the bottom. Clients live inside Operations.

interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  status?: PillarStatus;
}

const ADMIN_NAV: AdminNavItem[] = [
  ...orderedPillars().map((p) => ({
    to: `/admin/pillar/${p.id}`,
    label: p.order === "hub" ? "Operations" : `${p.num} ${p.label}`,
    icon: pillarIcon(p.icon),
    status: rollUpStatus(p),
  })),
  { to: "/admin/infrastructure", label: "Infrastructure", icon: Map },
];

function NavRow({ item }: { item: AdminNavItem }) {
  return (
    <NavLink to={item.to} className={({ isActive }) => `adm-nav-item${isActive ? " on" : ""}`} end={false}>
      <item.icon size={18} />
      <span className="flex-1">{item.label}</span>
      {item.status && <StatusDot status={item.status} />}
    </NavLink>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const isLight = resolved === "light";

  return (
    <div className="pk-kit flex min-h-dvh bg-bg text-text">
      {/* PillarStyle carries the Modern Motion theme, the shell styles, and the
          rail status-dot styles, mounted once for the whole admin. */}
      <PillarStyle />

      {/* Desktop glass rail (lg+). */}
      <aside className="adm-rail hidden h-dvh w-[248px] shrink-0 flex-col px-3 pb-3 pt-[18px] lg:sticky lg:top-0 lg:flex">
        <div className="flex items-center gap-[11px] px-2 pb-5">
          <span className="adm-brandmark" aria-hidden>H</span>
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold leading-tight tracking-[-0.01em]">Hauck</div>
            <div className="text-[11px] font-medium text-faint">Admin Console</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto">
          {ADMIN_NAV.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop glass topbar (lg+): search, theme, sign out, avatar. */}
        <div className="adm-topbar hidden lg:flex">
          <label className="adm-search">
            <Search size={15} />
            <input placeholder="Search clients, lanes, tools..." aria-label="Search" />
          </label>
          <div className="flex-1" />
          <button onClick={toggle} className="adm-iconbtn" aria-label="Toggle theme">
            {isLight ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button onClick={() => void signOut()} className="adm-iconbtn danger" aria-label="Sign out">
            <LogOut size={16} />
          </button>
          <span className="adm-avatar" title={admin?.email ?? "Admin"} aria-hidden>
            {initials(admin?.email)}
          </span>
        </div>

        {/* Phone top bar (below lg): brand, theme + sign out, then the nav. */}
        <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="adm-brandmark !h-[26px] !w-[26px] !rounded-[8px] !text-[13px]" aria-hidden>H</span>
            <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">Hauck</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={toggle} className="adm-iconbtn !h-9 !w-9" aria-label="Toggle theme">
                {isLight ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button onClick={() => void signOut()} className="adm-iconbtn danger !h-9 !w-9" aria-label="Sign out">
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
                    "flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors",
                    isActive ? "adm-nav-item on" : "text-muted hover:bg-surface-2 hover:text-text",
                  ].join(" ")
                }
              >
                <item.icon size={15} className="shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* Each admin page renders its own content. */}
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

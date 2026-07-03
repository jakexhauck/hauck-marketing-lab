import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  Handshake,
  HeartHandshake,
  Wrench,
  Settings,
  LogOut,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { PillarStyle } from "../../components/pillars/PillarKit";

// The admin console chrome: a narrow icon spine (the Theory-of-Constraints
// command view) plus each page's own body. The spine is the org chart in four
// pillars around a Command home: Command, then the value chain
// Acquisition -> Sales -> Service Delivery, with Operations as the foundation.
// Settings and the account avatar pin to the bottom. Theme toggle and sign-out
// stay reachable in the spine footer.
//
// The Modern Motion theme is scoped to .pk-kit so it themes the whole admin
// without touching the client app, and PillarStyle is mounted once here.

interface SpineItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // Command matches only its exact path; every other item matches its subtree
  // (e.g. Service Delivery is active for any /admin/delivery/:tenantId).
  end?: boolean;
}

const SPINE_NAV: SpineItem[] = [
  { to: "/admin", label: "Command", icon: LayoutDashboard, end: true },
  { to: "/admin/pillar/acquisition", label: "Acquisition", icon: Megaphone },
  { to: "/admin/pillar/sales", label: "Sales", icon: Handshake },
  { to: "/admin/delivery", label: "Service Delivery", icon: HeartHandshake },
  { to: "/admin/pillar/operations", label: "Operations", icon: Wrench },
];

function SpineLink({ item }: { item: SpineItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => `adm-spine-btn${isActive ? " on" : ""}`}
      aria-label={item.label}
    >
      <item.icon size={20} />
      <span className="adm-spine-tip">{item.label}</span>
    </NavLink>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const isLight = resolved === "light";
  const themeLabel = isLight ? "Switch to dark mode" : "Switch to light mode";

  return (
    <div className="pk-kit flex min-h-dvh bg-bg text-text">
      {/* PillarStyle carries the Modern Motion theme + the shared pk-* styles,
          mounted once for the whole admin. The spine styles live in the block
          below, also scoped to .pk-kit. */}
      <PillarStyle />
      <AdminSpineStyle />

      {/* Desktop icon spine (lg+). */}
      <aside className="adm-spine hidden lg:flex">
        <NavLink to="/admin" end className="adm-spine-logo" aria-label="Command home">
          H
        </NavLink>
        <nav className="adm-spine-nav">
          {SPINE_NAV.map((item) => (
            <SpineLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="adm-spine-sp" />
        <button onClick={toggle} className="adm-spine-btn" aria-label={themeLabel}>
          {isLight ? <Moon size={18} /> : <Sun size={18} />}
          <span className="adm-spine-tip">{themeLabel}</span>
        </button>
        <NavLink
          to="/admin/settings"
          className={({ isActive }) => `adm-spine-btn${isActive ? " on" : ""}`}
          aria-label="Settings"
        >
          <Settings size={18} />
          <span className="adm-spine-tip">Settings</span>
        </NavLink>
        <button onClick={() => void signOut()} className="adm-spine-btn danger" aria-label="Sign out">
          <LogOut size={18} />
          <span className="adm-spine-tip">Sign out</span>
        </button>
        <span className="adm-spine-avatar" title={admin?.email ?? "Admin"} aria-hidden>
          {initials(admin?.email)}
        </span>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar (below lg): brand, theme + sign out, then scrollable nav. */}
        <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="adm-brandmark !h-[26px] !w-[26px] !rounded-[8px] !text-[13px]" aria-hidden>
              H
            </span>
            <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">Hauck Admin</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={toggle} className="adm-iconbtn !h-9 !w-9" aria-label={themeLabel}>
                {isLight ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button
                onClick={() => void signOut()}
                className="adm-iconbtn danger !h-9 !w-9"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
          <nav className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5">
            {[...SPINE_NAV, { to: "/admin/settings", label: "Settings", icon: Settings, end: false }].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
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

// Spine styles, scoped to .pk-kit so they read the Modern Motion tokens and
// work in light and dark. Ported from the approved mockup spine but using the
// shared CSS variables instead of raw hex.
function AdminSpineStyle() {
  return (
    <style>{`
      .pk-kit .adm-spine {
        position: sticky; top: 0; height: 100dvh; width: 66px; flex-shrink: 0;
        flex-direction: column; align-items: center; gap: 4px; padding: 14px 0;
        background: rgba(255,255,255,0.60);
        backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
        border-right: 1px solid rgba(120,115,160,0.16); z-index: 30;
      }
      [data-theme="dark"] .pk-kit .adm-spine { background: rgba(18,22,31,0.55); border-right-color: rgba(255,255,255,0.07); }
      .pk-kit .adm-spine-logo {
        width: 40px; height: 40px; border-radius: 12px; margin-bottom: 10px;
        background: var(--grad-brand); box-shadow: var(--shadow-brand);
        display: grid; place-items: center; color: #fff;
        font-family: var(--font-display); font-weight: 700; font-size: 18px; text-decoration: none;
      }
      .pk-kit .adm-spine-nav { display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .pk-kit .adm-spine-sp { flex: 1; }
      .pk-kit .adm-spine-btn {
        position: relative; width: 44px; height: 44px; border-radius: 12px;
        display: grid; place-items: center; color: var(--text-faint);
        border: 0; background: transparent; cursor: pointer; text-decoration: none;
        transition: color .15s, background .15s;
      }
      .pk-kit .adm-spine-btn:hover { background: color-mix(in srgb, var(--surface) 72%, transparent); color: var(--text); }
      .pk-kit .adm-spine-btn.on { background: var(--brand-tint); color: var(--brand-text); }
      .pk-kit .adm-spine-btn.on::before {
        content: ""; position: absolute; left: -14px; top: 50%; transform: translateY(-50%);
        width: 3px; height: 22px; border-radius: 3px; background: var(--grad-brand);
      }
      .pk-kit .adm-spine-btn.danger:hover { color: var(--danger); }
      .pk-kit .adm-spine-tip {
        position: absolute; left: 54px; top: 50%; transform: translateY(-50%);
        white-space: nowrap; background: var(--surface); border: 1px solid var(--border);
        color: var(--text); padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 500;
        opacity: 0; pointer-events: none; transition: opacity .15s, left .15s;
        z-index: 200; box-shadow: var(--shadow-md);
      }
      .pk-kit .adm-spine-btn:hover .adm-spine-tip { opacity: 1; left: 58px; }
      .pk-kit .adm-spine-avatar {
        width: 40px; height: 40px; border-radius: 50%; margin-top: 6px;
        background: var(--grad-brand); color: #fff; box-shadow: var(--shadow-brand);
        display: grid; place-items: center;
        font-family: var(--font-display); font-size: 13px; font-weight: 600;
      }
    `}</style>
  );
}

function initials(email?: string | null): string {
  if (!email) return "HM";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[.\-_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "HM";
}

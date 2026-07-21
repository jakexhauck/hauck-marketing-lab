import { Fragment, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  Handshake,
  HeartHandshake,
  Wrench,
  PhoneCall,
  Settings,
  LogOut,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { PillarStyle } from "../../components/pillars/PillarKit";

// The admin console chrome: a labelled sidebar (the same shape and row
// treatment as the client app's rail, so the two consoles read as one product)
// plus each page's own body. The upper zone is the org chart: a Command home,
// then the value chain Acquisition -> Sales -> Fulfillment, with Operations as
// the foundation. All five are AGENCY-level surfaces: they describe how Hauck
// Marketing itself is running.
//
// Below a divider sits the client-work zone. The Setter Suite is not a pillar:
// it is where our setters work a *client's* leads, so it deliberately sits
// outside the agency org chart rather than under Sales.
//
// The Modern Motion theme is scoped to .pk-kit so it themes the whole admin
// without touching the client app, and PillarStyle is mounted once here.

interface NavRow {
  to: string;
  label: string;
  icon: LucideIcon;
  // Command matches only its exact path; every other item matches its subtree
  // (e.g. Fulfillment is active for any /admin/delivery/:tenantId).
  end?: boolean;
}

// The agency pillars. Sales is the agency's own sales performance (the Sales
// Data pillar), NOT the per-client lead-working board.
const PILLAR_NAV: NavRow[] = [
  { to: "/admin", label: "Command", icon: LayoutDashboard, end: true },
  { to: "/admin/pillar/acquisition", label: "Acquisition", icon: Megaphone },
  { to: "/admin/pillar/sales", label: "Sales", icon: Handshake },
  { to: "/admin/delivery", label: "Fulfillment", icon: HeartHandshake },
  { to: "/admin/pillar/operations", label: "Operations", icon: Wrench },
];

// Client-work surfaces, below the divider. One row today; the zone is built to
// take more without rework.
const CLIENT_NAV: NavRow[] = [
  { to: "/admin/setter", label: "Setter Suite", icon: PhoneCall },
];

// Every row the phone's horizontal nav shows, in sidebar order.
const ALL_NAV: NavRow[] = [...PILLAR_NAV, ...CLIENT_NAV];

// One sidebar row. Active is the brand gradient pill; hover nudges right by a
// half-pixel, matching the client rail exactly so the two never drift apart.
function NavRowLink({ item }: { item: NavRow }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        [
          "group relative mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-[color,background,transform] duration-200",
          isActive
            ? "text-white shadow-[var(--shadow-brand)]"
            : "text-[var(--text)] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]",
        ].join(" ")
      }
      style={({ isActive }) => (isActive ? { backgroundImage: "var(--grad-brand)" } : undefined)}
    >
      <item.icon size={17} className="shrink-0 opacity-80" />
      {item.label}
    </NavLink>
  );
}

// A footer control that is a button rather than a link (theme, sign out). Same
// geometry as NavRowLink so the footer column lines up with the nav column.
function FooterButton({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "mb-0.5 flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-[color,background,transform] duration-200",
        "hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]",
        danger ? "text-[var(--text)] hover:text-[var(--danger)]" : "text-[var(--text)]",
      ].join(" ")}
    >
      <Icon size={16} className="shrink-0 opacity-80" />
      {label}
    </button>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const isLight = resolved === "light";
  const themeLabel = isLight ? "Switch to dark mode" : "Switch to light mode";

  return (
    // Desktop (lg+): lock the frame to the available height (h-full resolves
    // against .app-shell, so it already excludes any app-wide banner) and clip
    // it. The rail and the content column each fill that fixed height; the
    // content column owns the scroll. That keeps the rail perfectly still on
    // every page, rather than relying on a sticky rail whose sticky travel
    // collapses to zero once its flex parent is shrunk to one viewport. This
    // mirrors Shell.tsx exactly. Below lg the phone keeps its document scroll.
    <div className="pk-kit flex min-h-dvh bg-bg text-text lg:h-full lg:min-h-0 lg:overflow-hidden">
      {/* PillarStyle carries the Modern Motion theme + the shared pk-* styles,
          mounted once for the whole admin. The spine styles live in the block
          below, also scoped to .pk-kit. */}
      <PillarStyle />
      <AdminSpineStyle />

      {/* Desktop sidebar (lg+). */}
      <aside className="adm-rail hidden lg:flex">
        {/* Brand mark */}
        <NavLink to="/admin" end className="adm-rail-brand" aria-label="Command home">
          <span className="adm-rail-brand-mark" aria-hidden>
            H
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-[15px] font-semibold leading-tight text-[var(--text)]">
              Hauck Admin
            </span>
            <span className="block truncate text-[11px] text-[var(--text-faint)]">Agency console</span>
          </span>
        </NavLink>

        {/* Agency pillars, then the client-work zone behind a divider. */}
        <nav className="flex-1 overflow-y-auto px-3 py-1">
          {PILLAR_NAV.map((item) => (
            <NavRowLink key={item.to} item={item} />
          ))}
          <div className="my-3 border-t border-[var(--border)]" />
          {CLIENT_NAV.map((item) => (
            <NavRowLink key={item.to} item={item} />
          ))}
        </nav>

        {/* Footer controls */}
        <div className="border-t border-[var(--border)] px-3 py-3">
          <NavLink
            to="/admin/settings"
            className={({ isActive }) =>
              [
                "mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-[color,background,transform] duration-200",
                isActive
                  ? "text-white shadow-[var(--shadow-brand)]"
                  : "text-[var(--text)] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]",
              ].join(" ")
            }
            style={({ isActive }) =>
              isActive ? { backgroundImage: "var(--grad-brand)" } : undefined
            }
          >
            <Settings size={16} className="shrink-0 opacity-80" /> Settings
          </NavLink>
          <FooterButton
            icon={isLight ? Moon : Sun}
            label={isLight ? "Dark mode" : "Light mode"}
            onClick={toggle}
          />
          <FooterButton icon={LogOut} label="Sign out" onClick={() => void signOut()} danger />
          <div className="mt-2 flex items-center gap-2.5 border-t border-[var(--border)] px-3 pt-3">
            <span className="adm-rail-avatar" aria-hidden>
              {initials(admin?.email)}
            </span>
            <span
              className="min-w-0 truncate text-[12px] text-[var(--text-faint)]"
              title={admin?.email ?? "Admin"}
            >
              {admin?.email ?? "Admin"}
            </span>
          </div>
        </div>
      </aside>

      {/* On lg this column fills the locked frame and is the single scroll
          container. Admin pages remount per route, so it starts at the top on
          navigation without needing ScrollToTop. */}
      <div className="flex min-w-0 flex-1 flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto">
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
          {/* Same order as the sidebar, with the client-work zone kept visually
              separate by a hairline rather than a horizontal divider. */}
          <nav className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2.5">
            {ALL_NAV.map((item, i) => (
              <Fragment key={item.to}>
                {i === PILLAR_NAV.length && (
                  <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden />
                )}
                <NavLink
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
              </Fragment>
            ))}
            <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden />
            <NavLink
              to="/admin/settings"
              className={({ isActive }) =>
                [
                  "flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors",
                  isActive ? "adm-nav-item on" : "text-muted hover:bg-surface-2 hover:text-text",
                ].join(" ")
              }
            >
              <Settings size={15} className="shrink-0" />
              Settings
            </NavLink>
          </nav>
        </header>

        {/* Each admin page renders its own content. */}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

// Sidebar styles, scoped to .pk-kit so they read the Modern Motion tokens and
// work in light and dark. The glass treatment and width match the client app's
// rail; the row treatment itself is Tailwind on the components above, shared
// with the client rail so the two consoles cannot drift apart.
function AdminSpineStyle() {
  return (
    <style>{`
      .pk-kit .adm-rail {
        height: 100%; width: 244px; flex-shrink: 0;
        flex-direction: column; padding: 0 0 0 0;
        background: rgba(255,255,255,0.60);
        backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
        border-right: 1px solid rgba(120,115,160,0.16); z-index: 30;
      }
      [data-theme="dark"] .pk-kit .adm-rail { background: rgba(18,22,31,0.55); border-right-color: rgba(255,255,255,0.07); }
      .pk-kit .adm-rail-brand {
        display: flex; align-items: center; gap: 10px;
        padding: 16px 16px 16px 16px; text-decoration: none;
      }
      .pk-kit .adm-rail-brand-mark {
        width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
        background: var(--grad-brand); box-shadow: var(--shadow-brand);
        display: grid; place-items: center; color: #fff;
        font-family: var(--font-display); font-weight: 700; font-size: 14px;
      }
      .pk-kit .adm-rail-avatar {
        width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
        background: var(--grad-brand); color: #fff; box-shadow: var(--shadow-brand);
        display: grid; place-items: center;
        font-family: var(--font-display); font-size: 11px; font-weight: 600;
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

import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Handshake,
  HeartHandshake,
  Wrench,
  PhoneCall,
  Settings,
  LogOut,
  Sun,
  Moon,
  Users,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { getPillar, resolvePillarTab, type PillarId } from "../../lib/adminPillars";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { PillarStyle } from "../../components/pillars/PillarKit";
import { effectiveAdminRole, type AdminRole } from "../../lib/adminRoles";
import UpdateDialog from "../../components/admin/UpdateDialog";

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

// A page inside a pillar. Pillar tabs live on the pillar route behind ?tab=, so
// `to` carries the query and the pillar/tab pair is kept alongside it: the
// default tab renders with no ?tab= in the URL, and matching on the string alone
// would leave the first child looking inactive on arrival.
interface NavChild {
  to: string;
  label: string;
  pillar?: PillarId;
  tab?: string;
}

interface NavRow {
  to: string;
  label: string;
  icon: LucideIcon;
  // Command matches only its exact path; every other item matches its subtree
  // (e.g. Fulfillment is active for any /admin/delivery/:tenantId).
  end?: boolean;
  // Compact label for the phone bottom bar, where seven tabs share one row and
  // the full label ("Fulfillment", "Setter Suite") will not fit. Falls back to
  // `label` when unset.
  short?: string;
  // Sub-pages. A row with children expands in the desktop rail; the parent is
  // still a real page, so clicking it opens the group and navigates.
  children?: NavChild[];
}

// A pillar as a rail group: every tab the pillar page offers becomes a child, so
// the rail is generated from lib/adminPillars rather than a second hand-kept
// list that quietly drifts when a tab is added.
function pillarGroup(id: PillarId, icon: LucideIcon, short?: string): NavRow {
  const pillar = getPillar(id);
  const to = `/admin/pillar/${id}`;
  return {
    to,
    label: pillar?.label ?? id,
    icon,
    short,
    children: (pillar?.tabs ?? []).map((t) => ({
      to: `${to}?tab=${t.id}`,
      label: t.label,
      pillar: id,
      tab: t.id,
    })),
  };
}

// The agency pillars. Sales is the agency's own sales performance (the Sales
// Data pillar), NOT the per-client lead-working board.
//
// Fulfillment is the exception to the generated groups: its pages are real
// routes rather than tabs on one page. The Setter Suite sits inside it because
// that is what it is, the work of delivering for a client.
const PILLAR_NAV: NavRow[] = [
  { to: "/admin", label: "Command", icon: LayoutDashboard, end: true },
  pillarGroup("acquisition", Megaphone, "Acq"),
  pillarGroup("sales", Handshake),
  {
    to: "/admin/delivery",
    label: "Fulfillment",
    icon: HeartHandshake,
    short: "Fulfill",
    children: [
      { to: "/admin/delivery", label: "Clients" },
      { to: "/admin/onboarding", label: "Onboarding" },
      { to: "/admin/setter", label: "Setter Suite" },
    ],
  },
  pillarGroup("operations", Wrench, "Ops"),
];

// Client-work surfaces, below the divider. Empty for an owner now that the
// Setter Suite lives inside Fulfillment; a setter's whole rail is this one row.
const CLIENT_NAV: NavRow[] = [
  { to: "/admin/setter", label: "Setter Suite", icon: PhoneCall, short: "Setter" },
];

// What each role's rail contains (0047). A hired role does not see the agency
// org chart at all: they get their own surface and nothing else. This is
// cosmetic. The API refuses everything outside their role regardless of what is
// rendered here, so a typed URL gets them a 403, not a back door.
interface RoleNav {
  pillars: NavRow[];
  client: NavRow[];
  // Where the brand mark and any redirect send this role.
  home: string;
}

const ROLE_NAV: Record<AdminRole, RoleNav> = {
  owner: { pillars: PILLAR_NAV, client: [], home: "/admin" },
  cold_caller: {
    // One item, pointed at the real section rather than a landing page of its
    // own: what he needs IS Cold Call, and a second front door would only be a
    // page to click through. The section hides Settings from him, and the API
    // refuses everything else regardless of what is rendered.
    pillars: [
      {
        to: "/admin/pillar/acquisition?tab=cold-call",
        label: "Cold Calling",
        icon: PhoneCall,
        short: "Calling",
      },
    ],
    client: [],
    home: "/admin/pillar/acquisition?tab=cold-call",
  },
  setter: { pillars: [], client: CLIENT_NAV, home: "/admin/setter" },
};

export function adminHomeFor(role: AdminRole): string {
  return ROLE_NAV[role].home;
}

// The phone bottom bar is the four pillars split around a raised center button
// (Command). Acquisition + Sales sit left of it, Fulfillment + Operations
// right, matching the desktop rail's pillar order. The center button is not a
// pillar: it opens the Command hub (the app launcher at /admin/apps), which is
// where the Setter Suite and every future app live. Settings moves to the
// header gear rather than taking a bottom slot.
const BOTTOM_LEFT: NavRow[] = [PILLAR_NAV[1], PILLAR_NAV[2]]; // Acquisition, Sales
const BOTTOM_RIGHT: NavRow[] = [PILLAR_NAV[3], PILLAR_NAV[4]]; // Fulfillment, Operations

// Is this child the page currently on screen? A pillar tab is matched through
// the pillar's own resolver so the default tab reads as active on arrival, when
// the URL still carries no ?tab=. Everything else matches its route subtree.
function useChildActive(child: NavChild): boolean {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  if (child.pillar && child.tab) {
    if (location.pathname !== `/admin/pillar/${child.pillar}`) return false;
    return resolvePillarTab(child.pillar, searchParams.get("tab")) === child.tab;
  }
  const path = child.to.split("?")[0];
  return location.pathname === path || location.pathname.startsWith(`${path}/`);
}

// One sub-page row inside an expanded group. Indented under the guide rule, and
// smaller than a parent row so the hierarchy is legible at a glance.
function NavChildLink({ child }: { child: NavChild }) {
  const active = useChildActive(child);
  return (
    <NavLink
      to={child.to}
      className={[
        "mb-0.5 flex items-center rounded-[9px] px-3 py-2 text-[13px] font-medium transition-[color,background,transform] duration-200",
        active
          ? "text-white shadow-[var(--shadow-brand)]"
          : "text-[var(--text-muted)] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] hover:text-[var(--text)]",
      ].join(" ")}
      style={active ? { backgroundImage: "var(--grad-brand)" } : undefined}
    >
      {child.label}
    </NavLink>
  );
}

// A pillar row that owns sub-pages. The parent is itself a real page (the pillar
// opens on its first tab), so clicking it both expands the group and navigates.
// The group stays open whenever the route is inside it, so a deep link or the
// back button never lands on a collapsed section.
function NavRowGroup({ item }: { item: NavRow }) {
  const location = useLocation();
  const navigate = useNavigate();
  const children = item.children ?? [];
  const parentPath = item.to.split("?")[0];
  const within =
    location.pathname === parentPath ||
    location.pathname.startsWith(`${parentPath}/`) ||
    children.some((c) => {
      const p = c.to.split("?")[0];
      return location.pathname === p || location.pathname.startsWith(`${p}/`);
    });
  const [open, setOpen] = useState(within);

  useEffect(() => {
    if (within) setOpen(true);
  }, [within]);

  const Icon = item.icon;
  return (
    <div className="mb-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          if (location.pathname !== item.to) navigate(item.to);
        }}
        className={[
          "group relative flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-[color,background,transform] duration-200",
          within
            ? "bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] text-[var(--brand-text)]"
            : "text-[var(--text)] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]",
        ].join(" ")}
      >
        <Icon size={17} className="shrink-0 opacity-80" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          size={15}
          className={[
            "shrink-0 opacity-60 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>
      {open && (
        <div className="ml-[22px] mt-0.5 flex flex-col border-l border-[var(--divider)] pl-2.5">
          {children.map((child) => (
            <NavChildLink key={child.to} child={child} />
          ))}
        </div>
      )}
    </div>
  );
}

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
  const role = effectiveAdminRole(admin?.role);
  const isOwnerAdmin = role === "owner";
  const nav = ROLE_NAV[role];
  // The phone's split-around-hub bar is the owner's five-surface layout. A role
  // with one surface gets a plain row instead: a raised center button leading to
  // an app launcher they cannot use is worse than no launcher.
  const bottomLeft = isOwnerAdmin ? BOTTOM_LEFT : [];
  const bottomRight = isOwnerAdmin ? BOTTOM_RIGHT : [];

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

      {/* "Here is what changed", once per person per release. Mounted on the
          shell rather than on a page, so it reaches whoever signs in wherever
          they land. Renders nothing when there is nothing new. */}
      <UpdateDialog />

      {/* Desktop sidebar (lg+). */}
      <aside className="adm-rail hidden lg:flex">
        {/* Brand mark */}
        <NavLink to={nav.home} end className="adm-rail-brand" aria-label="Command home">
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

        {/* Agency pillars, then the client-work zone behind a divider. Both
            lists come from the role, so a hired role sees only its own. */}
        <nav className="flex-1 overflow-y-auto px-3 py-1">
          {nav.pillars.map((item) =>
            item.children?.length ? (
              <NavRowGroup key={item.to} item={item} />
            ) : (
              <NavRowLink key={item.to} item={item} />
            ),
          )}
          {nav.pillars.length > 0 && nav.client.length > 0 && (
            <div className="my-3 border-t border-[var(--border)]" />
          )}
          {nav.client.map((item) => (
            <NavRowLink key={item.to} item={item} />
          ))}
        </nav>

        {/* Footer controls */}
        <div className="border-t border-[var(--border)] px-3 py-3">
          {/* Team sits with Settings rather than in the org chart: it is account
              administration, not a pillar of the business. Owners only. */}
          {isOwnerAdmin && (
            <NavLink
              to="/admin/team"
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
              <Users size={16} className="shrink-0 opacity-80" /> Team
            </NavLink>
          )}
          {isOwnerAdmin && (
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
          )}
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
        {/* Phone top bar (below lg): brand + theme + sign out only. Navigation
            moved to the fixed bottom bar below; the brand mark links home. */}
        <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <NavLink to={nav.home} end className="flex items-center gap-3" aria-label="Command home">
              <span className="adm-brandmark !h-[26px] !w-[26px] !rounded-[8px] !text-[13px]" aria-hidden>
                H
              </span>
              <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">Hauck Admin</span>
            </NavLink>
            <div className="ml-auto flex items-center gap-1.5">
              {isOwnerAdmin && (
                <NavLink
                  to="/admin/team"
                  className={({ isActive }) =>
                    `adm-iconbtn !h-9 !w-9${isActive ? " on" : ""}`
                  }
                  aria-label="Team"
                >
                  <Users size={16} />
                </NavLink>
              )}
              {isOwnerAdmin && (
              <NavLink
                to="/admin/settings"
                className={({ isActive }) =>
                  `adm-iconbtn !h-9 !w-9${isActive ? " on" : ""}`
                }
                aria-label="Settings"
              >
                <Settings size={16} />
              </NavLink>
              )}
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
        </header>

        {/* Each admin page renders its own content. Padded on the phone so page
            content clears the fixed bottom bar. */}
        <main className="flex min-h-0 flex-1 flex-col pb-[calc(62px+env(safe-area-inset-bottom,0px))] lg:pb-0">
          {children}
        </main>
      </div>

      {/* Phone bottom tab bar (below lg). For an owner: the four pillars split
          around the raised Command hub button, in the same order as the desktop
          rail. For a hired role: a plain row of the one or two surfaces they
          have, with no hub button, since the launcher only holds owner apps. */}
      <nav className="adm-bottombar" aria-label="Primary">
        {!isOwnerAdmin && (
          <div className="adm-bottomside" style={{ flex: 1, justifyContent: "center" }}>
            {[...nav.pillars, ...nav.client].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `adm-bottomtab${isActive ? " on" : ""}`}
              >
                <item.icon size={18} className="shrink-0" aria-hidden />
                <span>{item.short ?? item.label}</span>
              </NavLink>
            ))}
          </div>
        )}
        {isOwnerAdmin && (
        <div className="adm-bottomside">
          {bottomLeft.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `adm-bottomtab${isActive ? " on" : ""}`}
            >
              <item.icon size={18} className="shrink-0" aria-hidden />
              <span>{item.short ?? item.label}</span>
            </NavLink>
          ))}
        </div>

        )}

        {isOwnerAdmin && (
        <div className="adm-hubwrap">
          <NavLink
            to="/admin/apps"
            className={({ isActive }) => `adm-hubbtn${isActive ? " on" : ""}`}
            aria-label="Command"
          >
            <LayoutGrid size={24} aria-hidden />
          </NavLink>
          <span className="adm-hublabel">Command</span>
        </div>
        )}

        {isOwnerAdmin && (
        <div className="adm-bottomside">
          {bottomRight.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `adm-bottomtab${isActive ? " on" : ""}`}
            >
              <item.icon size={18} className="shrink-0" aria-hidden />
              <span>{item.short ?? item.label}</span>
            </NavLink>
          ))}
        </div>
        )}
      </nav>
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

      /* Phone bottom tab bar. Hidden on desktop (the rail is the nav there);
         on phones, the four pillars split around a raised center Command hub.
         Scoped to .pk-kit so it reads the Modern Motion tokens light and dark. */
      .pk-kit .adm-bottombar { display: none; }
      @media (max-width: 1023.98px) {
        .pk-kit .adm-bottombar {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
          display: flex; align-items: stretch;
          padding: 5px 4px calc(5px + env(safe-area-inset-bottom, 0px));
          background: color-mix(in srgb, var(--surface) 90%, transparent);
          backdrop-filter: blur(18px) saturate(1.4);
          -webkit-backdrop-filter: blur(18px) saturate(1.4);
          border-top: 1px solid var(--border);
        }
        /* Each side holds two pillar tabs, spread evenly; the hub wrapper in
           between is a fixed width so the two sides stay balanced. */
        .pk-kit .adm-bottomside {
          flex: 1 1 0; min-width: 0;
          display: flex; align-items: stretch; justify-content: space-around;
        }
        .pk-kit .adm-bottomtab {
          flex: 1 1 0; min-width: 0;
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 4px 1px; text-decoration: none;
          color: var(--text-muted); font-size: 10px; font-weight: 600;
          transition: color .14s;
        }
        .pk-kit .adm-bottomtab.on { color: var(--brand-text); }
        .pk-kit .adm-bottomtab svg { opacity: .85; }
        .pk-kit .adm-bottomtab.on svg { opacity: 1; }
        .pk-kit .adm-bottomtab span {
          line-height: 1; white-space: nowrap;
          max-width: 100%; overflow: hidden; text-overflow: ellipsis;
        }

        /* The raised center hub: a brand-gradient circle lifted above the bar,
           ringed in the surface color so it reads as floating over it. */
        .pk-kit .adm-hubwrap {
          flex: 0 0 74px; width: 74px;
          display: flex; flex-direction: column; align-items: center; gap: 2px;
        }
        .pk-kit .adm-hubbtn {
          width: 56px; height: 56px; border-radius: 50%;
          margin-top: -22px; flex-shrink: 0;
          display: grid; place-items: center; color: #fff;
          background: var(--grad-brand); box-shadow: var(--shadow-brand);
          border: 4px solid var(--surface);
          transition: transform .16s ease;
        }
        .pk-kit .adm-hubbtn:active { transform: scale(0.94); }
        .pk-kit .adm-hubbtn.on { box-shadow: var(--shadow-brand), 0 0 0 3px color-mix(in srgb, var(--brand) 30%, transparent); }
        .pk-kit .adm-hublabel {
          margin-top: -2px; line-height: 1;
          font-size: 10px; font-weight: 600; color: var(--text-muted);
        }
      }

      /* Restyled scrollbars for EVERY admin scroll container (the content
         column, board wells, cockpit, inbox lists, overlays). Scoped to
         .pk-kit so the client app keeps its native bars. A slim rounded
         thumb floating on a transparent track; the 2px transparent border +
         padding-box clip insets the pill from the edge. Hover deepens it,
         and it picks up the brand on active drag. */
      .pk-kit *::-webkit-scrollbar { width: 10px; height: 10px; }
      .pk-kit *::-webkit-scrollbar-track { background: transparent; }
      .pk-kit *::-webkit-scrollbar-corner { background: transparent; }
      .pk-kit *::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, var(--text-faint) 34%, transparent);
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: padding-box;
      }
      .pk-kit *::-webkit-scrollbar-thumb:hover {
        background: color-mix(in srgb, var(--text-faint) 55%, transparent);
        border: 2px solid transparent;
        background-clip: padding-box;
      }
      .pk-kit *::-webkit-scrollbar-thumb:active {
        background: color-mix(in srgb, var(--brand) 65%, transparent);
        border: 2px solid transparent;
        background-clip: padding-box;
      }
      /* Firefox has no scrollbar pseudo-elements; give it the thin tinted
         equivalent. Kept inside a -moz-only support gate because Chrome 121+
         would otherwise prefer these standard properties and IGNORE the
         styled pill above. */
      @supports (-moz-appearance: none) {
        .pk-kit * {
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--text-faint) 45%, transparent) transparent;
        }
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

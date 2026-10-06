import { Fragment, createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import {
  LayoutGrid,
  ClipboardList,
  MessageSquare,
  PhoneCall,
  Settings,
  LogOut,
  Sun,
  Moon,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Target,
  SquareKanban,
  ChartColumn,
  Layers,
  type LucideIcon,
  MessagesSquare,
  Wallet,
} from "lucide-react";
import { resolvePillarTab, type PillarId } from "../../lib/adminPillars";
import { clientNavGroups, clientPath, parseClientPath, type ClientNavRow } from "../../lib/clientNav";
import { useAdminClientsQuery } from "../../hooks/useApi";
import ClientStrip from "../../components/admin/ClientStrip";
import ClientSheet from "../../components/admin/ClientSheet";
import { clientRowIcon } from "../../components/admin/clientRowIcons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { PillarStyle } from "../../components/pillars/PillarKit";
import { effectiveAdminRole, type AdminRole } from "../../lib/adminRoles";
import UpdateDialog from "../../components/admin/UpdateDialog";
import ClientMark from "../../components/ClientMark";

// The admin console chrome: a sidebar (the same shape and row treatment as the
// client app's rail, so the two consoles read as one product) plus each page's
// own body. Every agency page is an inline row, top of rail to bottom in
// org-chart order under three DEAD pillar captions (Operations, Acquisition,
// Sales): labels only, nothing clickable or expandable. All of them are
// AGENCY-level surfaces: they describe how Hauck Marketing itself is running.
//
// Client work is not in that list (Jake, 2026-10-05). For an owner, a client
// strip sits left of the rail (ClientStrip): the Agency chip shows the rows
// above, a client's chip swaps the whole rail to that client's pages
// (lib/clientNav), GHL sub-account style. The address says which, so the rail
// reads it straight off the URL.
//
// Below a divider sits the client-work zone. The Setter Suite is not agency
// work: it is where our setters work a *client's* leads, so for a setter role
// it sits alone below the rule.
//
// The Modern Motion theme is scoped to .pk-kit so it themes the whole admin
// without touching the client app, and PillarStyle is mounted once here.

// One rail row: one page. Since 2026-08-23 the rail carries every page INLINE,
// so a row is a destination and nothing more.
interface NavRow {
  to: string;
  label: string;
  icon: LucideIcon;
  // A row that IS a pillar tab (Tasks, Inbox, Clients, Cold Call, Pipeline all
  // live on /admin/pillar/:pillar). Carried because NavLink's own isActive
  // ignores the query string, so rows sharing one path would all light up at
  // once without it.
  pillar?: PillarId;
  tab?: string;
  // A row matches its subtree unless this says otherwise.
  end?: boolean;
  // Compact label for the phone bottom bar, where four tabs share one row and
  // the full label ("Onboarding") will not fit. Falls back to `label`.
  short?: string;
}

// A pillar tab as its own inline rail row. The rail is generated from
// lib/adminPillars (and lib/fulfillmentPages below), not hand-kept, so adding a
// tab is one line in the config and the chrome follows.
function pillarRow(
  label: string,
  pillar: PillarId,
  tab: string,
  icon: LucideIcon,
  short?: string,
): NavRow {
  return {
    to: `/admin/pillar/${pillar}?tab=${tab}`,
    label,
    icon,
    pillar,
    tab,
    short,
  };
}

// The agency's pages, top of rail to bottom, in org-chart order, with the
// pillar names back as CAPTIONS (Jake, 2026-08-23). A caption is a label and
// nothing else: not a link, not a toggle, no chevron and no hover state, so
// there is nothing to click into and nothing to expand. The pages under each
// one stay the same inline rows the flattened rail introduced.
//
// Kept as groups even though every consumer outside the desktop rail wants the
// flat list, because the grouping IS the org chart; PILLAR_NAV below is the
// flatten of these, and it is what everything else reads.
interface RailGroup {
  caption: string;
  rows: NavRow[];
}

const PILLAR_GROUPS: RailGroup[] = [
  {
    caption: "Operations",
    rows: [
      pillarRow("Tasks", "operations", "tasks", ClipboardList),
      pillarRow("Inbox", "operations", "inbox", MessageSquare),
      pillarRow("Budget", "operations", "budget", Wallet),
    ],
  },
  {
    // Acquisition: sourcing first (Leads), then the daily work (Cold Call,
    // then Cold SMS).
    caption: "Acquisition",
    rows: [
      pillarRow("Leads", "acquisition", "leads", Target),
      pillarRow("Cold Call", "acquisition", "cold-call", PhoneCall, "Calling"),
      pillarRow("Cold SMS", "acquisition", "sms", MessagesSquare, "SMS"),
    ],
  },
  {
    // Sales: two pages. Short names because each stands alone as a rail row.
    caption: "Sales",
    rows: [
      pillarRow("Pipeline", "sales", "pipeline", SquareKanban),
      pillarRow("Data", "sales", "sales-data", ChartColumn),
    ],
  },
];

const PILLAR_NAV: NavRow[] = PILLAR_GROUPS.flatMap((group) => group.rows);

// Client-work surfaces, below the divider. Empty for an owner, whose client
// work is behind the strip; a setter's whole rail is this one row.
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
  // Home follows the rail: Command is no longer a row, so landing an owner on it
  // would open a page the chrome does not show. Tasks is the new top row.
  owner: { pillars: PILLAR_NAV, client: [], home: "/admin/pillar/operations?tab=tasks" },
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

// The phone bottom bar is four pages split around a raised center button
// (Command). The center button is not a page: it opens the Command hub (the
// app launcher at /admin/apps), which is where everything else lives. Settings
// moves to the header gear rather than taking a bottom slot.
// Tasks and Inbox sit left because they are the two opened without thinking
// about it; Budget right, then Accounts, the phone's client strip (a sheet,
// not a page, so it is a button rather than a row here). Everything else is one tap away through the hub launcher, so
// the bar stays four tabs no matter how long the rail grows.
const BOTTOM_LEFT: NavRow[] = [
  pillarRow("Tasks", "operations", "tasks", ClipboardList),
  pillarRow("Inbox", "operations", "inbox", MessageSquare),
];
const BOTTOM_RIGHT: NavRow[] = [pillarRow("Budget", "operations", "budget", Wallet)];

// Collapsed rail. The whole desktop rail can shrink to an icon column so a wide
// page (a board, the cockpit) gets the width back. Read through a context rather
// than threaded as a prop, because every row treatment below needs it and the
// rows are drawn from three separate lists.
const RailCollapsed = createContext(false);
const useRailCollapsed = () => useContext(RailCollapsed);

// Remembered per browser: a rail that springs back open on every navigation is
// worse than no toggle at all.
const COLLAPSE_KEY = "hauck.admin.rail.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

// Row geometry when the rail is an icon column: the label is gone, so the icon
// centers itself in the narrower track and the row becomes a square target.
const COLLAPSED_ROW = "justify-center !px-0 hover:!translate-x-0";

// Is this child the page currently on screen? A pillar tab is matched through
// the pillar's own resolver so the default tab reads as active on arrival, when
// the URL still carries no ?tab=. Everything else matches its route subtree.
function useChildActive(child: { to: string; pillar?: PillarId; tab?: string }): boolean {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  if (child.pillar && child.tab) {
    if (location.pathname !== `/admin/pillar/${child.pillar}`) return false;
    return resolvePillarTab(child.pillar, searchParams.get("tab")) === child.tab;
  }
  const path = child.to.split("?")[0];
  return location.pathname === path || location.pathname.startsWith(`${path}/`);
}

// One sidebar row. Active is the brand gradient pill; hover nudges right by a
// half-pixel, matching the client rail exactly so the two never drift apart.
function NavRowLink({ item }: { item: NavRow }) {
  const collapsed = useRailCollapsed();
  // Tasks, Inbox and Clients share one path and differ only by ?tab=, which
  // NavLink's own isActive cannot see. Resolve those through the pillar's
  // resolver (the same one the child rows use) and let every other row keep
  // NavLink's subtree matching.
  const tabActive = useChildActive(item);
  const isTabRow = !!(item.pillar && item.tab);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          "group relative mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-[color,background,transform] duration-200",
          (isTabRow ? tabActive : isActive)
            ? "text-white shadow-[var(--shadow-brand)]"
            : "text-[var(--text)] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]",
          collapsed ? COLLAPSED_ROW : "",
        ].join(" ")
      }
      style={({ isActive }) =>
        (isTabRow ? tabActive : isActive) ? { backgroundImage: "var(--grad-brand)" } : undefined
      }
    >
      <item.icon size={17} className="shrink-0 opacity-80" />
      {!collapsed && item.label}
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
  const collapsed = useRailCollapsed();
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={[
        "mb-0.5 flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-[color,background,transform] duration-200",
        "hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]",
        danger ? "text-[var(--text)] hover:text-[var(--danger)]" : "text-[var(--text)]",
        collapsed ? COLLAPSED_ROW : "",
      ].join(" ")}
    >
      <Icon size={16} className="shrink-0 opacity-80" />
      {!collapsed && label}
    </button>
  );
}

// One phone bottom-bar tab. Exists so the bar shares NavRowLink's ?tab=
// awareness: three of the rows sit on /admin/pillar/operations and NavLink's
// own isActive would light all three at once.
function BottomTab({ item }: { item: NavRow }) {
  const tabActive = useChildActive(item);
  const isTabRow = !!(item.pillar && item.tab);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `adm-bottomtab${(isTabRow ? tabActive : isActive) ? " on" : ""}`
      }
    >
      <item.icon size={18} className="shrink-0" aria-hidden />
      <span>{item.short ?? item.label}</span>
    </NavLink>
  );
}

// A footer link (Team, Settings). Same geometry as FooterButton so the account
// zone reads as one column whether the row navigates or acts.
function FooterLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  const collapsed = useRailCollapsed();
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        [
          "mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-[color,background,transform] duration-200",
          isActive
            ? "text-white shadow-[var(--shadow-brand)]"
            : "text-[var(--text)] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]",
          collapsed ? COLLAPSED_ROW : "",
        ].join(" ")
      }
      style={({ isActive }) => (isActive ? { backgroundImage: "var(--grad-brand)" } : undefined)}
    >
      <Icon size={16} className="shrink-0 opacity-80" />
      {!collapsed && label}
    </NavLink>
  );
}

// A caption above its run of rows. A div, deliberately: it navigates nowhere,
// expands nothing and carries no hover state, so a click lands on nothing.
// When the rail collapses to an icon column the label has nowhere to sit, so
// each group reads through a hairline rule instead.
function RailGroupCaption({ caption }: { caption: string }) {
  const collapsed = useRailCollapsed();
  if (collapsed) return <div aria-hidden className="mx-3 my-2 border-t border-[var(--border)]" />;
  return (
    <div className="select-none px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">
      {caption}
    </div>
  );
}

// One row of a client's rail. Same treatment as NavRowLink; active is matched
// on page AND sub-page, since every Paid Ads row shares the /paid-ads prefix.
function ClientRowLink({
  tenantId,
  row,
  current,
}: {
  tenantId: string;
  row: ClientNavRow;
  current: { page: string; sub: string | null };
}) {
  const collapsed = useRailCollapsed();
  const on = current.page === row.page && current.sub === row.sub;
  const Icon = clientRowIcon(row);
  return (
    <NavLink
      to={clientPath(tenantId, row.page, row.sub)}
      title={collapsed ? row.label : undefined}
      aria-label={collapsed ? row.label : undefined}
      aria-current={on ? "page" : undefined}
      className={[
        "group relative mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-[color,background,transform] duration-200",
        on
          ? "text-white shadow-[var(--shadow-brand)]"
          : "text-[var(--text)] hover:translate-x-0.5 hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]",
        collapsed ? COLLAPSED_ROW : "",
      ].join(" ")}
      style={on ? { backgroundImage: "var(--grad-brand)" } : undefined}
    >
      <Icon size={17} className="shrink-0 opacity-80" />
      {!collapsed && row.label}
    </NavLink>
  );
}

// Inside a client the rail wears that client's colour, the way their chip on
// the strip does. The derived tokens are re-declared here because a custom
// property built from var(--brand) is computed where it is declared, not where
// it is used, so overriding --brand alone would leave the gradient indigo.
function clientBrandVars(color: string): CSSProperties {
  return {
    "--brand": color,
    "--brand-2": `color-mix(in srgb, ${color} 72%, white)`,
    "--grad-brand": `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 72%, white) 100%)`,
    "--shadow-brand": `0 8px 22px color-mix(in srgb, ${color} 28%, transparent)`,
  } as CSSProperties;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  // Desktop rail width. Phone chrome ignores it entirely: the bottom bar is the
  // navigation there, so there is nothing to collapse.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* private mode: the rail just forgets between sessions */
    }
  }, [collapsed]);
  const isLight = resolved === "light";
  const themeLabel = isLight ? "Switch to dark mode" : "Switch to light mode";
  const role = effectiveAdminRole(admin?.role);
  const isOwnerAdmin = role === "owner";
  const nav = ROLE_NAV[role];
  // The phone's split-around-hub bar is the owner's four-page layout. A role
  // with one surface gets a plain row instead: a raised center button leading to
  // an app launcher they cannot use is worse than no launcher.
  const bottomLeft = isOwnerAdmin ? BOTTOM_LEFT : [];
  const bottomRight = isOwnerAdmin ? BOTTOM_RIGHT : [];

  // Which sub-account the address is in, if any. Owners only: nobody else has
  // a strip, and the client routes refuse them anyway.
  const location = useLocation();
  const clientCtx = isOwnerAdmin ? parseClientPath(location.pathname) : null;
  const clientsQuery = useAdminClientsQuery(isOwnerAdmin);
  const clients = clientsQuery.data?.clients ?? [];
  const activeClient = clientCtx ? (clients.find((c) => c.id === clientCtx.tenantId) ?? null) : null;
  const [sheetOpen, setSheetOpen] = useState(false);

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
      {isOwnerAdmin && <ClientStrip clients={clients} current={clientCtx} agencyHome={nav.home} />}

      <RailCollapsed.Provider value={collapsed}>
      <aside
        className={`adm-rail hidden lg:flex${collapsed ? " is-collapsed" : ""}`}
        style={activeClient ? clientBrandVars(activeClient.brandColor) : undefined}
      >
        {/* Brand mark, and the control that shrinks the rail to icons. */}
        <div className="adm-rail-head">
          <NavLink to={nav.home} end className="adm-rail-brand" aria-label="Command home">
            <span className="adm-rail-brand-mark" aria-hidden>
              {activeClient ? (
                <ClientMark
                  picture={activeClient.brandLogoUrl}
                  initials={activeClient.brandInitials || activeClient.name.slice(0, 2).toUpperCase()}
                />
              ) : (
                "H"
              )}
            </span>
            {!collapsed && activeClient && (
              <span className="min-w-0 truncate font-display text-[15px] font-semibold leading-tight text-[var(--text)]">
                {activeClient.name}
              </span>
            )}
            {!collapsed && !activeClient && (
              <span className="min-w-0">
                <span className="block truncate font-display text-[15px] font-semibold leading-tight text-[var(--text)]">
                  Hauck Admin
                </span>
                <span className="block truncate text-[11px] text-[var(--text-faint)]">
                  Agency console
                </span>
              </span>
            )}
          </NavLink>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="adm-rail-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Agency pages, then the client-work zone behind a divider. Both
            lists come from the role, so a hired role sees only its own. */}
        {/* Bottom padding, not just py: fourteen inline rows now, so the
            column can scroll on a short window and the last row needs
            somewhere to land clear of the pinned footer. */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
          {activeClient && clientCtx ? (
            // A client's rail: their pages, grouped as lib/clientNav groups
            // them. Captions for Paid Ads and GHL, a hairline before the rest.
            clientNavGroups(activeClient).map((group, i) => (
              <Fragment key={i}>
                {group.caption && <RailGroupCaption caption={group.caption} />}
                {group.rule && <div aria-hidden className="mx-3 my-2 border-t border-[var(--border)]" />}
                {group.rows.map((row) => (
                  <ClientRowLink
                    key={`${row.page}/${row.sub ?? ""}`}
                    tenantId={activeClient.id}
                    row={row}
                    current={clientCtx}
                  />
                ))}
              </Fragment>
            ))
          ) : isOwnerAdmin ? (
            // The owner's rail reads in pillar groups: a caption, then its
            // rows. Captions are dead labels (RailGroupCaption), so the only
            // things that navigate are the page rows themselves.
            PILLAR_GROUPS.map((group) => (
              <Fragment key={group.caption}>
                <RailGroupCaption caption={group.caption} />
                {group.rows.map((item) => (
                  <NavRowLink key={item.to} item={item} />
                ))}
              </Fragment>
            ))
          ) : (
            nav.pillars.map((item) => <NavRowLink key={item.to} item={item} />)
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
          {isOwnerAdmin && <FooterLink to="/admin/team" icon={Users} label="Team" />}
          {isOwnerAdmin && <FooterLink to="/admin/settings" icon={Settings} label="Settings" />}
          <FooterButton
            icon={isLight ? Moon : Sun}
            label={isLight ? "Dark mode" : "Light mode"}
            onClick={toggle}
          />
          <FooterButton icon={LogOut} label="Sign out" onClick={() => void signOut()} danger />
          <div
            className={[
              "mt-2 flex items-center gap-2.5 border-t border-[var(--border)] pt-3",
              collapsed ? "justify-center px-0" : "px-3",
            ].join(" ")}
          >
            <span className="adm-rail-avatar" aria-hidden title={admin?.email ?? "Admin"}>
              {initials(admin?.email)}
            </span>
            {!collapsed && (
              <span
                className="min-w-0 truncate text-[12px] text-[var(--text-faint)]"
                title={admin?.email ?? "Admin"}
              >
                {admin?.email ?? "Admin"}
              </span>
            )}
          </div>
        </div>
      </aside>
      </RailCollapsed.Provider>

      {/* On lg this column fills the locked frame and is the single scroll
          container. Admin pages remount per route, so it starts at the top on
          navigation without needing ScrollToTop. */}
      <div className="flex min-w-0 flex-1 flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto">
        {/* Phone top bar (below lg): brand + theme + sign out only. Navigation
            moved to the fixed bottom bar below; the brand mark links home. */}
        <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <NavLink to={nav.home} end className="flex items-center gap-3" aria-label="Command home">
              <span
                className="adm-brandmark !h-[26px] !w-[26px] !rounded-[8px] !text-[11px]"
                style={activeClient ? clientBrandVars(activeClient.brandColor) : undefined}
                aria-hidden
              >
                {activeClient ? (
                <ClientMark
                  picture={activeClient.brandLogoUrl}
                  initials={activeClient.brandInitials || activeClient.name.slice(0, 2).toUpperCase()}
                />
              ) : (
                "H"
              )}
              </span>
              <span className="min-w-0 truncate font-display text-[15px] font-semibold tracking-[-0.02em]">
                {activeClient ? activeClient.name : "Hauck Admin"}
              </span>
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

      {/* Phone bottom tab bar (below lg). For an owner: four pages split
          around the raised Command hub button, in the same order as the desktop
          rail. For a hired role: a plain row of the one or two surfaces they
          have, with no hub button, since the launcher only holds owner apps. */}
      <nav className="adm-bottombar" aria-label="Primary">
        {!isOwnerAdmin && (
          <div className="adm-bottomside" style={{ flex: 1, justifyContent: "center" }}>
            {[...nav.pillars, ...nav.client].map((item) => (
              <BottomTab key={item.to} item={item} />
            ))}
          </div>
        )}
        {isOwnerAdmin && (
        <div className="adm-bottomside">
          {bottomLeft.map((item) => (
            <BottomTab key={item.to} item={item} />
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
            <BottomTab key={item.to} item={item} />
          ))}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={`adm-bottomtab${clientCtx ? " on" : ""}`}
            aria-haspopup="dialog"
          >
            <Layers size={18} className="shrink-0" aria-hidden />
            <span>Accounts</span>
          </button>
        </div>
        )}
      </nav>

      {sheetOpen && (
        <ClientSheet
          clients={clients}
          current={clientCtx}
          agencyHome={nav.home}
          onClose={() => setSheetOpen(false)}
        />
      )}
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
        transition: width .18s ease;
      }
      /* Collapsed: an icon column. 68px holds a 34px brand mark and a centered
         17px row icon with the same 12px gutters the open rail uses. */
      .pk-kit .adm-rail.is-collapsed { width: 68px; }
      @media (prefers-reduced-motion: reduce) { .pk-kit .adm-rail { transition: none; } }
      [data-theme="dark"] .pk-kit .adm-rail { background: rgba(18,22,31,0.55); border-right-color: rgba(255,255,255,0.07); }
      .pk-kit .adm-rail-head {
        display: flex; align-items: center; gap: 6px;
        padding: 16px 10px 16px 16px;
      }
      .pk-kit .adm-rail-brand {
        display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 auto;
        text-decoration: none;
      }
      /* Stacked when collapsed: the mark on top, the expand control under it,
         both centered on the narrow track. */
      .pk-kit .adm-rail.is-collapsed .adm-rail-head {
        flex-direction: column; gap: 10px; padding: 16px 0 14px;
      }
      .pk-kit .adm-rail.is-collapsed .adm-rail-brand { flex: 0 0 auto; justify-content: center; }
      .pk-kit .adm-rail-collapse {
        width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
        display: grid; place-items: center; color: var(--text-faint);
        transition: color .14s, background .14s;
      }
      .pk-kit .adm-rail-collapse:hover {
        color: var(--text);
        background: color-mix(in srgb, var(--surface) 72%, transparent);
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
          on phones, four pages split around a raised center Command hub.
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

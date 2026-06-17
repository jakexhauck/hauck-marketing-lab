import { Fragment, useCallback, useMemo, useState } from "react";
import type { ClientEntry } from "../../lib/types";
import { useTheme } from "../../lib/ThemeContext";
import {
  defaultClientSection,
  type ClientSection,
  type OutreachSection,
  type PersonalSection,
  type ProspectEntry,
  type WorkspaceView,
} from "../../lib/navigation";
import {
  IconBarChart,
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconCode,
  IconDashboard,
  IconFile,
  IconFolder,
  IconGlobe,
  IconLayout,
  IconPersonal,
  IconPlus,
  IconRecordings,
  IconSearch,
  IconSettings,
  IconSOPs,
  IconStar,
  IconTarget,
  IconTasks,
  IconUsers,
  IconZap,
} from "../icons";

/**
 * The unified "Console" sidebar — one CRM-style rail that replaces the old
 * 48px IconRail + contextual AppSidebar pair. Top-level surfaces are folded
 * into a handful of collapsible groups so the list stays compact; the active
 * client expands inline to its sections. Footer carries the theme toggle and
 * Settings, mirroring the web CRM.
 *
 * It drives the exact same `view`/`setView` routing the dashboard already uses,
 * via the handler props below — no page logic changes.
 */
export interface ConsoleSidebarProps {
  // Active-state derivations (computed by MainDashboard from `view`).
  dashboardActive: boolean;
  builderActive: boolean;
  activeWorkspace: WorkspaceView | null;
  activeOutreach: OutreachSection | null;
  activeClient: { slug: string; section: ClientSection } | null;
  activePersonal: PersonalSection | null;

  clients: ClientEntry[];
  prospects?: ProspectEntry[];
  plansCount?: number;

  onGoDashboard: () => void;
  onGoBuilder: () => void;
  onSelectWorkspace: (tab: WorkspaceView) => void;
  onSelectOutreachSection: (
    section: "overview" | "lead-scraper" | "web-designer" | "sequence" | "dms",
  ) => void;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onSelectPersonalSection?: (section: PersonalSection) => void;
  onAddClient?: () => void;
  onSettings?: () => void;
  onOpenCommand?: () => void;

  userName?: string;
  userInitials?: string;
}

type GroupId = "clients" | "sales" | "outreach" | "workspace";
type ClientFilter = "all" | "live" | "pre-launch" | "paused";

const GROUPS_STORAGE_KEY = "hml_sidebar_groups_v1";

/** Default collapse state: Workspace starts collapsed (it's the longest list). */
const DEFAULT_OPEN: Record<GroupId, boolean> = {
  clients: true,
  sales: true,
  outreach: true,
  workspace: false,
};

function loadGroupState(): Record<GroupId, boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_OPEN, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_OPEN };
}

function avatarText(name: string): string {
  if (!name) return "•";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function clientStatusPill(status: ClientEntry["status"]) {
  switch (status) {
    case "live":
      return { className: "hml-green", label: "Live" };
    case "pre-launch":
      return { className: "hml-blue", label: "Pre" };
    case "paused":
      return { className: "hml-neutral", label: "Paused" };
  }
}

function clientSectionIcon(section: ClientSection) {
  switch (section) {
    case "dashboard":
      return IconDashboard;
    case "ads":
      return IconBarChart;
    case "onboarding":
      return IconCheck;
    case "documents":
      return IconFolder;
    case "recordings":
      return IconRecordings;
    case "websites":
      return IconGlobe;
    case "reporting":
      return IconFile;
    case "settings":
      return IconSettings;
  }
}

function clientSectionLabel(section: ClientSection) {
  switch (section) {
    case "dashboard":
      return "Dashboard";
    case "ads":
      return "Ads";
    case "onboarding":
      return "Onboarding";
    case "documents":
      return "Drive";
    case "recordings":
      return "Recordings";
    case "websites":
      return "Websites";
    case "reporting":
      return "Reporting";
    case "settings":
      return "Settings";
  }
}

function clientSectionsForStatus(status: ClientEntry["status"]): ClientSection[] {
  const base: ClientSection[] = [
    "dashboard",
    "ads",
    "documents",
    "recordings",
    "websites",
    "reporting",
  ];
  return status === "pre-launch" ? ["onboarding", ...base, "settings"] : [...base, "settings"];
}

export function ConsoleSidebar(props: ConsoleSidebarProps) {
  const {
    dashboardActive,
    builderActive,
    activeWorkspace,
    activeOutreach,
    activeClient,
    activePersonal,
    clients,
    prospects,
    plansCount = 0,
    onGoDashboard,
    onGoBuilder,
    onSelectWorkspace,
    onSelectOutreachSection,
    onSelectClientSection,
    onSelectPersonalSection,
    onAddClient,
    onSettings,
    onOpenCommand,
    userName = "Jake Hauck",
    userInitials = "JH",
  } = props;

  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState<Record<GroupId, boolean>>(loadGroupState);

  const toggleGroup = useCallback((id: GroupId) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const prospectsList = useMemo(() => prospects ?? [], [prospects]);
  const liveCount = useMemo(
    () => clients.filter((c) => c.status === "live").length,
    [clients],
  );

  return (
    <aside className="hml-sidebar">
      {/* Brand */}
      <button type="button" className="hml-brand" onClick={onGoDashboard}>
        <span className="hml-brand-mark">H</span>
        <span className="hml-brand-name">
          Hauck Marketing
          <span className="hml-sub">LAB · OS</span>
        </span>
      </button>

      {/* Command trigger */}
      <button type="button" className="hml-search-bar" onClick={onOpenCommand}>
        <IconSearch size={14} />
        <span className="hml-placeholder">Search or jump…</span>
        <span className="hml-kbd">⌘K</span>
      </button>

      <nav className="hml-nav">
        {/* Pinned top-level surfaces */}
        <NavItem
          label="Dashboard"
          Icon={IconDashboard}
          active={dashboardActive}
          onClick={onGoDashboard}
        />
        <NavItem
          label="Builder"
          Icon={IconCode}
          active={builderActive}
          onClick={onGoBuilder}
        />

        {/* CLIENTS */}
        <Group
          id="clients"
          label="Clients"
          open={open.clients}
          onToggle={toggleGroup}
          count={liveCount > 0 ? `${liveCount} live` : undefined}
        >
          <ClientsBody
            clients={clients}
            activeClient={activeClient}
            landingActive={activeWorkspace === "clients"}
            onboardingActive={activeWorkspace === "onboarding"}
            onSelectClientSection={onSelectClientSection}
            onOpenLanding={() => onSelectWorkspace("clients")}
            onOpenOnboarding={() => onSelectWorkspace("onboarding")}
            onAddClient={onAddClient}
          />
        </Group>

        {/* SALES */}
        <Group id="sales" label="Sales" open={open.sales} onToggle={toggleGroup}>
          <NavItem
            label="Pipeline"
            Icon={IconLayout}
            active={activeWorkspace === "sales"}
            onClick={() => onSelectWorkspace("sales")}
          />
          <NavItem
            label="Book a Call"
            Icon={IconCalendar}
            active={activeWorkspace === "sales-booking"}
            onClick={() => onSelectWorkspace("sales-booking")}
          />
        </Group>

        {/* OUTREACH */}
        <Group
          id="outreach"
          label="Outreach"
          open={open.outreach}
          onToggle={toggleGroup}
          count={prospectsList.length > 0 ? String(prospectsList.length) : undefined}
        >
          <NavItem
            label="Overview"
            Icon={IconTarget}
            active={activeOutreach === "overview"}
            onClick={() => onSelectOutreachSection("overview")}
          />
          <NavItem
            label="Cold Call Sequence"
            Icon={IconBarChart}
            active={activeOutreach === "sequence"}
            onClick={() => onSelectOutreachSection("sequence")}
          />
          <NavItem
            label="Lead Scraper"
            Icon={IconSearch}
            active={activeOutreach === "lead-scraper"}
            onClick={() => onSelectOutreachSection("lead-scraper")}
          />
          <NavItem
            label="Web Designer"
            Icon={IconStar}
            active={activeOutreach === "web-designer"}
            onClick={() => onSelectOutreachSection("web-designer")}
          />
          <NavItem
            label="Personalized DMs"
            Icon={IconTasks}
            active={activeOutreach === "dms"}
            onClick={() => onSelectOutreachSection("dms")}
          />
        </Group>

        {/* WORKSPACE */}
        <Group
          id="workspace"
          label="Workspace"
          open={open.workspace}
          onToggle={toggleGroup}
        >
          <NavItem
            label="Calendar"
            Icon={IconCalendar}
            active={activeWorkspace === "calendar"}
            onClick={() => onSelectWorkspace("calendar")}
          />
          <NavItem
            label="Tasks"
            Icon={IconTasks}
            active={activeWorkspace === "tasks"}
            onClick={() => onSelectWorkspace("tasks")}
          />
          <NavItem
            label="Plans"
            Icon={IconLayout}
            active={activeWorkspace === "plans"}
            badge={plansCount > 0 ? String(plansCount) : undefined}
            onClick={() => onSelectWorkspace("plans")}
          />
          <NavItem
            label="Revenue"
            Icon={IconBarChart}
            active={activeWorkspace === "revenue"}
            onClick={() => onSelectWorkspace("revenue")}
          />
          <NavItem
            label="Recordings"
            Icon={IconRecordings}
            active={activeWorkspace === "recordings"}
            onClick={() => onSelectWorkspace("recordings")}
          />
          <NavItem
            label="SOPs"
            Icon={IconSOPs}
            active={activeWorkspace === "sops"}
            onClick={() => onSelectWorkspace("sops")}
          />
          <NavItem
            label="Resources"
            Icon={IconStar}
            active={activeWorkspace === "resources"}
            onClick={() => onSelectWorkspace("resources")}
          />
          <NavItem
            label="Creative Studio"
            Icon={IconTarget}
            active={activeWorkspace === "creative-studio"}
            onClick={() => onSelectWorkspace("creative-studio")}
          />
          <NavItem
            label="Automations"
            Icon={IconZap}
            active={activeWorkspace === "automations"}
            onClick={() => onSelectWorkspace("automations")}
          />
          {onSelectPersonalSection && (
            <NavItem
              label="Personal Hub"
              Icon={IconPersonal}
              active={activePersonal !== null}
              onClick={() => onSelectPersonalSection("overview")}
            />
          )}
        </Group>
      </nav>

      {/* Footer: account + theme toggle + settings */}
      <div className="hml-sidebar-footer">
        <div className="hml-user-avatar">{userInitials}</div>
        <div className="hml-user-info">
          <div className="hml-user-name">{userName}</div>
        </div>
        <button
          type="button"
          className="hml-sidebar-foot-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        {onSettings && (
          <button
            type="button"
            className="hml-sidebar-foot-btn"
            onClick={onSettings}
            title="Settings"
            aria-label="Settings"
          >
            <IconSettings size={15} />
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── Collapsible group ───────────────────────────────────────────────────

interface GroupProps {
  id: GroupId;
  label: string;
  open: boolean;
  onToggle: (id: GroupId) => void;
  count?: string;
  children: React.ReactNode;
}

function Group({ id, label, open, onToggle, count, children }: GroupProps) {
  return (
    <div className={`hml-nav-section hml-group${open ? " hml-group-open" : ""}`}>
      <button
        type="button"
        className="hml-section-toggle hml-group-head"
        onClick={() => onToggle(id)}
        aria-expanded={open}
      >
        <IconChevronRight size={12} className="hml-group-chevron" />
        <span className="hml-section-label" style={{ padding: 0, flex: 1 }}>
          {label}
        </span>
        {count && <span className="hml-count">{count}</span>}
      </button>
      {open && <div className="hml-group-body">{children}</div>}
    </div>
  );
}

// ─── Clients body (filter + roster + nested sections) ────────────────────

interface ClientsBodyProps {
  clients: ClientEntry[];
  activeClient: { slug: string; section: ClientSection } | null;
  landingActive: boolean;
  onboardingActive: boolean;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onOpenLanding: () => void;
  onOpenOnboarding: () => void;
  onAddClient?: () => void;
}

function ClientsBody(props: ClientsBodyProps) {
  const {
    clients,
    activeClient,
    landingActive,
    onboardingActive,
    onSelectClientSection,
    onOpenLanding,
    onOpenOnboarding,
    onAddClient,
  } = props;
  const [filter, setFilter] = useState<ClientFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return clients;
    return clients.filter((c) => c.status === filter);
  }, [clients, filter]);

  const filters: { id: ClientFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "live", label: "Live" },
    { id: "pre-launch", label: "Pre" },
    { id: "paused", label: "Paused" },
  ];

  return (
    <>
      <NavItem
        label="All Clients"
        Icon={IconUsers}
        active={landingActive && !activeClient}
        onClick={onOpenLanding}
      />
      <NavItem
        label="Onboarding Pipeline"
        Icon={IconCheck}
        active={onboardingActive && !activeClient}
        onClick={onOpenOnboarding}
      />

      <div className="hml-chips">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`hml-chip-f${filter === f.id ? " hml-chip-on" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="hml-clients-list">
        {filtered.map((c) => {
          const pill = clientStatusPill(c.status);
          const isActive = activeClient?.slug === c.slug;
          return (
            <Fragment key={c.slug}>
              <button
                type="button"
                className={`hml-cli-row${isActive ? " hml-cli-active" : ""}`}
                onClick={() => onSelectClientSection(c.slug, defaultClientSection(c.status))}
                title={c.name}
              >
                <span className="hml-cli-mark">{avatarText(c.name)}</span>
                <span className="hml-cli-name">{c.name}</span>
                <span className={`hml-pill-mini ${pill.className}`}>{pill.label}</span>
              </button>

              {isActive && (
                <div className="hml-nested-tabs">
                  {clientSectionsForStatus(c.status).map((section) => {
                    const Icon = clientSectionIcon(section);
                    const tabActive = activeClient.section === section;
                    return (
                      <button
                        key={section}
                        type="button"
                        className={`hml-nested-tab${tabActive ? " hml-nested-active" : ""}`}
                        onClick={() => onSelectClientSection(c.slug, section)}
                      >
                        <Icon size={13} className="hml-nested-ico" />
                        <span>{clientSectionLabel(section)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}

        {filtered.length === 0 && <div className="hml-empty-hint">No clients match.</div>}

        {onAddClient && (
          <button type="button" className="hml-add-client" onClick={onAddClient}>
            <IconPlus size={13} />
            <span>Add client</span>
          </button>
        )}
      </div>
    </>
  );
}

// ─── Shared nav item ─────────────────────────────────────────────────────

interface NavItemProps {
  label: string;
  Icon: typeof IconDashboard;
  active?: boolean;
  badge?: string;
  onClick?: () => void;
}

function NavItem({ label, Icon, active, badge, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      className={`hml-nav-item${active ? " hml-active" : ""}`}
      onClick={onClick}
    >
      <Icon className="hml-nav-icon" />
      <span>{label}</span>
      {badge != null && <span className="hml-badge">{badge}</span>}
    </button>
  );
}

// ─── Inline sun/moon glyphs (no icon in the set) ─────────────────────────

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

import { Fragment, useMemo, useState } from "react";
import type { ClientEntry } from "../../lib/types";
import {
  defaultClientSection,
  type ClientSection,
  type OutreachSection,
  type PersonalSection,
  type ProspectEntry,
  type SubApp,
  type WorkspaceView,
} from "../../lib/navigation";
import {
  IconBarChart,
  IconCalendar,
  IconCheck,
  IconDashboard,
  IconFile,
  IconFolder,
  IconGlobe,
  IconPersonal,
  IconPlus,
  IconRecordings,
  IconSearch,
  IconSettings,
  IconSOPs,
  IconStar,
  IconTarget,
  IconTasks,
  IconZap,
} from "../icons";

export interface AppSidebarProps {
  currentSubApp: SubApp;

  /** Workspace pillar active tab. */
  activeWorkspace?: WorkspaceView | null;
  activeOutreach?: OutreachSection | null;
  activeClient?: { slug: string; section: ClientSection } | null;
  activePersonal?: PersonalSection | null;

  clients: ClientEntry[];
  prospects?: ProspectEntry[];

  onSelectWorkspace: (tab: WorkspaceView) => void;
  onSelectOutreachSection: (
    section: "overview" | "lead-scraper" | "web-designer" | "sequence" | "dms",
  ) => void;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onSelectPersonalSection?: (section: PersonalSection) => void;
  onAddClient?: () => void;
  onOpenSettings?: () => void;
  onSearch?: () => void;
  onBrandClick?: () => void;

  userName?: string;
  userInitials?: string;
  userStatusLabel?: string;
  appVersion?: string;
}

type ClientFilter = "all" | "live" | "pre-launch" | "paused";

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

/** Build the per-client sidebar list. Onboarding appears only while the
 *  client is still pre-launch; Settings is always last. */
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

function subAppDisplay(subApp: SubApp): { name: string; eyebrow: string } {
  switch (subApp) {
    case "dashboard":
      return { name: "Dashboard", eyebrow: "Sub-app" };
    case "clients":
      return { name: "Clients", eyebrow: "Sub-app" };
    case "outreach":
      return { name: "Outreach", eyebrow: "Sub-app" };
    case "sales":
      return { name: "Sales Pipeline", eyebrow: "Sub-app" };
    case "onboarding":
      return { name: "Onboarding Pipeline", eyebrow: "Sub-app" };
    case "workspace":
      return { name: "Workspace", eyebrow: "Sub-app" };
    case "settings":
      return { name: "Settings", eyebrow: "Sub-app" };
  }
}

export function AppSidebar(props: AppSidebarProps) {
  const {
    currentSubApp,
    activeWorkspace,
    activeOutreach,
    activeClient,
    activePersonal,
    clients,
    prospects,
    onSelectWorkspace,
    onSelectOutreachSection,
    onSelectClientSection,
    onSelectPersonalSection,
    onAddClient,
    onOpenSettings,
    onSearch,
    userName = "Jake Hauck",
    userInitials = "JH",
    userStatusLabel = "Aurelius online",
  } = props;

  const display = subAppDisplay(currentSubApp);
  const prospectsList = useMemo(() => prospects ?? [], [prospects]);

  const liveCount = useMemo(
    () => clients.filter((c) => c.status === "live").length,
    [clients],
  );
  const preLaunchCount = useMemo(
    () => clients.filter((c) => c.status === "pre-launch").length,
    [clients],
  );

  let countBadge: { label: string; className: string } | null = null;
  if (currentSubApp === "clients" && liveCount > 0) {
    countBadge = { label: `${liveCount} live`, className: "hml-green" };
  } else if (currentSubApp === "outreach" && prospectsList.length > 0) {
    countBadge = {
      label: String(prospectsList.length),
      className: "hml-blue",
    };
  } else if (currentSubApp === "onboarding" && preLaunchCount > 0) {
    countBadge = {
      label: `${preLaunchCount} pending`,
      className: "hml-amber",
    };
  }

  if (currentSubApp === "dashboard") {
    return null;
  }

  return (
    <aside className="hml-sidebar">
      <div className="hml-sub-head">
        <div>
          <span className="hml-sub-eyebrow">{display.eyebrow}</span>
          <div className="hml-sub-name">{display.name}</div>
        </div>
        {countBadge && (
          <span className={`hml-sub-count ${countBadge.className}`}>
            {countBadge.label}
          </span>
        )}
      </div>

      <button
        type="button"
        className="hml-search-bar"
        onClick={onSearch}
        title="Open command palette"
      >
        <IconSearch size={13} />
        <span className="hml-placeholder">Search…</span>
        <span className="hml-kbd">⌘K</span>
      </button>

      <nav className="hml-nav">
        {currentSubApp === "clients" && (
          <ClientsBody
            clients={clients}
            activeClient={activeClient ?? null}
            onSelectClientSection={onSelectClientSection}
            onAddClient={onAddClient}
            onOpenLanding={() => onSelectWorkspace("clients")}
            landingActive={activeWorkspace === "clients"}
          />
        )}

        {currentSubApp === "outreach" && (
          <OutreachBody
            activeOutreach={activeOutreach ?? null}
            onSelectOutreachSection={onSelectOutreachSection}
            prospects={prospectsList}
          />
        )}

        {currentSubApp === "sales" && (
          <SalesBody />
        )}

        {currentSubApp === "onboarding" && (
          <OnboardingBody
            clients={clients}
            activeClient={activeClient ?? null}
            onSelectClientSection={onSelectClientSection}
            onOpenLanding={() => onSelectWorkspace("onboarding")}
            landingActive={activeWorkspace === "onboarding"}
          />
        )}

        {currentSubApp === "workspace" && (
          <WorkspaceBody
            activeWorkspace={activeWorkspace}
            activePersonal={activePersonal ?? null}
            onSelectWorkspace={onSelectWorkspace}
            onSelectPersonalSection={onSelectPersonalSection}
          />
        )}

        {currentSubApp === "settings" && (
          <div className="hml-empty-hint">Settings opens in a modal.</div>
        )}
      </nav>

      <div className="hml-sidebar-footer">
        <div className="hml-user-avatar">{userInitials}</div>
        <div className="hml-user-info">
          <div className="hml-user-name">{userName}</div>
          <div className="hml-user-status">
            <span className="hml-status-dot" />
            {userStatusLabel}
          </div>
        </div>
        {onOpenSettings && (
          <button
            type="button"
            className="hml-sidebar-foot-btn"
            onClick={onOpenSettings}
            title="Settings"
          >
            <IconSettings size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── Sub-app body components ──────────────────────────────────────────────

interface ClientsBodyProps {
  clients: ClientEntry[];
  activeClient: { slug: string; section: ClientSection } | null;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onAddClient?: () => void;
  onOpenLanding: () => void;
  landingActive: boolean;
}

function ClientsBody(props: ClientsBodyProps) {
  const {
    clients,
    activeClient,
    onSelectClientSection,
    onAddClient,
    onOpenLanding,
    landingActive,
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
      <button
        type="button"
        className={`hml-nav-item${landingActive && !activeClient ? " hml-active" : ""}`}
        onClick={onOpenLanding}
        title="All clients overview"
      >
        <IconBarChart className="hml-nav-icon" />
        <span>All clients</span>
      </button>

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
                onClick={() =>
                  onSelectClientSection(c.slug, defaultClientSection(c.status))
                }
                title={c.name}
              >
                <span className="hml-cli-mark">
                  {avatarText(c.name)}
                </span>
                <span className="hml-cli-name">{c.name}</span>
                <span className={`hml-pill-mini ${pill.className}`}>
                  {pill.label}
                </span>
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

        {filtered.length === 0 && (
          <div className="hml-empty-hint">No clients match.</div>
        )}

        {onAddClient && (
          <button
            type="button"
            className="hml-add-client"
            onClick={onAddClient}
          >
            <IconPlus size={13} />
            <span>Add client</span>
          </button>
        )}
      </div>
    </>
  );
}

interface OutreachBodyProps {
  activeOutreach: OutreachSection | null;
  onSelectOutreachSection: (
    section: "overview" | "lead-scraper" | "web-designer" | "sequence" | "dms",
  ) => void;
  prospects: ProspectEntry[];
}

function OutreachBody({
  activeOutreach,
  onSelectOutreachSection,
  prospects,
}: OutreachBodyProps) {
  return (
    <div className="hml-nav-section">
      <div className="hml-nav-label">Outreach</div>
      <NavItem
        label="Overview"
        Icon={IconTarget}
        active={activeOutreach === "overview"}
        onClick={() => onSelectOutreachSection("overview")}
      />
      <NavItem
        label="Cold call sequence"
        Icon={IconBarChart}
        active={activeOutreach === "sequence"}
        onClick={() => onSelectOutreachSection("sequence")}
      />
      <NavItem
        label="Lead scraper"
        Icon={IconSearch}
        active={activeOutreach === "lead-scraper"}
        onClick={() => onSelectOutreachSection("lead-scraper")}
      />
      <NavItem
        label="Web designer"
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
      {prospects.length > 0 && (
        <div className="hml-nav-label" style={{ marginTop: 14 }}>
          Prospects ({prospects.length})
        </div>
      )}
    </div>
  );
}

function SalesBody() {
  return (
    <div className="hml-nav-section">
      <div className="hml-nav-label">Sales</div>
      <div className="hml-empty-hint">
        Sales pipeline lives in the main pane.
      </div>
    </div>
  );
}

interface OnboardingBodyProps {
  clients: ClientEntry[];
  activeClient: { slug: string; section: ClientSection } | null;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onOpenLanding: () => void;
  landingActive: boolean;
}

function OnboardingBody({
  clients,
  activeClient,
  onSelectClientSection,
  onOpenLanding,
  landingActive,
}: OnboardingBodyProps) {
  const preLaunch = clients.filter((c) => c.status === "pre-launch");
  return (
    <>
      <button
        type="button"
        className={`hml-nav-item${landingActive && !activeClient ? " hml-active" : ""}`}
        onClick={onOpenLanding}
      >
        <IconCheck className="hml-nav-icon" />
        <span>Pipeline overview</span>
      </button>

      <div className="hml-nav-label" style={{ marginTop: 14 }}>
        Pre-launch clients
      </div>
      <div className="hml-clients-list">
        {preLaunch.length === 0 ? (
          <div className="hml-empty-hint">No pre-launch clients.</div>
        ) : (
          preLaunch.map((c) => {
            const isActive = activeClient?.slug === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                className={`hml-cli-row${isActive ? " hml-cli-active" : ""}`}
                onClick={() => onSelectClientSection(c.slug, "onboarding")}
              >
                <span className="hml-cli-mark">
                  {avatarText(c.name)}
                </span>
                <span className="hml-cli-name">{c.name}</span>
                <span className="hml-pill-mini hml-blue">Pre</span>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

interface WorkspaceBodyProps {
  activeWorkspace?: WorkspaceView | null;
  activePersonal: PersonalSection | null;
  onSelectWorkspace: (tab: WorkspaceView) => void;
  onSelectPersonalSection?: (section: PersonalSection) => void;
}

function WorkspaceBody({
  activeWorkspace,
  activePersonal,
  onSelectWorkspace,
  onSelectPersonalSection,
}: WorkspaceBodyProps) {
  return (
    <div className="hml-nav-section">
      <div className="hml-nav-label">Workspace</div>
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
    </div>
  );
}

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

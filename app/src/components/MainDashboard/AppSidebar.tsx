import { useMemo, useState } from "react";
import type { ClientEntry } from "../../lib/types";
import type {
  ClientSection,
  OutreachSection,
  ProspectEntry,
  WorkspaceView,
} from "../../lib/navigation";
import { prospectStatusPill } from "../../lib/navigation";
import {
  IconArrowRight,
  IconBarChart,
  IconBroadcast,
  IconCalendar,
  IconChevronRight,
  IconDashboard,
  IconFolder,
  IconGlobe,
  IconLayout,
  IconPen,
  IconPlus,
  IconRecordings,
  IconSearch,
  IconSettings,
  IconSOPs,
  IconStar,
  IconTarget,
  IconTasks,
  IconUser,
  IconUsers,
} from "../icons";

export interface AppSidebarProps {
  /** Workspace pillar active tab. */
  activeWorkspace?: WorkspaceView | null;
  /** Outreach pillar — either a section, or null when not in outreach. */
  activeOutreach?: OutreachSection | null;
  /** When active outreach surface is a per-prospect page, the slug. */
  activeProspectSlug?: string | null;
  /** Currently open client + section, or null. */
  activeClient?: { slug: string; section: ClientSection } | null;

  /** Real clients loaded from disk. */
  clients: ClientEntry[];
  /** Prospects discovered via the lead scraper / outreach folder. */
  prospects?: ProspectEntry[];

  // ── callbacks ─────────────────────────────────────────────
  onSelectWorkspace: (tab: WorkspaceView) => void;
  onSelectOutreachSection: (
    section: "overview" | "lead-scraper" | "web-designer" | "sequence",
  ) => void;
  onSelectProspect: (slug: string) => void;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onAddClient?: () => void;
  onOpenSettings?: () => void;
  onSearch?: () => void;
  onBrandClick?: () => void;

  // ── footer ────────────────────────────────────────────────
  userName?: string;
  userInitials?: string;
  userStatusLabel?: string;
  appVersion?: string;
}

const CLIENT_SECTIONS: ReadonlyArray<{
  id: ClientSection;
  label: string;
  Icon: typeof IconUser;
}> = [
  { id: "profile", label: "Profile", Icon: IconUser },
  { id: "memory", label: "Memory", Icon: IconPen },
  { id: "drive", label: "Drive", Icon: IconFolder },
  { id: "media-buying", label: "Media Buying", Icon: IconBarChart },
  { id: "website", label: "Website", Icon: IconGlobe },
  { id: "recordings", label: "Recordings", Icon: IconRecordings },
];

function avatarText(name: string): string {
  if (!name) return "•";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function clientStatusPill(status: ClientEntry["status"]): {
  className: string;
  label: string;
} {
  switch (status) {
    case "live":
      return { className: "hml-green", label: "Live" };
    case "pre-launch":
      return { className: "hml-amber", label: "Pre-launch" };
    case "paused":
      return { className: "hml-neutral", label: "Paused" };
  }
}

export function AppSidebar({
  activeWorkspace,
  activeOutreach,
  activeProspectSlug,
  activeClient,
  clients,
  prospects,
  onSelectWorkspace,
  onSelectOutreachSection,
  onSelectProspect,
  onSelectClientSection,
  onAddClient,
  onOpenSettings,
  onSearch,
  onBrandClick,
  userName = "Jake Hauck",
  userInitials = "JH",
  userStatusLabel = "Aurelius online",
  appVersion,
}: AppSidebarProps) {
  // Clients the user has manually expanded.  Active client is always expanded
  // implicitly so its sub-sections are visible.
  const [manuallyExpanded, setManuallyExpanded] = useState<
    Record<string, boolean>
  >({});

  const isClientExpanded = (slug: string) =>
    !!manuallyExpanded[slug] || activeClient?.slug === slug;

  const toggleClient = (slug: string) => {
    setManuallyExpanded((prev) => ({ ...prev, [slug]: !isClientExpanded(slug) }));
  };

  // Section-level collapse for the Outreach + Clients groups. Both expanded by
  // default. Active item in a section forces it open even when manually
  // collapsed (so the active state never hides).
  const [collapsedSections, setCollapsedSections] = useState<{
    outreach: boolean;
    clients: boolean;
  }>({ outreach: false, clients: false });

  const toggleSection = (key: "outreach" | "clients") => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const outreachActive = activeOutreach !== null && activeOutreach !== undefined;
  const clientsActive = activeClient !== null && activeClient !== undefined;
  const outreachOpen = !collapsedSections.outreach || outreachActive;
  const clientsOpen = !collapsedSections.clients || clientsActive;

  const prospectsList = useMemo(() => prospects ?? [], [prospects]);

  return (
    <aside className="hml-sidebar">
      {/* Brand ──────────────────────────────────────── */}
      <button
        type="button"
        className="hml-brand"
        onClick={onBrandClick}
        title="Back to dashboard"
      >
        <div className="hml-brand-mark">H</div>
        <div className="hml-brand-name">
          Hauck Marketing
          <span className="hml-sub">Lab{appVersion ? ` · ${appVersion}` : ""}</span>
        </div>
      </button>

      {/* Search placeholder (opens command palette) ── */}
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
        {/* WORKSPACE ─────────────────────────────────── */}
        <div className="hml-nav-section">
          <div className="hml-section-label">
            <span>Workspace</span>
          </div>
          <NavItem
            label="Dashboard"
            Icon={IconDashboard}
            active={activeWorkspace === "dashboard"}
            onClick={() => onSelectWorkspace("dashboard")}
          />
          <NavItem
            label="Calendar"
            Icon={IconCalendar}
            active={activeWorkspace === "calendar"}
            onClick={() => onSelectWorkspace("calendar")}
          />
          <NavItem
            label="Clients"
            Icon={IconUsers}
            active={activeWorkspace === "clients"}
            onClick={() => onSelectWorkspace("clients")}
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
        </div>

        {/* OUTREACH ──────────────────────────────────── */}
        <div className="hml-nav-section">
          <button
            type="button"
            className="hml-section-label hml-section-toggle"
            onClick={() => toggleSection("outreach")}
            title={outreachOpen ? "Collapse Outreach" : "Expand Outreach"}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconChevronRight
                className="hml-nav-chevron"
                size={9}
                style={{
                  transform: outreachOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 120ms ease",
                  opacity: 0.6,
                }}
              />
              Outreach
            </span>
            {prospectsList.length > 0 && (
              <span className="hml-count">{prospectsList.length}</span>
            )}
          </button>
          {outreachOpen && (
            <>
              <NavItem
                label="Overview"
                Icon={IconBroadcast}
                active={activeOutreach === "overview"}
                onClick={() => onSelectOutreachSection("overview")}
              />
              <NavItem
                label="Sequence"
                Icon={IconArrowRight}
                active={activeOutreach === "sequence"}
                onClick={() => onSelectOutreachSection("sequence")}
              />
              <NavItem
                label="Lead Scraper"
                Icon={IconTarget}
                active={activeOutreach === "lead-scraper"}
                onClick={() => onSelectOutreachSection("lead-scraper")}
              />
              <NavItem
                label="Web Designer"
                Icon={IconLayout}
                active={activeOutreach === "web-designer"}
                onClick={() => onSelectOutreachSection("web-designer")}
              />
              {prospectsList.length > 0 && (
                <>
                  <div className="hml-section-sublabel">
                    Prospects · {prospectsList.length} active
                  </div>
                  {prospectsList.map((p) => {
                    const pill = prospectStatusPill(p.status);
                    const isActive =
                      activeOutreach === "prospect" && activeProspectSlug === p.slug;
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        className={`hml-nav-item-sub${isActive ? " hml-active" : ""}`}
                        onClick={() => onSelectProspect(p.slug)}
                        title={p.name}
                      >
                        <span
                          className="hml-pill-dot"
                          style={{
                            background: `var(--hml-${pill.className.replace("hml-", "")})`,
                          }}
                        />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* CLIENTS ───────────────────────────────────── */}
        <div className="hml-nav-section">
          <button
            type="button"
            className="hml-section-label hml-section-toggle"
            onClick={() => toggleSection("clients")}
            title={clientsOpen ? "Collapse Clients" : "Expand Clients"}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconChevronRight
                className="hml-nav-chevron"
                size={9}
                style={{
                  transform: clientsOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 120ms ease",
                  opacity: 0.6,
                }}
              />
              Clients
            </span>
            <span className="hml-count">{clients.length}</span>
          </button>
          {clientsOpen && (
            <>
              {clients.map((c) => (
                <ClientGroup
                  key={c.slug}
                  client={c}
                  expanded={isClientExpanded(c.slug)}
                  activeSection={
                    activeClient?.slug === c.slug ? activeClient.section : null
                  }
                  onToggle={() => toggleClient(c.slug)}
                  onSelectSection={(section) => onSelectClientSection(c.slug, section)}
                />
              ))}
              {onAddClient && (
                <button type="button" className="hml-nav-add" onClick={onAddClient}>
                  <IconPlus size={13} />
                  <span>Add client</span>
                </button>
              )}
            </>
          )}
        </div>
      </nav>

      {/* Footer ─────────────────────────────────────── */}
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

// ─── helpers ──────────────────────────────────────────

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

interface ClientGroupProps {
  client: ClientEntry;
  expanded: boolean;
  activeSection: ClientSection | null;
  onToggle: () => void;
  onSelectSection: (section: ClientSection) => void;
}

function ClientGroup({
  client,
  expanded,
  activeSection,
  onToggle,
  onSelectSection,
}: ClientGroupProps) {
  const pill = clientStatusPill(client.status);
  return (
    <div className={`hml-nav-group${expanded ? " hml-expanded" : ""}`}>
      <button
        type="button"
        className={`hml-nav-item${activeSection ? " hml-active" : ""}`}
        onClick={onToggle}
        title={client.name}
      >
        <IconChevronRight className="hml-nav-chevron" />
        <span
          className="hml-client-avatar"
          style={{
            width: 18,
            height: 18,
            fontSize: 9.5,
            borderRadius: 4,
          }}
        >
          {avatarText(client.name)}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {client.name}
        </span>
        <span
          className={`hml-pill ${pill.className}`}
          style={{
            marginLeft: "auto",
            padding: "1px 6px",
            fontSize: 9,
          }}
        >
          <span className="hml-pill-dot" />
          {pill.label}
        </span>
      </button>
      {expanded && (
        <div className="hml-nav-sub">
          {CLIENT_SECTIONS.map(({ id, label, Icon }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                className={`hml-nav-item-sub${isActive ? " hml-active" : ""}`}
                onClick={() => onSelectSection(id)}
              >
                <Icon size={11} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

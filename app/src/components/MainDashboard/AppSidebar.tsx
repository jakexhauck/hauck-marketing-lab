import { useMemo } from "react";
import type { ClientEntry } from "../../lib/types";
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
  IconDashboard,
  IconHabits,
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
} from "../icons";

export interface AppSidebarProps {
  /** Workspace pillar active tab. */
  activeWorkspace?: WorkspaceView | null;
  /** Outreach pillar — either a section, or null when not in outreach. */
  activeOutreach?: OutreachSection | null;
  /** Currently open client + section, or null. */
  activeClient?: { slug: string; section: ClientSection } | null;
  /** Personal pillar active section, or null when not in Personal. */
  activePersonal?: PersonalSection | null;

  /** Real clients loaded from disk. */
  clients: ClientEntry[];
  /** Prospects discovered via the lead scraper / outreach folder. Used for
   *  the sidebar count badge on the Outreach Hub button. */
  prospects?: ProspectEntry[];

  // ── callbacks ─────────────────────────────────────────────
  onSelectWorkspace: (tab: WorkspaceView) => void;
  onSelectOutreachSection: (
    section: "overview" | "lead-scraper" | "web-designer" | "sequence",
  ) => void;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onSelectPersonalSection?: (section: PersonalSection) => void;
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
  onBrandClick,
  userName = "Jake Hauck",
  userInitials = "JH",
  userStatusLabel = "Aurelius online",
  appVersion,
}: AppSidebarProps) {
  const outreachActive = activeOutreach !== null && activeOutreach !== undefined;
  const clientsHubActive = activeWorkspace === "clients";

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
            label="Habits"
            Icon={IconHabits}
            active={activeWorkspace === "habits"}
            onClick={() => onSelectWorkspace("habits")}
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
          <div className="hml-section-label">
            <span>Outreach</span>
          </div>
          <NavItem
            label="Outreach Hub"
            Icon={IconTarget}
            active={outreachActive}
            onClick={() => onSelectOutreachSection("overview")}
            badge={
              prospectsList.length > 0 ? String(prospectsList.length) : undefined
            }
          />
        </div>

        {/* ONBOARDING ────────────────────────────────── */}
        <div className="hml-nav-section">
          <div className="hml-section-label">
            <span>Onboarding</span>
          </div>
          <NavItem
            label="Onboarding Hub"
            Icon={IconUsers}
            active={activeWorkspace === "onboarding"}
            onClick={() => onSelectWorkspace("onboarding")}
          />
        </div>

        {/* SALES ─────────────────────────────────────── */}
        <div className="hml-nav-section">
          <div className="hml-section-label">
            <span>Sales</span>
          </div>
          <NavItem
            label="Sales Hub"
            Icon={IconBarChart}
            active={activeWorkspace === "sales"}
            onClick={() => onSelectWorkspace("sales")}
          />
        </div>

        {/* CLIENTS ───────────────────────────────────── */}
        <div className="hml-nav-section">
          <div className="hml-section-label">
            <span>Clients</span>
          </div>
          <NavItem
            label="Clients Hub"
            Icon={IconUsers}
            active={clientsHubActive}
            onClick={() => onSelectWorkspace("clients")}
            badge={clients.length > 0 ? String(clients.length) : undefined}
          />
          {clients.map((c) => {
            const pill = clientStatusPill(c.status);
            const isActive = activeClient?.slug === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                className={`hml-nav-item${isActive ? " hml-active" : ""}`}
                onClick={() => onSelectClientSection(c.slug, defaultClientSection(c.status))}
                title={c.name}
              >
                <span
                  className="hml-client-avatar"
                  style={{
                    width: 18,
                    height: 18,
                    fontSize: 9.5,
                    borderRadius: 4,
                  }}
                >
                  {avatarText(c.name)}
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
                  {c.name}
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
            );
          })}
          {onAddClient && (
            <button type="button" className="hml-nav-add" onClick={onAddClient}>
              <IconPlus size={13} />
              <span>Add client</span>
            </button>
          )}
        </div>

        {/* PERSONAL ──────────────────────────────────── */}
        {onSelectPersonalSection && (
          <div className="hml-nav-section">
            <div className="hml-section-label">
              <span>Personal</span>
            </div>
            <NavItem
              label="Personal Hub"
              Icon={IconPersonal}
              active={activePersonal !== null && activePersonal !== undefined}
              onClick={() => onSelectPersonalSection("overview")}
            />
          </div>
        )}
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


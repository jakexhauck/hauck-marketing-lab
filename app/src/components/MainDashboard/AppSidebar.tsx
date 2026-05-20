import { useMemo, useState } from "react";
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
  IconChevronRight,
  IconDashboard,
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
    section: "overview" | "lead-scraper" | "web-designer" | "sequence" | "dms",
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
  const inActiveClient = activeClient !== null && activeClient !== undefined;

  const prospectsList = useMemo(() => prospects ?? [], [prospects]);

  /** Clients dropdown defaults open if you're already inside a client (so the
   *  active client is visible) or on the Clients Hub page. Otherwise collapsed. */
  const [clientsOpen, setClientsOpen] = useState<boolean>(
    () => clientsHubActive || inActiveClient,
  );
  const toggleClients = () => setClientsOpen((x) => !x);

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
        {/* DASHBOARD ─────────────────────────────────── (ungrouped, top) */}
        <div className="hml-nav-section" style={{ marginBottom: 4 }}>
          <NavItem
            label="Dashboard"
            Icon={IconDashboard}
            active={activeWorkspace === "dashboard"}
            onClick={() => onSelectWorkspace("dashboard")}
          />
        </div>

        {/* AGENCY ────────────────────────────────────── */}
        <div className="hml-nav-section">
          <div className="hml-section-label">
            <span>Agency</span>
          </div>
          <NavItem
            label="Ads Manager"
            Icon={IconBarChart}
            active={activeWorkspace === "ads"}
            onClick={() => onSelectWorkspace("ads")}
          />
          <NavItem
            label="Outreach Hub"
            Icon={IconTarget}
            active={outreachActive}
            onClick={() => onSelectOutreachSection("overview")}
            badge={
              prospectsList.length > 0 ? String(prospectsList.length) : undefined
            }
          />
          <NavItem
            label="Sales pipeline"
            Icon={IconBarChart}
            active={activeWorkspace === "sales"}
            onClick={() => onSelectWorkspace("sales")}
          />
          <NavItem
            label="Onboarding pipeline"
            Icon={IconUsers}
            active={activeWorkspace === "onboarding"}
            onClick={() => onSelectWorkspace("onboarding")}
          />

          {/* Clients Hub — caret toggles dropdown, label navigates to hub page. */}
          <button
            type="button"
            className={`hml-nav-item${clientsHubActive ? " hml-active" : ""}`}
            onClick={() => {
              onSelectWorkspace("clients");
              setClientsOpen(true);
            }}
            title="Clients Hub"
          >
            <span
              role="button"
              tabIndex={0}
              aria-label={clientsOpen ? "Collapse clients" : "Expand clients"}
              onClick={(e) => {
                e.stopPropagation();
                toggleClients();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  toggleClients();
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 14,
                height: 14,
                marginRight: 2,
                cursor: "pointer",
                transform: clientsOpen ? "rotate(90deg)" : "none",
                transition: "transform 120ms ease",
              }}
            >
              <IconChevronRight size={12} />
            </span>
            <IconUsers size={14} />
            <span style={{ flex: 1, textAlign: "left" }}>Clients Hub</span>
            {clients.length > 0 && (
              <span className="hml-nav-badge">{clients.length}</span>
            )}
          </button>

          {clientsOpen && (
            <>
              {clients.map((c) => {
                const pill = clientStatusPill(c.status);
                const isActive = activeClient?.slug === c.slug;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    className={`hml-nav-item${isActive ? " hml-active" : ""}`}
                    onClick={() =>
                      onSelectClientSection(c.slug, defaultClientSection(c.status))
                    }
                    title={c.name}
                    style={{ paddingLeft: 26 }}
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
                <button
                  type="button"
                  className="hml-nav-add"
                  onClick={onAddClient}
                  style={{ paddingLeft: 26 }}
                >
                  <IconPlus size={13} />
                  <span>Add client</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* WORKSPACE ─────────────────────────────────── */}
        <div className="hml-nav-section">
          <div className="hml-section-label">
            <span>Workspace</span>
          </div>
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
          {onSelectPersonalSection && (
            <NavItem
              label="Personal Hub"
              Icon={IconPersonal}
              active={activePersonal !== null && activePersonal !== undefined}
              onClick={() => onSelectPersonalSection("overview")}
            />
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


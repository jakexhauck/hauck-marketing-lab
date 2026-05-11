import type { AgentSummary, ClientEntry } from "../../lib/types";
import { ALL_FORM_CONFIGS, type FormSurfaceId } from "../../lib/formConfigs";
import { ClientTree, type ClientSection } from "./ClientTree";
import type { ClientV1 } from "./v1Data";

export type WorkspaceView = "dashboard" | "calendar" | "tasks";
export type WorkflowView = "media-buying";

interface SidebarProps {
  activeWorkspace: WorkspaceView | null;
  activeWorkflow?: WorkflowView | null;
  onSelectWorkspace: (view: WorkspaceView) => void;
  onSelectClientSection?: (slug: string, section: ClientSection) => void;
  onSelectWorkflow: (view: WorkflowView) => void;
  onAddClient?: () => void;
  /** Real client list — when provided, used in place of V1 mock data. */
  clients?: ClientEntry[];
  /** When set, sidebar renders flat client list + agents section (media-buying mode). */
  agents?: AgentSummary[];
  activeAgentSlug?: string | null;
  activeClientSlug?: string | null;
  /** Currently active form surface (highlighted in the Forms list). */
  activeFormId?: string | null;
  onSelectClient?: (slug: string) => void;
  onSelectAgent?: (agent: AgentSummary) => void;
  /** Open a form directly from the sidebar. */
  onSelectForm?: (id: FormSurfaceId) => void;
  /** Open Aurelius chat from the sidebar. */
  onOpenAureliusChat?: () => void;
}

const AGENT_ACCENT: Record<string, string> = {
  vortex: "#a78bfa",
  stratos: "#f59e0b",
  nexus: "#38bdf8",
  zenith: "#5fe699",
  aurelius: "#ec9849",
};

function statusToV1(status: ClientEntry["status"]): ClientV1["status"] {
  return status === "live" ? "live" : "hold";
}

export function Sidebar({
  activeWorkspace,
  activeWorkflow,
  onSelectWorkspace,
  onSelectClientSection,
  onSelectWorkflow,
  onAddClient,
  clients,
  agents,
  activeAgentSlug,
  activeClientSlug,
  activeFormId,
  onSelectClient,
  onSelectAgent,
  onSelectForm,
  onOpenAureliusChat,
}: SidebarProps) {
  const mediaBuyingMode = !!agents;
  const clientList: ClientV1[] = (clients ?? []).map((c) => ({
    slug: c.slug,
    name: c.name,
    status: statusToV1(c.status),
    counts: {},
  }));
  const clientCount = clientList.length;

  return (
    <aside className="md-sidebar">
      <div className="md-nav-section">
        <div className="md-nav-label">▸ Workspace</div>
        <button
          type="button"
          className={`md-nav-item${activeWorkspace === "dashboard" ? " md-active" : ""}`}
          onClick={() => onSelectWorkspace("dashboard")}
        >
          <span className="md-glyph">▸</span>
          <span>Dashboard</span>
        </button>
        <button
          type="button"
          className={`md-nav-item${activeWorkspace === "calendar" ? " md-active" : ""}`}
          onClick={() => onSelectWorkspace("calendar")}
        >
          <span className="md-glyph">◴</span>
          <span>Calendar</span>
        </button>
        <button
          type="button"
          className={`md-nav-item${activeWorkspace === "tasks" ? " md-active" : ""}`}
          onClick={() => onSelectWorkspace("tasks")}
        >
          <span className="md-glyph">☰</span>
          <span>Tasks</span>
        </button>
      </div>

      <div className="md-nav-section">
        <div className="md-nav-label">
          <span>▸ Clients · {clientCount}</span>
          <button
            type="button"
            className="md-add-mini"
            onClick={onAddClient}
            aria-label="Add client"
          >
            +
          </button>
        </div>

        {mediaBuyingMode
          ? clientList.map((client) => {
              const isActive = client.slug === activeClientSlug;
              return (
                <button
                  key={client.slug}
                  type="button"
                  className={`md-client-row${isActive ? " md-active-client" : ""}`}
                  onClick={() => onSelectClient?.(client.slug)}
                  title="Switch active client for media buying"
                >
                  <span className="md-caret" style={{ visibility: "hidden" }}>▸</span>
                  <span className={`md-dot md-${client.status}`} />
                  <span>{client.name}</span>
                  {isActive && <span className="md-active-mark">●</span>}
                </button>
              );
            })
          : clientList.map((client) => (
              <ClientTree
                key={client.slug}
                client={client}
                defaultExpanded
                onSelect={(slug, section) => onSelectClientSection?.(slug, section)}
              />
            ))}

        <button type="button" className="md-add-client-row" onClick={onAddClient}>
          + Add client
        </button>
      </div>

      <div className="md-nav-section">
        <div className="md-nav-label">▸ Workflows</div>
        <button
          type="button"
          className={`md-nav-item${activeWorkflow === "media-buying" ? " md-active" : ""}`}
          onClick={() => onSelectWorkflow("media-buying")}
        >
          <span className="md-glyph">▣</span>
          <span>Media Buying</span>
        </button>
      </div>

      {onSelectForm && (
        <div className="md-nav-section">
          <div className="md-nav-label">▸ Forms · {ALL_FORM_CONFIGS.length}</div>
          {ALL_FORM_CONFIGS.map((cfg) => {
            const accent = AGENT_ACCENT[cfg.agentSlug.toLowerCase()] ?? "#95a0b3";
            const isActive = cfg.id === activeFormId;
            return (
              <button
                key={cfg.id}
                type="button"
                className={`md-nav-item md-agent-item${isActive ? " md-active" : ""}`}
                onClick={() => onSelectForm(cfg.id as FormSurfaceId)}
                title={`${cfg.title} · ${cfg.agentName}`}
              >
                <span
                  className="md-agent-initial"
                  style={{
                    color: accent,
                    borderColor: `${accent}55`,
                    background: `${accent}14`,
                  }}
                >
                  {cfg.agentName[0]}
                </span>
                <span>{cfg.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {(onOpenAureliusChat || (agents && agents.some((a) => a.slug.toLowerCase() === "aurelius"))) && (
        <div className="md-nav-section">
          <div className="md-nav-label">▸ Chat</div>
          <button
            type="button"
            className={`md-nav-item md-agent-item${
              activeAgentSlug === "aurelius" ? " md-active" : ""
            }`}
            onClick={() => {
              if (onOpenAureliusChat) {
                onOpenAureliusChat();
                return;
              }
              const aurelius = agents?.find((a) => a.slug.toLowerCase() === "aurelius");
              if (aurelius) onSelectAgent?.(aurelius);
            }}
            title="Talk to Aurelius — the only chat agent"
          >
            <span
              className="md-agent-initial"
              style={{
                color: AGENT_ACCENT.aurelius,
                borderColor: `${AGENT_ACCENT.aurelius}55`,
                background: `${AGENT_ACCENT.aurelius}14`,
              }}
            >
              A
            </span>
            <span>Aurelius</span>
            <span className="md-count">CHAT</span>
          </button>
        </div>
      )}

      <div className="md-sidebar-foot">
        <div className="md-row">
          <span>Folder</span>
          <span className="md-copper">SYNCED</span>
        </div>
        <div className="md-row">
          <span>Agents</span>
          <span>{agents ? String(agents.length) : "—"}</span>
        </div>
        <div className="md-row">
          <span>v0.2.0</span>
          <span>α</span>
        </div>
      </div>
    </aside>
  );
}

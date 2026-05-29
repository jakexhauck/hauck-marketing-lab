import { useEffect, useMemo, useState } from "react";
import type { AgentSummary, ClientEntry } from "../../lib/types";
import { ALL_FORM_CONFIGS, type FormConfig, type FormSurfaceId } from "../../lib/formConfigs";
import { loadLayout, saveLayout, type SidebarLayout } from "../../lib/formLayout";
import { ClientTree, type ClientSection } from "./ClientTree";
import { FormLayoutEditor } from "./FormLayoutEditor";
import type { ClientV1 } from "./v1Data";

export type WorkspaceView = "dashboard" | "calendar" | "tasks" | "recordings" | "sops";
export type WorkflowView = "media-buying" | "lead-scraper" | "web-designer";

interface SidebarProps {
  activeWorkspace: WorkspaceView | null;
  activeWorkflow?: WorkflowView | null;
  onSelectWorkspace: (view: WorkspaceView) => void;
  onSelectClientSection?: (slug: string, section: ClientSection) => void;
  onSelectWorkflow: (view: WorkflowView) => void;
  onAddClient?: () => void;
  onManageClients?: () => void;
  /** Active media-buying root — needed for ClientTree to fetch Drive indexes. */
  root?: string | null;
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
  /** Open the Troubleshooting page (media-buying view only). */
  onOpenTroubleshooting?: () => void;
  /** Highlight the Troubleshooting nav item. */
  activeTroubleshooting?: boolean;
}

const AGENT_ACCENT: Record<string, string> = {
  vortex: "#a78bfa",
  stratos: "#f59e0b",
  nexus: "#38bdf8",
  zenith: "#5fe699",
  aurelius: "#b478ff",
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
  onManageClients,
  root,
  clients,
  agents,
  activeAgentSlug,
  activeClientSlug,
  activeFormId,
  onSelectClient,
  onSelectAgent,
  onSelectForm,
  onOpenAureliusChat,
  onOpenTroubleshooting,
  activeTroubleshooting,
}: SidebarProps) {
  const mediaBuyingMode = !!agents;
  const clientList: ClientV1[] = (clients ?? []).map((c) => ({
    slug: c.slug,
    name: c.name,
    status: statusToV1(c.status),
    counts: {},
  }));
  const driveUrlBySlug = new Map<string, string | null>(
    (clients ?? []).map((c) => [c.slug, c.drive_folder_url ?? null]),
  );
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
        <button
          type="button"
          className={`md-nav-item${activeWorkspace === "recordings" ? " md-active" : ""}`}
          onClick={() => onSelectWorkspace("recordings")}
        >
          <span className="md-glyph">▶</span>
          <span>Recordings</span>
        </button>
        <button
          type="button"
          className={`md-nav-item${activeWorkspace === "sops" ? " md-active" : ""}`}
          onClick={() => onSelectWorkspace("sops")}
        >
          <span className="md-glyph">☑</span>
          <span>SOPs</span>
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
                root={root ?? null}
                driveFolderUrl={driveUrlBySlug.get(client.slug) ?? null}
                defaultExpanded
                onSelect={(slug, section) => onSelectClientSection?.(slug, section)}
              />
            ))}

        <button type="button" className="md-add-client-row" onClick={onAddClient}>
          + Add client
        </button>
        {onManageClients && (
          <button
            type="button"
            className="md-add-client-row md-manage-client-row"
            onClick={onManageClients}
          >
            Manage clients
          </button>
        )}
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
        <button
          type="button"
          className={`md-nav-item${activeWorkflow === "lead-scraper" ? " md-active" : ""}`}
          onClick={() => onSelectWorkflow("lead-scraper")}
        >
          <span className="md-glyph">◎</span>
          <span>Lead Scraper</span>
        </button>
        <button
          type="button"
          className={`md-nav-item${activeWorkflow === "web-designer" ? " md-active" : ""}`}
          onClick={() => onSelectWorkflow("web-designer")}
        >
          <span className="md-glyph">◈</span>
          <span>Web Designer</span>
        </button>
        {mediaBuyingMode && onOpenTroubleshooting && (
          <button
            type="button"
            className={`md-nav-item${activeTroubleshooting ? " md-active" : ""}`}
            onClick={onOpenTroubleshooting}
            title="Common Meta Ads issues and fixes"
          >
            <span className="md-glyph">?</span>
            <span>Troubleshooting</span>
          </button>
        )}
      </div>

      {onSelectForm && (
        <FormsSection
          activeFormId={activeFormId ?? null}
          onSelectForm={onSelectForm}
        />
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
            title="Talk to Aurelius: the only chat agent"
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
          <span>v0.1.6</span>
          <span>α</span>
        </div>
      </div>
    </aside>
  );
}

interface FormsSectionProps {
  activeFormId: string | null;
  onSelectForm: (id: FormSurfaceId) => void;
}

function FormsSection({ activeFormId, onSelectForm }: FormsSectionProps) {
  const [layout, setLayout] = useState<SidebarLayout>(() => loadLayout(ALL_FORM_CONFIGS));
  const [editorOpen, setEditorOpen] = useState(false);

  const configsById = useMemo(() => {
    const m = new Map<string, FormConfig>();
    for (const c of ALL_FORM_CONFIGS) m.set(c.id, c);
    return m;
  }, []);

  // Re-reconcile if the underlying form list changes at runtime (e.g. HMR).
  useEffect(() => {
    setLayout((cur) => loadLayout(ALL_FORM_CONFIGS) || cur);
  }, []);

  function applyLayout(next: SidebarLayout) {
    setLayout(next);
    saveLayout(next);
  }

  function toggleCategory(catId: string) {
    applyLayout({
      ...layout,
      categories: layout.categories.map((c) =>
        c.id === catId ? { ...c, collapsed: !c.collapsed } : c,
      ),
    });
  }

  function handleEditorSave(next: SidebarLayout) {
    applyLayout(next);
    setEditorOpen(false);
  }

  const totalForms = layout.categories.reduce((n, c) => n + c.formIds.length, 0);

  return (
    <>
      <div className="md-nav-section">
        <div className="md-nav-label">
          <span>▸ Forms · {totalForms}</span>
          <button
            type="button"
            className="md-add-mini"
            onClick={() => setEditorOpen(true)}
            aria-label="Edit forms layout"
            title="Edit categories and form order"
          >
            ✎
          </button>
        </div>
        {layout.categories.map((cat) => {
          const collapsed = !!cat.collapsed;
          return (
            <div key={cat.id} className="md-form-phase">
              <button
                type="button"
                className="md-form-cat-head"
                onClick={() => toggleCategory(cat.id)}
                aria-expanded={!collapsed}
              >
                <span className={`md-form-cat-caret${collapsed ? "" : " md-open"}`}>▸</span>
                <span className="md-form-cat-name">{cat.name}</span>
                <span className="md-form-cat-count">{cat.formIds.length}</span>
              </button>
              {!collapsed &&
                cat.formIds.map((fid) => {
                  const cfg = configsById.get(fid);
                  if (!cfg) return null;
                  const accent = AGENT_ACCENT[cfg.agentSlug.toLowerCase()] ?? "#95a0b3";
                  const isActive = cfg.id === activeFormId;
                  return (
                    <button
                      key={cfg.id}
                      type="button"
                      className={`md-nav-item md-agent-item${isActive ? " md-active" : ""}`}
                      onClick={() => onSelectForm(cfg.id as FormSurfaceId)}
                      title={`${cfg.title} · ${cfg.agentName} · ${cat.name}`}
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
          );
        })}
      </div>
      <FormLayoutEditor
        open={editorOpen}
        layout={layout}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditorSave}
      />
    </>
  );
}

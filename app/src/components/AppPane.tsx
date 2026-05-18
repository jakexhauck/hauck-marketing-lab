import { useCallback, useEffect, useRef, useState } from "react";
import { AgentFormsHub } from "./AgentFormsHub";
import { AskDock } from "./AskDock";
import { ChatDrawer } from "./ChatDrawer";
import { CommandPalette } from "./CommandPalette";
import { Dashboard } from "./Dashboard";
import { DiagnosisForm } from "./DiagnosisForm";
import { GenericFormGenerator } from "./GenericFormGenerator";
import { KnowledgeBrowser } from "./KnowledgeBrowser";
import { MainDashboard } from "./MainDashboard";
import { Sidebar, type WorkflowView } from "./MainDashboard/Sidebar";
import { TopBar } from "./MainDashboard/TopBar";
import { TroubleshootingPage } from "./MainDashboard/TroubleshootingPage";
import "./MainDashboard/main-dashboard.css";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { TrackingAuditWalkthrough } from "./TrackingAuditWalkthrough";
import { WorkflowChain } from "./WorkflowChain";
import { getFormConfig, type FormSurfaceId } from "../lib/formConfigs";
import { api } from "../lib/tauri";
import { PaneContext } from "../lib/PaneContext";
import { usePaneWidth } from "../lib/usePaneWidth";
import type {
  AgentSummary,
  ChatFile,
  ChatSummary,
  ClientEntry,
  ClientStatus,
  FolderSummary,
  KnowledgeChunk,
  KnowledgeTitle,
  SkillEntry,
} from "../lib/types";
import { IconClose, IconExternalLink, IconReturnLeft, IconSplit } from "./icons";

type GeneratorSurface =
  | "audit"
  | "workflow-launch"
  | "workflow-optimize"
  | "workflow-scale"
  | FormSurfaceId;

export interface AppPaneProps {
  paneId: string;
  isPrimary: boolean;
  isDetached?: boolean;
  /** Global pieces — shared across panes, read from disk. */
  root: string;
  summary: FolderSummary;
  clients: ClientEntry[];
  defaultAgentSlug: string | null;
  syncing: boolean;
  syncStatus: "idle" | "ok" | "error";
  syncTooltip: string;
  refreshing: boolean;
  /** Pane initial state — used when split or popped out. */
  initialClientSlug: string;
  initialView?: "main" | "media-buying";
  initialGenerator?: GeneratorSurface | null;
  /** Onboarding-dismissed map (global, per-client). */
  onboardingDismissed: Record<string, boolean>;
  dismissOnboarding: (slug: string) => void;
  restoreOnboarding: (slug: string) => void;
  /** Persisted active client setter — only primary pane writes to disk. */
  onActiveClientChanged: (slug: string, persist: boolean) => Promise<void>;
  /** Refresh the global folder summary (delegates to App.tsx). */
  loadFolder: (clientSlugOverride?: string) => Promise<void>;
  /** Trigger git sync via App.tsx. */
  onSync: () => void;
  /** Open the global Settings overlay. */
  onOpenSettings: () => void;
  /** Open the Add-Client surface. */
  onOpenAddClient: () => void;
  /** Open the Manage-Clients surface. */
  onOpenManageClients: () => void;
  /** Split-view chrome. */
  canSplit?: boolean;
  onSplit?: () => void;
  onClosePane?: () => void;
  onPopOut?: () => void;
  onReturnToMain?: () => void;
}

export function AppPane(props: AppPaneProps) {
  const {
    paneId,
    isPrimary,
    isDetached = false,
    root,
    summary,
    clients,
    defaultAgentSlug,
    syncing,
    syncStatus,
    syncTooltip,
    refreshing,
    initialClientSlug,
    initialView = "main",
    initialGenerator = null,
    onboardingDismissed,
    dismissOnboarding,
    restoreOnboarding,
    onActiveClientChanged,
    loadFolder,
    onSync,
    onOpenSettings,
    onOpenAddClient,
    onOpenManageClients,
    canSplit,
    onSplit,
    onClosePane,
    onPopOut,
    onReturnToMain,
  } = props;

  const paneRootRef = useRef<HTMLDivElement>(null);
  const { width: paneWidth, compact } = usePaneWidth(paneRootRef);

  const [activeClientSlug, setActiveClientSlug] = useState<string>(initialClientSlug);
  const [clientStatus, setClientStatus] = useState<ClientStatus>("pre-launch");
  const [activeAgent, setActiveAgent] = useState<AgentSummary | null>(
    summary.agents[0] ?? null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentChat, setCurrentChat] = useState<ChatFile | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeChunkId, setKnowledgeChunkId] = useState<string | null>(null);
  const [pendingInput, setPendingInput] = useState<string | undefined>(undefined);
  const pendingInputTick = useRef(0);
  const [view, setView] = useState<"main" | "media-buying">(initialView);
  const [pendingWorkflow, setPendingWorkflow] = useState<WorkflowView | null>(null);
  const [troubleshootingOpen, setTroubleshootingOpen] = useState(false);
  const [generator, setGenerator] = useState<GeneratorSurface | null>(initialGenerator);
  const [agentFormsHub, setAgentFormsHub] = useState<AgentSummary | null>(null);

  const isChatAgent = (slug: string) => slug.toLowerCase() === "aurelius";

  const activeClient =
    clients.find((c) => c.slug === activeClientSlug) ?? clients[0] ?? {
      slug: activeClientSlug,
      name: activeClientSlug,
      status: "pre-launch" as const,
    };

  // Read client status when the active client changes.
  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await api.readClientStatus(root, activeClientSlug);
        if (!cancelled) setClientStatus(status);
      } catch {
        if (!cancelled) setClientStatus("pre-launch");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, activeClientSlug]);

  // Refetch client status when global vault changes for this client.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unlistenVault: (() => void) | null = null;
    (async () => {
      unlisten = await api.onDataChanged((evt) => {
        if (
          evt.kind === "onboarding" ||
          evt.kind === "client" ||
          (evt.kind === "vault" &&
            (evt.client_slug === activeClientSlug || evt.client_slug === null))
        ) {
          (async () => {
            try {
              const status = await api.readClientStatus(root, activeClientSlug);
              setClientStatus(status);
            } catch {
              // ignore
            }
          })();
        }
      });
      unlistenVault = await api.onVaultChanged((evt) => {
        if (evt.kind === "client" && evt.client_slug === activeClientSlug) {
          (async () => {
            try {
              const status = await api.readClientStatus(root, activeClientSlug);
              setClientStatus(status);
              const el = paneRootRef.current?.querySelector(
                `[data-client-slug="${activeClientSlug}"]`,
              );
              if (el) {
                el.classList.remove("hml-vault-pulse");
                void (el as HTMLElement).offsetWidth;
                el.classList.add("hml-vault-pulse");
              }
            } catch {
              // ignore
            }
          })();
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
      if (unlistenVault) unlistenVault();
    };
  }, [root, activeClientSlug]);

  // ⌘K / Ctrl+K palette — pane-scoped: only fires when this pane has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        // If the event originated inside a different pane, ignore.
        const root = paneRootRef.current;
        const target = e.target as Node | null;
        if (root && target && !root.contains(target)) return;
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openDrawer = (agent: AgentSummary, chat: ChatFile | null = null) => {
    setActiveAgent(agent);
    setCurrentChat(chat);
    setDrawerOpen(true);
  };

  const onAgentSelect = (agent: AgentSummary) => {
    setActiveAgent(agent);
    if (isChatAgent(agent.slug)) {
      setAgentFormsHub(null);
      if (drawerOpen) {
        setCurrentChat(null);
      } else {
        openDrawer(agent);
      }
      return;
    }
    setDrawerOpen(false);
    setCurrentChat(null);
    setGenerator(null);
    setDiagnosisOpen(false);
    setKnowledgeOpen(false);
    setTroubleshootingOpen(false);
    setAgentFormsHub(agent);
  };

  const onOpenChatFromList = async (chat: ChatSummary) => {
    try {
      const file = await api.readChat(chat.path);
      const agent =
        summary.agents.find((a) => a.slug === chat.agent || a.name === chat.agent) ??
        activeAgent ??
        summary.agents[0];
      if (!agent) return;
      openDrawer(agent, file);
    } catch {
      // ignore
    }
  };

  const onAskDock = () => {
    const aurelius = summary.agents.find((a) => isChatAgent(a.slug));
    const fallback =
      aurelius ??
      activeAgent ??
      (defaultAgentSlug
        ? summary.agents.find((a) => a.slug === defaultAgentSlug)
        : undefined) ??
      summary.agents[0];
    if (fallback) openDrawer(fallback, null);
  };

  const onChatSaved = async () => {
    await loadFolder();
  };

  const onPaletteChat = async (chat: ChatSummary) => {
    setPaletteOpen(false);
    await onOpenChatFromList(chat);
  };

  const onPaletteSkill = (skill: SkillEntry) => {
    setPaletteOpen(false);
    pendingInputTick.current += 1;
    setPendingInput(`Run the ${skill.name} skill.`);
    const agent = activeAgent ?? summary.agents[0];
    if (agent) openDrawer(agent, currentChat);
  };

  const onPaletteKnowledge = (item: KnowledgeTitle) => {
    setPaletteOpen(false);
    setKnowledgeChunkId(item.id);
    setKnowledgeOpen(true);
  };

  const onOpenKnowledgeBrowser = () => {
    setPaletteOpen(false);
    setKnowledgeChunkId(null);
    setKnowledgeOpen(true);
  };

  const onCloseKnowledge = () => {
    setKnowledgeOpen(false);
    setKnowledgeChunkId(null);
  };

  const onPinKnowledgeToChat = (chunk: KnowledgeChunk) => {
    const agent = activeAgent ?? summary.agents[0];
    if (!agent) return;
    setKnowledgeOpen(false);
    setKnowledgeChunkId(null);
    pendingInputTick.current += 1;
    setPendingInput(
      `Reference this knowledge chunk in your reply:\n\n## ${chunk.id} — ${chunk.title}\n${chunk.body}\n\n`,
    );
    openDrawer(agent, null);
  };

  const onOpenDiagnosis = () => {
    setPaletteOpen(false);
    setDiagnosisOpen(true);
  };

  const onCloseDiagnosis = () => {
    setDiagnosisOpen(false);
    void loadFolder();
  };

  const openGenerator = (surface: GeneratorSurface) => {
    setPaletteOpen(false);
    setDiagnosisOpen(false);
    setKnowledgeOpen(false);
    setTroubleshootingOpen(false);
    setGenerator(surface);
  };

  const openTroubleshooting = () => {
    setPaletteOpen(false);
    setDiagnosisOpen(false);
    setKnowledgeOpen(false);
    setGenerator(null);
    setAgentFormsHub(null);
    setDrawerOpen(false);
    setTroubleshootingOpen(true);
  };

  const closeGenerator = () => {
    setGenerator(null);
    void loadFolder();
  };

  const onAgentChangeInDrawer = (agent: AgentSummary) => {
    setActiveAgent(agent);
    setCurrentChat(null);
  };

  // ── client switching (per-pane). Only the primary pane persists to disk.
  const switchClient = useCallback(
    async (slug: string) => {
      setKnowledgeOpen(false);
      setDiagnosisOpen(false);
      setGenerator(null);
      setAgentFormsHub(null);
      setCurrentChat(null);
      setTroubleshootingOpen(false);

      setActiveClientSlug(slug);
      // Only the primary pane writes the persisted slug to disk.
      await onActiveClientChanged(slug, isPrimary);
    },
    [onActiveClientChanged, isPrimary],
  );

  const clientName = activeClient.name;
  const clientSlug = activeClient.slug;

  // Dock advertises Aurelius.
  const dockAgent =
    summary.agents.find((a) => isChatAgent(a.slug)) ??
    activeAgent ??
    (defaultAgentSlug
      ? summary.agents.find((a) => a.slug === defaultAgentSlug) ?? summary.agents[0]
      : summary.agents[0]);

  const onSelectWorkspaceFromShell = (_tab: unknown) => {
    setView("main");
  };
  const onSelectWorkflowFromShell = (tab: WorkflowView) => {
    if (tab === "media-buying") return;
    if (tab === "lead-scraper" || tab === "web-designer") {
      setPendingWorkflow(tab);
      setView("main");
    }
  };

  // Pane chrome buttons rendered into the MainDashboard top-bar via DOM portal? No — we inject via a small floating button row.
  // Simpler: render a thin pane control strip absolutely positioned at the top right corner of the pane.

  const paneControls = (
    <div className="hml-pane-controls">
      {canSplit && onSplit && (
        <button
          type="button"
          className="hml-pane-ctl"
          onClick={onSplit}
          title="Split view"
          aria-label="Split view"
        >
          <IconSplit size={13} />
        </button>
      )}
      {onPopOut && (
        <button
          type="button"
          className="hml-pane-ctl"
          onClick={onPopOut}
          title="Open in new window"
          aria-label="Open in new window"
        >
          <IconExternalLink size={13} />
        </button>
      )}
      {onReturnToMain && (
        <button
          type="button"
          className="hml-pane-ctl"
          onClick={onReturnToMain}
          title="Return to main window"
          aria-label="Return to main window"
        >
          <IconReturnLeft size={13} />
        </button>
      )}
      {onClosePane && (
        <button
          type="button"
          className="hml-pane-ctl hml-pane-ctl-close"
          onClick={onClosePane}
          title="Close pane"
          aria-label="Close pane"
        >
          <IconClose size={13} />
        </button>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (view === "main") {
    body = (
      <>
        <MainDashboard
          onOpenMediaBuying={() => setView("media-buying")}
          root={root}
          clients={clients}
          activeClientSlug={activeClientSlug}
          onSync={onSync}
          syncing={syncing}
          syncStatus={syncStatus}
          syncTooltip={syncTooltip}
          onSettings={onOpenSettings}
          onAddClient={onOpenAddClient}
          onManageClients={onOpenManageClients}
          initialWorkflow={pendingWorkflow}
          onInitialWorkflowApplied={() => setPendingWorkflow(null)}
          agents={summary.agents}
          onOpenForm={(id, slug) => {
            void switchClient(slug);
            openGenerator(id);
          }}
          onSwitchClient={(slug) => void switchClient(slug)}
        />
        {generator && getFormConfig(generator) && (
          <div
            className="hml-overlay hml-overlay--pane"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeGenerator();
            }}
          >
            <div className="hml-overlay-content">
              <GenericFormGenerator
                config={getFormConfig(generator)!}
                root={root}
                agents={summary.agents}
                clientName={clientName}
                clientSlug={clientSlug}
                onClose={closeGenerator}
              />
            </div>
          </div>
        )}
      </>
    );
  } else {
    // Media-buying pane content.
    const paneContent = diagnosisOpen ? (
      <DiagnosisForm
        root={root}
        agents={summary.agents}
        clientName={clientName}
        clientSlug={clientSlug}
        onClose={onCloseDiagnosis}
      />
    ) : knowledgeOpen ? (
      <KnowledgeBrowser
        root={root}
        initialChunkId={knowledgeChunkId}
        onClose={onCloseKnowledge}
        onPinToChat={onPinKnowledgeToChat}
      />
    ) : generator === "audit" ? (
      <TrackingAuditWalkthrough
        root={root}
        agents={summary.agents}
        clientName={clientName}
        clientSlug={clientSlug}
        onClose={closeGenerator}
      />
    ) : generator === "workflow-launch" ||
      generator === "workflow-optimize" ||
      generator === "workflow-scale" ? (
      <WorkflowChain
        root={root}
        agents={summary.agents}
        clientName={clientName}
        clientSlug={clientSlug}
        onClose={closeGenerator}
        initialKind={
          generator === "workflow-launch"
            ? "launch"
            : generator === "workflow-optimize"
              ? "optimize"
              : "scale"
        }
      />
    ) : generator && getFormConfig(generator) ? (
      <GenericFormGenerator
        config={getFormConfig(generator)!}
        root={root}
        agents={summary.agents}
        clientName={clientName}
        clientSlug={clientSlug}
        onClose={closeGenerator}
      />
    ) : agentFormsHub ? (
      <AgentFormsHub
        agent={agentFormsHub}
        clientName={clientName}
        onOpenForm={(id) => openGenerator(id)}
        onClose={() => setAgentFormsHub(null)}
      />
    ) : troubleshootingOpen ? (
      <TroubleshootingPage />
    ) : clientStatus === "pre-launch" && !onboardingDismissed[clientSlug] ? (
      <OnboardingChecklist
        root={root}
        clientName={clientName}
        clientSlug={clientSlug}
        agents={summary.agents}
        onComplete={() => dismissOnboarding(clientSlug)}
      />
    ) : (
      <Dashboard
        summary={summary}
        clientName={clientName}
        clientSlug={clientSlug}
        clientStatus={clientStatus}
        root={root}
        drawerOpen={drawerOpen}
        onOpenChat={onOpenChatFromList}
        onOpenDiagnosis={onOpenDiagnosis}
        onBackToOnboarding={() => restoreOnboarding(clientSlug)}
        onOpenHookGenerator={() => openGenerator("hooks")}
        onOpenCreativeBrief={() => openGenerator("creative-brief")}
        onOpenTrackingAudit={() => openGenerator("audit")}
        onOpenWorkflowLaunch={() => openGenerator("workflow-launch")}
        onOpenWorkflowOptimize={() => openGenerator("workflow-optimize")}
        onOpenWorkflowScale={() => openGenerator("workflow-scale")}
      />
    );

    body = (
      <>
        <div className="md-root">
          <TopBar
            onBrandClick={() => setView("main")}
            onCommand={() => setPaletteOpen(true)}
            onSettings={onOpenSettings}
            onRefresh={() => loadFolder()}
            refreshing={refreshing}
            onSync={onSync}
            syncing={syncing}
            syncStatus={syncStatus}
            syncTooltip={syncTooltip}
            rightLabel={clientName.toUpperCase()}
          />
          <div className="md-shell">
            <Sidebar
              activeWorkspace={null}
              activeWorkflow="media-buying"
              clients={clients}
              agents={summary.agents}
              activeAgentSlug={drawerOpen ? activeAgent?.slug ?? null : null}
              activeClientSlug={clientSlug}
              activeFormId={generator}
              onSelectWorkspace={onSelectWorkspaceFromShell}
              onSelectWorkflow={onSelectWorkflowFromShell}
              onSelectClient={(slug) => void switchClient(slug)}
              onSelectAgent={(agent) => onAgentSelect(agent)}
              onSelectForm={(id) => openGenerator(id)}
              onOpenAureliusChat={onAskDock}
              onOpenTroubleshooting={openTroubleshooting}
              activeTroubleshooting={troubleshootingOpen}
              onAddClient={onOpenAddClient}
            />
            <main className="md-main md-main--mb">{paneContent}</main>
          </div>
        </div>

        {!drawerOpen &&
          !knowledgeOpen &&
          !generator &&
          !agentFormsHub &&
          !troubleshootingOpen && dockAgent && (
            <AskDock
              agentName={dockAgent.name}
              agentInitial={dockAgent.initial}
              onClick={onAskDock}
            />
          )}

        {drawerOpen && activeAgent && (
          <ChatDrawer
            key={`drawer-${paneId}-${pendingInputTick.current}`}
            root={root}
            agents={summary.agents}
            activeAgent={activeAgent}
            clientName={clientName}
            clientSlug={activeClientSlug}
            initialChat={currentChat}
            initialInput={pendingInput}
            onClose={() => {
              setDrawerOpen(false);
              setPendingInput(undefined);
            }}
            onAgentChange={onAgentChangeInDrawer}
            onChatSaved={onChatSaved}
            onOpenPalette={() => setPaletteOpen(true)}
          />
        )}

        <CommandPalette
          open={paletteOpen}
          root={root}
          chats={summary.chats}
          onClose={() => setPaletteOpen(false)}
          onOpenChat={onPaletteChat}
          onScaffoldSkill={onPaletteSkill}
          onOpenKnowledge={onPaletteKnowledge}
          onOpenDiagnosis={onOpenDiagnosis}
          onOpenKnowledgeBrowser={onOpenKnowledgeBrowser}
          onOpenTrackingAudit={() => openGenerator("audit")}
          onOpenWorkflowLaunch={() => openGenerator("workflow-launch")}
          onOpenWorkflowOptimize={() => openGenerator("workflow-optimize")}
          onOpenWorkflowScale={() => openGenerator("workflow-scale")}
          onOpenForm={(id) => openGenerator(id)}
        />
      </>
    );
  }

  const detachedNotice = isDetached ? (
    <div className="hml-pane-detached-tag">DETACHED</div>
  ) : null;

  return (
    <PaneContext.Provider
      value={{
        paneId,
        isPrimary,
        isDetached,
        width: paneWidth,
        compact,
        rootRef: paneRootRef,
      }}
    >
      <div
        ref={paneRootRef}
        className={`hml-pane${compact ? " hml-pane--compact" : ""}${isDetached ? " hml-pane--detached" : ""}`}
        data-pane-id={paneId}
      >
        {paneControls}
        {detachedNotice}
        {body}
      </div>
    </PaneContext.Provider>
  );
}


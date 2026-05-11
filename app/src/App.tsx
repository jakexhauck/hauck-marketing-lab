import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AgentFormsHub } from "./components/AgentFormsHub";
import { AskDock } from "./components/AskDock";
import { ChatDrawer } from "./components/ChatDrawer";
import { ClientsPage } from "./components/ClientsPage";
import { CommandPalette } from "./components/CommandPalette";
import { CreativeBriefBuilder } from "./components/CreativeBriefBuilder";
import { Dashboard } from "./components/Dashboard";
import { DiagnosisForm } from "./components/DiagnosisForm";
import { FolderPicker } from "./components/FolderPicker";
import { GenericFormGenerator } from "./components/GenericFormGenerator";
import { HookGenerator } from "./components/HookGenerator";
import { KnowledgeBrowser } from "./components/KnowledgeBrowser";
import { MainDashboard } from "./components/MainDashboard";
import { Sidebar, type WorkspaceView, type WorkflowView } from "./components/MainDashboard/Sidebar";
import { TopBar } from "./components/MainDashboard/TopBar";
import "./components/MainDashboard/main-dashboard.css";
import { OnboardingChecklist } from "./components/OnboardingChecklist";
import { ReportBuilder } from "./components/ReportBuilder";
import { ScaleReadiness } from "./components/ScaleReadiness";
import { SettingsPage } from "./components/SettingsPage";
import { TrackingAuditWalkthrough } from "./components/TrackingAuditWalkthrough";
import { WorkflowChain } from "./components/WorkflowChain";
import { getFormConfig, type FormSurfaceId } from "./lib/formConfigs";
import { api } from "./lib/tauri";
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
} from "./lib/types";

const DEFAULT_CLIENT: ClientEntry = {
  slug: "willis-windows",
  name: "Willis Windows",
  status: "pre-launch",
};

export default function App() {
  const [bootError, setBootError] = useState<string | null>(null);
  const [root, setRoot] = useState<string | null>(null);
  const [summary, setSummary] = useState<FolderSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentChat, setCurrentChat] = useState<ChatFile | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeChunkId, setKnowledgeChunkId] = useState<string | null>(null);
  const [pendingInput, setPendingInput] = useState<string | undefined>(undefined);
  const pendingInputTick = useRef(0);
  const [bootDone, setBootDone] = useState(false);
  const [clientStatus, setClientStatus] = useState<ClientStatus>("pre-launch");

  // Multi-client state
  const [clients, setClients] = useState<ClientEntry[]>([DEFAULT_CLIENT]);
  const [activeClientSlug, setActiveClientSlug] = useState<string>(DEFAULT_CLIENT.slug);
  const [clientsPageOpen, setClientsPageOpen] = useState(false);
  const [clientsPageStartInAdd, setClientsPageStartInAdd] = useState(false);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultAgentSlug, setDefaultAgentSlug] = useState<string | null>(null);

  // Main Dashboard vs Media Buying — boots into the Main Dashboard.
  const [view, setView] = useState<"main" | "media-buying">("main");

  // Git sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "ok" | "error">("idle");
  const [syncTooltip, setSyncTooltip] = useState<string>("Sync with GitHub");
  const syncTimerRef = useRef<number | null>(null);

  // Per-client onboarding-dismissed flag — localStorage-backed for v1.
  // Set when the user clicks "Skip" or "Onboarding complete" inside the
  // OnboardingChecklist; until set, a pre-launch client lands on the checklist
  // instead of the existing pre-launch Dashboard.
  const ONBOARDING_DISMISS_KEY = "hml-onboarding-dismissed-v1";
  const [onboardingDismissed, setOnboardingDismissed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(ONBOARDING_DISMISS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const dismissOnboarding = useCallback((slug: string) => {
    setOnboardingDismissed((prev) => {
      const next = { ...prev, [slug]: true };
      try {
        localStorage.setItem(ONBOARDING_DISMISS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  const restoreOnboarding = useCallback((slug: string) => {
    setOnboardingDismissed((prev) => {
      if (!prev[slug]) return prev;
      const next = { ...prev };
      delete next[slug];
      try {
        localStorage.setItem(ONBOARDING_DISMISS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Generator surface — null = dashboard, otherwise the open generator.
  // Form surface ids (welcome-email, contract, audiences, etc.) are also valid
  // values; they route to the shared GenericFormGenerator via getFormConfig.
  type GeneratorSurface =
    | "hooks"
    | "briefs"
    | "reports"
    | "scale"
    | "audit"
    | "workflow-launch"
    | "workflow-optimize"
    | "workflow-scale"
    | FormSurfaceId;
  const [generator, setGenerator] = useState<GeneratorSurface | null>(null);

  // Forms hub for a non-Aurelius specialist agent. When set, clicking the
  // agent in the sidebar lands here instead of a chat drawer. Aurelius keeps
  // his chat. Selecting a form here opens the generator on top of the hub;
  // closing the form returns to the hub.
  const [agentFormsHub, setAgentFormsHub] = useState<AgentSummary | null>(null);
  const isChatAgent = (slug: string) => slug.toLowerCase() === "aurelius";

  const activeClient =
    clients.find((c) => c.slug === activeClientSlug) ?? clients[0] ?? DEFAULT_CLIENT;

  const loadFolder = useCallback(
    async (path: string, clientSlugOverride?: string) => {
      setRefreshing(true);
      try {
        const next = await api.parseFolder(path);
        setSummary(next);
        setActiveAgent((prev) => {
          if (prev) {
            const stillThere = next.agents.find((a) => a.slug === prev.slug);
            return stillThere ?? next.agents[0] ?? null;
          }
          return next.agents[0] ?? null;
        });
        // Refresh clients registry alongside folder parse
        let latestClients: ClientEntry[] = [];
        try {
          latestClients = await api.listClients(path);
          if (latestClients.length === 0) latestClients = [DEFAULT_CLIENT];
          setClients(latestClients);
        } catch {
          latestClients = [DEFAULT_CLIENT];
          setClients(latestClients);
        }
        const resolvedSlug =
          clientSlugOverride ??
          (latestClients.some((c) => c.slug === activeClientSlug)
            ? activeClientSlug
            : latestClients[0]?.slug ?? DEFAULT_CLIENT.slug);
        try {
          const status = await api.readClientStatus(path, resolvedSlug);
          setClientStatus(status);
        } catch {
          setClientStatus("pre-launch");
        }
        setBootError(null);
        return next;
      } catch (e) {
        setBootError(String(e));
        return null;
      } finally {
        setRefreshing(false);
      }
    },
    [activeClientSlug],
  );

  const onSync = useCallback(async () => {
    if (syncing) return;
    if (!root) {
      setSyncStatus("error");
      setSyncTooltip(
        "No media-buying folder configured on this machine. Open Settings (⚙) and pick the folder first.",
      );
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => setSyncStatus("idle"), 5000);
      return;
    }
    setSyncing(true);
    setSyncStatus("idle");
    setSyncTooltip("Syncing with GitHub…");
    try {
      const result = await api.gitSync(root);
      setSyncStatus("ok");
      const stamp = new Date().toLocaleTimeString();
      setSyncTooltip(`${result.summary}\nLast sync: ${stamp}\n\n${result.detail}`);
      await loadFolder(root);
    } catch (e) {
      setSyncStatus("error");
      setSyncTooltip(`Sync failed:\n${String(e)}`);
      console.error("git sync failed", e);
    } finally {
      setSyncing(false);
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => setSyncStatus("idle"), 4000);
    }
  }, [root, syncing, loadFolder]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.loadConfig();
        if (cfg.default_agent_slug) {
          setDefaultAgentSlug(cfg.default_agent_slug);
        }
        if (cfg.media_buying_path) {
          setRoot(cfg.media_buying_path);
          const persistedSlug = cfg.active_client_slug ?? undefined;
          if (persistedSlug) {
            setActiveClientSlug(persistedSlug);
          }
          await loadFolder(cfg.media_buying_path, persistedSlug ?? undefined);
        }
      } catch (e) {
        setBootError(String(e));
      } finally {
        setBootDone(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refresh on window focus
  useEffect(() => {
    if (!root) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      const win = getCurrentWindow();
      unlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          loadFolder(root);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [root, loadFolder]);

  // refresh folder summary when chats are written (e.g. via CLI)
  useEffect(() => {
    if (!root) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onDataChanged((evt) => {
        if (evt.kind === "chat") {
          loadFolder(root);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [root, loadFolder]);

  // ⌘K / Ctrl+K palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onFolderPicked = async (path: string) => {
    setRoot(path);
    await api.saveConfig({
      media_buying_path: path,
      active_client_slug: activeClientSlug,
      default_agent_slug: defaultAgentSlug ?? null,
    });
    await loadFolder(path);
  };

  const openDrawer = (agent: AgentSummary, chat: ChatFile | null = null) => {
    setActiveAgent(agent);
    setCurrentChat(chat);
    setDrawerOpen(true);
  };

  const onAgentSelect = (agent: AgentSummary) => {
    setActiveAgent(agent);
    if (isChatAgent(agent.slug)) {
      // Aurelius keeps the chat surface
      setAgentFormsHub(null);
      if (drawerOpen) {
        // already chatting — start a fresh thread with Aurelius
        setCurrentChat(null);
      } else {
        openDrawer(agent);
      }
      return;
    }
    // Specialist agent — show their forms hub. Close any active chat so the
    // two surfaces don't overlap.
    setDrawerOpen(false);
    setCurrentChat(null);
    setGenerator(null);
    setSettingsOpen(false);
    setClientsPageOpen(false);
    setDiagnosisOpen(false);
    setKnowledgeOpen(false);
    setAgentFormsHub(agent);
  };

  const onOpenChatFromList = async (chat: ChatSummary) => {
    try {
      const file = await api.readChat(chat.path);
      const agent =
        summary?.agents.find((a) => a.slug === chat.agent || a.name === chat.agent) ??
        activeAgent ??
        summary?.agents[0];
      if (!agent) return;
      openDrawer(agent, file);
    } catch (e) {
      setBootError(String(e));
    }
  };

  const onAskDock = () => {
    // Chat is Aurelius-only. The dock always routes there if he's present;
    // otherwise fall back to active/default/first agent so the dock isn't dead.
    const aurelius = summary?.agents.find((a) => isChatAgent(a.slug));
    const fallback =
      aurelius ??
      activeAgent ??
      (defaultAgentSlug
        ? summary?.agents.find((a) => a.slug === defaultAgentSlug)
        : undefined) ??
      summary?.agents[0];
    if (fallback) openDrawer(fallback, null);
  };

  const onChatSaved = async () => {
    if (!root) return;
    await loadFolder(root);
  };

  const onPaletteChat = async (chat: ChatSummary) => {
    setPaletteOpen(false);
    await onOpenChatFromList(chat);
  };

  const onPaletteSkill = (skill: SkillEntry) => {
    setPaletteOpen(false);
    pendingInputTick.current += 1;
    setPendingInput(`Run the ${skill.name} skill.`);
    const agent = activeAgent ?? summary?.agents[0];
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
    const agent = activeAgent ?? summary?.agents[0];
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
    if (root) loadFolder(root);
  };

  const openGenerator = (surface: GeneratorSurface) => {
    setPaletteOpen(false);
    setDiagnosisOpen(false);
    setKnowledgeOpen(false);
    setSettingsOpen(false);
    setClientsPageOpen(false);
    setGenerator(surface);
  };

  const closeGenerator = () => {
    setGenerator(null);
    if (root) loadFolder(root);
  };

  const onAgentChangeInDrawer = (agent: AgentSummary) => {
    setActiveAgent(agent);
    setCurrentChat(null);
  };

  // ── client switching ──────────────────────────────────
  const switchClient = async (slug: string) => {
    if (slug === activeClientSlug || !root) {
      setActiveClientSlug(slug);
      return;
    }
    setActiveClientSlug(slug);
    // close any per-client modal/drawer state to avoid stale references
    setDiagnosisOpen(false);
    setGenerator(null);
    setAgentFormsHub(null);
    setCurrentChat(null);
    try {
      await api.saveConfig({
        media_buying_path: root,
        active_client_slug: slug,
        default_agent_slug: defaultAgentSlug ?? null,
      });
    } catch (e) {
      console.error("persist active client failed", e);
    }
    await loadFolder(root, slug);
  };

  const onOpenAddClient = () => {
    setClientsPageStartInAdd(true);
    setClientsPageOpen(true);
  };

  const onClientsChanged = (next: ClientEntry[]) => {
    setClients(next.length === 0 ? [DEFAULT_CLIENT] : next);
    // If the active client was deleted, fall back to the first remaining one.
    if (!next.some((c) => c.slug === activeClientSlug) && next[0]) {
      void switchClient(next[0].slug);
    }
  };

  if (view === "main") {
    return (
      <MainDashboard
        onOpenMediaBuying={() => setView("media-buying")}
        root={root}
        clients={clients}
        onSync={onSync}
        syncing={syncing}
        syncStatus={syncStatus}
        syncTooltip={syncTooltip}
      />
    );
  }

  if (!bootDone) {
    return (
      <div className="picker-shell">
        <div style={{ fontFamily: "var(--mono)", color: "var(--text-faint)", letterSpacing: "0.16em" }}>
          BOOTING…
        </div>
      </div>
    );
  }

  if (!root || !summary) {
    return (
      <FolderPicker
        initialError={bootError}
        onPicked={onFolderPicked}
      />
    );
  }

  if (summary.agents.length === 0) {
    return (
      <FolderPicker
        initialError={`No agents found in ${summary.root}/agents. Check that the folder contains agents/*.md files.`}
        onPicked={onFolderPicked}
      />
    );
  }

  // Dock advertises the chat agent (Aurelius). If not found, fall back to the
  // active or default agent so the surface stays usable.
  const dockAgent =
    summary.agents.find((a) => isChatAgent(a.slug)) ??
    activeAgent ??
    (defaultAgentSlug
      ? summary.agents.find((a) => a.slug === defaultAgentSlug) ?? summary.agents[0]
      : summary.agents[0]);
  const clientName = activeClient.name;
  const clientSlug = activeClient.slug;

  const onSelectWorkspaceFromShell = (tab: WorkspaceView) => {
    // Any workspace pick exits media-buying back to the main dashboard.
    setView("main");
    if (tab !== "dashboard") {
      // Calendar/Tasks are still wired by MainDashboard's own state, which
      // resets to dashboard on mount — the click intent is preserved in spirit
      // by simply returning to main.
    }
  };
  const onSelectWorkflowFromShell = (_tab: WorkflowView) => {
    // Only media-buying remains; we're already here.
  };

  const paneContent = settingsOpen ? (
    <SettingsPage
      root={root}
      agents={summary.agents}
      clients={clients}
      defaultAgentSlug={defaultAgentSlug}
      activeClientSlug={clientSlug}
      activeClientName={clientName}
      onClose={() => setSettingsOpen(false)}
      onFolderChanged={async (path) => {
        setRoot(path);
        await loadFolder(path);
      }}
      onDefaultAgentChanged={(slug) => setDefaultAgentSlug(slug)}
      onManageClients={() => {
        setSettingsOpen(false);
        setClientsPageStartInAdd(false);
        setClientsPageOpen(true);
      }}
    />
  ) : clientsPageOpen ? (
    <ClientsPage
      root={root}
      clients={clients}
      activeSlug={clientSlug}
      onClose={() => setClientsPageOpen(false)}
      onClientsChanged={onClientsChanged}
      onSelectClient={(slug) => {
        void switchClient(slug);
      }}
      startInAddMode={clientsPageStartInAdd}
    />
  ) : diagnosisOpen ? (
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
  ) : generator === "hooks" ? (
    <HookGenerator
      root={root}
      agents={summary.agents}
      clientName={clientName}
      clientSlug={clientSlug}
      onClose={closeGenerator}
    />
  ) : generator === "briefs" ? (
    <CreativeBriefBuilder
      root={root}
      agents={summary.agents}
      clientName={clientName}
      clientSlug={clientSlug}
      onClose={closeGenerator}
    />
  ) : generator === "reports" ? (
    <ReportBuilder
      root={root}
      agents={summary.agents}
      clientName={clientName}
      clientSlug={clientSlug}
      onClose={closeGenerator}
    />
  ) : generator === "scale" ? (
    <ScaleReadiness
      root={root}
      agents={summary.agents}
      clientName={clientName}
      clientSlug={clientSlug}
      onClose={closeGenerator}
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
  ) : clientStatus === "pre-launch" && !onboardingDismissed[clientSlug] ? (
    <OnboardingChecklist
      clientName={clientName}
      clientSlug={clientSlug}
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
      onOpenCreativeBrief={() => openGenerator("briefs")}
      onOpenReport={() => openGenerator("reports")}
      onOpenScaleReadiness={() => openGenerator("scale")}
      onOpenTrackingAudit={() => openGenerator("audit")}
      onOpenWorkflowLaunch={() => openGenerator("workflow-launch")}
      onOpenWorkflowOptimize={() => openGenerator("workflow-optimize")}
      onOpenWorkflowScale={() => openGenerator("workflow-scale")}
    />
  );

  return (
    <>
      <div className="md-root">
        <TopBar
          onBrandClick={() => setView("main")}
          onCommand={() => setPaletteOpen(true)}
          onSettings={() => {
            setClientsPageOpen(false);
            setDiagnosisOpen(false);
            setSettingsOpen(true);
          }}
          onRefresh={() => loadFolder(root)}
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
            onAddClient={onOpenAddClient}
          />
          <main className="md-main md-main--mb">{paneContent}</main>
        </div>
      </div>

      {!drawerOpen &&
        !clientsPageOpen &&
        !settingsOpen &&
        !knowledgeOpen &&
        !generator &&
        !agentFormsHub && (
          <AskDock
            agentName={dockAgent.name}
            agentInitial={dockAgent.initial}
            onClick={onAskDock}
          />
        )}

      {drawerOpen && activeAgent && (
        <ChatDrawer
          key={`drawer-${pendingInputTick.current}`}
          root={root}
          agents={summary.agents}
          activeAgent={activeAgent}
          clientName={clientName}
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
        onOpenHookGenerator={() => openGenerator("hooks")}
        onOpenCreativeBrief={() => openGenerator("briefs")}
        onOpenReport={() => openGenerator("reports")}
        onOpenScaleReadiness={() => openGenerator("scale")}
        onOpenTrackingAudit={() => openGenerator("audit")}
        onOpenWorkflowLaunch={() => openGenerator("workflow-launch")}
        onOpenWorkflowOptimize={() => openGenerator("workflow-optimize")}
        onOpenWorkflowScale={() => openGenerator("workflow-scale")}
        onOpenForm={(id) => openGenerator(id)}
      />
    </>
  );
}

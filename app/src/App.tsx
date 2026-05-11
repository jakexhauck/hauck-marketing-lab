import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AgentRail } from "./components/AgentRail";
import { AskDock } from "./components/AskDock";
import { ChatDrawer } from "./components/ChatDrawer";
import { ClientsPage } from "./components/ClientsPage";
import { CommandPalette } from "./components/CommandPalette";
import { Dashboard } from "./components/Dashboard";
import { DiagnosisForm } from "./components/DiagnosisForm";
import { FolderPicker } from "./components/FolderPicker";
import { KnowledgeBrowser } from "./components/KnowledgeBrowser";
import { SettingsPage } from "./components/SettingsPage";
import { StatusBar } from "./components/StatusBar";
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
  const awaitingReadinessVerdict = useRef(false);

  // Multi-client state
  const [clients, setClients] = useState<ClientEntry[]>([DEFAULT_CLIENT]);
  const [activeClientSlug, setActiveClientSlug] = useState<string>(DEFAULT_CLIENT.slug);
  const [clientsPageOpen, setClientsPageOpen] = useState(false);
  const [clientsPageStartInAdd, setClientsPageStartInAdd] = useState(false);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultAgentSlug, setDefaultAgentSlug] = useState<string | null>(null);

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
    if (drawerOpen) {
      setActiveAgent(agent);
      // start fresh thread when switching mid-drawer for now
      setCurrentChat(null);
    } else {
      openDrawer(agent);
    }
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
    if (activeAgent) {
      openDrawer(activeAgent, null);
      return;
    }
    const fallback =
      (defaultAgentSlug
        ? summary?.agents.find((a) => a.slug === defaultAgentSlug)
        : undefined) ?? summary?.agents[0];
    if (fallback) openDrawer(fallback);
  };

  const onAskAurelius = (bundledPrompt: string) => {
    const aurelius =
      summary?.agents.find((a) => a.slug === "aurelius" || a.name === "Aurelius") ??
      summary?.agents[0];
    if (!aurelius) return;
    openDrawer(aurelius, null);
    pendingInputTick.current += 1;
    setPendingInput(bundledPrompt);
    awaitingReadinessVerdict.current = true;
  };

  const onChatSaved = async () => {
    if (!root) return;
    await loadFolder(root);
    if (awaitingReadinessVerdict.current) {
      awaitingReadinessVerdict.current = false;
      const slugAtVerdict = activeClientSlug;
      (async () => {
        try {
          const fresh = await api.parseFolder(root);
          const latest = fresh.chats
            .filter((c) => c.agent === "aurelius" || c.agent === "Aurelius")
            .sort((a, b) => b.modified_at.localeCompare(a.modified_at))[0];
          if (!latest) return;
          const file = await api.readChat(latest.path);
          const lastAgentTurn = [...file.turns].reverse().find((t) => t.role === "agent");
          if (!lastAgentTurn) return;
          await api.saveLaunchReadinessVerdict(root, slugAtVerdict, lastAgentTurn.body);
        } catch (e) {
          console.error("verdict save failed", e);
        }
      })();
    }
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

  const onOpenManageClients = () => {
    setClientsPageStartInAdd(false);
    setClientsPageOpen(true);
  };

  const onClientsChanged = (next: ClientEntry[]) => {
    setClients(next.length === 0 ? [DEFAULT_CLIENT] : next);
    // If the active client was deleted, fall back to the first remaining one.
    if (!next.some((c) => c.slug === activeClientSlug) && next[0]) {
      void switchClient(next[0].slug);
    }
  };

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

  const dockAgent =
    activeAgent ??
    (defaultAgentSlug
      ? summary.agents.find((a) => a.slug === defaultAgentSlug) ?? summary.agents[0]
      : summary.agents[0]);
  const clientName = activeClient.name;
  const clientSlug = activeClient.slug;

  return (
    <>
      <StatusBar
        clients={clients}
        activeSlug={clientSlug}
        activeName={clientName}
        onSelectClient={switchClient}
        onAddClient={onOpenAddClient}
        onManageClients={onOpenManageClients}
        onOpenSettings={() => {
          setClientsPageOpen(false);
          setDiagnosisOpen(false);
          setSettingsOpen(true);
        }}
        onRefresh={() => loadFolder(root)}
        refreshing={refreshing}
      />
      <div className="shell">
        <AgentRail
          agents={summary.agents}
          activeSlug={drawerOpen ? activeAgent?.slug ?? null : null}
          drawerOpen={drawerOpen}
          onSelect={onAgentSelect}
        />
        {settingsOpen ? (
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
        ) : (
          <Dashboard
            summary={summary}
            clientName={clientName}
            clientSlug={clientSlug}
            clientStatus={clientStatus}
            root={root}
            drawerOpen={drawerOpen}
            onOpenChat={onOpenChatFromList}
            onAskAurelius={onAskAurelius}
            onOpenDiagnosis={onOpenDiagnosis}
          />
        )}
      </div>

      {!drawerOpen && !clientsPageOpen && !settingsOpen && !knowledgeOpen && (
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
      />
    </>
  );
}

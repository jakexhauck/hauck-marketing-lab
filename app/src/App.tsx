import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath } from "@tauri-apps/plugin-opener";
import { AgentRail } from "./components/AgentRail";
import { AskDock } from "./components/AskDock";
import { ChatDrawer } from "./components/ChatDrawer";
import { CommandPalette } from "./components/CommandPalette";
import { Dashboard } from "./components/Dashboard";
import { FolderPicker } from "./components/FolderPicker";
import { StatusBar } from "./components/StatusBar";
import { api } from "./lib/tauri";
import type {
  AgentSummary,
  ChatFile,
  ChatSummary,
  FolderSummary,
  KnowledgeTitle,
  SkillEntry,
} from "./lib/types";

const CLIENT_NAME = "Willis Windows";

export default function App() {
  const [bootError, setBootError] = useState<string | null>(null);
  const [root, setRoot] = useState<string | null>(null);
  const [summary, setSummary] = useState<FolderSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentChat, setCurrentChat] = useState<ChatFile | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingInput, setPendingInput] = useState<string | undefined>(undefined);
  const pendingInputTick = useRef(0);
  const [bootDone, setBootDone] = useState(false);

  const loadFolder = useCallback(async (path: string) => {
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
      setBootError(null);
      return next;
    } catch (e) {
      setBootError(String(e));
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.loadConfig();
        if (cfg.media_buying_path) {
          setRoot(cfg.media_buying_path);
          await loadFolder(cfg.media_buying_path);
        }
      } catch (e) {
        setBootError(String(e));
      } finally {
        setBootDone(true);
      }
    })();
  }, [loadFolder]);

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
    await api.saveConfig({ media_buying_path: path });
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
    if (!activeAgent && summary?.agents[0]) {
      openDrawer(summary.agents[0]);
    } else if (activeAgent) {
      openDrawer(activeAgent, null);
    }
  };

  const onChatSaved = () => {
    if (root) loadFolder(root);
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

  const onPaletteKnowledge = async (item: KnowledgeTitle) => {
    setPaletteOpen(false);
    try {
      await openPath(item.path);
    } catch (e) {
      setBootError(String(e));
    }
  };

  const onAgentChangeInDrawer = (agent: AgentSummary) => {
    setActiveAgent(agent);
    setCurrentChat(null);
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

  const dockAgent = activeAgent ?? summary.agents[0];

  return (
    <>
      <StatusBar
        client={CLIENT_NAME}
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
        <Dashboard
          summary={summary}
          clientName={CLIENT_NAME}
          drawerOpen={drawerOpen}
          onOpenChat={onOpenChatFromList}
        />
      </div>

      {!drawerOpen && (
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
          clientName={CLIENT_NAME}
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
      />
    </>
  );
}

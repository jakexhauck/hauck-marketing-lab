import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { assemblePrompt } from "../lib/prompt";
import type {
  AgentSummary,
  ChatFile,
  ChatTurn,
  StreamEvent,
} from "../lib/types";

type Props = {
  root: string;
  agents: AgentSummary[];
  activeAgent: AgentSummary;
  clientName: string;
  initialChat: ChatFile | null;
  initialInput?: string;
  onClose: () => void;
  onAgentChange: (agent: AgentSummary) => void;
  onChatSaved: () => void;
  onOpenPalette: () => void;
};

const SKILL_CHIPS: { label: string; prompt: string; featured?: boolean }[] = [
  {
    label: "Diagnose campaign",
    featured: true,
    prompt:
      "Diagnose the current Willis Windows campaign. Walk through what the data is saying and where the bottleneck is.",
  },
  {
    label: "Generate hooks",
    prompt: "Generate 12 fresh hooks for Willis Windows across 4 angles.",
  },
  { label: "Tracking audit", prompt: "Walk through tracking — pixel, CAPI, EMQ, dedup." },
  { label: "Scale readiness", prompt: "Are we ready to scale? What does the data say?" },
  { label: "Creative brief", prompt: "Build a creative brief for the next batch." },
  { label: "Audience expansion", prompt: "What audience expansions should we test next?" },
];

export function ChatDrawer({
  root,
  agents,
  activeAgent,
  clientName,
  initialChat,
  initialInput,
  onClose,
  onAgentChange,
  onChatSaved,
  onOpenPalette,
}: Props) {
  const [chatFile, setChatFile] = useState<ChatFile | null>(initialChat);
  const [input, setInput] = useState(initialInput ?? "");
  const [streaming, setStreaming] = useState(false);
  const [, setStreamId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setChatFile(initialChat);
    setError(null);
    setStreamText("");
    setStreaming(false);
    setStreamId(null);
  }, [initialChat]);

  useEffect(() => {
    if (initialInput !== undefined) setInput(initialInput);
  }, [initialInput]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !streaming) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, streaming]);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let mounted = true;
    api
      .onClaudeStream((evt: StreamEvent) => {
        if (!mounted) return;
        if (evt.kind === "started") {
          setStreamId(evt.id);
        } else if (evt.kind === "delta") {
          setStreamText((prev) => prev + evt.text);
        } else if (evt.kind === "done") {
          // handled in submit() after invokeClaude resolves
        } else if (evt.kind === "error") {
          setError(evt.message);
        }
      })
      .then((un) => {
        if (!mounted) {
          un();
          return;
        }
        unlistenFn = un;
      });
    return () => {
      mounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatFile?.turns.length, streamText]);

  const turns = chatFile?.turns ?? [];

  const submit = async () => {
    const value = input.trim();
    if (!value || streaming) return;

    setError(null);
    setInput("");

    let file = chatFile;
    if (!file) {
      try {
        file = await api.createChat(root, activeAgent.slug, value);
        setChatFile(file);
      } catch (e) {
        setError(String(e));
        return;
      }
    }

    const userTurn: ChatTurn = {
      role: "user",
      agent: null,
      at: new Date().toISOString(),
      body: value,
    };

    try {
      await api.appendTurn(file.path, userTurn);
    } catch (e) {
      setError(String(e));
      return;
    }

    const historyWithUser = [...file.turns, userTurn];
    setChatFile({ ...file, turns: historyWithUser });

    const placeholder: ChatTurn = {
      role: "agent",
      agent: activeAgent.name,
      at: new Date().toISOString(),
      body: "",
    };
    try {
      await api.appendTurn(file.path, placeholder);
    } catch (e) {
      setError(String(e));
      return;
    }

    setStreaming(true);
    setStreamText("");
    const id = crypto.randomUUID();
    setStreamId(id);

    let agentBody = "";
    try {
      agentBody = await api.readAgentBody(root, activeAgent.slug);
    } catch (e) {
      setError(`Could not read agent ${activeAgent.slug}: ${e}`);
      setStreaming(false);
      return;
    }

    const prompt = assemblePrompt({
      agent: activeAgent,
      agentBody,
      history: file.turns,
      userInput: value,
      clientName,
    });

    try {
      const full = await api.invokeClaude(id, prompt);
      const finalTurn: ChatTurn = {
        role: "agent",
        agent: activeAgent.name,
        at: new Date().toISOString(),
        body: full || streamText,
      };
      await api.replaceLastTurn(file.path, finalTurn);
      const refreshed = await api.readChat(file.path);
      setChatFile(refreshed);
      onChatSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
      setStreamId(null);
      setStreamText("");
    }
  };

  const visibleTurns = useMemo(() => {
    // If we're currently streaming, the last persisted turn is a placeholder — drop it for display
    if (streaming && turns.length > 0 && turns[turns.length - 1].role === "agent") {
      return turns.slice(0, -1);
    }
    return turns;
  }, [turns, streaming]);

  const headerMeta = chatFile
    ? `thread saving → ${chatFile.path.split(/[\\/]/).slice(-2).join("/")}`
    : "new conversation — will save on first send";

  return (
    <div className="drawer" role="dialog" aria-label={`Conversation with ${activeAgent.name}`}>
      <div className="drawer-head">
        <div>
          <div className="drawer-head-eye">▸ CONVERSATION</div>
          <div className="drawer-head-title">{activeAgent.name}</div>
          <div className="drawer-head-meta">{headerMeta}</div>
        </div>
        <div className="drawer-head-actions">
          <button className="drawer-close" title="Close" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="drawer-switcher">
        <span className="drawer-switcher-label">SWITCH ›</span>
        {agents.map((a) => (
          <button
            key={a.slug}
            className={`switcher-btn ${a.slug === activeAgent.slug ? "active" : ""}`}
            title={a.name}
            onClick={() => !streaming && onAgentChange(a)}
            disabled={streaming}
          >
            {a.initial}
          </button>
        ))}
      </div>

      <div className="thread" ref={threadRef}>
        {visibleTurns.length === 0 && !streaming && (
          <div className="thread-empty">
            Ask {activeAgent.name.toUpperCase()} something
          </div>
        )}

        {visibleTurns.map((t, i) => (
          <div className={`msg ${t.role} reveal reveal-${Math.min(i + 1, 5)}`} key={i}>
            <div className="msg-label">
              {t.role === "user" ? "YOU ›" : `${(t.agent ?? "AGENT").toUpperCase()} ›`}
            </div>
            <div className="msg-body">{t.body}</div>
          </div>
        ))}

        {streaming && (
          <div className="msg agent reveal">
            <div className="msg-label">{activeAgent.name.toUpperCase()} ›</div>
            <div className="msg-body">
              {streamText}
              <span className="caret" />
            </div>
          </div>
        )}

        {error && (
          <div className="msg agent">
            <div className="msg-label" style={{ color: "var(--signal-stop)" }}>
              ERROR ›
            </div>
            <div className="msg-body" style={{ color: "var(--signal-stop)" }}>
              {error}
            </div>
          </div>
        )}
      </div>

      <div className="chips-wrap">
        <div className="chips-label">QUICK SKILLS — click to scaffold a prompt</div>
        <div className="chips">
          {SKILL_CHIPS.map((c) => (
            <button
              key={c.label}
              className={`chip ${c.featured ? "featured" : ""}`}
              onClick={() => setInput(c.prompt)}
              disabled={streaming}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="input-wrap">
        <div className="input-row">
          <button className="input-attach" title="Attach file" disabled>
            +
          </button>
          <textarea
            ref={inputRef}
            className="input-field"
            rows={2}
            placeholder={`Ask ${activeAgent.name} about ${clientName}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={streaming}
          />
          <button
            className="input-send"
            onClick={submit}
            disabled={streaming || input.trim().length === 0}
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>
        <div className="input-hints">
          <div className="left">
            <span>
              <span className="kbd kbd-action">⌘ ↵</span>send
            </span>
            <span
              onClick={onOpenPalette}
              style={{ cursor: "pointer" }}
              title="Open command palette"
            >
              <span className="kbd">⌘ K</span>skill palette
            </span>
            <span>
              <span className="kbd">Esc</span>close
            </span>
          </div>
          <div className="right">
            <span>
              {activeAgent.name} · {streaming ? "drafting" : "ready"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

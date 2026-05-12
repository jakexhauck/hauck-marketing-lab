import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { assemblePrompt } from "../lib/prompt";
import {
  assembleSkillPrompt,
  defaultSkillChips,
  type SkillChip,
} from "../lib/skills";
import type {
  AgentSummary,
  ChatFile,
  ChatTurn,
  KnowledgeChunk,
  SkillFile,
  StreamEvent,
  VaultNote,
} from "../lib/types";

type Props = {
  root: string;
  agents: AgentSummary[];
  activeAgent: AgentSummary;
  clientName: string;
  clientSlug: string;
  initialChat: ChatFile | null;
  initialInput?: string;
  onClose: () => void;
  onAgentChange: (agent: AgentSummary) => void;
  onChatSaved: () => void;
  onOpenPalette: () => void;
};

const SKILL_CHIPS: SkillChip[] = defaultSkillChips();

function fallbackSkillPrompt(chip: SkillChip, clientName: string): string {
  return `Run the ${chip.label} skill for ${clientName}.\n\n(Skill file not found at media-buying/skills/${chip.category}/${chip.skillId}/SKILL.md — proceed using your built-in knowledge of this skill.)`;
}

export function ChatDrawer({
  root,
  agents,
  activeAgent,
  clientName,
  clientSlug,
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
  const [skillForm, setSkillForm] = useState<{
    skill: SkillFile;
    values: Record<string, string>;
  } | null>(null);
  const [memoryDraft, setMemoryDraft] = useState<{
    turnIndex: number;
    text: string;
    error: string | null;
    saving: boolean;
  } | null>(null);
  const [savedTurnIndexes, setSavedTurnIndexes] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setChatFile(initialChat);
    setError(null);
    setStreamText("");
    setStreaming(false);
    setStreamId(null);
    setSavedTurnIndexes(new Set());
    setMemoryDraft(null);
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

    // Slash commands — intercept before any LLM call
    if (value.startsWith("/")) {
      const helpText =
        "Available commands:\n" +
        "  /remember <fact>  — save a fact to this client's memory\n" +
        "  /help, /?         — show this list";

      if (value === "/help" || value === "/?") {
        setError(null);
        setInput("");
        showToast(helpText);
        return;
      }

      if (value === "/remember" || value.startsWith("/remember ")) {
        const fact = value === "/remember" ? "" : value.slice("/remember ".length).trim();
        if (!fact) {
          setError("Usage: /remember <fact>");
          return;
        }
        try {
          await api.appendToMemory(root, clientSlug, fact);
          setError(null);
          setInput("");
          showToast(`Remembered: ${fact}`);
        } catch (e) {
          setError(String(e));
        }
        return;
      }

      // Unknown slash command — surface usage, do not call LLM
      if (/^\/[A-Za-z?]/.test(value)) {
        setError(`Unknown command: ${value.split(/\s+/)[0]}. Try /help.`);
        return;
      }
    }

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

    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      knowledgeChunks = await api.matchKnowledgeChunks(root, value);
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    let aboutNotes: VaultNote[] = [];
    let clientNotes: VaultNote[] = [];
    try {
      [aboutNotes, clientNotes] = await Promise.all([
        api.readAboutNotes(root),
        api.readClientNotes(root, clientSlug),
      ]);
    } catch (e) {
      console.error("vault context fetch failed", e);
    }

    const prompt = assemblePrompt({
      agent: activeAgent,
      agentBody,
      history: file.turns,
      userInput: value,
      clientName,
      knowledgeChunks,
      aboutNotes,
      clientNotes,
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

  const saveMemoryDraft = async () => {
    if (!memoryDraft) return;
    const fact = memoryDraft.text.trim();
    if (!fact) {
      setMemoryDraft({ ...memoryDraft, error: "Fact can't be empty." });
      return;
    }
    setMemoryDraft({ ...memoryDraft, saving: true, error: null });
    try {
      await api.appendToMemory(root, clientSlug, fact);
      const savedIndex = memoryDraft.turnIndex;
      setSavedTurnIndexes((prev) => {
        const next = new Set(prev);
        next.add(savedIndex);
        return next;
      });
      setMemoryDraft(null);
      showToast(`Saved to ${clientName} memory.`);
    } catch (e) {
      setMemoryDraft((prev) =>
        prev ? { ...prev, saving: false, error: String(e) } : prev,
      );
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

        {visibleTurns.map((t, i) => {
          const isAgent = t.role === "agent";
          const hasBody = (t.body ?? "").trim().length > 0;
          const saved = savedTurnIndexes.has(i);
          return (
            <div className={`msg ${t.role} reveal reveal-${Math.min(i + 1, 5)}`} key={i}>
              <div className="msg-label">
                {t.role === "user" ? "YOU ›" : `${(t.agent ?? "AGENT").toUpperCase()} ›`}
                {isAgent && hasBody && (
                  <span className="msg-actions">
                    {saved && <span className="msg-saved-badge">remembered</span>}
                    <button
                      className="msg-action-btn"
                      title="Save a fact from this response to client memory"
                      onClick={() =>
                        setMemoryDraft({
                          turnIndex: i,
                          text: (t.body ?? "").trim().slice(0, 280),
                          error: null,
                          saving: false,
                        })
                      }
                    >
                      Save to memory
                    </button>
                  </span>
                )}
              </div>
              <div className="msg-body">{t.body}</div>
            </div>
          );
        })}

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
        {skillForm && (
          <div
            className="skill-form"
            style={{
              border: "1px solid var(--line)",
              padding: "10px 12px",
              margin: "0 0 10px 0",
              background: "rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", marginBottom: "6px" }}>
              {skillForm.skill.name.toUpperCase()} ›
            </div>
            {skillForm.skill.inputs.map((inp) => (
              <div key={inp.name} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ minWidth: "160px", fontSize: "12px", opacity: 0.8 }}>
                  {inp.label?.trim() || inp.name}
                </label>
                <input
                  type="text"
                  value={skillForm.values[inp.name] ?? ""}
                  placeholder={inp.prompt ?? inp.default ?? ""}
                  onChange={(e) =>
                    setSkillForm((prev) =>
                      prev ? { ...prev, values: { ...prev.values, [inp.name]: e.target.value } } : prev,
                    )
                  }
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1px solid var(--line)",
                    color: "inherit",
                    padding: "4px 6px",
                    font: "inherit",
                  }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <button
                className="chip featured"
                onClick={() => {
                  const prompt = assembleSkillPrompt(skillForm.skill, skillForm.values, clientName);
                  setInput(prompt);
                  setSkillForm(null);
                  inputRef.current?.focus();
                }}
              >
                Scaffold
              </button>
              <button className="chip" onClick={() => setSkillForm(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="chips">
          {SKILL_CHIPS.map((c) => (
            <button
              key={c.label}
              className={`chip ${c.featured ? "featured" : ""}`}
              onClick={async () => {
                try {
                  const skill = await api.loadSkill(root, c.category, c.skillId);
                  if (skill.inputs.length === 0) {
                    setInput(assembleSkillPrompt(skill, {}, clientName));
                    inputRef.current?.focus();
                  } else {
                    const defaults: Record<string, string> = {};
                    for (const i of skill.inputs) defaults[i.name] = i.default ?? "";
                    setSkillForm({ skill, values: defaults });
                  }
                } catch {
                  setInput(fallbackSkillPrompt(c, clientName));
                  inputRef.current?.focus();
                }
              }}
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

      {toast && (
        <div className="chat-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {memoryDraft && (
        <div
          className="kpi-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !memoryDraft.saving) setMemoryDraft(null);
          }}
        >
          <div className="kpi-modal" style={{ width: 560 }}>
            <div className="kpi-modal-head">
              <div className="kpi-modal-title">SAVE TO MEMORY · {clientName.toUpperCase()}</div>
              <button
                className="kpi-modal-close"
                onClick={() => !memoryDraft.saving && setMemoryDraft(null)}
                disabled={memoryDraft.saving}
                title="Cancel"
              >
                ×
              </button>
            </div>
            <div style={{ padding: "18px 28px 4px" }}>
              <label
                className="kpi-form-label"
                htmlFor="memory-draft-textarea"
                style={{ marginBottom: 10 }}
              >
                FACT TO REMEMBER
              </label>
              <textarea
                id="memory-draft-textarea"
                className="kpi-form-input"
                rows={6}
                value={memoryDraft.text}
                placeholder="What's the fact to remember?"
                onChange={(e) =>
                  setMemoryDraft((prev) => (prev ? { ...prev, text: e.target.value } : prev))
                }
                disabled={memoryDraft.saving}
                autoFocus
                style={{
                  resize: "vertical",
                  minHeight: 120,
                  fontFamily: "var(--sans)",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              />
              <div
                style={{
                  marginTop: 8,
                  fontFamily: "var(--mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                }}
              >
                Appends to vault/Clients/{clientName}/Memory.md with today's date.
              </div>
            </div>
            {memoryDraft.error && (
              <div className="kpi-form-err">{memoryDraft.error}</div>
            )}
            <div className="kpi-form-foot">
              <span className="kpi-form-hint">Manual only — agents never auto-save facts.</span>
              <div className="kpi-form-actions">
                <button
                  className="kpi-form-btn"
                  onClick={() => setMemoryDraft(null)}
                  disabled={memoryDraft.saving}
                >
                  Cancel
                </button>
                <button
                  className="kpi-form-btn primary"
                  onClick={saveMemoryDraft}
                  disabled={memoryDraft.saving || memoryDraft.text.trim().length === 0}
                >
                  {memoryDraft.saving ? "Saving…" : "Save to memory"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

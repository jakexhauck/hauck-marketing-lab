import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../lib/tauri";
import { assemblePrompt } from "../lib/prompt";
import type {
  AgentSummary,
  ChatFile,
  ChatHistoryItem,
  ChatTurn,
  SavedPrompt,
  StreamEvent,
  VaultNote,
} from "../lib/types";

/**
 * CopywriterChat / SkillChat — a free-form chat with a skill persona itself
 * (<skill>/CLAUDE.md + SKILL.md), not a media-buying agent. Replaces the old
 * ad-copy form: you type whatever prompt you like and get a normal streaming
 * chat back, scoped to the active client so the skill can use their Profile +
 * Memory. Defaults to the copywriter; pass `agent` + `loadSkill` to drive a
 * different persona (e.g. the data analyst for competitor-review pain-point
 * extraction). The `SkillChat` export is the agent-agnostic alias.
 *
 * Reuses the existing chat plumbing: invoke_claude streaming over
 * `claude://stream`, the create_chat / append_turn / replace_last_turn chat
 * files (saved under the agent's slug), and the shared .thread / .msg /
 * .input-wrap visual classes.
 */

/** A file the user attached, already read into text by the backend. */
type Attachment = { name: string; text: string; truncated: boolean };

const COPYWRITER_AGENT: AgentSummary = {
  slug: "copywriter",
  name: "Copywriter",
  initial: "C",
  short: "Copywriter",
  role: "Direct-response copywriter",
  description: "Direct-response copywriter skill",
  path: "",
};

type Props = {
  root: string;
  clientName: string;
  clientSlug: string;
  onClose: () => void;
  /** When provided, agent replies get a save button. The handler persists the
   *  chosen reply (e.g. as an Ads Sequence step output). On success the parent
   *  typically advances/unmounts this chat, so no local "saved" state is kept. */
  onSaveReply?: (text: string) => Promise<void> | void;
  /** Label for the save button. Defaults to "Save". */
  saveLabel?: string;
  /** The skill persona driving the chat. Defaults to the copywriter. Pass a
   *  different agent (e.g. the data analyst) to repurpose the same chat shell. */
  agent?: AgentSummary;
  /** Loads the persona body (CLAUDE.md + SKILL.md). Defaults to the copywriter
   *  skill loader. Pair with a matching `agent`. */
  loadSkill?: (root: string) => Promise<string>;
};

export function CopywriterChat({
  root,
  clientName,
  clientSlug,
  onClose,
  onSaveReply,
  saveLabel = "Save",
  agent = COPYWRITER_AGENT,
  loadSkill,
}: Props) {
  const loadSkillBody = loadSkill ?? api.readCopywriterSkill;
  const agentLabel = agent.short.toUpperCase();
  const [chatFile, setChatFile] = useState<ChatFile | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skillBody, setSkillBody] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Right rail: past conversations (per client + agent) and saved prompts
  // (per agent — each persona keeps its own set).
  const [railTab, setRailTab] = useState<"history" | "prompts">("history");
  const [chatList, setChatList] = useState<ChatHistoryItem[]>([]);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [promptDraft, setPromptDraft] = useState<{
    id: string | null;
    title: string;
    body: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const streamIdRef = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshChatList = useCallback(() => {
    api
      .listChats(root, clientSlug, agent.slug)
      .then(setChatList)
      .catch((e) => console.error("list chats failed", e));
  }, [root, clientSlug, agent.slug]);

  // Load conversation history + saved prompts on mount / client change.
  useEffect(() => {
    refreshChatList();
  }, [refreshChatList]);

  useEffect(() => {
    api
      .listSavedPrompts(root, agent.slug)
      .then(setPrompts)
      .catch((e) => console.error("list saved prompts failed", e));
  }, [root, agent.slug]);

  // Persist the prompt list whenever it changes (skip the initial empty load by
  // only writing on user actions — handled in the mutators below).
  const persistPrompts = useCallback(
    (next: SavedPrompt[]) => {
      setPrompts(next);
      api
        .saveSavedPrompts(root, agent.slug, next)
        .catch((e) => setError(`Could not save prompts: ${e}`));
    },
    [root, agent.slug],
  );

  const loadPastChat = useCallback(
    async (path: string) => {
      if (streaming) return;
      try {
        const file = await api.readChat(path);
        setChatFile(file);
        setInput("");
        setAttachments([]);
        setStreamText("");
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    },
    [streaming],
  );

  const startNewChat = useCallback(() => {
    // Abort whatever is in flight rather than bailing: clearing the stream id
    // makes any late deltas and the in-flight submit's completion no-op (it
    // checks streamIdRef before touching state), so a stuck "streaming" flag
    // can never wedge this button.
    streamIdRef.current = null;
    setStreaming(false);
    setChatFile(null);
    setInput("");
    setAttachments([]);
    setStreamText("");
    setError(null);
    inputRef.current?.focus();
  }, []);

  const deleteChat = useCallback(
    async (path: string, title: string) => {
      if (streaming) return;
      if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
      try {
        await api.deleteChat(path);
        // Optimistically drop it from the rail; clear the view if it was open.
        setChatList((prev) => prev.filter((c) => c.path !== path));
        if (chatFile?.path === path) {
          setChatFile(null);
          setStreamText("");
        }
      } catch (e) {
        setError(`Could not delete conversation: ${e}`);
      }
    },
    [streaming, chatFile],
  );

  const copyPrompt = useCallback(async (p: SavedPrompt) => {
    try {
      await navigator.clipboard.writeText(p.body);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId((cur) => (cur === p.id ? null : cur)), 1400);
    } catch {
      // clipboard can fail silently; nothing actionable to show.
    }
  }, []);

  const savePromptDraft = useCallback(() => {
    if (!promptDraft) return;
    const title = promptDraft.title.trim() || "Untitled";
    const body = promptDraft.body.trim();
    if (!body) return;
    if (promptDraft.id) {
      persistPrompts(
        prompts.map((p) =>
          p.id === promptDraft.id ? { ...p, title, body } : p,
        ),
      );
    } else {
      persistPrompts([
        ...prompts,
        { id: crypto.randomUUID(), title, body },
      ]);
    }
    setPromptDraft(null);
  }, [promptDraft, prompts, persistPrompts]);

  const deletePrompt = useCallback(
    (id: string) => {
      persistPrompts(prompts.filter((p) => p.id !== id));
    },
    [prompts, persistPrompts],
  );

  // Load the skill persona text once. This becomes the persona body.
  useEffect(() => {
    let cancelled = false;
    loadSkillBody(root)
      .then((body) => {
        if (!cancelled) setSkillBody(body);
      })
      .catch((e) => {
        if (!cancelled) setError(`Could not load the ${agent.name} skill: ${e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [root, loadSkillBody, agent.name]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !streaming) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, streaming]);

  // Stream deltas, filtered to the in-flight request id so a stray listener
  // elsewhere can't bleed into this thread.
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let mounted = true;
    api
      .onClaudeStream((evt: StreamEvent) => {
        if (!mounted) return;
        if (evt.id !== streamIdRef.current) return;
        if (evt.kind === "delta") {
          setStreamText((prev) => prev + evt.text);
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

  // While streaming, the last persisted turn is an empty placeholder — hide it.
  const visibleTurns = useMemo(() => {
    if (streaming && turns.length > 0 && turns[turns.length - 1].role === "agent") {
      return turns.slice(0, -1);
    }
    return turns;
  }, [turns, streaming]);

  const pickFiles = useCallback(async () => {
    try {
      const picked = await openDialog({
        multiple: true,
        directory: false,
        filters: [
          { name: "Data / text / PDF", extensions: ["csv", "tsv", "tab", "txt", "md", "json", "pdf"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      for (const p of paths) {
        try {
          const att = await api.readAttachmentText(p);
          setAttachments((prev) => [
            ...prev,
            { name: att.name, text: att.text, truncated: att.truncated },
          ]);
        } catch (e) {
          setError(String(e));
        }
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const submit = async () => {
    const typed = input.trim();
    const files = attachments;
    if ((!typed && files.length === 0) || streaming) return;
    if (!skillBody) {
      setError(`${agent.name} skill not loaded yet, give it a moment.`);
      return;
    }

    // The visible message stays clean (typed text + a list of file names); the
    // full file contents only go into the prompt so the thread isn't flooded
    // with a pasted CSV. Each turn's stored body matches what's shown.
    const fileBlocks = files
      .map(
        (a) =>
          `--- Attached file: ${a.name}${a.truncated ? " (truncated)" : ""} ---\n\`\`\`\n${a.text}\n\`\`\``,
      )
      .join("\n\n");
    const promptInput = files.length
      ? `${typed}${typed ? "\n\n" : ""}${fileBlocks}`
      : typed;
    const displayBody = files.length
      ? `${typed}${typed ? "\n\n" : ""}📎 Attached: ${files.map((a) => a.name).join(", ")}`
      : typed;

    setError(null);
    setInput("");
    setAttachments([]);

    let file = chatFile;
    if (!file) {
      try {
        file = await api.createChat(root, agent.slug, displayBody, clientSlug);
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
      body: displayBody,
    };
    try {
      await api.appendTurn(file.path, userTurn);
    } catch (e) {
      setError(String(e));
      return;
    }

    const historyForPrompt = file.turns;
    setChatFile({ ...file, turns: [...file.turns, userTurn] });

    const placeholder: ChatTurn = {
      role: "agent",
      agent: agent.name,
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
    streamIdRef.current = id;

    // Pull the active client's vault context so the skill can voice-match.
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
      agent,
      agentBody: skillBody,
      history: historyForPrompt,
      userInput: promptInput,
      clientName,
      aboutNotes,
      clientNotes,
    });

    try {
      const full = await api.invokeClaude(id, prompt);
      // If the user started a new conversation (or switched away) mid-stream,
      // streamIdRef no longer matches: persist the reply to its file but don't
      // yank the now-cleared view back to this thread.
      const finalTurn: ChatTurn = {
        role: "agent",
        agent: agent.name,
        at: new Date().toISOString(),
        body: full || streamText,
      };
      await api.replaceLastTurn(file.path, finalTurn);
      if (streamIdRef.current === id) {
        const refreshed = await api.readChat(file.path);
        setChatFile(refreshed);
      }
      refreshChatList();
    } catch (e) {
      if (streamIdRef.current === id) setError(String(e));
    } finally {
      if (streamIdRef.current === id) {
        setStreaming(false);
        streamIdRef.current = null;
        setStreamText("");
      }
    }
  };

  const doSave = async (text: string) => {
    if (!onSaveReply || saving) return;
    const body = (text ?? "").trim();
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveReply(body);
      // On success the parent advances/unmounts this chat; nothing more to do.
    } catch (e) {
      setError(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const headerMeta = chatFile
    ? `thread saving → ${chatFile.path.split(/[\\/]/).slice(-2).join("/")}`
    : "new conversation, will save on first send";

  return (
    <div className="cw-chat" role="dialog" aria-label={`Chat with the ${agent.name}`}>
      <div className="cw-main">
      <div className="drawer-head">
        <div>
          <div className="drawer-head-eye">▸ {agentLabel}</div>
          <div className="drawer-head-title">{agent.name}</div>
          <div className="drawer-head-meta">
            {headerMeta} · voice-matched to {clientName}
          </div>
        </div>
        <div className="drawer-head-actions">
          <button className="drawer-close" title="Close" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="thread" ref={threadRef}>
        {visibleTurns.map((t, i) => {
          const isAgent = t.role === "agent";
          const hasBody = (t.body ?? "").trim().length > 0;
          return (
            <div className={`msg ${t.role} reveal reveal-${Math.min(i + 1, 5)}`} key={i}>
              <div className="msg-label">
                {t.role === "user" ? "YOU ›" : `${agentLabel} ›`}
                {isAgent && hasBody && onSaveReply && (
                  <span className="msg-actions">
                    <button
                      className="msg-action-btn"
                      disabled={saving}
                      title="Save this reply"
                      onClick={() => void doSave(t.body)}
                    >
                      {saving ? "Saving…" : saveLabel}
                    </button>
                  </span>
                )}
              </div>
              <div className="msg-body">
                {isAgent ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.body}</ReactMarkdown>
                ) : (
                  t.body
                )}
              </div>
            </div>
          );
        })}

        {streaming && (
          <div className="msg agent reveal">
            <div className="msg-label">{agentLabel} ›</div>
            <div className="msg-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
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

      <div className="input-wrap">
        <div className="input-row">
          <textarea
            ref={inputRef}
            className="input-field"
            rows={6}
            placeholder=""
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline. Skip while an IME
              // composition is in flight so mid-composition Enter doesn't send.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={streaming}
          />
        </div>
        {attachments.length > 0 && (
          <div className="cw-attachments">
            {attachments.map((a, i) => (
              <span className="cw-chip" key={`${a.name}-${i}`} title={a.name}>
                <span className="cw-chip-name">
                  📎 {a.name}
                  {a.truncated ? " (truncated)" : ""}
                </span>
                <button
                  type="button"
                  className="cw-chip-x"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => removeAttachment(i)}
                  disabled={streaming}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="input-footer">
          <button
            type="button"
            className="input-attach-btn"
            onClick={pickFiles}
            disabled={streaming}
            title="Attach a file (CSV works best)"
          >
            + File
          </button>
          <div className="input-hints">
            <div className="left">
              <span>
                <span className="kbd kbd-action">↵</span>send
              </span>
              <span>
                <span className="kbd">⇧ ↵</span>new line
              </span>
              <span>
                <span className="kbd">Esc</span>close
              </span>
            </div>
            <div className="right">
              <span>{agent.short} · {streaming ? "drafting" : "ready"}</span>
            </div>
          </div>
          <button
            className="input-send"
            onClick={submit}
            disabled={streaming || (input.trim().length === 0 && attachments.length === 0)}
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>
      </div>
      </div>

      <aside className="cw-rail">
        <div className="cw-rail-tabs">
          <button
            type="button"
            className={"cw-rail-tab" + (railTab === "history" ? " is-active" : "")}
            onClick={() => setRailTab("history")}
          >
            Conversations
          </button>
          <button
            type="button"
            className={"cw-rail-tab" + (railTab === "prompts" ? " is-active" : "")}
            onClick={() => setRailTab("prompts")}
          >
            Saved prompts
          </button>
        </div>

        {railTab === "history" ? (
          <div className="cw-rail-body">
            <button
              type="button"
              className="cw-rail-new"
              onClick={startNewChat}
            >
              + New conversation
            </button>
            {chatList.length === 0 ? (
              <div className="cw-rail-empty">No past conversations for {clientName} yet.</div>
            ) : (
              chatList.map((c) => {
                const active = chatFile?.path === c.path;
                return (
                  <div className="cw-rail-item-row" key={c.path}>
                    <button
                      type="button"
                      className={"cw-rail-item" + (active ? " is-active" : "")}
                      disabled={streaming}
                      onClick={() => void loadPastChat(c.path)}
                      title={c.title}
                    >
                      <span className="cw-rail-item-title">{c.title}</span>
                      <span className="cw-rail-item-meta">
                        {c.started_at ? c.started_at.slice(0, 10) : ""} · {c.turns} msg
                      </span>
                    </button>
                    <button
                      type="button"
                      className="cw-rail-del"
                      disabled={streaming}
                      title="Delete this conversation"
                      aria-label={`Delete ${c.title}`}
                      onClick={() => void deleteChat(c.path, c.title)}
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="cw-rail-body">
            {promptDraft ? (
              <div className="cw-prompt-edit">
                <input
                  className="cw-prompt-input"
                  placeholder="Title"
                  value={promptDraft.title}
                  onChange={(e) =>
                    setPromptDraft({ ...promptDraft, title: e.target.value })
                  }
                />
                <textarea
                  className="cw-prompt-textarea"
                  placeholder="Prompt text (copy-paste only, never sent automatically)"
                  rows={6}
                  value={promptDraft.body}
                  onChange={(e) =>
                    setPromptDraft({ ...promptDraft, body: e.target.value })
                  }
                />
                <div className="cw-prompt-edit-actions">
                  <button
                    type="button"
                    className="cw-rail-btn primary"
                    onClick={savePromptDraft}
                    disabled={promptDraft.body.trim().length === 0}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="cw-rail-btn"
                    onClick={() => setPromptDraft(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="cw-rail-new"
                onClick={() => setPromptDraft({ id: null, title: "", body: "" })}
              >
                + Add prompt
              </button>
            )}
            {!promptDraft && prompts.length === 0 ? (
              <div className="cw-rail-empty">No saved prompts yet.</div>
            ) : (
              !promptDraft &&
              prompts.map((p) => (
                <div className="cw-prompt-item" key={p.id}>
                  <button
                    type="button"
                    className="cw-prompt-copy"
                    onClick={() => void copyPrompt(p)}
                    title="Copy to clipboard"
                  >
                    <span className="cw-prompt-title">{p.title}</span>
                    <span className="cw-prompt-hint">
                      {copiedId === p.id ? "Copied" : "Copy"}
                    </span>
                  </button>
                  <div className="cw-prompt-row-actions">
                    <button
                      type="button"
                      className="cw-prompt-mini"
                      onClick={() =>
                        setPromptDraft({ id: p.id, title: p.title, body: p.body })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="cw-prompt-mini"
                      onClick={() => deletePrompt(p.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/** Agent-agnostic alias. Same component; name reads honestly when driving a
 *  non-copywriter persona (e.g. the data analyst). */
export const SkillChat = CopywriterChat;

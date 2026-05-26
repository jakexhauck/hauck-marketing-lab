import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { assemblePrompt } from "../lib/prompt";
import type {
  AgentSummary,
  ChatFile,
  ChatTurn,
  StreamEvent,
  VaultNote,
} from "../lib/types";

/**
 * CopywriterChat — a free-form chat with the copywriter skill itself
 * (copywriter/CLAUDE.md + SKILL.md), not a media-buying agent. Replaces the
 * old ad-copy form: you type whatever prompt you like and get a normal
 * streaming chat back, scoped to the active client so the skill can voice-match
 * from their Profile + Memory.
 *
 * Reuses the existing chat plumbing: invoke_claude streaming over
 * `claude://stream`, the create_chat / append_turn / replace_last_turn chat
 * files (saved under the "copywriter" slug), and the shared .thread / .msg /
 * .input-wrap visual classes.
 */

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
};

export function CopywriterChat({
  root,
  clientName,
  clientSlug,
  onClose,
  onSaveReply,
  saveLabel = "Save",
}: Props) {
  const [chatFile, setChatFile] = useState<ChatFile | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skillBody, setSkillBody] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const streamIdRef = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load the copywriter skill text once. This becomes the persona body.
  useEffect(() => {
    let cancelled = false;
    api
      .readCopywriterSkill(root)
      .then((body) => {
        if (!cancelled) setSkillBody(body);
      })
      .catch((e) => {
        if (!cancelled) setError(`Could not load the copywriter skill: ${e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

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

  const submit = async () => {
    const value = input.trim();
    if (!value || streaming) return;
    if (!skillBody) {
      setError("Copywriter skill not loaded yet, give it a moment.");
      return;
    }

    setError(null);
    setInput("");

    let file = chatFile;
    if (!file) {
      try {
        file = await api.createChat(root, COPYWRITER_AGENT.slug, value);
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

    const historyForPrompt = file.turns;
    setChatFile({ ...file, turns: [...file.turns, userTurn] });

    const placeholder: ChatTurn = {
      role: "agent",
      agent: COPYWRITER_AGENT.name,
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
      agent: COPYWRITER_AGENT,
      agentBody: skillBody,
      history: historyForPrompt,
      userInput: value,
      clientName,
      aboutNotes,
      clientNotes,
    });

    try {
      const full = await api.invokeClaude(id, prompt);
      const finalTurn: ChatTurn = {
        role: "agent",
        agent: COPYWRITER_AGENT.name,
        at: new Date().toISOString(),
        body: full || streamText,
      };
      await api.replaceLastTurn(file.path, finalTurn);
      const refreshed = await api.readChat(file.path);
      setChatFile(refreshed);
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
      streamIdRef.current = null;
      setStreamText("");
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
    : "new conversation — will save on first send";

  return (
    <div className="cw-chat" role="dialog" aria-label="Chat with the copywriter">
      <div className="drawer-head">
        <div>
          <div className="drawer-head-eye">▸ COPYWRITER</div>
          <div className="drawer-head-title">Copywriter</div>
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
                {t.role === "user" ? "YOU ›" : "COPYWRITER ›"}
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
              <div className="msg-body">{t.body}</div>
            </div>
          );
        })}

        {streaming && (
          <div className="msg agent reveal">
            <div className="msg-label">COPYWRITER ›</div>
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

      <div className="input-wrap">
        <div className="input-row">
          <textarea
            ref={inputRef}
            className="input-field"
            rows={2}
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
            <span>Copywriter · {streaming ? "drafting" : "ready"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/tauri";
import type { StreamEvent } from "../../lib/types";
import {
  IconClose,
  IconCode,
  IconSend,
  IconSplit,
} from "../icons";
import {
  MODE_HINTS,
  MODE_LABELS,
  newId,
  type BuilderMode,
  type BuilderProject,
  type BuilderSession as Session,
  type BuilderToolCall,
  type BuilderTurn,
} from "../../lib/builderStore";

interface BuilderSessionProps {
  session: Session;
  project: BuilderProject | null;
  /** Persist a changed session (turns, mode, title, claudeSessionId). */
  onPersist: (session: Session) => void;
  onClose: () => void;
  /** Pull this pane into / out of a side-by-side split. */
  onToggleSplit?: () => void;
  splitActive?: boolean;
  /** Show the split control at all (hidden when no second tab is available). */
  canSplit?: boolean;
  /** A request to drop text (e.g. a file path) into this pane's composer. */
  insert?: { text: string; nonce: string } | null;
}

const MODES: BuilderMode[] = ["plan", "edits", "auto"];

export function BuilderSession({
  session,
  project,
  onPersist,
  onClose,
  onToggleSplit,
  splitActive,
  canSplit,
  insert,
}: BuilderSessionProps) {
  const [turns, setTurns] = useState<BuilderTurn[]>(session.turns);
  const [mode, setMode] = useState<BuilderMode>(session.mode);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [liveTools, setLiveTools] = useState<BuilderToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The stream id for the in-flight turn. Held in a ref so the (single)
  // listener can filter events for this session without re-subscribing.
  const activeIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(session.claudeSessionId);
  // Tools captured during the in-flight turn. A ref (not just state) so send()
  // can read the final list synchronously after the run resolves.
  const toolsRef = useRef<BuilderToolCall[]>([]);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastInsertNonce = useRef<string | null>(null);

  // Reload local state when the selected session changes (tab switch).
  useEffect(() => {
    setTurns(session.turns);
    setMode(session.mode);
    sessionIdRef.current = session.claudeSessionId;
    setStreamText("");
    setLiveTools([]);
    setError(null);
    activeIdRef.current = null;
    setStreaming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;
    api
      .onClaudeStream((evt: StreamEvent) => {
        if (!mounted) return;
        if (!activeIdRef.current || evt.id !== activeIdRef.current) return;
        if (evt.kind === "delta") {
          setStreamText((prev) => prev + evt.text);
        } else if (evt.kind === "tool_use") {
          const call = { name: evt.name, detail: evt.detail };
          toolsRef.current = [...toolsRef.current, call];
          setLiveTools((prev) => [...prev, call]);
        } else if (evt.kind === "session_id") {
          sessionIdRef.current = evt.session_id;
        } else if (evt.kind === "error") {
          setError(evt.message);
        }
      })
      .then((un) => {
        if (!mounted) {
          un();
          return;
        }
        unlisten = un;
      });
    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, streamText, liveTools.length]);

  // Append a requested file path to the composer (from the docs/assets panel).
  useEffect(() => {
    if (!insert || insert.nonce === lastInsertNonce.current) return;
    lastInsertNonce.current = insert.nonce;
    setInput((prev) => {
      const sep = prev && !/\s$/.test(prev) ? " " : "";
      return prev + sep + insert.text;
    });
    inputRef.current?.focus();
  }, [insert]);

  const changeMode = (m: BuilderMode) => {
    setMode(m);
    onPersist({ ...session, mode: m });
  };

  const send = async () => {
    const value = input.trim();
    if (!value || streaming || !project) return;

    const at = new Date().toISOString();
    const userTurn: BuilderTurn = { role: "user", text: value, at };
    const baseTurns = [...turns, userTurn];
    setTurns(baseTurns);
    setInput("");
    setError(null);
    setStreamText("");
    setLiveTools([]);
    toolsRef.current = [];
    setStreaming(true);

    const streamId = `builder-${session.id}-${newId()}`;
    activeIdRef.current = streamId;

    // Title the session after its first user message.
    const title =
      session.turns.length === 0 && session.title === "New session"
        ? value.slice(0, 48)
        : session.title;

    let full = "";
    try {
      full = await api.invokeBuilder(
        streamId,
        value,
        project.path,
        mode,
        sessionIdRef.current,
      );
    } catch (e) {
      setError((prev) => prev ?? String(e));
    }

    const capturedTools = toolsRef.current;
    activeIdRef.current = null;
    setStreaming(false);

    const agentText = full.trim();
    const finalTurns: BuilderTurn[] = [...baseTurns];
    if (agentText || capturedTools.length > 0) {
      finalTurns.push({
        role: "agent",
        text: agentText,
        tools: capturedTools.length > 0 ? capturedTools : undefined,
        at: new Date().toISOString(),
      });
    }
    setTurns(finalTurns);
    setStreamText("");
    setLiveTools([]);
    onPersist({
      ...session,
      title,
      mode,
      claudeSessionId: sessionIdRef.current,
      turns: finalTurns,
    });
  };

  const stop = async () => {
    if (activeIdRef.current) {
      try {
        await api.stopBuilder(activeIdRef.current);
      } catch {
        // ignore — child may already be gone
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  const placeholder = project
    ? `Tell Claude what to build in ${project.name}…  (⌘↵ to send)`
    : "Add a project folder first.";

  const emptyThread = turns.length === 0 && !streaming;

  return (
    <section className="bld-session">
      <header className="bld-session-bar">
        <div className="bld-mode-group" role="group" aria-label="Permission mode">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`bld-mode-btn${mode === m ? " bld-mode-active" : ""}`}
              onClick={() => changeMode(m)}
              title={MODE_HINTS[m]}
              disabled={streaming}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="bld-session-bar-right">
          {canSplit && onToggleSplit && (
            <button
              type="button"
              className={`hml-btn hml-ghost bld-icon-btn${splitActive ? " bld-icon-on" : ""}`}
              onClick={onToggleSplit}
              title={splitActive ? "Close split" : "Open side-by-side"}
            >
              <IconSplit size={14} />
            </button>
          )}
          <button
            type="button"
            className="hml-btn hml-ghost bld-icon-btn"
            onClick={onClose}
            title="Close session"
          >
            <IconClose size={14} />
          </button>
        </div>
      </header>

      <div className="bld-thread" ref={threadRef}>
        {emptyThread && (
          <div className="bld-empty">
            <IconCode size={26} />
            <p className="bld-empty-title">
              {project ? project.name : "No project"}
            </p>
            <p className="bld-empty-sub">
              {project
                ? `Working in ${project.path}`
                : "Pick a folder from the rail to start."}
            </p>
            <p className="bld-empty-mode">Mode: {MODE_LABELS[mode]}. {MODE_HINTS[mode]}</p>
          </div>
        )}

        {turns.map((t, i) => (
          <Turn key={i} turn={t} />
        ))}

        {streaming && (
          <div className="bld-turn bld-turn-agent">
            {liveTools.length > 0 && (
              <ul className="bld-tools">
                {liveTools.map((tool, i) => (
                  <li key={i} className="bld-tool">
                    <span className="bld-tool-name">{tool.name}</span>
                    {tool.detail && <span className="bld-tool-detail">{tool.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="bld-bubble bld-bubble-agent">
              {streamText ? (
                <pre className="bld-pre">{streamText}</pre>
              ) : (
                <span className="bld-thinking">Working…</span>
              )}
            </div>
          </div>
        )}

        {error && <div className="bld-error">{error}</div>}
      </div>

      <div className="bld-composer">
        <textarea
          ref={inputRef}
          className="bld-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={3}
          disabled={!project}
        />
        <div className="bld-composer-actions">
          {streaming ? (
            <button type="button" className="hml-btn bld-stop" onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="hml-btn hml-primary bld-send"
              onClick={() => void send()}
              disabled={!input.trim() || !project}
            >
              <IconSend size={13} />
              Send
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Turn({ turn }: { turn: BuilderTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`bld-turn ${isUser ? "bld-turn-user" : "bld-turn-agent"}`}>
      {!isUser && turn.tools && turn.tools.length > 0 && (
        <ul className="bld-tools">
          {turn.tools.map((tool, i) => (
            <li key={i} className="bld-tool">
              <span className="bld-tool-name">{tool.name}</span>
              {tool.detail && <span className="bld-tool-detail">{tool.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {turn.text && (
        <div className={`bld-bubble ${isUser ? "bld-bubble-user" : "bld-bubble-agent"}`}>
          <pre className="bld-pre">{turn.text}</pre>
        </div>
      )}
    </div>
  );
}

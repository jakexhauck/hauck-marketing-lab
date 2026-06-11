import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../lib/tauri";
import type { StreamEvent } from "../../lib/types";
import {
  buildMasterMarkdown,
  decompositionPrompt,
  materializeGraph,
  parseDecomposition,
  planningSystemPrompt,
  type ProjectGraph,
} from "../../lib/projectGraph";
import type { BuilderProject } from "../../lib/builderStore";
import { newId } from "../../lib/builderStore";
import { IconCode, IconSend } from "../icons";

interface Turn {
  role: "user" | "agent";
  text: string;
}

interface PlanComposerProps {
  project: BuilderProject;
  /** Fired once the graph has been written to disk. */
  onGraphCreated: (graph: ProjectGraph) => void;
}

/**
 * Phase one of the unified Builder flow: design the master plan in one chat,
 * grounded in the real repo (Claude runs in `plan` mode so it reads but writes
 * nothing). When the user is satisfied, "Generate graph" asks Claude to
 * decompose the plan into steps + a DAG, then files it under `.hml/`.
 */
export function PlanComposer({ project, onGraphCreated }: PlanComposerProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;
    api
      .onClaudeStream((evt: StreamEvent) => {
        if (!mounted || !activeIdRef.current || evt.id !== activeIdRef.current) return;
        if (evt.kind === "delta") setStreamText((p) => p + evt.text);
        else if (evt.kind === "session_id") sessionIdRef.current = evt.session_id;
        else if (evt.kind === "error") setError(evt.message);
      })
      .then((un) => {
        if (!mounted) un();
        else unlisten = un;
      });
    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, streamText]);

  /** Run one planning turn. The first turn carries the system framing. */
  const runTurn = async (message: string): Promise<string> => {
    const isFirst = sessionIdRef.current === null;
    const prompt = isFirst
      ? `${planningSystemPrompt(project.name)}\n\n---\n\n${message}`
      : message;
    const streamId = `plan-${project.id}-${newId()}`;
    activeIdRef.current = streamId;
    setStreamText("");
    try {
      const full = await api.invokeBuilder(
        streamId,
        prompt,
        project.path,
        "plan",
        sessionIdRef.current,
      );
      return full;
    } finally {
      activeIdRef.current = null;
      setStreamText("");
    }
  };

  const send = async () => {
    const value = input.trim();
    if (!value || streaming || generating) return;
    setInput("");
    setError(null);
    setTurns((t) => [...t, { role: "user", text: value }]);
    setStreaming(true);
    try {
      const reply = await runTurn(value);
      setTurns((t) => [...t, { role: "agent", text: reply.trim() }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const generate = async () => {
    if (streaming || generating || sessionIdRef.current === null) return;
    setError(null);
    setGenerating(true);
    setStreaming(true);
    setTurns((t) => [...t, { role: "user", text: "Generate the build graph." }]);
    try {
      const reply = await runTurn(decompositionPrompt());
      const decomp = parseDecomposition(reply);
      if (!decomp) {
        setError("Could not parse the decomposition. Ask me to try again, or refine the plan.");
        setTurns((t) => [...t, { role: "agent", text: reply.trim() }]);
        return;
      }
      const master = buildMasterMarkdown(decomp);
      const graph = await materializeGraph(project.path, master, decomp);
      onGraphCreated(graph);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
      setStreaming(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  const canGenerate = turns.some((t) => t.role === "agent") && !streaming && !generating;
  const empty = turns.length === 0 && !streaming;

  return (
    <div className="pg-composer">
      <div className="pg-composer-head">
        <div className="pg-composer-title">
          <span className="hml-dot" />
          Plan: {project.name}
        </div>
        <button
          type="button"
          className="hml-btn hml-primary pg-gen-btn"
          onClick={() => void generate()}
          disabled={!canGenerate}
          title={
            canGenerate
              ? "Decompose the plan into a build graph"
              : "Discuss the plan first, then generate the graph"
          }
        >
          {generating ? "Generating graph…" : "Generate graph →"}
        </button>
      </div>

      <div className="pg-thread" ref={threadRef}>
        {empty && (
          <div className="pg-thread-empty">
            <IconCode size={26} />
            <p className="pg-thread-empty-title">Design the build.</p>
            <p className="pg-thread-empty-sub">
              Describe what you want to build in <strong>{project.name}</strong>. I will
              read the repo, challenge the idea, and shape it into discrete steps. When
              it is solid, hit Generate graph and each step becomes a build node.
            </p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`pg-msg pg-msg-${t.role}`}>
            <div className="pg-msg-label">{t.role === "user" ? "YOU" : "PLANNER"}</div>
            <div className="pg-msg-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
            </div>
          </div>
        ))}
        {streaming && (
          <div className="pg-msg pg-msg-agent">
            <div className="pg-msg-label">PLANNER</div>
            <div className="pg-msg-body">
              {streamText ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
              ) : (
                <span className="pg-thinking">
                  {generating ? "Decomposing the plan…" : "Reading the repo…"}
                </span>
              )}
              <span className="pg-caret" />
            </div>
          </div>
        )}
        {error && <div className="pg-error">{error}</div>}
      </div>

      <div className="pg-input-wrap">
        <textarea
          className="pg-input"
          rows={3}
          placeholder={`Describe what to build in ${project.name}, or answer the planner…  (⌘↵ to send)`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming || generating}
        />
        <button
          type="button"
          className="hml-btn hml-primary pg-send"
          onClick={() => void send()}
          disabled={streaming || generating || input.trim().length === 0}
        >
          <IconSend size={13} /> Send
        </button>
      </div>
    </div>
  );
}

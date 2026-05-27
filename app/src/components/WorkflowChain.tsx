import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import {
  assembleWorkflowFinalPrompt,
  assembleWorkflowStepPrompt,
  type WorkflowKind,
  type WorkflowStepContext,
} from "../lib/generatorPrompts";
import type {
  AgentSummary,
  GeneratorOutput,
  KnowledgeChunk,
} from "../lib/types";
import {
  ErrorPanel,
  FullTranscript,
  HeroBar,
  SavedHeader,
  extractJson,
  useEscapeClose,
  useStreamListener,
} from "./generators/GeneratorChrome";
import { PastResults } from "./generators/PastResults";
import { logActivity } from "../lib/activity";
import { writeBackMemory } from "../lib/memoryWriteback";

type Props = {
  root: string;
  agents: AgentSummary[];
  clientName: string;
  clientSlug: string;
  onClose: () => void;
  initialKind?: WorkflowKind;
};

type Step = {
  id: string;
  agentSlug: string;
  agentName: string;
  goal: string;
  isFinal?: boolean;
};

type StepRun = {
  status: "pending" | "running" | "done" | "error";
  text: string;
  error: string | null;
};

const CHAINS: Record<WorkflowKind, Step[]> = {
  launch: [
    { id: "aurelius-1", agentSlug: "aurelius", agentName: "Aurelius", goal: "Frame the launch strategy — offer, audience, expected CPA/ROAS, success criteria." },
    { id: "stratos", agentSlug: "stratos", agentName: "Stratos", goal: "Validate the offer + landing path. Surface friction points and call out what must be fixed pre-launch." },
    { id: "vortex", agentSlug: "vortex", agentName: "Vortex", goal: "Propose the opening creative slate — 3 angles × 3 hooks. Identify the lead creative." },
    { id: "nexus", agentSlug: "nexus", agentName: "Nexus", goal: "Verify tracking is launch-ready — pixel, CAPI, dedup, EMQ. Block launch if anything is missing." },
    { id: "aurelius-final", agentSlug: "aurelius", agentName: "Aurelius", goal: "Final GO / HOLD / NO-GO verdict with the top 3 next moves.", isFinal: true },
  ],
  optimize: [
    { id: "zenith", agentSlug: "zenith", agentName: "Zenith", goal: "Diagnose the current bottleneck. Pinpoint the layer (creative / offer / tracking / strategy)." },
    { id: "stratos", agentSlug: "stratos", agentName: "Stratos", goal: "If offer / landing is the bottleneck, propose the fix. Otherwise confirm the layer is clean." },
    { id: "vortex", agentSlug: "vortex", agentName: "Vortex", goal: "Refresh creative — 2 new angles × 3 hooks to inject diversity." },
    { id: "aurelius-final", agentSlug: "aurelius", agentName: "Aurelius", goal: "Synthesize the optimize plan. Top 3 moves, in order, for the next 7 days.", isFinal: true },
  ],
  scale: [
    { id: "stratos", agentSlug: "stratos", agentName: "Stratos", goal: "Apply the 4-pillar scale-readiness check. Verdict: GREEN / YELLOW / RED with reasoning." },
    { id: "vortex", agentSlug: "vortex", agentName: "Vortex", goal: "Confirm creative pipeline can sustain the scaled spend. Identify gaps." },
    { id: "nexus", agentSlug: "nexus", agentName: "Nexus", goal: "Confirm tracking holds at higher volume. Flag dedup / EMQ risks under load." },
    { id: "aurelius-final", agentSlug: "aurelius", agentName: "Aurelius", goal: "Final scaling verdict with the staircase (Day 1/2/4/6) if GREEN, or the blocker punch list.", isFinal: true },
  ],
};

const KIND_TONE: Record<string, { background: string; borderColor: string; color: string }> = {
  go: {
    background: "rgba(95, 230, 153, 0.13)",
    borderColor: "rgba(95, 230, 153, 0.4)",
    color: "var(--signal-go)",
  },
  hold: {
    background: "rgba(251, 191, 36, 0.13)",
    borderColor: "rgba(251, 191, 36, 0.4)",
    color: "var(--signal-hold)",
  },
  no_go: {
    background: "rgba(248, 113, 113, 0.13)",
    borderColor: "rgba(248, 113, 113, 0.4)",
    color: "var(--signal-stop)",
  },
};

function statusDot(status: StepRun["status"]): string {
  if (status === "running") return "var(--copper)";
  if (status === "done") return "var(--signal-go)";
  if (status === "error") return "var(--signal-stop)";
  return "var(--text-faint)";
}

export function WorkflowChain({
  root,
  agents,
  clientName,
  clientSlug,
  onClose,
  initialKind = "launch",
}: Props) {
  const [kind, setKind] = useState<WorkflowKind>(initialKind);
  const [brief, setBrief] = useState("");
  const [attemptName, setAttemptName] = useState("");
  const [runs, setRuns] = useState<Record<string, StepRun>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GeneratorOutput | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [pastRefresh, setPastRefresh] = useState(0);
  const cancelledRef = useRef(false);
  const currentStepRef = useRef<string | null>(null);

  const steps = CHAINS[kind];
  const running = useMemo(
    () => Object.values(runs).some((r) => r.status === "running"),
    [runs],
  );

  // Validate that every required agent is present
  const missingAgents = useMemo(() => {
    const present = new Set(agents.map((a) => a.slug));
    return Array.from(new Set(steps.map((s) => s.agentSlug))).filter(
      (slug) => !present.has(slug),
    );
  }, [steps, agents]);

  const canRun = !running && !saved && missingAgents.length === 0 && brief.trim().length > 0;

  useEscapeClose(() => {
    if (!running) onClose();
  }, running);

  useStreamListener(
    (text) => {
      const id = currentStepRef.current;
      if (!id) return;
      setRuns((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, text: cur.text + text } };
      });
    },
    (msg) => {
      setError(msg);
    },
  );

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const resetRuns = () => {
    const next: Record<string, StepRun> = {};
    for (const s of steps) {
      next[s.id] = { status: "pending", text: "", error: null };
    }
    setRuns(next);
  };

  const handleRun = async () => {
    if (!canRun) return;
    setError(null);
    setSaved(null);
    setVerdict(null);
    cancelledRef.current = false;
    resetRuns();

    const priorSteps: Array<{ agent: string; body: string }> = [];

    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      knowledgeChunks = await api.matchKnowledgeChunks(root, `${kind} workflow ${brief}`);
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    for (const step of steps) {
      if (cancelledRef.current) return;
      (currentStepRef.current = step.id);
      setRuns((p) => ({ ...p, [step.id]: { status: "running", text: "", error: null } }));

      const agent = agents.find((a) => a.slug === step.agentSlug);
      if (!agent) {
        setRuns((p) => ({
          ...p,
          [step.id]: { status: "error", text: "", error: `Agent ${step.agentSlug} not found` },
        }));
        (currentStepRef.current = null);
        return;
      }

      let agentBody = "";
      try {
        agentBody = await api.readAgentBody(root, agent.slug);
      } catch (e) {
        setRuns((p) => ({
          ...p,
          [step.id]: { status: "error", text: "", error: String(e) },
        }));
        (currentStepRef.current = null);
        return;
      }

      const ctx: WorkflowStepContext = {
        workflowKind: kind,
        clientName,
        brief,
        priorSteps: [...priorSteps],
      };

      const prompt = step.isFinal
        ? assembleWorkflowFinalPrompt({
            aureliusBody: agentBody,
            ctx,
            knowledgeChunks,
          })
        : assembleWorkflowStepPrompt({
            agentName: step.agentName,
            agentBody,
            stepGoal: step.goal,
            ctx,
            knowledgeChunks,
          });

      const id = crypto.randomUUID();
      try {
        const full = await api.invokeClaude(id, prompt);
        const finalText = full || (runs[step.id]?.text ?? "");
        setRuns((p) => ({
          ...p,
          [step.id]: { status: "done", text: finalText, error: null },
        }));
        priorSteps.push({ agent: step.agentName, body: finalText });

        if (step.isFinal) {
          const parsed = extractJson(finalText);
          const v = (parsed?.verdict as string | undefined) ?? null;
          setVerdict(v);
          const customName = attemptName.trim();
          const title =
            customName ||
            (parsed?.headline as string | undefined) ||
            `${kind.toUpperCase()} workflow · ${v ?? "complete"}`;
          const summary = (parsed?.summary as string | undefined) ?? null;
          const composedBody = composeWorkflowBody(kind, brief, [
            ...priorSteps,
          ]);
          const output = await api.saveGeneratorOutput({
            root,
            clientSlug,
            kind: "workflows",
            title,
            summary,
            body: composedBody,
            inputsYaml: `workflow: ${kind}\nbrief: |\n${brief
              .trim()
              .split("\n")
              .map((l) => `  ${l}`)
              .join("\n")}`,
          });
          setSaved(output);
          setPastRefresh((n) => n + 1);

          void logActivity(root, {
            type: "form.run",
            summary: `${kind.toUpperCase()} workflow: ${output.title}`,
            clientSlug,
            refPath: output.path,
          });
          void writeBackMemory({
            root,
            clientSlug,
            clientName,
            outputPath: output.path,
            formTitle: `${kind.toUpperCase()} workflow`,
            body: composedBody,
          });
        }
      } catch (e) {
        setRuns((p) => ({
          ...p,
          [step.id]: { status: "error", text: p[step.id]?.text ?? "", error: String(e) },
        }));
        (currentStepRef.current = null);
        return;
      }
    }
    (currentStepRef.current = null);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    (currentStepRef.current = null);
  };

  return (
    <main className="main" style={{ position: "relative" }}>
      <HeroBar
        eyebrow={`▸ WORKFLOW · ${kind.toUpperCase()}`}
        tag="MULTI-AGENT"
        clientName={clientName}
        onClose={onClose}
        closeDisabled={running}
        title={
          <>
            <strong>{kind === "launch" ? "Launch campaign" : kind === "optimize" ? "Optimize campaign" : "Scale campaign"}</strong>{" "}
            — orchestrated across {steps.length} agents, finishing with an Aurelius verdict.
          </>
        }
        body="Each agent passes their briefing to the next. Final memo is what you act on tomorrow morning."
      />

      <section className="row-split reveal reveal-2" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ CHOOSE WORKFLOW</span>
            <span className="panel-meta">launch · optimize · scale</span>
          </div>
          <div className="status-toggle" style={{ marginBottom: 16 }}>
            {(["launch", "optimize", "scale"] as WorkflowKind[]).map((k) => (
              <button
                type="button"
                key={k}
                className={`status-toggle-btn ${kind === k ? "active ok" : ""}`}
                onClick={() => {
                  setKind(k);
                  setRuns({});
                  setSaved(null);
                  setVerdict(null);
                }}
                disabled={running || !!saved}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="diag-list" style={{ marginTop: 8 }}>
            {steps.map((step, idx) => {
              const r = runs[step.id] ?? { status: "pending", text: "", error: null };
              return (
                <div key={step.id} className="diag-item" style={{ alignItems: "flex-start" }}>
                  <span
                    className="diag-dot"
                    style={{ background: statusDot(r.status), marginTop: 6 }}
                  />
                  <span className="diag-attr">
                    {idx + 1}. {step.agentName.toUpperCase()}
                    {step.isFinal ? " · FINAL" : ""}
                  </span>
                  <span className="diag-text" style={{ color: "var(--text-mid)" }}>
                    {step.goal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ SITUATION BRIEF</span>
            <span className="panel-meta">required</span>
          </div>
          <textarea
            className="kpi-form-textarea"
            placeholder={
              kind === "launch"
                ? "What are we launching? Offer, audience, expected window. Anything weird."
                : kind === "optimize"
                  ? "What's broken or stalling? Numbers, symptoms, what you've already tried."
                  : "How much are you spending now, what's the target, and what does the back-end look like?"
            }
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={running || !!saved}
            style={{ minHeight: 280, fontFamily: "var(--mono)", fontSize: 13 }}
          />
          {missingAgents.length > 0 && (
            <div
              style={{
                marginTop: 12,
                color: "var(--signal-stop)",
                fontFamily: "var(--mono)",
                fontSize: 11.5,
              }}
            >
              MISSING AGENTS: {missingAgents.join(", ")}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ ATTEMPT NAME</span>
            <span className="panel-meta">optional</span>
          </div>
          <input
            type="text"
            className="os-input"
            placeholder="Leave blank to auto-name"
            value={attemptName}
            onChange={(e) => setAttemptName(e.target.value)}
            disabled={running || !!saved}
            style={{ width: "100%" }}
          />
        </div>
      </section>

      {!saved && (
        <div className="actions-row reveal reveal-3" style={{ marginBottom: 32 }}>
          <button type="button" className="action primary" onClick={handleRun} disabled={!canRun}>
            {running ? "Running…" : "Run workflow"}
          </button>
          <button
            type="button"
            className="action"
            onClick={running ? handleCancel : onClose}
            disabled={false}
          >
            {running ? "Cancel" : "Close"}
          </button>
        </div>
      )}

      {!saved && !running && (
        <PastResults
          root={root}
          clientSlug={clientSlug}
          kind="workflows"
          refreshKey={pastRefresh}
          onSelect={(out) => {
            setSaved(out);
            setError(null);
            setRuns({});
            const parsed = extractJson(out.body);
            const v = (parsed?.verdict as string | undefined) ?? null;
            setVerdict(v);
          }}
        />
      )}

      {/* Per-step transcript panels */}
      {steps.map((step) => {
        const r = runs[step.id];
        if (!r || r.status === "pending") return null;
        return (
          <section
            key={step.id}
            className="panel reveal"
            style={{
              marginBottom: 24,
              borderLeft: `2px solid ${statusDot(r.status)}`,
            }}
          >
            <div className="panel-head">
              <span className="panel-title">
                ▸ {step.agentName.toUpperCase()}
                {step.isFinal ? " · FINAL VERDICT" : ""}
              </span>
              <span className="panel-meta">
                {r.status === "running" ? "streaming" : r.status === "done" ? "complete" : "error"}
              </span>
            </div>
            <div className="thread" style={{ maxHeight: 480, padding: 0, gap: 0 }}>
              <div className="msg agent">
                <div className="msg-label">{step.agentName.toUpperCase()} ›</div>
                <div className="msg-body">
                  {r.text}
                  {r.status === "running" && <span className="caret" />}
                </div>
              </div>
            </div>
            {r.error && (
              <div
                style={{
                  marginTop: 12,
                  color: "var(--signal-stop)",
                  fontFamily: "var(--mono)",
                  fontSize: 12.5,
                }}
              >
                {r.error}
              </div>
            )}
          </section>
        );
      })}

      {error && <ErrorPanel error={error} />}

      {saved && (
        <>
          <SavedHeader
            output={saved}
            primaryLabel="Back to dashboard"
            onPrimary={onClose}
            secondaryLabel="Run another workflow"
            onSecondary={() => {
              setSaved(null);
              setVerdict(null);
              setRuns({});
              setBrief("");
              setAttemptName("");
            }}
            badge={verdict ? verdict.replace("_", " ") : null}
            badgeTone={verdict ? KIND_TONE[verdict] : undefined}
          />
          <FullTranscript title="▸ WORKFLOW TRANSCRIPT" agent="ORCHESTRATION" body={saved.body} kind="workflows" />
          <PastResults
            root={root}
            clientSlug={clientSlug}
            kind="workflows"
            refreshKey={pastRefresh}
            activePath={saved.path}
            onSelect={(out) => {
              setSaved(out);
              setError(null);
              const parsed = extractJson(out.body);
              const v = (parsed?.verdict as string | undefined) ?? null;
              setVerdict(v);
            }}
            onDelete={(path) => {
              if (saved?.path === path) {
                setSaved(null);
                setVerdict(null);
              }
            }}
            onRename={(path, newTitle) => {
              if (saved?.path === path) setSaved({ ...saved, title: newTitle });
            }}
          />
        </>
      )}
    </main>
  );
}

function composeWorkflowBody(
  kind: WorkflowKind,
  brief: string,
  steps: Array<{ agent: string; body: string }>,
): string {
  const lines: string[] = [];
  lines.push(`# ${kind.toUpperCase()} workflow`);
  lines.push("");
  lines.push("## Brief");
  lines.push("");
  lines.push(brief.trim());
  lines.push("");
  for (const s of steps) {
    lines.push(`## ${s.agent}`);
    lines.push("");
    lines.push(s.body.trim());
    lines.push("");
  }
  return lines.join("\n");
}

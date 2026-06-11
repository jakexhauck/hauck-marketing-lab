import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BuilderProject, BuilderSession as Session } from "../../lib/builderStore";
import { newId } from "../../lib/builderStore";
import {
  buildSessionSeed,
  graphProgress,
  isUnlocked,
  radialLayout,
  readStepSpec,
  saveGraph,
  stepsById,
  type PlanStep,
  type ProjectGraph,
  type StepStatus,
} from "../../lib/projectGraph";
import { BuilderSession } from "./BuilderSession";
import { IconCheck, IconClose, IconLock } from "../icons";

interface PlanGraphProps {
  project: BuilderProject;
  graph: ProjectGraph;
  /** Bubble a persisted manifest change up so the workspace re-renders. */
  onGraphChange: (graph: ProjectGraph) => void;
  /** Discard the graph and return to the planning chat. */
  onReplan: () => void;
}

const BOX_HALF_W = 96;
const BOX_HALF_H = 34;

/**
 * Phase two: the node graph. The orb in the centre is the master plan; each box
 * is a step, with spokes to the orb and dependency arrows between boxes. Click
 * an unlocked box to open its build session (a real Claude coding chat seeded
 * with that step's spec). Builds run one at a time and gate on dependencies.
 */
export function PlanGraph({ project, graph, onGraphChange, onReplan }: PlanGraphProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Per-step build sessions, kept in memory while the graph is open. The
  // resume id is mirrored into the manifest so a reopen continues the chat.
  const sessionsRef = useRef<Map<string, Session>>(new Map());
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [seedReq, setSeedReq] = useState<{
    stepId: string;
    text: string;
    nonce: string;
  } | null>(null);

  const byId = useMemo(() => stepsById(graph), [graph]);
  const progress = useMemo(() => graphProgress(graph), [graph]);
  const buildingId = useMemo(
    () => graph.steps.find((s) => s.status === "building")?.id ?? null,
    [graph],
  );

  // Measure the stage so the radial layout fills it responsively.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const radius = Math.max(140, Math.min(size.w, size.h) / 2 - 120);
    return radialLayout(graph, cx, cy, radius);
  }, [graph, size]);

  const posById = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout],
  );

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  // Load the selected step's spec on demand.
  useEffect(() => {
    if (!selected || specs[selected.id] !== undefined) return;
    let cancelled = false;
    void readStepSpec(project.path, selected).then((spec) => {
      if (!cancelled) setSpecs((m) => ({ ...m, [selected.id]: spec }));
    });
    return () => {
      cancelled = true;
    };
  }, [selected, project.path, specs]);

  const persistGraph = async (next: ProjectGraph) => {
    onGraphChange(next); // optimistic
    try {
      const saved = await saveGraph(project.path, next);
      onGraphChange(saved);
    } catch {
      // keep the optimistic copy; disk write can be retried on the next change
    }
  };

  const setStatus = (stepId: string, status: StepStatus) => {
    void persistGraph({
      ...graph,
      steps: graph.steps.map((s) => (s.id === stepId ? { ...s, status } : s)),
    });
  };

  const setSessionId = (stepId: string, claudeSessionId: string | null) => {
    if (byId.get(stepId)?.claudeSessionId === claudeSessionId) return;
    void persistGraph({
      ...graph,
      steps: graph.steps.map((s) =>
        s.id === stepId ? { ...s, claudeSessionId } : s,
      ),
    });
  };

  const sessionFor = (step: PlanStep): Session => {
    let s = sessionsRef.current.get(step.id);
    if (!s) {
      s = {
        id: `graph-${project.id}-${step.id}`,
        projectId: project.id,
        title: step.title,
        mode: "edits",
        claudeSessionId: step.claudeSessionId,
        turns: [],
        createdAt: new Date().toISOString(),
      };
      sessionsRef.current.set(step.id, s);
    }
    return s;
  };

  const openStep = (step: PlanStep) => {
    setSelectedId(step.id);
    const fresh = sessionFor(step);
    // Seed the composer with the build instructions the first time we open a
    // step that has never run, once its spec is available.
    const spec = specs[step.id];
    if (fresh.turns.length === 0 && !fresh.claudeSessionId && spec) {
      setSeedReq({ stepId: step.id, text: buildSessionSeed(step, spec), nonce: newId() });
    }
  };

  // Once a spec arrives for a freshly-opened step, drop the seed in.
  useEffect(() => {
    if (!selected) return;
    const s = sessionFor(selected);
    const spec = specs[selected.id];
    if (spec && s.turns.length === 0 && !s.claudeSessionId && seedReq?.stepId !== selected.id) {
      setSeedReq({ stepId: selected.id, text: buildSessionSeed(selected, spec), nonce: newId() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs, selected]);

  const onSessionPersist = (step: PlanStep, updated: Session) => {
    sessionsRef.current.set(step.id, updated);
    setSessionId(step.id, updated.claudeSessionId);
    // First real exchange flips a pending step to building.
    if (step.status === "pending" && updated.turns.length > 0) {
      setStatus(step.id, "building");
    }
  };

  const nodeState = (step: PlanStep): "done" | "building" | "open" | "locked" => {
    if (step.status === "done") return "done";
    if (step.status === "building") return "building";
    return isUnlocked(step, byId) ? "open" : "locked";
  };

  const blockedByActiveBuild =
    !!selected && !!buildingId && buildingId !== selected.id && selected.status !== "done";

  return (
    <div className="pg-graph">
      <div className="pg-graph-head">
        <div className="pg-graph-title">
          <span className="hml-dot" />
          {graph.title}
        </div>
        <div className="pg-graph-meta">
          <div className="pg-progress">
            <div className="pg-progress-bar">
              <div
                className="pg-progress-fill"
                style={{ width: `${Math.round(progress.ratio * 100)}%` }}
              />
            </div>
            <span className="pg-progress-text">
              {progress.done}/{progress.total} done
            </span>
          </div>
          <button type="button" className="hml-btn hml-ghost" onClick={onReplan}>
            Re-plan
          </button>
        </div>
      </div>

      <div className={`pg-graph-body${selected ? " pg-graph-body-split" : ""}`}>
        <div className="pg-stage" ref={stageRef}>
          {size.w > 0 && (
            <>
              <svg className="pg-svg" width={size.w} height={size.h}>
                <defs>
                  <marker
                    id="pg-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" className="pg-arrowhead" />
                  </marker>
                </defs>

                {/* Spokes: orb to every box (the radiating lines). */}
                {layout.nodes.map((n) => (
                  <line
                    key={`spoke-${n.id}`}
                    x1={layout.center.x}
                    y1={layout.center.y}
                    x2={n.x}
                    y2={n.y}
                    className="pg-spoke"
                  />
                ))}

                {/* Dependency arrows: box to box. */}
                {graph.steps.flatMap((step) =>
                  step.deps.map((depId) => {
                    const from = posById.get(depId);
                    const to = posById.get(step.id);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={`dep-${depId}-${step.id}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        className="pg-dep"
                        markerEnd="url(#pg-arrow)"
                      />
                    );
                  }),
                )}
              </svg>

              {/* Orb */}
              <div
                className="pg-orb"
                style={{ left: layout.center.x, top: layout.center.y }}
                title={graph.summary}
              >
                <span className="pg-orb-label">{graph.title}</span>
                <span className="pg-orb-sub">
                  {progress.done}/{progress.total}
                </span>
              </div>

              {/* Step boxes */}
              {graph.steps.map((step, i) => {
                const pos = posById.get(step.id);
                if (!pos) return null;
                const state = nodeState(step);
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={`pg-node pg-node-${state}${selectedId === step.id ? " pg-node-on" : ""}`}
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: BOX_HALF_W * 2,
                      minHeight: BOX_HALF_H * 2,
                    }}
                    onClick={() => (state === "locked" ? setSelectedId(step.id) : openStep(step))}
                    title={step.summary}
                  >
                    <span className="pg-node-num">{i + 1}</span>
                    <span className="pg-node-title">{step.title}</span>
                    {state === "done" && <IconCheck size={12} className="pg-node-ico" />}
                    {state === "locked" && <IconLock size={11} className="pg-node-ico" />}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {selected && (
          <aside className="pg-drawer">
            <header className="pg-drawer-head">
              <div className="pg-drawer-title">
                <span className={`pg-drawer-status pg-drawer-status-${nodeState(selected)}`} />
                {selected.title}
              </div>
              <div className="pg-drawer-actions">
                {selected.status !== "done" && (
                  <button
                    type="button"
                    className="hml-btn hml-ghost pg-done-btn"
                    onClick={() => setStatus(selected.id, "done")}
                    title="Mark this step complete"
                  >
                    <IconCheck size={12} /> Mark done
                  </button>
                )}
                {selected.status === "done" && (
                  <button
                    type="button"
                    className="hml-btn hml-ghost"
                    onClick={() => setStatus(selected.id, "building")}
                  >
                    Reopen
                  </button>
                )}
                <button
                  type="button"
                  className="hml-btn hml-ghost bld-icon-btn"
                  onClick={() => setSelectedId(null)}
                  title="Close"
                >
                  <IconClose size={14} />
                </button>
              </div>
            </header>

            {nodeState(selected) === "locked" ? (
              <div className="pg-drawer-locked">
                <IconLock size={22} />
                <p className="pg-drawer-locked-title">Locked</p>
                <p className="pg-drawer-locked-sub">
                  Finish{" "}
                  {selected.deps
                    .map((d) => byId.get(d)?.title)
                    .filter(Boolean)
                    .join(", ")}{" "}
                  before building this step.
                </p>
              </div>
            ) : blockedByActiveBuild ? (
              <div className="pg-drawer-locked">
                <p className="pg-drawer-locked-title">One step at a time</p>
                <p className="pg-drawer-locked-sub">
                  Another step is mid-build. Finish it (or mark it done) first.
                </p>
                <button
                  type="button"
                  className="hml-btn hml-primary"
                  onClick={() => buildingId && setSelectedId(buildingId)}
                >
                  Go to active build
                </button>
              </div>
            ) : (
              <div className="pg-drawer-session">
                <BuilderSession
                  key={selected.id}
                  session={sessionFor(selected)}
                  project={project}
                  onPersist={(s) => onSessionPersist(selected, s)}
                  onClose={() => setSelectedId(null)}
                  insert={seedReq && seedReq.stepId === selected.id ? seedReq : null}
                />
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

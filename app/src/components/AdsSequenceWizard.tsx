/**
 * Ads Sequence Wizard. Three-column launcher for the 10-step Ads sequence
 * defined in MEDIA_BUYING_SEQUENCE. Opens from the "Ads" task in the
 * OnboardingChecklist.
 *
 *   ┌──────────┬──────────────────┬──────────┐
 *   │ DONE     │  ACTIVE FORM     │ UP NEXT  │
 *   │ (click   │  (eyebrow/title/ │ (dimmed) │
 *   │  to edit)│   GenericForm-   │          │
 *   │          │   Generator)     │          │
 *   └──────────┴──────────────────┴──────────┘
 *
 * Visual contract mirrors docs/forms-sequence.html — same topbar, progress
 * bar, phase-strip pills, amber active panel, numbered upcoming rail.
 *
 * Reuses chainFrom prefill from the existing sequence and ticks each step's
 * matching checklist task on save.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MEDIA_BUYING_SEQUENCE,
  formatHooksForAdCopy,
  nextStepId,
  stepIndex,
  type SequenceState,
  type SequenceStep,
  type SequenceStepId,
} from "../lib/mediaBuyingSequence";
import { getFormConfig, type FormValues, type FormConfig } from "../lib/formConfigs";
import { api } from "../lib/tauri";
import type { AgentSummary, GeneratorOutput } from "../lib/types";
import { GenericFormGenerator } from "./GenericFormGenerator";

type Props = {
  root: string;
  clientName: string;
  clientSlug: string;
  agents: AgentSummary[];
  sequenceState: SequenceState;
  onSequenceChange: (next: SequenceState) => void;
  onTaskTick: (taskId: string) => void;
  onClose: () => void;
};

function extractJsonFromBody(body: string): Record<string, unknown> | null {
  const start = body.indexOf("```json");
  if (start === -1) return null;
  const after = body.slice(start + "```json".length).replace(/^\n/, "");
  const end = after.indexOf("```");
  if (end === -1) return null;
  try {
    return JSON.parse(after.slice(0, end).trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isStepDone(state: SequenceState, id: SequenceStepId): boolean {
  if (state.skipped?.includes(id)) return true;
  return !!state.stepOutputs[id]?.path;
}

/** Resolve the step to render in the center. Defaults to the persisted
 *  currentStep, falling back to the first not-done step, then first overall. */
function resolveInitialStepId(state: SequenceState): SequenceStepId {
  const persisted = state.currentStep;
  if (MEDIA_BUYING_SEQUENCE.some((s) => s.id === persisted)) return persisted;
  const firstUndone = MEDIA_BUYING_SEQUENCE.find((s) => !isStepDone(state, s.id));
  return (firstUndone ?? MEDIA_BUYING_SEQUENCE[0]).id;
}

/** Unique ordered phase numbers the Ads sequence touches. Used to render the
 *  phase-strip pills above the active panel. */
const SEQUENCE_PHASES: number[] = Array.from(
  new Set(MEDIA_BUYING_SEQUENCE.map((s) => s.phase)),
).sort((a, b) => a - b);

export function AdsSequenceWizard({
  root,
  clientName,
  clientSlug,
  agents,
  sequenceState,
  onSequenceChange,
  onTaskTick,
  onClose,
}: Props) {
  const [activeStepId, setActiveStepId] = useState<SequenceStepId>(() =>
    resolveInitialStepId(sequenceState),
  );
  const [chainValues, setChainValues] = useState<Partial<FormValues>>({});
  const [loadingChain, setLoadingChain] = useState(false);

  const activeStep = useMemo<SequenceStep | undefined>(
    () => MEDIA_BUYING_SEQUENCE.find((s) => s.id === activeStepId),
    [activeStepId],
  );
  const activeFormConfig: FormConfig | undefined = activeStep
    ? getFormConfig(activeStep.formId)
    : undefined;

  const completedSteps = useMemo(
    () => MEDIA_BUYING_SEQUENCE.filter((s) => isStepDone(sequenceState, s.id)),
    [sequenceState],
  );
  const upcomingSteps = useMemo(
    () => MEDIA_BUYING_SEQUENCE.filter((s) => !isStepDone(sequenceState, s.id)),
    [sequenceState],
  );

  const doneCount = completedSteps.length;
  const total = MEDIA_BUYING_SEQUENCE.length;
  const remaining = total - doneCount;
  const pct = Math.round((doneCount / total) * 100);

  /** For each unique phase, decide complete/active/upcoming for the strip. */
  const phaseStripStates = useMemo(() => {
    const activePhase = activeStep?.phase;
    return SEQUENCE_PHASES.map((p) => {
      const stepsInPhase = MEDIA_BUYING_SEQUENCE.filter((s) => s.phase === p);
      const allDone = stepsInPhase.every((s) => isStepDone(sequenceState, s.id));
      const isActive = activePhase === p && !allDone;
      return { phase: p, state: allDone ? "complete" : isActive ? "active" : "upcoming" };
    });
  }, [sequenceState, activeStep]);

  // Load chain values for the active step.
  useEffect(() => {
    let cancelled = false;
    setChainValues({});
    if (!activeStep || !activeStep.chainFrom) return;
    const specs = Array.isArray(activeStep.chainFrom)
      ? activeStep.chainFrom
      : [activeStep.chainFrom];
    if (specs.length === 0) return;
    setLoadingChain(true);
    void (async () => {
      const mapped: Partial<FormValues> = {};
      for (const spec of specs) {
        const priorRec = sequenceState.stepOutputs[spec.step];
        if (!priorRec?.path) continue;
        try {
          const note = await api.readVaultNote(root, priorRec.path);
          const body = note?.body ?? "";
          if (spec.rawBodyField) mapped[spec.rawBodyField] = body;
          const parsed = extractJsonFromBody(body);
          if (spec.transform === "hooks-to-adcopy" && spec.transformTargetField && parsed) {
            mapped[spec.transformTargetField] = formatHooksForAdCopy(parsed);
          }
          if (!parsed) continue;
          for (const [sourceKey, targetField] of Object.entries(spec.fields)) {
            const v = parsed[sourceKey];
            if (typeof v === "string" || typeof v === "number") mapped[targetField] = v;
            else if (Array.isArray(v)) mapped[targetField] = v.map(String);
          }
        } catch (e) {
          console.warn("AdsSequenceWizard: chainFrom load failed", spec.step, e);
        }
      }
      if (!cancelled) {
        setChainValues(mapped);
        setLoadingChain(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStep, sequenceState.stepOutputs, root]);

  const handleSaved = useCallback(
    (output: GeneratorOutput) => {
      if (!activeStep) return;
      const now = new Date().toISOString();
      const wasCurrent = sequenceState.currentStep === activeStep.id;
      const next: SequenceState = {
        ...sequenceState,
        stepOutputs: {
          ...sequenceState.stepOutputs,
          [activeStep.id]: { path: output.path, completedAt: now },
        },
        currentStep: wasCurrent
          ? nextStepId(activeStep.id) ?? sequenceState.currentStep
          : sequenceState.currentStep,
      };
      onSequenceChange(next);
      if (activeStep.checklistTaskId) onTaskTick(activeStep.checklistTaskId);
      const advanceTo = nextStepId(activeStep.id);
      if (advanceTo) setActiveStepId(advanceTo);
    },
    [activeStep, sequenceState, onSequenceChange, onTaskTick],
  );

  return (
    <div className="aw-root">
      {/* Topbar */}
      <div className="aw-topbar">
        <div>
          <div className="aw-eyebrow">▸ {clientName} · Media Buying</div>
          <h1 className="aw-h1">Onboarding Sequence</h1>
          <div className="aw-sub">
            One form at a time. Completed forms tuck into the left rail, still editable.
            Upcoming forms queue on the right.
          </div>
        </div>
        <div className="aw-meta-cluster">
          <div>
            <b>Step {Math.min(stepIndex(activeStepId) + 1, total)}</b> / {total}
          </div>
          <div>
            <b>{doneCount}</b> done · <b>{remaining}</b> to go
          </div>
          <button type="button" className="aw-close" onClick={onClose}>
            ← Back to onboarding
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="aw-progress">
        <div className="aw-track">
          <div className="aw-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="aw-progress-meta">
          <span>
            {doneCount} of {total} complete
          </span>
          <span>~{pct}%</span>
        </div>
      </div>

      {/* Columns */}
      <div className="aw-columns">
        {/* LEFT · COMPLETED */}
        <div>
          <div className="aw-col-head">
            Completed <span className="aw-count">{completedSteps.length}</span>
          </div>
          {completedSteps.length === 0 && (
            <div className="aw-rail-empty">No forms completed yet.</div>
          )}
          {completedSteps.map((s) => {
            const isActive = s.id === activeStepId;
            const cfg = getFormConfig(s.formId);
            return (
              <button
                key={s.id}
                type="button"
                className={"aw-rail-card done" + (isActive ? " is-active" : "")}
                onClick={() => setActiveStepId(s.id)}
              >
                <div className="aw-check done">✓</div>
                <div className="aw-rail-body">
                  <div className="aw-rail-name">{s.label}</div>
                  <div className="aw-rail-meta">
                    Phase {s.phase}
                    {cfg ? ` · ${cfg.agentName}` : ""}
                  </div>
                </div>
                <div className="aw-rail-edit">Edit</div>
              </button>
            );
          })}
        </div>

        {/* CENTER · ACTIVE FORM */}
        <div className="aw-center">
          {/* Phase strip */}
          <div className="aw-phase-strip">
            {phaseStripStates.map((p) => (
              <div
                key={p.phase}
                className={`aw-phase-pill aw-${p.state}`}
                title={`Phase ${p.phase}`}
              />
            ))}
          </div>

          {!activeStep ? (
            <div className="aw-empty">
              <p>All steps complete.</p>
              <button type="button" onClick={onClose} className="aw-primary">
                ← Back to onboarding
              </button>
            </div>
          ) : !activeFormConfig ? (
            <div className="aw-empty">
              <p>
                Form <code>{activeStep.formId}</code> not found. Edit{" "}
                <code>mediaBuyingSequence.ts</code> or <code>formConfigs.ts</code>.
              </p>
            </div>
          ) : (
            <div className="aw-active">
              <div className="aw-active-head">
                <div>
                  <div className="aw-active-eyebrow">
                    ▸ Phase {activeStep.phase} · Step {stepIndex(activeStep.id) + 1} of{" "}
                    {total}
                  </div>
                  <h2 className="aw-active-title">{activeStep.label}</h2>
                  <div className="aw-active-sub">{activeStep.hint}</div>
                  {loadingChain && (
                    <div className="aw-chain-note">Loading prior outputs…</div>
                  )}
                  {!loadingChain &&
                    activeStep.chainFrom &&
                    Object.keys(chainValues).length > 0 && (
                      <div className="aw-chain-note">
                        Prefilled from{" "}
                        {(Array.isArray(activeStep.chainFrom)
                          ? activeStep.chainFrom
                          : [activeStep.chainFrom]
                        )
                          .map((s) => s.step)
                          .join(" + ")}
                      </div>
                    )}
                </div>
                <div className="aw-agent-tag">{activeFormConfig.agentName}</div>
              </div>
              <div className="aw-active-body">
                <GenericFormGenerator
                  key={activeStep.id}
                  config={activeFormConfig}
                  root={root}
                  agents={agents}
                  clientName={clientName}
                  clientSlug={clientSlug}
                  onClose={onClose}
                  initialValues={chainValues}
                  onSaved={handleSaved}
                  hidePastResults
                />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT · UPCOMING */}
        <div>
          <div className="aw-col-head">
            Up next <span className="aw-count">{upcomingSteps.length}</span>
          </div>
          {upcomingSteps.length === 0 && (
            <div className="aw-rail-empty">No upcoming steps.</div>
          )}
          {upcomingSteps.map((s) => {
            const pos = stepIndex(s.id) + 1;
            const cfg = getFormConfig(s.formId);
            const isActive = s.id === activeStepId;
            return (
              <button
                key={s.id}
                type="button"
                className={"aw-rail-card upcoming" + (isActive ? " is-active" : "")}
                onClick={() => setActiveStepId(s.id)}
              >
                <div className="aw-check next">{pos}</div>
                <div className="aw-rail-body">
                  <div className="aw-rail-name">{s.label}</div>
                  <div className="aw-rail-meta">
                    Phase {s.phase}
                    {cfg ? ` · ${cfg.agentName}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom note */}
      <div className="aw-note">
        <b>How this works.</b> Each form pulls context from the ones before it (Creative
        Brief reads <code>competitors</code> + <code>audience-research</code>; Ad Copy
        reads <code>hooks</code>; etc). Every form auto-saves to the client's vault —
        click any completed card on the left to reopen it for edits. The Up Next rail
        activates one-by-one as you finish each form.
      </div>

      <style>{WIZ_CSS}</style>
    </div>
  );
}

const WIZ_CSS = `
.aw-root {
  padding: 0 0 56px;
  color: var(--hml-text-primary);
  font-family: var(--hml-font-sans);
}

/* Topbar */
.aw-topbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--hml-border-subtle);
}
.aw-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--hml-accent);
  text-transform: uppercase;
  margin-bottom: 8px;
}
.aw-h1 {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.018em;
  margin: 0;
  color: var(--hml-text-primary);
}
.aw-sub {
  color: var(--hml-text-tertiary);
  font-size: 13px;
  margin-top: 4px;
  max-width: 640px;
}
.aw-meta-cluster {
  display: flex;
  gap: 18px;
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.05em;
  align-items: center;
}
.aw-meta-cluster b { color: var(--hml-text-primary); font-weight: 600; }
.aw-close {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 14px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}
.aw-close:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
}

/* Progress */
.aw-progress { margin-bottom: 22px; }
.aw-track {
  height: 4px;
  background: var(--hml-bg-elev-2);
  border-radius: 2px;
  overflow: hidden;
}
.aw-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--hml-accent), var(--hml-accent-bright));
  transition: width 320ms cubic-bezier(.4,.2,.2,1);
}
.aw-progress-meta {
  display: flex;
  justify-content: space-between;
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.06em;
  margin-top: 8px;
}

/* Three-column layout */
.aw-columns {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 260px;
  gap: 20px;
  align-items: flex-start;
}
@media (max-width: 1100px) {
  .aw-columns { grid-template-columns: 1fr; }
}

.aw-col-head {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  margin: 0 0 10px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.aw-count {
  color: var(--hml-text-secondary);
  background: var(--hml-bg-elev-2);
  padding: 2px 7px;
  border-radius: 3px;
  font-size: 9.5px;
  letter-spacing: 0.06em;
}
.aw-rail-empty {
  font-size: 12px;
  color: var(--hml-text-quaternary);
  font-style: italic;
  padding: 6px 4px;
}

/* Rail cards */
.aw-rail-card {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--hml-border-subtle);
  background: var(--hml-bg-elev-1);
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font-family: inherit;
  transition: border-color 120ms ease, background 120ms ease, transform 200ms ease;
}
.aw-rail-card:hover {
  border-color: var(--hml-border-strong);
  background: var(--hml-bg-elev-2);
}
.aw-rail-card.done { opacity: 0.85; }
.aw-rail-card.done:hover { opacity: 1; }
.aw-rail-card.upcoming { opacity: 0.6; }
.aw-rail-card.is-active {
  border-color: var(--hml-accent-border);
  background: var(--hml-accent-dim);
  opacity: 1;
}

.aw-check {
  width: 20px; height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 10.5px;
  font-weight: 600;
  border: 1px solid;
  font-family: var(--hml-font-mono);
}
.aw-check.done {
  color: var(--hml-green);
  border-color: var(--hml-green-border);
  background: var(--hml-green-bg);
}
.aw-check.next {
  color: var(--hml-text-tertiary);
  border-color: var(--hml-border);
  background: transparent;
}

.aw-rail-body {
  flex: 1;
  min-width: 0;
}
.aw-rail-name {
  font-size: 12.5px;
  color: var(--hml-text-primary);
  line-height: 1.3;
}
.aw-rail-meta {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.04em;
  margin-top: 2px;
}
.aw-rail-edit {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  color: var(--hml-accent);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 120ms ease;
}
.aw-rail-card.done:hover .aw-rail-edit { opacity: 1; }

/* Center column */
.aw-center {
  min-width: 0;
}
.aw-phase-strip {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
}
.aw-phase-pill {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: var(--hml-bg-elev-2);
}
.aw-phase-pill.aw-complete {
  background: var(--hml-accent);
  opacity: 0.7;
}
.aw-phase-pill.aw-active {
  background: var(--hml-accent-bright);
  box-shadow: 0 0 12px rgba(226, 181, 133, 0.5);
}

/* Active panel */
.aw-active {
  border: 1px solid var(--hml-accent-border);
  background: var(--hml-bg-elev-1);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(212, 165, 116, 0.08) inset,
    0 24px 60px -28px rgba(212, 165, 116, 0.18);
}
.aw-active-head {
  padding: 22px 26px 18px;
  border-bottom: 1px solid var(--hml-border-subtle);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.aw-active-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--hml-accent);
  text-transform: uppercase;
  margin-bottom: 8px;
}
.aw-active-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.018em;
  margin: 0 0 4px;
  color: var(--hml-text-primary);
}
.aw-active-sub {
  color: var(--hml-text-secondary);
  font-size: 13px;
}
.aw-chain-note {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
  margin-top: 10px;
  letter-spacing: 0.04em;
}
.aw-agent-tag {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 4px 10px;
  border: 1px solid var(--hml-blue-border);
  background: var(--hml-blue-bg);
  color: var(--hml-blue);
  border-radius: 4px;
  white-space: nowrap;
  align-self: flex-start;
}
.aw-active-body {
  padding: 0;
}

.aw-empty {
  border: 1px dashed var(--hml-border);
  background: var(--hml-bg-elev-1);
  border-radius: 14px;
  padding: 40px 32px;
  text-align: center;
  color: var(--hml-text-secondary);
}
.aw-empty code {
  font-family: var(--hml-font-mono);
  background: var(--hml-bg-elev-2);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--hml-text-primary);
}
.aw-primary {
  margin-top: 14px;
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 10px 18px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--hml-accent-border);
  background: var(--hml-accent-dim);
  color: var(--hml-accent-bright);
}

/* Bottom note */
.aw-note {
  margin-top: 28px;
  padding: 14px 16px;
  border: 1px solid var(--hml-border);
  background: var(--hml-bg-elev-1);
  border-radius: 10px;
  font-size: 12.5px;
  color: var(--hml-text-secondary);
}
.aw-note b { color: var(--hml-text-primary); font-weight: 600; }
.aw-note code {
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  background: var(--hml-bg-elev-2);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--hml-text-primary);
}
`;

export default AdsSequenceWizard;

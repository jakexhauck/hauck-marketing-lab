/**
 * ClientSequence. Guided 10-step wizard for new clients.
 *
 * Lives next to OnboardingChecklist: the checklist tracks completion state,
 * this surface drives the user through one form per step from "pixel installed"
 * to "first weekly report." Each completed step:
 *   1. Persists its saved output path under sequence.stepOutputs[stepId].
 *   2. Auto-ticks the matching task in onboarding.json (done array).
 *   3. Advances currentStep to the next unfinished step.
 *
 * Where useful, step N+1 prefills from step N via the chainFrom spec in
 * mediaBuyingSequence.ts. State persists in vault/Clients/<slug>/onboarding.json
 * under the optional `sequence` block.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/tauri";
import { getFormConfig, type FormValues } from "../../lib/formConfigs";
import type { AgentSummary, GeneratorOutput, OnboardingState } from "../../lib/types";
import {
  MEDIA_BUYING_SEQUENCE,
  type SequenceState,
  type SequenceStepId,
  emptySequenceState,
  getStep,
  isStepDone,
  nextStepId,
  sequenceComplete,
  stepIndex,
  totalSteps,
} from "../../lib/mediaBuyingSequence";
import { GenericFormGenerator } from "../GenericFormGenerator";
import { IconArrowRight, IconChevronRight, IconCheck, IconTarget } from "../icons";

interface ClientSequenceProps {
  root: string;
  clientSlug: string;
  clientName: string;
  agents: AgentSummary[];
  /** Fired after Jake clicks "Mark launched" on the final step. Parent can use
   *  this to navigate back to the dashboard / live view. */
  onLaunched?: () => void;
}

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

export function ClientSequence({
  root,
  clientSlug,
  clientName,
  agents,
  onLaunched,
}: ClientSequenceProps) {
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [openStepId, setOpenStepId] = useState<SequenceStepId | null>(null);
  const [chainValues, setChainValues] = useState<Partial<FormValues>>({});
  const [loadingChain, setLoadingChain] = useState(false);

  // Load onboarding state on mount + whenever the client changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = await api.readOnboardingState(root, clientSlug);
        if (cancelled) return;
        setOnboarding(state);
      } catch (e) {
        console.warn("readOnboardingState failed:", e);
        if (!cancelled) {
          setOnboarding({ done: [], phaseDoneAt: {}, sequence: undefined });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  const sequence: SequenceState = useMemo(() => {
    const raw = onboarding?.sequence;
    if (!raw) return emptySequenceState();
    return {
      currentStep: raw.currentStep as SequenceStepId,
      stepOutputs: raw.stepOutputs as SequenceState["stepOutputs"],
      skipped: raw.skipped as SequenceStepId[] | undefined,
      launchedAt: raw.launchedAt,
    };
  }, [onboarding]);

  const completed = useMemo(
    () => MEDIA_BUYING_SEQUENCE.filter((s) => isStepDone(sequence, s.id)).length,
    [sequence],
  );
  const allDone = useMemo(() => sequenceComplete(sequence), [sequence]);

  /** Persist updated onboarding state back to disk. */
  const writeOnboarding = useCallback(
    async (next: OnboardingState) => {
      setOnboarding(next);
      try {
        await api.writeOnboardingState(root, clientSlug, next);
      } catch (e) {
        console.warn("writeOnboardingState failed:", e);
      }
    },
    [root, clientSlug],
  );

  /** Mark a step as done in the sequence + auto-tick its OnboardingChecklist task. */
  const completeStep = useCallback(
    (stepId: SequenceStepId, outputPath: string) => {
      if (!onboarding) return;
      const step = getStep(stepId);
      if (!step) return;
      const now = new Date().toISOString();

      const nextSeq: SequenceState = {
        currentStep: nextStepId(stepId) ?? stepId,
        stepOutputs: {
          ...sequence.stepOutputs,
          [stepId]: { path: outputPath, completedAt: now },
        },
        skipped: sequence.skipped,
        launchedAt: sequence.launchedAt,
      };

      const doneSet = new Set(onboarding.done);
      doneSet.add(step.checklistTaskId);

      void writeOnboarding({
        ...onboarding,
        done: Array.from(doneSet),
        sequence: nextSeq,
      });
    },
    [onboarding, sequence, writeOnboarding],
  );

  const skipStep = useCallback(
    (stepId: SequenceStepId) => {
      if (!onboarding) return;
      const skippedSet = new Set(sequence.skipped ?? []);
      skippedSet.add(stepId);
      const nextSeq: SequenceState = {
        currentStep: nextStepId(stepId) ?? stepId,
        stepOutputs: sequence.stepOutputs,
        skipped: Array.from(skippedSet),
        launchedAt: sequence.launchedAt,
      };
      void writeOnboarding({ ...onboarding, sequence: nextSeq });
      setOpenStepId(null);
    },
    [onboarding, sequence, writeOnboarding],
  );

  const markLaunched = useCallback(() => {
    if (!onboarding) return;
    const nextSeq: SequenceState = {
      ...sequence,
      launchedAt: new Date().toISOString(),
    };
    void writeOnboarding({ ...onboarding, sequence: nextSeq });
    onLaunched?.();
  }, [onboarding, sequence, writeOnboarding, onLaunched]);

  /** Open a step: read the prior step's saved output (if chainFrom is set) and
   *  build a chainValues map to seed the form. */
  const openStep = useCallback(
    async (stepId: SequenceStepId) => {
      setOpenStepId(stepId);
      setChainValues({});
      const step = getStep(stepId);
      if (!step?.chainFrom) return;
      const priorRec = sequence.stepOutputs[step.chainFrom.step];
      if (!priorRec?.path) return;
      setLoadingChain(true);
      try {
        const note = await api.readVaultNote(root, priorRec.path);
        const parsed = extractJsonFromBody(note?.body ?? "");
        if (!parsed) return;
        const mapped: Partial<FormValues> = {};
        for (const [sourceKey, targetField] of Object.entries(step.chainFrom.fields)) {
          const v = parsed[sourceKey];
          if (typeof v === "string" || typeof v === "number") mapped[targetField] = v;
          else if (Array.isArray(v)) mapped[targetField] = v.map(String);
        }
        setChainValues(mapped);
      } catch (e) {
        console.warn("chainFrom prefill failed:", e);
      } finally {
        setLoadingChain(false);
      }
    },
    [root, sequence],
  );

  const closeStep = useCallback(() => {
    setOpenStepId(null);
    setChainValues({});
  }, []);

  const handleSaved = useCallback(
    (output: GeneratorOutput) => {
      if (!openStepId) return;
      completeStep(openStepId, output.path);
    },
    [openStepId, completeStep],
  );

  if (!onboarding) {
    return (
      <section className="hml-content">
        <div className="hml-empty">Loading sequence,</div>
      </section>
    );
  }

  const openStep_ = openStepId ? getStep(openStepId) : null;
  const openStep_FormConfig = openStep_ ? getFormConfig(openStep_.formId) : null;

  return (
    <section className="hml-content">
      <header className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <IconTarget size={11} />
            Media Buying Sequence
          </div>
          <h1 className="hml-page-title">Launch {clientName}.</h1>
          <div className="hml-page-subtitle">
            One form per step. Each completed step ticks the matching onboarding task and feeds
            the next form. Skip any step you do not need. The tab disappears once you mark launched.
          </div>
        </div>
        <div className="hml-page-header-actions">
          <span className="seq-progress">
            {completed} of {totalSteps()} steps
          </span>
          {allDone && !sequence.launchedAt && (
            <button type="button" className="os-primary" onClick={markLaunched}>
              Mark launched
              <IconArrowRight size={11} />
            </button>
          )}
        </div>
      </header>

      <SequenceStepper
        sequence={sequence}
        openStepId={openStepId}
        onJump={(id) => {
          if (openStepId) closeStep();
          void openStep(id);
        }}
      />

      {!openStep_ && (
        <SequenceList
          sequence={sequence}
          onOpen={(id) => void openStep(id)}
          onSkip={skipStep}
        />
      )}

      {openStep_ && openStep_FormConfig && (
        <div className="seq-form-wrap">
          <div className="seq-form-head">
            <button type="button" className="hml-btn" onClick={closeStep}>
              Back to overview
            </button>
            <div className="seq-form-meta">
              <span className="seq-form-step">
                Step {stepIndex(openStep_.id) + 1} of {totalSteps()}
              </span>
              {loadingChain && <span className="seq-form-hint">Loading prior outputs,</span>}
              {!loadingChain &&
                openStep_.chainFrom &&
                Object.keys(chainValues).length > 0 && (
                  <span className="seq-form-hint">
                    Prefilled from {openStep_.chainFrom.step}
                  </span>
                )}
            </div>
            <button
              type="button"
              className="hml-btn"
              onClick={() => skipStep(openStep_.id)}
              title="Mark this step as skipped and advance"
            >
              Skip step
            </button>
          </div>

          <GenericFormGenerator
            config={openStep_FormConfig}
            root={root}
            agents={agents}
            clientName={clientName}
            clientSlug={clientSlug}
            onClose={closeStep}
            initialValues={chainValues}
            onSaved={handleSaved}
          />
        </div>
      )}

      <style>{SEQUENCE_CSS}</style>
    </section>
  );
}

interface SequenceStepperProps {
  sequence: SequenceState;
  openStepId: SequenceStepId | null;
  onJump: (id: SequenceStepId) => void;
}

function SequenceStepper({ sequence, openStepId, onJump }: SequenceStepperProps) {
  return (
    <nav className="seq-stepper">
      {MEDIA_BUYING_SEQUENCE.map((step, i) => {
        const done = isStepDone(sequence, step.id);
        const skipped = sequence.skipped?.includes(step.id) ?? false;
        const isOpen = openStepId === step.id;
        const isCurrent = sequence.currentStep === step.id && !done;
        const cls = [
          "seq-step",
          done && "seq-step-done",
          skipped && "seq-step-skipped",
          isOpen && "seq-step-open",
          isCurrent && "seq-step-current",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={step.id}
            type="button"
            className={cls}
            onClick={() => onJump(step.id)}
            title={`${step.label} (${step.hint})`}
          >
            <span className="seq-step-num">
              {done && !skipped ? <IconCheck size={10} /> : i + 1}
            </span>
            <span className="seq-step-label">{step.label}</span>
            {i < MEDIA_BUYING_SEQUENCE.length - 1 && (
              <IconChevronRight size={10} className="seq-step-arrow" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

interface SequenceListProps {
  sequence: SequenceState;
  onOpen: (id: SequenceStepId) => void;
  onSkip: (id: SequenceStepId) => void;
}

function SequenceList({ sequence, onOpen, onSkip }: SequenceListProps) {
  return (
    <div className="seq-list">
      {MEDIA_BUYING_SEQUENCE.map((step, i) => {
        const done = isStepDone(sequence, step.id);
        const skipped = sequence.skipped?.includes(step.id) ?? false;
        const isCurrent = sequence.currentStep === step.id && !done;
        const rec = sequence.stepOutputs[step.id];
        const cls = [
          "seq-list-row",
          done && "seq-list-row-done",
          isCurrent && "seq-list-row-current",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={step.id} className={cls}>
            <span className="seq-list-num">{done && !skipped ? <IconCheck size={11} /> : i + 1}</span>
            <span className="seq-list-body">
              <span className="seq-list-label">{step.label}</span>
              <span className="seq-list-hint">{step.hint}</span>
              {rec?.completedAt && (
                <span className="seq-list-stamp">
                  Saved {new Date(rec.completedAt).toLocaleString()}
                </span>
              )}
              {skipped && <span className="seq-list-stamp">Skipped</span>}
            </span>
            <span className="seq-list-actions">
              {!done && (
                <button
                  type="button"
                  className="hml-btn-link"
                  onClick={() => onSkip(step.id)}
                  title="Mark as skipped without running the form"
                >
                  Skip
                </button>
              )}
              <button
                type="button"
                className={done ? "hml-btn" : "os-primary"}
                onClick={() => onOpen(step.id)}
              >
                {done ? "Re-run" : isCurrent ? "Start step" : "Open"}
                <IconArrowRight size={10} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SEQUENCE_CSS = `
.seq-progress {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--hml-text-dim, #94a3b8);
  text-transform: uppercase;
}

.seq-stepper {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 18px 0 22px;
  padding: 10px;
  border: 1px solid var(--hml-border, #1f2937);
  border-radius: 10px;
  background: var(--hml-bg-elev, #0f172a);
}
.seq-step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--hml-text-dim, #94a3b8);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: background 120ms, color 120ms, border 120ms;
}
.seq-step:hover {
  background: rgba(148, 163, 184, 0.08);
  color: var(--hml-text, #e2e8f0);
}
.seq-step-num {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  color: var(--hml-text-dim, #94a3b8);
}
.seq-step-label { font-weight: 500; }
.seq-step-arrow { opacity: 0.4; margin-left: 2px; }

.seq-step-done .seq-step-num {
  background: rgba(94, 234, 212, 0.18);
  color: #5eead4;
}
.seq-step-done .seq-step-label { color: var(--hml-text, #e2e8f0); }
.seq-step-skipped .seq-step-num {
  background: rgba(234, 179, 8, 0.18);
  color: #facc15;
}
.seq-step-current {
  background: rgba(167, 139, 250, 0.10);
  border-color: rgba(167, 139, 250, 0.30);
}
.seq-step-current .seq-step-num {
  background: #a78bfa;
  color: #0a0a0a;
}
.seq-step-current .seq-step-label { color: var(--hml-text, #e2e8f0); }
.seq-step-open {
  background: rgba(167, 139, 250, 0.18);
  border-color: rgba(167, 139, 250, 0.50);
}

.seq-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.seq-list-row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--hml-border, #1f2937);
  border-radius: 12px;
  background: var(--hml-bg-elev, #0f172a);
}
.seq-list-row-current {
  border-color: rgba(167, 139, 250, 0.45);
  background: rgba(167, 139, 250, 0.06);
}
.seq-list-row-done {
  opacity: 0.85;
}
.seq-list-num {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  color: var(--hml-text-dim, #94a3b8);
}
.seq-list-row-done .seq-list-num {
  background: rgba(94, 234, 212, 0.18);
  color: #5eead4;
}
.seq-list-row-current .seq-list-num {
  background: #a78bfa;
  color: #0a0a0a;
}
.seq-list-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.seq-list-label {
  font-weight: 600;
  color: var(--hml-text, #e2e8f0);
  font-size: 14px;
}
.seq-list-hint {
  font-size: 12px;
  color: var(--hml-text-dim, #94a3b8);
}
.seq-list-stamp {
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--hml-text-dim, #94a3b8);
  text-transform: uppercase;
  margin-top: 4px;
}
.seq-list-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.hml-btn-link {
  background: transparent;
  border: none;
  color: var(--hml-text-dim, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
}
.hml-btn-link:hover { color: var(--hml-text, #e2e8f0); }

.seq-form-wrap {
  margin-top: 18px;
  border: 1px solid var(--hml-border, #1f2937);
  border-radius: 12px;
  background: var(--hml-bg-elev, #0f172a);
  padding: 14px 14px 4px;
}
.seq-form-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.seq-form-meta {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--hml-text-dim, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.seq-form-step { font-weight: 600; color: var(--hml-text, #e2e8f0); }
.seq-form-hint {
  background: rgba(94, 234, 212, 0.12);
  color: #5eead4;
  padding: 2px 8px;
  border-radius: 999px;
  text-transform: none;
  letter-spacing: 0;
}
`;

/**
 * ClientSequence — the Onboarding Sequence Wizard tab.
 *
 * Mirrors OutreachSequencePage's stepper pattern. Stepper at top, body renders
 * the current step (GenericFormGenerator when the step is form-backed, a
 * confirmation card otherwise). Output of step N seeds step N+1 via
 * loadChainValues; that fires BEFORE GenericFormGenerator's profile prefill, so
 * Profile.md stays the fallback.
 *
 * Tab is hidden by ClientDashboard once sequenceComplete flips. After launch,
 * forms are accessed through the standalone menu.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/tauri";
import { logActivity } from "../../../lib/activity";
import { getFormConfig, type FormValues } from "../../../lib/formConfigs";
import type { AgentSummary, ClientEntry, GeneratorOutput, OpsClientRow } from "../../../lib/types";
import { GenericFormGenerator } from "../../GenericFormGenerator";
import {
  ONBOARDING_SEQUENCE,
  emptySequenceState,
  getStep,
  isStepDone,
  loadChainValues,
  loadSequenceState,
  nextStepId,
  previousStepId,
  saveSequenceState,
  sequenceComplete,
  stepIndex,
  tickChecklistTask,
  type OnboardingSequenceState,
  type OnboardingSequenceStep,
  type OnboardingSequenceStepId,
} from "../../../lib/onboardingSequence";

interface Props {
  root: string;
  client: ClientEntry;
  agents: AgentSummary[];
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ClientSequence({ root, client, agents }: Props) {
  const [state, setState] = useState<OnboardingSequenceState>(() => emptySequenceState());
  const [loaded, setLoaded] = useState(false);
  const [activeStepId, setActiveStepId] = useState<OnboardingSequenceStepId>(
    ONBOARDING_SEQUENCE[0].id,
  );
  const [chainValues, setChainValues] = useState<Partial<FormValues>>({});
  const [loadingChain, setLoadingChain] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load persisted state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await loadSequenceState(root, client.slug);
      if (cancelled) return;
      setState(next);
      setActiveStepId(next.currentStep);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [root, client.slug]);

  const activeStep = useMemo(() => getStep(activeStepId) ?? ONBOARDING_SEQUENCE[0], [activeStepId]);

  // Recompute chain values whenever the active step changes or upstream output changes.
  useEffect(() => {
    if (!loaded) return;
    if (!activeStep.chainFrom) {
      setChainValues({});
      return;
    }
    let cancelled = false;
    setLoadingChain(true);
    void (async () => {
      const vals = await loadChainValues(root, state, activeStep);
      if (cancelled) return;
      setChainValues(vals);
      setLoadingChain(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStep, state, root, loaded]);

  const persist = useCallback(
    async (next: OnboardingSequenceState) => {
      setState(next);
      try {
        await saveSequenceState(root, client.slug, next);
      } catch (e) {
        console.warn("ClientSequence: persist failed", e);
      }
    },
    [root, client.slug],
  );

  /** Form-backed step finished saving: record output, auto-tick, advance. */
  const handleFormSaved = useCallback(
    (output: GeneratorOutput) => {
      const now = new Date().toISOString();
      const advanceTo = nextStepId(activeStep.id) ?? activeStep.id;
      const next: OnboardingSequenceState = {
        ...state,
        currentStep: advanceTo,
        stepOutputs: {
          ...state.stepOutputs,
          [activeStep.id]: { path: output.path, completedAt: now },
        },
        skipped: state.skipped.filter((s) => s !== activeStep.id),
      };
      void persist(next);
      setActiveStepId(advanceTo);
      if (activeStep.checklistTaskId) {
        void tickChecklistTask(root, client.slug, activeStep.checklistTaskId);
      }
      void logActivity(root, {
        type: "form.run",
        summary: `Sequence: ${activeStep.label} saved`,
        clientSlug: client.slug,
        refPath: output.path,
        meta: { sequence: "onboarding", step: activeStep.id },
      });
    },
    [activeStep, state, root, client.slug, persist],
  );

  /** Confirmation-only step (no form): synthesize a marker output and advance. */
  const handleConfirmStep = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const stamp = `Confirmed at ${now} by ${client.name} sequence wizard.`;
      let savedPath = `confirmed://${activeStep.id}`;
      try {
        const out = await api.saveGeneratorOutput({
          root,
          clientSlug: client.slug,
          kind: "workflows",
          title: `${activeStep.label} confirmed`,
          summary: activeStep.hint,
          body: `# ${activeStep.label}\n\n${activeStep.confirmationCopy ?? activeStep.hint}\n\n${stamp}\n`,
          inputsYaml: `step: ${activeStep.id}\n`,
        });
        savedPath = out.path;
      } catch (e) {
        // Saving the marker is best-effort. Even if it fails, persist the
        // sequence state so Jake can advance.
        console.warn("ClientSequence: marker save failed", e);
      }
      const advanceTo = nextStepId(activeStep.id) ?? activeStep.id;
      const next: OnboardingSequenceState = {
        ...state,
        currentStep: advanceTo,
        stepOutputs: {
          ...state.stepOutputs,
          [activeStep.id]: { path: savedPath, completedAt: now },
        },
        skipped: state.skipped.filter((s) => s !== activeStep.id),
      };
      await persist(next);
      setActiveStepId(advanceTo);
      if (activeStep.checklistTaskId) {
        void tickChecklistTask(root, client.slug, activeStep.checklistTaskId);
      }
      void logActivity(root, {
        type: "form.run",
        summary: `Sequence: ${activeStep.label} confirmed`,
        clientSlug: client.slug,
        meta: { sequence: "onboarding", step: activeStep.id },
      });
    } finally {
      setBusy(false);
    }
  }, [busy, activeStep, state, root, client.slug, client.name, persist]);

  const handleSkipStep = useCallback(async () => {
    const advanceTo = nextStepId(activeStep.id) ?? activeStep.id;
    const next: OnboardingSequenceState = {
      ...state,
      currentStep: advanceTo,
      skipped: state.skipped.includes(activeStep.id)
        ? state.skipped
        : [...state.skipped, activeStep.id],
    };
    await persist(next);
    setActiveStepId(advanceTo);
    void logActivity(root, {
      type: "form.run",
      summary: `Sequence: ${activeStep.label} skipped`,
      clientSlug: client.slug,
      meta: { sequence: "onboarding", step: activeStep.id, skipped: true },
    });
  }, [activeStep, state, root, client.slug, persist]);

  const handleBack = useCallback(() => {
    const prev = previousStepId(activeStep.id);
    if (prev) setActiveStepId(prev);
  }, [activeStep]);

  const handleMarkLaunched = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const next: OnboardingSequenceState = {
        ...state,
        launchedAt: now,
        sequenceComplete: true,
      };
      await persist(next);
      // Mirror onto ops/clients.json so the rest of the app knows.
      try {
        const ops = await api.readOpsClients(root);
        const existing = ops.rows[client.slug] ?? {};
        if (!existing.adsLaunchedAt) {
          const nextRow: OpsClientRow = { ...existing, adsLaunchedAt: todayYMD() };
          await api.writeOpsClients(root, {
            rows: { ...ops.rows, [client.slug]: nextRow },
          });
        }
      } catch (e) {
        console.warn("ClientSequence: ops/clients adsLaunchedAt write failed", e);
      }
      if (activeStep.checklistTaskId) {
        void tickChecklistTask(root, client.slug, activeStep.checklistTaskId);
      }
      void logActivity(root, {
        type: "form.run",
        summary: `Sequence: ${client.name} launched`,
        clientSlug: client.slug,
        hot: true,
        meta: { sequence: "onboarding", launched: true },
      });
    } finally {
      setBusy(false);
    }
  }, [busy, state, root, client, activeStep, persist]);

  if (!loaded) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-sub">Loading sequence…</div>
      </div>
    );
  }

  const activeIndex = stepIndex(activeStep.id);
  const isLastStep = activeIndex === ONBOARDING_SEQUENCE.length - 1;
  const lastStepHasOutput = !!state.stepOutputs[ONBOARDING_SEQUENCE[ONBOARDING_SEQUENCE.length - 1].id]?.path;
  const formConfig = activeStep.formId ? getFormConfig(activeStep.formId) : null;
  const priorOutput = state.stepOutputs[activeStep.id];

  return (
    <div className="cs-root">
      <div className="cs-stepper" role="tablist">
        {ONBOARDING_SEQUENCE.map((step, i) => {
          const done = isStepDone(state, step.id);
          const isCurrent = step.id === activeStep.id;
          const isSkipped = state.skipped.includes(step.id);
          const status: "done" | "current" | "pending" | "skipped" = isSkipped
            ? "skipped"
            : done
              ? "done"
              : isCurrent
                ? "current"
                : "pending";
          return (
            <button
              key={step.id}
              type="button"
              role="tab"
              className={`cs-step cs-step-${status}`}
              onClick={() => setActiveStepId(step.id)}
              aria-selected={isCurrent}
            >
              <span className="cs-step-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="cs-step-label">{step.label}</span>
              <span className="cs-step-badge">
                {status === "done" ? "✓" : status === "skipped" ? "—" : status === "current" ? "●" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cs-body">
        {formConfig ? (
          <>
            {priorOutput && (
              <div className="cs-prior">
                ✓ This step has a saved output. Re-running overwrites it; downstream prefills may need review.
              </div>
            )}
            {loadingChain && (
              <div className="cs-prior">Loading prior outputs…</div>
            )}
            {!loadingChain && activeStep.chainFrom && Object.keys(chainValues).length > 0 && (
              <div className="cs-prior">
                Prefilled from {activeStep.chainFrom.step}.
              </div>
            )}
            <GenericFormGenerator
              key={activeStep.id}
              config={formConfig}
              root={root}
              agents={agents}
              clientName={client.name}
              clientSlug={client.slug}
              onClose={() => undefined}
              initialValues={chainValues}
              onSaved={handleFormSaved}
            />
          </>
        ) : (
          <ConfirmationCard step={activeStep} priorPath={priorOutput?.path ?? null} />
        )}
      </div>

      <footer className="cs-foot">
        <button
          type="button"
          className="hml-btn"
          onClick={handleBack}
          disabled={!previousStepId(activeStep.id)}
        >
          ← Back
        </button>
        {!formConfig && (
          <button
            type="button"
            className="os-primary"
            onClick={handleConfirmStep}
            disabled={busy}
          >
            {busy ? "Saving…" : "Mark complete & continue"}
          </button>
        )}
        <button
          type="button"
          className="hml-btn"
          onClick={handleSkipStep}
          disabled={state.skipped.includes(activeStep.id)}
        >
          Skip step
        </button>
        <span style={{ flex: 1 }} />
        {isLastStep && (
          <button
            type="button"
            className="os-primary"
            onClick={handleMarkLaunched}
            disabled={busy || !lastStepHasOutput || sequenceComplete(state)}
            title={
              !lastStepHasOutput
                ? "Complete the final step before marking launched."
                : sequenceComplete(state)
                  ? "Already launched."
                  : "Sets adsLaunchedAt on the client and closes the sequence."
            }
          >
            {sequenceComplete(state) ? "Launched ✓" : "Mark launched"}
          </button>
        )}
      </footer>

      <style>{CS_CSS}</style>
    </div>
  );
}

function ConfirmationCard({
  step,
  priorPath,
}: {
  step: OnboardingSequenceStep;
  priorPath: string | null;
}) {
  return (
    <section className="cs-confirm">
      <div className="cs-confirm-eyebrow">▸ STEP · NO FORM</div>
      <h2 className="cs-confirm-title">{step.label}</h2>
      <p className="cs-confirm-hint">{step.hint}</p>
      {step.confirmationCopy && (
        <p className="cs-confirm-body">{step.confirmationCopy}</p>
      )}
      {priorPath && !priorPath.startsWith("confirmed://") && (
        <div className="cs-prior">
          Marker on disk: <code>{priorPath.split(/[\\/]/).slice(-3).join("/")}</code>
        </div>
      )}
      {priorPath && (
        <div className="cs-prior">Marked complete. Re-confirm to overwrite the marker.</div>
      )}
    </section>
  );
}

const CS_CSS = `
.cs-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 4px 24px;
}
.cs-stepper {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  padding: 8px;
}
.cs-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  text-align: left;
  color: var(--hml-text-secondary);
  font-family: inherit;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.cs-step:hover {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.03));
}
.cs-step-num {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--hml-text-tertiary);
  min-width: 26px;
}
.cs-step-label {
  font-size: 12.5px;
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-step-badge {
  font-size: 12px;
  color: var(--hml-text-tertiary);
}
.cs-step-current {
  background: var(--hml-accent-dim, rgba(106,169,255,0.12));
  border-color: var(--hml-accent-border, rgba(106,169,255,0.5));
  color: var(--hml-text-primary);
}
.cs-step-current .cs-step-badge { color: var(--hml-accent, #6aa9ff); }
.cs-step-done .cs-step-badge { color: #22c55e; }
.cs-step-skipped {
  opacity: 0.65;
}
.cs-step-skipped .cs-step-badge { color: #f59e0b; }
.cs-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cs-prior {
  padding: 10px 14px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--hml-text-secondary);
}
.cs-prior code {
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
}
.cs-confirm {
  padding: 22px 24px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cs-confirm-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--hml-text-tertiary);
}
.cs-confirm-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--hml-text-primary);
}
.cs-confirm-hint {
  margin: 0;
  color: var(--hml-text-secondary);
  font-size: 13px;
}
.cs-confirm-body {
  margin: 0;
  color: var(--hml-text-secondary);
  font-size: 13.5px;
  line-height: 1.55;
}
.cs-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0 0;
  border-top: 1px solid var(--hml-border-subtle);
}
`;

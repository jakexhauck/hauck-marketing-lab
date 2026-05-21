/**
 * Ads Sequence Wizard. Three-column launcher for the 8-step Ads sequence
 * defined in MEDIA_BUYING_SEQUENCE. Opens from the "Ads" task in the
 * OnboardingChecklist. Offer + CTA and Competitor Research are owned by
 * Pre-Call Prep (Phase 1.2) and are not part of this sequence.
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
  SEQUENCE_GROUPS,
  formatHooksForAdCopy,
  getStep,
  isStepDone,
  nextStepId,
  summarizeStepOutput,
  type CampaignSkeleton,
  type SequenceState,
  type SequenceStep,
  type SequenceStepId,
} from "../lib/mediaBuyingSequence";
import { getFormConfig, type FormValues, type FormConfig } from "../lib/formConfigs";
import { api } from "../lib/tauri";
import type { AgentSummary, GeneratorOutput } from "../lib/types";
import { GenericFormGenerator } from "./GenericFormGenerator";
import { CampaignTreeView } from "./CampaignTreeView";
import { AdCreativeStudio } from "./AdCreativeStudio";

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

/** Friendly "Pulls from X + Y" preview for a step's chainFrom config. Resolves
 *  source step IDs to their labels so the rail can tell the user what data
 *  this step is about to consume BEFORE they click in. Returns null when the
 *  step has no chainFrom. */
function chainPreview(step: SequenceStep): string | null {
  if (!step.chainFrom) return null;
  const specs = Array.isArray(step.chainFrom) ? step.chainFrom : [step.chainFrom];
  const labels = specs
    .map((s) => getStep(s.step)?.label)
    .filter((l): l is string => Boolean(l));
  if (labels.length === 0) return null;
  return `Pulls from ${labels.join(" + ")}`;
}

/** Resolve the step to render in the center. Defaults to the persisted
 *  currentStep, falling back to the first not-done step, then first overall. */
function resolveInitialStepId(state: SequenceState): SequenceStepId {
  const persisted = state.currentStep;
  if (MEDIA_BUYING_SEQUENCE.some((s) => s.id === persisted)) return persisted;
  const firstUndone = MEDIA_BUYING_SEQUENCE.find((s) => !isStepDone(state, s.id));
  return (firstUndone ?? MEDIA_BUYING_SEQUENCE[0]).id;
}

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
  const [treeOpen, setTreeOpen] = useState(false);
  /** Per-step "what got produced" headline cached after reading the saved
   *  output. Keyed by step id. Null/missing = no summary available. */
  const [summaries, setSummaries] = useState<Partial<Record<SequenceStepId, string>>>({});

  const activeStep = useMemo<SequenceStep | undefined>(
    () => MEDIA_BUYING_SEQUENCE.find((s) => s.id === activeStepId),
    [activeStepId],
  );
  const activeFormConfig: FormConfig | undefined = activeStep
    ? getFormConfig(activeStep.formId)
    : undefined;

  const doneCount = useMemo(
    () => MEDIA_BUYING_SEQUENCE.filter((s) => isStepDone(sequenceState, s.id)).length,
    [sequenceState],
  );
  const total = MEDIA_BUYING_SEQUENCE.length;
  const pct = Math.round((doneCount / total) * 100);

  // Load chain values for the active step. Runs chainFrom prior-step lookups
  // first, then merges in any overrides from the editable campaign skeleton
  // (skeleton wins — user just touched it in the tree).
  useEffect(() => {
    let cancelled = false;
    setChainValues({});
    if (!activeStep) return;
    const specs = activeStep.chainFrom
      ? Array.isArray(activeStep.chainFrom)
        ? activeStep.chainFrom
        : [activeStep.chainFrom]
      : [];
    const hasChain = specs.length > 0;
    if (hasChain) setLoadingChain(true);
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

      // Skeleton overrides. Skeleton edits flow into the matching form's
      // prefill (skeleton wins over chainFrom — user just touched it in
      // the tree). Only fields the user directly edits in the tree should
      // land here.
      const skel = sequenceState.campaignSkeleton;
      if (skel) {
        const firstSet = skel.adSets[0];
        const uniqueAds = firstSet?.ads.length ?? 0;
        const distinctAngles = firstSet
          ? new Set(
              firstSet.ads
                .map((a) => a.angleLabel.trim())
                .filter((s) => s.length > 0),
            ).size
          : 0;
        const filledHooks = skel.adSets
          .flatMap((s) => s.ads.map((a) => a.hook.trim()))
          .filter((h) => h.length > 0);
        const dedupedHooks = Array.from(new Set(filledHooks));

        if (activeStep.formId === "structure") {
          mapped.daily_budget = skel.dailyBudget;
          if (skel.adSets.length > 0) mapped.audience_count = skel.adSets.length;
          if (uniqueAds > 0) mapped.creative_count = uniqueAds;
        }
        if (activeStep.formId === "hooks") {
          if (distinctAngles > 0) mapped.angle_count = distinctAngles;
          if (dedupedHooks.length > 0) mapped.seed = dedupedHooks.join("\n");
        }
        if (activeStep.formId === "creative-brief") {
          const primaryHook = firstSet?.ads[0]?.hook.trim();
          if (primaryHook) mapped.hook = primaryHook;
          if (uniqueAds > 0) mapped.quantity = uniqueAds;
        }
      }

      if (!cancelled) {
        setChainValues(mapped);
        if (hasChain) setLoadingChain(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeStep,
    sequenceState.stepOutputs,
    sequenceState.campaignSkeleton,
    root,
  ]);

  // Load summaries for every completed step. Re-runs when stepOutputs change
  // (e.g. after a save). Only touches steps with a real saved path — skipped
  // steps surface "Skipped" inline at render time.
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(sequenceState.stepOutputs) as Array<
      [SequenceStepId, { path: string; completedAt: string } | undefined]
    >;
    if (entries.length === 0) {
      setSummaries({});
      return;
    }
    void (async () => {
      const next: Partial<Record<SequenceStepId, string>> = {};
      for (const [id, rec] of entries) {
        if (!rec?.path) continue;
        try {
          const note = await api.readVaultNote(root, rec.path);
          const body = note?.body ?? "";
          const parsed = extractJsonFromBody(body);
          const summary = summarizeStepOutput(id, parsed, body);
          if (summary) next[id] = summary;
        } catch {
          // Summary is best-effort; rail still shows "Done" as a fallback.
        }
      }
      if (!cancelled) setSummaries(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [sequenceState.stepOutputs, root]);

  const handleSkeletonChange = useCallback(
    (next: CampaignSkeleton) => {
      onSequenceChange({ ...sequenceState, campaignSkeleton: next });
    },
    [sequenceState, onSequenceChange],
  );

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

  /** Mark this step done without generating output. Used when the step isn't
   *  applicable to this client (e.g. pixel already installed) or Jake just
   *  wants to skip the generator. Adds to `skipped[]` (which counts as done
   *  in `isStepDone`) and advances to the next step. */
  const handleMarkDone = useCallback(() => {
    if (!activeStep) return;
    const wasCurrent = sequenceState.currentStep === activeStep.id;
    const nextSkipped = Array.from(
      new Set([...(sequenceState.skipped ?? []), activeStep.id]),
    );
    const next: SequenceState = {
      ...sequenceState,
      skipped: nextSkipped,
      currentStep: wasCurrent
        ? nextStepId(activeStep.id) ?? sequenceState.currentStep
        : sequenceState.currentStep,
    };
    onSequenceChange(next);
    if (activeStep.checklistTaskId) onTaskTick(activeStep.checklistTaskId);
    const advanceTo = nextStepId(activeStep.id);
    if (advanceTo) setActiveStepId(advanceTo);
  }, [activeStep, sequenceState, onSequenceChange, onTaskTick]);

  /** Undo a mark-done / skip on the active step (only relevant when the step
   *  was marked done without a saved output). Keeps a generated output if
   *  one exists. */
  const handleUnmark = useCallback(() => {
    if (!activeStep) return;
    const skipped = (sequenceState.skipped ?? []).filter((id) => id !== activeStep.id);
    const next: SequenceState = { ...sequenceState, skipped };
    onSequenceChange(next);
  }, [activeStep, sequenceState, onSequenceChange]);

  /** Throw away the saved output for this step and clear any skip flag so the
   *  user gets a fresh form. The on-disk vault file is left in place (saving
   *  again will overwrite). Used when a generated output is wrong and the
   *  user wants to start over instead of editing inline. */
  const handleRegenerate = useCallback(() => {
    if (!activeStep) return;
    const ok = window.confirm(
      "Regenerate this step?\n\nThis clears the saved output so you start with a fresh form. The vault file stays where it is until you save again.",
    );
    if (!ok) return;
    const nextOutputs = { ...sequenceState.stepOutputs };
    delete nextOutputs[activeStep.id];
    const skipped = (sequenceState.skipped ?? []).filter((id) => id !== activeStep.id);
    const next: SequenceState = {
      ...sequenceState,
      stepOutputs: nextOutputs,
      skipped,
      currentStep: activeStep.id,
    };
    onSequenceChange(next);
  }, [activeStep, sequenceState, onSequenceChange]);

  const isActiveDone = activeStep ? isStepDone(sequenceState, activeStep.id) : false;
  const isActiveSkipped = activeStep
    ? Boolean(sequenceState.skipped?.includes(activeStep.id))
    : false;

  return (
    <div className="aw-root">
      {/* Topbar */}
      <div className="aw-topbar">
        <div>
          <div className="aw-eyebrow">▸ {clientName} · Ads</div>
          <h1 className="aw-h1">Ads Sequence</h1>
        </div>
        <div className="aw-meta-cluster">
          <div className="aw-count-pill">
            <b>{doneCount}</b> / {total} done
          </div>
          <button
            type="button"
            className={
              "aw-tree-btn" +
              (activeStep?.formId === "structure" ? " is-suggested" : "")
            }
            onClick={() => setTreeOpen(true)}
            title={
              activeStep?.formId === "structure"
                ? "Open the campaign tree alongside the Structure form for a live preview."
                : "Visualize the campaign skeleton being built"
            }
          >
            <span className="aw-tree-dot" />
            Campaign tree
          </button>
          <button type="button" className="aw-close" onClick={onClose}>
            ← Back
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="aw-progress">
        <div className="aw-track">
          <div className="aw-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Two columns: rail + active form */}
      <div className="aw-columns">
        {/* LEFT · STEPS RAIL (grouped: Setup / Creative / Launch) */}
        <div>
          {SEQUENCE_GROUPS.map((group, groupIdx) => {
            const groupSteps = group.stepIds
              .map((id) => MEDIA_BUYING_SEQUENCE.find((s) => s.id === id))
              .filter((s): s is SequenceStep => Boolean(s));
            const groupDoneCount = groupSteps.filter((s) =>
              isStepDone(sequenceState, s.id),
            ).length;
            const groupIsDone = groupDoneCount === groupSteps.length;
            const groupIsCurrent =
              !groupIsDone &&
              groupSteps.some((s) => s.id === activeStepId);
            return (
              <div
                key={group.id}
                className={
                  "aw-rail-group" +
                  (groupIsDone ? " is-done" : "") +
                  (groupIsCurrent ? " is-current" : "")
                }
              >
                <div className="aw-group-head">
                  <div className="aw-group-num">{groupIdx + 1}</div>
                  <div className="aw-group-name">{group.label}</div>
                  <div className="aw-group-count">
                    {groupDoneCount} / {groupSteps.length}
                  </div>
                </div>
                {groupSteps.map((s) => {
                  // Step number within the overall sequence (1-based) so the
                  // visual ordering still matches the original flat list.
                  const overallIdx = MEDIA_BUYING_SEQUENCE.findIndex(
                    (x) => x.id === s.id,
                  );
                  const isActive = s.id === activeStepId;
                  const done = isStepDone(sequenceState, s.id);
                  const skipped =
                    sequenceState.skipped?.includes(s.id) ?? false;
                  const summary = skipped
                    ? "Skipped"
                    : summaries[s.id] ?? (done ? "Done" : null);
                  const preview = !done ? chainPreview(s) : null;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={
                        "aw-rail-card" +
                        (done ? " done" : " upcoming") +
                        (isActive ? " is-active" : "")
                      }
                      onClick={() => setActiveStepId(s.id)}
                    >
                      <div className={"aw-check " + (done ? "done" : "next")}>
                        {done ? "✓" : overallIdx + 1}
                      </div>
                      <div className="aw-rail-body">
                        <div className="aw-rail-name">{s.label}</div>
                        {summary && (
                          <div
                            className={
                              "aw-rail-summary" + (skipped ? " is-skipped" : "")
                            }
                            title={summary}
                          >
                            {summary}
                          </div>
                        )}
                        {!summary && preview && (
                          <div className="aw-rail-preview" title={preview}>
                            {preview}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* RIGHT · ACTIVE FORM */}
        <div className="aw-center">
          {!activeStep ? (
            <div className="aw-empty">
              <p>All steps complete.</p>
              <button type="button" onClick={onClose} className="aw-primary">
                ← Back to onboarding
              </button>
            </div>
          ) : activeStep.id !== "ad-creative" && !activeFormConfig ? (
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
                  <h2 className="aw-active-title">{activeStep.label}</h2>
                  <div className="aw-active-sub">{activeStep.hint}</div>
                  {activeStep.checklistTaskId && (
                    <div className="aw-active-meta">
                      Saving ticks{" "}
                      <code>{activeStep.checklistTaskId}</code> in onboarding.
                    </div>
                  )}
                  {loadingChain && (
                    <div className="aw-chain-note">Loading prior outputs…</div>
                  )}
                </div>
                <div className="aw-active-actions">
                  {isActiveDone ? (
                    <>
                      {isActiveSkipped ? (
                        <button
                          type="button"
                          className="aw-ghost"
                          onClick={handleUnmark}
                          title="Undo the manual mark-done"
                        >
                          Unmark done
                        </button>
                      ) : (
                        <>
                          <span className="aw-done-pill">✓ Done</span>
                          <button
                            type="button"
                            className="aw-ghost"
                            onClick={handleRegenerate}
                            title="Clear the saved output and start over with a fresh form."
                          >
                            Regenerate
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="aw-ghost"
                      onClick={handleMarkDone}
                      title="Mark this step done without generating output (e.g. not applicable to this client)"
                    >
                      Mark done
                    </button>
                  )}
                </div>
              </div>
              <div className="aw-active-body">
                {activeStep.id === "ad-creative" ? (
                  <AdCreativeStudio
                    key={activeStep.id}
                    root={root}
                    clientName={clientName}
                    clientSlug={clientSlug}
                    initialValues={chainValues}
                    onSaved={handleSaved}
                  />
                ) : activeFormConfig ? (
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
                    hideHeader
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {treeOpen && (
        <CampaignTreeView
          clientName={clientName}
          sequenceState={sequenceState}
          onSkeletonChange={handleSkeletonChange}
          onClose={() => setTreeOpen(false)}
        />
      )}

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
.aw-meta-cluster {
  display: flex;
  gap: 12px;
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.05em;
  align-items: center;
}
.aw-count-pill {
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-secondary);
  letter-spacing: 0.08em;
}
.aw-count-pill b { color: var(--hml-text-primary); font-weight: 600; }
.aw-tree-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.aw-tree-btn:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
  background: var(--hml-bg-elev-3);
}
.aw-tree-btn.is-suggested {
  border-color: var(--hml-accent-border);
  background: var(--hml-accent-dim);
  color: var(--hml-accent);
  box-shadow: 0 0 0 1px var(--hml-accent-border), 0 0 18px -8px var(--hml-accent);
}
.aw-tree-btn.is-suggested:hover {
  border-color: var(--hml-accent);
  background: var(--hml-accent-dim);
  color: var(--hml-accent-bright);
}
.aw-tree-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5ea3ff, #b07bff, #54d68f);
  box-shadow: 0 0 6px rgba(94, 163, 255, 0.6);
}

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
  height: 3px;
  background: var(--hml-bg-elev-2);
  border-radius: 2px;
  overflow: hidden;
}
.aw-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--hml-accent), var(--hml-accent-bright));
  transition: width 320ms cubic-bezier(.4,.2,.2,1);
}

/* Two-column layout */
.aw-columns {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 24px;
  align-items: flex-start;
}
@media (max-width: 900px) {
  .aw-columns { grid-template-columns: 1fr; }
}

/* Rail groups */
.aw-rail-group {
  margin-bottom: 16px;
}
.aw-rail-group:last-child { margin-bottom: 0; }
.aw-group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 0 2px;
}
.aw-group-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  font-family: var(--hml-font-mono);
  font-size: 10px;
  font-weight: 600;
  display: grid;
  place-items: center;
  color: var(--hml-text-tertiary);
}
.aw-group-name {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  font-weight: 500;
  flex: 1;
}
.aw-group-count {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--hml-text-quaternary);
}
.aw-rail-group.is-current .aw-group-num {
  background: var(--hml-accent-dim);
  border-color: var(--hml-accent-border);
  color: var(--hml-accent);
}
.aw-rail-group.is-current .aw-group-name { color: var(--hml-accent); }
.aw-rail-group.is-done .aw-group-num {
  background: var(--hml-green-bg);
  border-color: var(--hml-green-border);
  color: var(--hml-green);
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
.aw-rail-summary {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.02em;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aw-rail-summary.is-skipped {
  font-style: italic;
  opacity: 0.7;
}
.aw-rail-preview {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-accent);
  letter-spacing: 0.02em;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
}
.aw-rail-card.is-active .aw-rail-preview { opacity: 1; }

/* Center column */
.aw-center {
  min-width: 0;
}

/* Active panel */
.aw-active {
  border: 1px solid var(--hml-border-subtle);
  background: var(--hml-bg-elev-1);
  border-radius: 12px;
  overflow: hidden;
}
.aw-active-head {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--hml-border-subtle);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.aw-active-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.018em;
  margin: 0 0 4px;
  color: var(--hml-text-primary);
}
.aw-active-sub {
  color: var(--hml-text-secondary);
  font-size: 13px;
  max-width: 640px;
}
.aw-chain-note {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
  margin-top: 8px;
  letter-spacing: 0.04em;
}
.aw-active-meta {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.04em;
  margin-top: 8px;
}
.aw-active-meta code {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  padding: 1px 6px;
  border-radius: 3px;
  color: var(--hml-text-secondary);
  font-size: 10.5px;
}
.aw-active-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.aw-ghost {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.aw-ghost:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
  background: var(--hml-bg-elev-2);
}
.aw-done-pill {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--hml-green-border);
  background: var(--hml-green-bg);
  color: var(--hml-green);
}
.aw-active-body {
  padding: 18px 24px 22px;
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

`;

export default AdsSequenceWizard;

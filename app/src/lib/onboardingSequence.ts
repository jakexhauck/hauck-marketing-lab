/**
 * Onboarding Sequence — the serial walk from signed → ads-live. Five steps,
 * one form per step, output of step N seeds step N+1.
 *
 * Distinct from MEDIA_BUYING_SEQUENCE (which lives inside the OnboardingChecklist):
 * this is the dedicated "Sequence" tab on the Client Hub, visible until Jake
 * clicks "Mark launched". After that the tab disappears and forms are accessed
 * via the standalone menu.
 *
 * State persists in vault/Clients/<slug>/onboarding.json under the `sequence`
 * key (shape already declared on OnboardingState). The chainFrom mapping is
 * the only thing that needs maintenance when forms evolve.
 */

import { api } from "./tauri";
import type { FormSurfaceId, FormValues } from "./formConfigs";
import type { OnboardingState } from "./types";

export type OnboardingSequenceStepId =
  | "calendar"
  | "audience"
  | "ad-copy"
  | "website"
  | "qa";

/** Maps a prior step's JSON keys to this step's form field keys. Applied
 *  BEFORE prefillFromProfile in GenericFormGenerator (initialValues take
 *  precedence over the Profile.md prefill effect). */
export interface SequenceChainSpec {
  step: OnboardingSequenceStepId;
  fields: Record<string, string>;
}

/** Steps that have `formId === null` render a lightweight confirmation card
 *  instead of GenericFormGenerator. Used for steps that aren't backed by a
 *  Claude-driven form (calendar booking, pre-launch QA checklist). */
export interface OnboardingSequenceStep {
  id: OnboardingSequenceStepId;
  label: string;
  hint: string;
  formId: FormSurfaceId | null;
  /** OnboardingChecklist task ID to auto-tick when this step completes. */
  checklistTaskId?: string;
  chainFrom?: SequenceChainSpec | null;
  /** Verbatim instructions rendered on the confirmation card for non-form
   *  steps. Ignored when formId is set. */
  confirmationCopy?: string;
}

export const ONBOARDING_SEQUENCE: OnboardingSequenceStep[] = [
  {
    id: "calendar",
    label: "Onboarding call booked",
    hint: "Confirm the kickoff is on the calendar.",
    formId: null,
    checklistTaskId: "02-call",
    confirmationCopy:
      "Confirm the kickoff call is booked on Google Calendar. Marking complete records it on the sequence; the actual invite is created via the Day-0 cascade or your normal calendar workflow.",
  },
  {
    id: "audience",
    label: "Audience research",
    hint: "Voice-of-customer research; feeds the ad-copy step.",
    formId: "audience-research",
    checklistTaskId: "04-audiences",
    chainFrom: null,
  },
  {
    id: "ad-copy",
    label: "Ad copy",
    hint: "10+ variations from the brief + audience research.",
    formId: "ad-copy",
    checklistTaskId: "04-copy",
    chainFrom: {
      step: "audience",
      fields: { summary: "audience_summary", headline: "audience_headline" },
    },
  },
  {
    id: "website",
    label: "Landing page",
    hint: "Build the landing page in the Web Designer.",
    formId: null,
    checklistTaskId: "04-creative",
    confirmationCopy:
      "Build or confirm the landing page in the Web Designer page (Workspace > Outreach > Web Designer, or per-client Fulfillment > Websites). Mark complete once a working URL exists.",
  },
  {
    id: "qa",
    label: "Pre-launch QA",
    hint: "Pixel + payment + client approval. Last gate before launch.",
    formId: null,
    checklistTaskId: "05-qa",
    confirmationCopy:
      "Run the pre-launch QA checklist: pixel firing, payment method on file, client has approved copy + creative. Mark complete only when every gate is green.",
  },
];

export interface SequenceStepRecord {
  path: string;
  completedAt: string;
}

export interface OnboardingSequenceState {
  currentStep: OnboardingSequenceStepId;
  stepOutputs: Partial<Record<OnboardingSequenceStepId, SequenceStepRecord>>;
  skipped: OnboardingSequenceStepId[];
  launchedAt?: string;
  sequenceComplete?: boolean;
}

export function emptySequenceState(): OnboardingSequenceState {
  return {
    currentStep: ONBOARDING_SEQUENCE[0].id,
    stepOutputs: {},
    skipped: [],
  };
}

export function getStep(id: OnboardingSequenceStepId): OnboardingSequenceStep | undefined {
  return ONBOARDING_SEQUENCE.find((s) => s.id === id);
}

export function stepIndex(id: OnboardingSequenceStepId): number {
  return ONBOARDING_SEQUENCE.findIndex((s) => s.id === id);
}

export function nextStepId(id: OnboardingSequenceStepId): OnboardingSequenceStepId | null {
  const idx = stepIndex(id);
  if (idx < 0 || idx >= ONBOARDING_SEQUENCE.length - 1) return null;
  return ONBOARDING_SEQUENCE[idx + 1].id;
}

export function previousStepId(id: OnboardingSequenceStepId): OnboardingSequenceStepId | null {
  const idx = stepIndex(id);
  if (idx <= 0) return null;
  return ONBOARDING_SEQUENCE[idx - 1].id;
}

export function isStepDone(state: OnboardingSequenceState, id: OnboardingSequenceStepId): boolean {
  if (state.skipped.includes(id)) return true;
  return !!state.stepOutputs[id]?.path;
}

export function sequenceComplete(state: OnboardingSequenceState): boolean {
  if (state.sequenceComplete) return true;
  return ONBOARDING_SEQUENCE.every((s) => isStepDone(state, s.id));
}

/** Load the sequence block from disk. Returns a fresh empty state on first run. */
export async function loadSequenceState(
  root: string,
  clientSlug: string,
): Promise<OnboardingSequenceState> {
  try {
    const state = await api.readOnboardingState(root, clientSlug);
    if (!state.sequence) return emptySequenceState();
    const seq = state.sequence;
    return {
      currentStep: (seq.currentStep as OnboardingSequenceStepId) ?? ONBOARDING_SEQUENCE[0].id,
      stepOutputs: (seq.stepOutputs ?? {}) as OnboardingSequenceState["stepOutputs"],
      skipped: ((seq.skipped ?? []) as OnboardingSequenceStepId[]).filter((s) =>
        ONBOARDING_SEQUENCE.some((step) => step.id === s),
      ),
      launchedAt: seq.launchedAt,
      sequenceComplete: state.sequence ? (state.sequence as { sequenceComplete?: boolean }).sequenceComplete : undefined,
    };
  } catch {
    return emptySequenceState();
  }
}

/** Persist the sequence block. Merges into the existing OnboardingState. */
export async function saveSequenceState(
  root: string,
  clientSlug: string,
  sequence: OnboardingSequenceState,
): Promise<void> {
  let existing: OnboardingState;
  try {
    existing = await api.readOnboardingState(root, clientSlug);
  } catch {
    existing = { done: [], phaseDoneAt: {} };
  }
  const next: OnboardingState = {
    ...existing,
    sequence: {
      currentStep: sequence.currentStep,
      stepOutputs: sequence.stepOutputs as Record<string, SequenceStepRecord>,
      skipped: sequence.skipped,
      launchedAt: sequence.launchedAt,
      ...(sequence.sequenceComplete ? { sequenceComplete: true } : {}),
    },
  };
  await api.writeOnboardingState(root, clientSlug, next);
}

/** Mark a checklist task complete in-place. Idempotent. Logs but never throws. */
export async function tickChecklistTask(
  root: string,
  clientSlug: string,
  taskId: string,
): Promise<void> {
  try {
    const state = await api.readOnboardingState(root, clientSlug);
    const done = new Set(state.done ?? []);
    if (done.has(taskId)) return;
    done.add(taskId);
    await api.writeOnboardingState(root, clientSlug, {
      ...state,
      done: Array.from(done),
    });
  } catch (e) {
    console.warn("tickChecklistTask failed", taskId, e);
  }
}

/** Pull a saved step's JSON block and project it into the next form's field
 *  keys per the chainFrom spec. Silently skips on parse/IO failure — chained
 *  prefill is best-effort. */
export async function loadChainValues(
  root: string,
  sequence: OnboardingSequenceState,
  step: OnboardingSequenceStep,
): Promise<Partial<FormValues>> {
  if (!step.chainFrom) return {};
  const prior = sequence.stepOutputs[step.chainFrom.step];
  if (!prior?.path) return {};
  try {
    const note = await api.readVaultNote(root, prior.path);
    const body = note?.body ?? "";
    const parsed = extractJson(body);
    if (!parsed) return {};
    const out: Partial<FormValues> = {};
    for (const [sourceKey, targetField] of Object.entries(step.chainFrom.fields)) {
      const v = parsed[sourceKey];
      if (typeof v === "string" || typeof v === "number") out[targetField] = v;
      else if (Array.isArray(v)) out[targetField] = v.map(String);
    }
    return out;
  } catch (e) {
    console.warn("loadChainValues: prior output unreadable", e);
    return {};
  }
}

function extractJson(src: string): Record<string, unknown> | null {
  const startIdx = src.indexOf("```json");
  if (startIdx === -1) return null;
  const after = src.slice(startIdx + "```json".length).replace(/^\n/, "");
  const endIdx = after.indexOf("```");
  if (endIdx === -1) return null;
  try {
    return JSON.parse(after.slice(0, endIdx).trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

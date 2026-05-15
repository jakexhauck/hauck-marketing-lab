/**
 * Media Buying Sequence. Guided wizard that walks a new client from signed
 * through ads-live by opening one form per step. Each completed step auto-ticks
 * the matching OnboardingChecklist task and (where useful) prefills the next
 * step's form from the prior step's output.
 *
 * Runs alongside the OnboardingChecklist: the checklist tracks THAT a thing
 * happened; this sequence GUIDES the next form. State persists in
 * vault/Clients/<slug>/onboarding.json under the optional `sequence` key.
 *
 * To extend: add a step here. The step's `formId` must match an existing
 * FormConfig.id in formConfigs.ts; `checklistTaskId` must match an
 * OnboardingTask.id in onboardingPlan.ts.
 */

import type { FormSurfaceId } from "./formConfigs";

export type SequenceStepId =
  | "pixel-install"
  | "competitors"
  | "audiences"
  | "creative-brief"
  | "ad-copy"
  | "ad-creative"
  | "approval-email"
  | "structure"
  | "live-message"
  | "optimizer"
  | "weekly-report";

/**
 * Maps a prior step's output JSON keys to this step's form field keys.
 * Run AFTER prefillFromProfile so chained values take precedence over Profile.md.
 *
 * `rawBodyField` is an escape hatch for prior steps that emit pure markdown
 * (no JSON block, e.g. ad-copy). When set, the entire markdown body of the
 * prior step's saved file is mapped into that field key, in addition to any
 * JSON-key mappings declared in `fields`.
 */
export interface ChainSpec {
  step: SequenceStepId;
  fields: Record<string, string>;
  rawBodyField?: string;
}

export interface SequenceStep {
  id: SequenceStepId;
  formId: FormSurfaceId;
  checklistTaskId: string;
  /** OnboardingChecklist phase index (1-based, matches `num` in onboardingPlan.ts). */
  phase: number;
  label: string;
  hint: string;
  /** One or more prior-step outputs to prefill from. Multiple specs are applied
   *  in order; later sources can overwrite earlier ones if their target fields
   *  collide. */
  chainFrom?: ChainSpec | ChainSpec[] | null;
}

export const MEDIA_BUYING_SEQUENCE: SequenceStep[] = [
  {
    id: "competitors",
    formId: "competitors",
    checklistTaskId: "03-competitors",
    phase: 2,
    label: "Research competitors",
    hint: "Pull 5–10 competitors with angles, offers, and weaknesses. Runs first so its intel feeds every downstream step.",
  },
  {
    id: "pixel-install",
    formId: "pixel-install",
    checklistTaskId: "03-pixel",
    phase: 2,
    label: "Install pixel",
    hint: "Walk through installing the Meta Pixel on the client's site.",
  },
  {
    id: "audiences",
    formId: "audiences",
    checklistTaskId: "04-audiences",
    phase: 3,
    label: "Build audiences",
    hint: "3–5 Meta audiences: broad, interest, lookalike. Pre-seeded with competitor intel.",
    chainFrom: {
      step: "competitors",
      fields: { key_takeaways: "competitor_intel" },
    },
  },
  {
    id: "creative-brief",
    formId: "creative-brief",
    checklistTaskId: "04-creative",
    phase: 3,
    label: "Write creative brief",
    hint: "Lock the hook, message, proof, and CTA. Informed by competitor white-space.",
    chainFrom: [
      {
        step: "competitors",
        fields: { key_takeaways: "competitor_intel" },
      },
      {
        step: "audiences",
        fields: { launch_first: "audience" },
      },
    ],
  },
  {
    id: "ad-copy",
    formId: "ad-copy",
    checklistTaskId: "04-copy",
    phase: 3,
    label: "Generate ad copy",
    hint: "10+ variations from the locked brief and competitor angles.",
    chainFrom: {
      step: "competitors",
      fields: { key_takeaways: "competitor_intel" },
    },
  },
  {
    id: "ad-creative",
    formId: "ad-creative",
    checklistTaskId: "04-creatives",
    phase: 3,
    label: "Build static creatives",
    hint: "Turn chosen ad-copy variations into Nano Banana 2 image prompts. Pick which ads, pick which dimensions, paste prompts into Google AI Studio.",
    chainFrom: [
      {
        step: "ad-copy",
        fields: {},
        rawBodyField: "ad_copy_markdown",
      },
      {
        step: "creative-brief",
        fields: { visual_style: "visual_style", do_nots: "do_nots" },
      },
    ],
  },
  {
    id: "approval-email",
    formId: "approval-email",
    checklistTaskId: "04-approval",
    phase: 3,
    label: "Send for approval",
    hint: "Email the client with copy + creative docs for sign-off.",
  },
  {
    id: "structure",
    formId: "structure",
    checklistTaskId: "05-structure",
    phase: 4,
    label: "Plan campaign structure",
    hint: "CBO vs ABO, ad-set split, creatives-per-ad-set.",
  },
  {
    id: "live-message",
    formId: "live-message",
    checklistTaskId: "06-live-msg",
    phase: 5,
    label: "Send ads-live message",
    hint: "Tell the client the ads are running.",
  },
  {
    id: "optimizer",
    formId: "optimizer",
    checklistTaskId: "06-optimizer",
    phase: 5,
    label: "Set optimizer rules",
    hint: "Kill thresholds, scale rules, alert channels.",
  },
  {
    id: "weekly-report",
    formId: "weekly-report",
    checklistTaskId: "06-report",
    phase: 5,
    label: "First weekly report",
    hint: "Monday recap email. Closes the onboarding arc.",
  },
];

/** Per-step persisted record. `path` points at the saved generator output on disk. */
export interface SequenceStepRecord {
  path: string;
  completedAt: string;
}

/**
 * Stored as the optional `sequence` block on OnboardingState (onboarding.json).
 * Absent = step 1, no outputs yet.
 */
export interface SequenceState {
  currentStep: SequenceStepId;
  stepOutputs: Partial<Record<SequenceStepId, SequenceStepRecord>>;
  skipped?: SequenceStepId[];
  /** Set once Jake clicks "Mark launched" on the final step. Mirrors adsLaunchedAt
   *  on the ops/clients.json row, but kept here for the local UI flag. */
  launchedAt?: string;
  /** Google Drive folder ID for this client's creative assets. Sticky across
   *  ad-creative runs so Jake doesn't re-paste it every time. The backend treats
   *  the whole sequence block as opaque JSON, so adding a field here is a
   *  TS-only change. */
  driveFolderId?: string;
}

export function emptySequenceState(): SequenceState {
  return {
    currentStep: MEDIA_BUYING_SEQUENCE[0].id,
    stepOutputs: {},
  };
}

export function stepIndex(id: SequenceStepId): number {
  return MEDIA_BUYING_SEQUENCE.findIndex((s) => s.id === id);
}

export function getStep(id: SequenceStepId): SequenceStep | undefined {
  return MEDIA_BUYING_SEQUENCE.find((s) => s.id === id);
}

export function nextStepId(id: SequenceStepId): SequenceStepId | null {
  const idx = stepIndex(id);
  if (idx < 0 || idx >= MEDIA_BUYING_SEQUENCE.length - 1) return null;
  return MEDIA_BUYING_SEQUENCE[idx + 1].id;
}

export function previousStepId(id: SequenceStepId): SequenceStepId | null {
  const idx = stepIndex(id);
  if (idx <= 0) return null;
  return MEDIA_BUYING_SEQUENCE[idx - 1].id;
}

export function totalSteps(): number {
  return MEDIA_BUYING_SEQUENCE.length;
}

/** Done = saved output exists OR step was explicitly skipped. */
export function isStepDone(state: SequenceState, id: SequenceStepId): boolean {
  if (state.skipped?.includes(id)) return true;
  return !!state.stepOutputs[id]?.path;
}

export function completedCount(state: SequenceState): number {
  return MEDIA_BUYING_SEQUENCE.filter((s) => isStepDone(state, s.id)).length;
}

/** True when every step is done (or skipped). Drives the "Mark launched" button. */
export function sequenceComplete(state: SequenceState): boolean {
  return MEDIA_BUYING_SEQUENCE.every((s) => isStepDone(state, s.id));
}

/** All checklist task IDs the sequence will auto-tick. Useful for sanity tests. */
export function sequenceChecklistTaskIds(): string[] {
  return MEDIA_BUYING_SEQUENCE.map((s) => s.checklistTaskId);
}

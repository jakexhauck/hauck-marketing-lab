/**
 * Ads Sequence. Guided wizard launched from the "Ads" task in the onboarding
 * checklist. Walks the agency from offer-lock through optimizer config, one
 * form at a time. Each completed step auto-ticks the matching checklist task
 * (when one exists) and prefills the next step's form from the prior step's
 * output.
 *
 * Constant kept as `MEDIA_BUYING_SEQUENCE` for backward compatibility with
 * existing imports — the conceptual name is now "Ads Sequence."
 *
 * State persists in vault/Clients/<slug>/onboarding.json under the optional
 * `sequence` key.
 *
 * To extend: add a step here. The step's `formId` must match an existing
 * FormConfig.id in formConfigs.ts; `checklistTaskId` (optional) must match an
 * OnboardingTask.id in onboardingPlan.ts.
 */

import type { FormSurfaceId } from "./formConfigs";

export type SequenceStepId =
  | "audience-research"
  | "creative-brief"
  | "ad-copy"
  | "ad-creative"
  | "structure";

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

/** One-line "what got produced" for the wizard rail. Reads the parsed JSON
 *  block from the saved output (if any) plus the raw markdown body, and
 *  returns a short headline ("12 hooks · 4 picks", "$25/day · 2 ad sets"),
 *  or null if there's nothing useful to surface. The wizard falls back to
 *  the step's saved timestamp when this returns null. */
export function summarizeStepOutput(
  stepId: SequenceStepId,
  parsed: Record<string, unknown> | null,
  rawBody: string,
): string | null {
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  const truncate = (s: string, n: number) =>
    s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";

  switch (stepId) {
    case "audience-research": {
      const audiences = arr(parsed?.audiences);
      const launchFirst = str(parsed?.launch_first).trim();
      if (audiences.length && launchFirst) {
        return `${audiences.length} audiences · launch: ${truncate(launchFirst, 32)}`;
      }
      if (audiences.length) return `${audiences.length} audiences`;
      if (launchFirst) return `Launch: ${truncate(launchFirst, 40)}`;
      return null;
    }
    case "creative-brief": {
      const format = str(parsed?.format).trim();
      const hook = str(parsed?.hook).trim();
      if (format && hook) return `${format} · ${truncate(hook, 40)}`;
      if (hook) return truncate(hook, 60);
      if (format) return format;
      return null;
    }
    case "ad-copy": {
      // Ad copy is free-form markdown — no JSON block. Count "Ad N" headers.
      const matches = rawBody.match(/^#{1,4}\s*Ad\s*\d+/gim);
      const count = matches?.length ?? 0;
      if (count > 0) return `${count} ad variations`;
      return null;
    }
    case "ad-creative": {
      // Free-form markdown of Nano Banana prompts. Count prompt blocks.
      const promptMatches = rawBody.match(/^#{1,4}\s*(Prompt|Ad)\s*\d+/gim);
      const count = promptMatches?.length ?? 0;
      if (count > 0) return `${count} creative prompts`;
      return null;
    }
    case "structure": {
      const adSets = arr(parsed?.ad_sets);
      const cbo = str(parsed?.cbo_or_abo).trim().toUpperCase();
      const totalBudget = adSets.reduce<number>((acc, s) => {
        const rec = s as Record<string, unknown> | null;
        return acc + num(rec?.budget);
      }, 0);
      const adsTotal = adSets.reduce<number>((acc, s) => {
        const rec = s as Record<string, unknown> | null;
        return acc + num(rec?.creatives);
      }, 0);
      const parts: string[] = [];
      if (cbo) parts.push(cbo);
      if (adSets.length) parts.push(`${adSets.length} ad sets`);
      if (adsTotal) parts.push(`${adsTotal} ads`);
      if (totalBudget) parts.push(`$${totalBudget}/day`);
      return parts.length ? parts.join(" · ") : null;
    }
    default:
      return null;
  }
}

/** Form surface a sequence step resolves to. Most steps use a real
 *  FormConfig.id; "ad-creative" is a sentinel — that step renders the
 *  AdCreativeStudio component directly instead of going through the
 *  generic form pipeline. */
export type SequenceFormSurface = FormSurfaceId | "ad-creative";

export interface SequenceStep {
  id: SequenceStepId;
  formId: SequenceFormSurface;
  /** OnboardingChecklist task ID to auto-tick on form save. Optional — some
   *  sequence steps (e.g. hooks) don't have a 1:1 task in the plan. */
  checklistTaskId?: string;
  /** OnboardingChecklist phase index (1-based, matches `num` in onboardingPlan.ts). */
  phase: number;
  label: string;
  hint: string;
  /** One or more prior-step outputs to prefill from. Multiple specs are applied
   *  in order; later sources can overwrite earlier ones if their target fields
   *  collide. */
  chainFrom?: ChainSpec | ChainSpec[] | null;
}

// Pixel install used to be step 1 of this sequence. Moved out 2026-05-20 into
// Phase 3 (Technical Setup) since it's plumbing, not creative work. The
// `pixel-install` form is still wired, but now via FORM_BY_TASK on the
// 03-pixel checklist row in OnboardingChecklist.tsx.
//
// `checklistTaskId` was stripped from every step in the same pass:
//   - 04-audiences / 04-creative / 04-copy / 04-creatives were phantom IDs
//     (no matching task in onboardingPlan.ts).
//   - 05-structure / 06-optimizer auto-ticked Phase 5 + Phase 6 tasks that
//     describe MANUAL build/monitoring work distinct from saving the wizard's
//     plan file. Auto-ticking them on save was misleading.
// The wizard now ticks nothing in the checklist directly. Instead, OnboardingChecklist
// watches `sequenceComplete(sequenceState)` and auto-ticks 06-ads when every
// wizard step is done.
// Trimmed 2026-05-26: audience research, creative brief, and campaign structure
// were removed from the sequence. Competitor research / reviews are now done by
// hand into a tab of the client's linked Google Sheet, which the copywriter
// reads automatically (see the Sheet tab's research-tab picker + prompt.ts).
// The `SequenceStepId` union and the retired FormConfigs are intentionally kept
// so unrelated code that references them still compiles.
export const MEDIA_BUYING_SEQUENCE: SequenceStep[] = [
  {
    id: "ad-copy",
    formId: "ad-copy",
    phase: 6,
    label: "Generate ad copy",
    hint: "Direct copywriter chat, voice-matched to the client. Reviews and competitor research from the linked sheet's research tab are auto-attached to every message.",
  },
  {
    id: "ad-creative",
    formId: "ad-creative",
    phase: 6,
    label: "Build static creatives",
    hint: "Turn chosen ad-copy variations into Nano Banana 2 image prompts.",
    chainFrom: [
      {
        step: "ad-copy",
        fields: {},
        rawBodyField: "ad_copy_markdown",
      },
    ],
  },
];

/** The set of FormConfig.id values that participate in the Ads sequence.
 *  Used by AgentFormsHub to split forms into "Ads sequence" vs "Other onboarding". */
export const ADS_SEQUENCE_FORM_IDS: ReadonlySet<string> = new Set(
  MEDIA_BUYING_SEQUENCE.map((s) => s.formId),
);

/** Visual grouping for the wizard rail. Purely presentational — the underlying
 *  step order, IDs, formIds, and chainFrom plumbing are unchanged. Adding or
 *  re-ordering steps still happens in MEDIA_BUYING_SEQUENCE above; this just
 *  decides which group header a step sits under. */
export type SequenceGroupId = "research" | "creative" | "launch";

export interface SequenceGroup {
  id: SequenceGroupId;
  label: string;
  stepIds: SequenceStepId[];
}

export const SEQUENCE_GROUPS: SequenceGroup[] = [
  {
    id: "creative",
    label: "Creative",
    stepIds: ["ad-copy", "ad-creative"],
  },
];

/** Per-step persisted record. `path` points at the saved generator output on disk.
 *  Drive fields are populated by the auto-push pipeline (see AdsSequenceWizard
 *  `handleSaved`). `driveUrl` set = green pill in the rail; `drivePushError`
 *  set = amber pill with a Retry button. They are independently optional so a
 *  successful save with a failed push still records the local path. */
export interface SequenceStepRecord {
  path: string;
  completedAt: string;
  /** Most recent successful push. Cleared on regenerate, refreshed on every retry. */
  driveUrl?: string;
  driveFileId?: string;
  drivePushAt?: string;
  /** Last push failure message. Cleared as soon as a push succeeds. */
  drivePushError?: string;
}

/** Ad-level cell in the campaign tree. Format is free-form so a slot can be any
 *  combo of image/video/carousel + angle label (no fixed "image must be Angle A"). */
export type AdFormat = "Image" | "Video" | "Carousel";

export interface CampaignSkeletonAd {
  format: AdFormat;
  angleLabel: string;
  hook: string;
  /** Absolute path of the creative saved/imported via AdCreativeStudio. Drives
   *  the ad-card thumbnail in CampaignTreeView when set. */
  creativePath?: string;
  /** Display-friendly basename for the creative; shown as a caption beside the
   *  thumbnail. */
  creativeFilename?: string;
  /** Inline preview source — remote URL for Replicate saves, data URI for
   *  imports. Used directly by the <img> in the ad card. */
  creativePreviewUrl?: string;
  /** Frames 2..N for Carousel format. Frame 0 lives on the primary
   *  creativePath/Filename/PreviewUrl fields so single-image and carousel ads
   *  share the same wire shape until you add a second frame. Ignored for
   *  Image/Video formats but kept on the model so flipping the format back to
   *  Carousel doesn't drop the stack. */
  extraFrames?: Array<{
    creativePath?: string;
    creativeFilename?: string;
    creativePreviewUrl?: string;
  }>;
}

export interface CampaignSkeletonAdSet {
  name: string;
  targeting: string;
  dailyBudget: number;
  ads: CampaignSkeletonAd[];
}

/** Editable campaign tree backing the CampaignTreeView. Edits flow into the
 *  matching forms via chainValues (see AdsSequenceWizard). */
export interface CampaignSkeleton {
  dailyBudget: number;
  adSets: CampaignSkeletonAdSet[];
}

/** Defaults match the Learning Phase framework: 1 campaign · 2 ad sets
 *  (Broad + Interest) · 3 ads each. Same 3 ads mirrored across both sets —
 *  testing audience, not creative. */
export function defaultCampaignSkeleton(): CampaignSkeleton {
  const ads: CampaignSkeletonAd[] = [
    { format: "Image", angleLabel: "Price anchor", hook: "" },
    { format: "Image", angleLabel: "Fear · urgency", hook: "" },
    { format: "Video", angleLabel: "Social proof", hook: "" },
  ];
  return {
    dailyBudget: 25,
    adSets: [
      {
        name: "Ad Set 1 · Broad",
        targeting: "Local 10mi · 25 to 55",
        dailyBudget: 12,
        ads: ads.map((a) => ({ ...a })),
      },
      {
        name: "Ad Set 2 · Interest",
        targeting: "Home Improvement + Homeowners",
        dailyBudget: 13,
        ads: ads.map((a) => ({ ...a })),
      },
    ],
  };
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
  /** Editable campaign tree (CampaignTreeView). Absent = use defaults. */
  campaignSkeleton?: CampaignSkeleton;
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

/** All checklist task IDs the sequence will auto-tick. Useful for sanity tests.
 *  Skips steps with no `checklistTaskId` mapping. */
export function sequenceChecklistTaskIds(): string[] {
  return MEDIA_BUYING_SEQUENCE.map((s) => s.checklistTaskId).filter(
    (id): id is string => Boolean(id),
  );
}

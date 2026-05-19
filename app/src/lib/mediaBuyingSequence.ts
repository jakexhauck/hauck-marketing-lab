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
  | "offer-cta"
  | "competitors"
  | "pixel-install"
  | "audience-research"
  | "creative-brief"
  | "hooks"
  | "ad-copy"
  | "ad-creative"
  | "structure"
  | "optimizer";

/**
 * Maps a prior step's output JSON keys to this step's form field keys.
 * Run AFTER prefillFromProfile so chained values take precedence over Profile.md.
 *
 * `rawBodyField` is an escape hatch for prior steps that emit pure markdown
 * (no JSON block, e.g. ad-copy). When set, the entire markdown body of the
 * prior step's saved file is mapped into that field key, in addition to any
 * JSON-key mappings declared in `fields`.
 *
 * `transform` runs a named formatter against the prior step's parsed JSON
 * and writes the result into `transformTargetField`. Use when the
 * structure-to-string mapping is too gnarly for the simple `fields` map.
 * Currently the only transform is `"hooks-to-adcopy"` (numbered priority
 * list + full hook list).
 */
export type ChainTransform = "hooks-to-adcopy";

export interface ChainSpec {
  step: SequenceStepId;
  fields: Record<string, string>;
  rawBodyField?: string;
  transform?: ChainTransform;
  transformTargetField?: string;
}

/** Format hooks-step JSON into the structured list the ad-copy prompt expects.
 *  Top picks lead the numbering as "PRIORITY"; remaining hooks follow with
 *  their angle category attached. Numbers are stable: priority picks get
 *  #1, #2, …; the rest continue the count. Used as `transform: "hooks-to-adcopy"`. */
export function formatHooksForAdCopy(parsed: Record<string, unknown>): string {
  type Entry = { n: number; hook: string; category?: string; priority: boolean };
  const entries: Entry[] = [];
  const seen = new Set<string>();

  const angles: Array<{ category?: string; hooks: string[] }> = [];
  if (Array.isArray(parsed.angles)) {
    for (const a of parsed.angles) {
      if (!a || typeof a !== "object") continue;
      const rec = a as Record<string, unknown>;
      const category = typeof rec.category === "string" ? rec.category : undefined;
      const hooks = Array.isArray(rec.hooks)
        ? (rec.hooks.filter((h) => typeof h === "string") as string[])
        : [];
      angles.push({ category, hooks });
    }
  }
  const categoryFor = (hook: string): string | undefined => {
    for (const a of angles) {
      if (a.hooks.includes(hook)) return a.category;
    }
    return undefined;
  };

  let n = 1;
  if (Array.isArray(parsed.top_picks)) {
    for (const p of parsed.top_picks) {
      if (!p || typeof p !== "object") continue;
      const hook = (p as Record<string, unknown>).hook;
      if (typeof hook !== "string" || seen.has(hook)) continue;
      entries.push({ n: n++, hook, category: categoryFor(hook), priority: true });
      seen.add(hook);
    }
  }
  for (const a of angles) {
    for (const hook of a.hooks) {
      if (seen.has(hook)) continue;
      entries.push({ n: n++, hook, category: a.category, priority: false });
      seen.add(hook);
    }
  }

  const lines: string[] = [];
  const priority = entries.filter((e) => e.priority);
  const rest = entries.filter((e) => !e.priority);
  if (priority.length > 0) {
    lines.push("PRIORITY (use each at least once across the 12 ads):");
    for (const e of priority) {
      const cat = e.category ? ` · ${e.category}` : "";
      lines.push(`#${e.n}${cat} · ${e.hook}`);
    }
    lines.push("");
  }
  if (rest.length > 0) {
    lines.push("FULL HOOK LIST (use to fill remaining slots):");
    for (const e of rest) {
      const cat = e.category ? ` · ${e.category}` : "";
      lines.push(`#${e.n}${cat} · ${e.hook}`);
    }
  }
  return lines.join("\n");
}

export interface SequenceStep {
  id: SequenceStepId;
  formId: FormSurfaceId;
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

export const MEDIA_BUYING_SEQUENCE: SequenceStep[] = [
  {
    id: "offer-cta",
    formId: "offer-cta",
    checklistTaskId: "02-offer",
    phase: 2,
    label: "Lock the offer + CTA",
    hint: "Nail the offer and primary CTA. Everything downstream reads from this.",
  },
  {
    id: "competitors",
    formId: "competitors",
    checklistTaskId: "03-competitors",
    phase: 5,
    label: "Research competitors",
    hint: "Pull 5–10 competitors with angles, offers, and weaknesses. Feeds every downstream step.",
  },
  {
    id: "pixel-install",
    formId: "pixel-install",
    checklistTaskId: "03-pixel",
    phase: 5,
    label: "Install pixel",
    hint: "Walk through installing the Meta Pixel on the client's site.",
  },
  {
    id: "audience-research",
    formId: "audience-research",
    checklistTaskId: "04-audiences",
    phase: 6,
    label: "Audience research",
    hint: "Deep voice-of-customer teardown: psychographics, pains, language. Seeds the brief and copy.",
    chainFrom: {
      step: "competitors",
      fields: { key_takeaways: "competitor_intel" },
    },
  },
  {
    id: "creative-brief",
    formId: "creative-brief",
    checklistTaskId: "04-creative",
    phase: 6,
    label: "Write creative brief",
    hint: "Lock the hook, message, proof, and CTA. Informed by competitor white-space + audience research.",
    chainFrom: [
      {
        step: "competitors",
        fields: { key_takeaways: "competitor_intel" },
      },
      {
        step: "audience-research",
        fields: { summary: "audience_summary" },
      },
    ],
  },
  {
    id: "hooks",
    formId: "hooks",
    phase: 6,
    label: "Generate hooks",
    hint: "Volume of hook variants on the locked angle. Feeds ad copy.",
    chainFrom: {
      step: "creative-brief",
      fields: { hook: "primary_hook", angle: "angle" },
    },
  },
  {
    id: "ad-copy",
    formId: "ad-copy",
    checklistTaskId: "04-copy",
    phase: 6,
    label: "Generate ad copy",
    hint: "10+ variations from the locked brief, hooks, and competitor angles.",
    chainFrom: [
      {
        step: "competitors",
        fields: { key_takeaways: "competitor_intel" },
      },
      {
        step: "hooks",
        fields: {},
        transform: "hooks-to-adcopy",
        transformTargetField: "hooks_markdown",
      },
    ],
  },
  {
    id: "ad-creative",
    formId: "ad-creative",
    checklistTaskId: "04-creatives",
    phase: 6,
    label: "Build static creatives",
    hint: "Turn chosen ad-copy variations into Nano Banana 2 image prompts.",
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
    id: "structure",
    formId: "structure",
    checklistTaskId: "05-structure",
    phase: 7,
    label: "Plan campaign structure",
    hint: "CBO vs ABO, ad-set split, creatives-per-ad-set.",
  },
  {
    id: "optimizer",
    formId: "optimizer",
    checklistTaskId: "06-optimizer",
    phase: 8,
    label: "Set optimizer watchlist",
    hint: "Thresholds Zenith uses to flag kill + scale candidates in Ads Manager. Advisory only — Zenith never touches the ads. You make every call.",
  },
];

/** The set of FormConfig.id values that participate in the Ads sequence.
 *  Used by AgentFormsHub to split forms into "Ads sequence" vs "Other onboarding". */
export const ADS_SEQUENCE_FORM_IDS: ReadonlySet<string> = new Set(
  MEDIA_BUYING_SEQUENCE.map((s) => s.formId),
);

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

/** All checklist task IDs the sequence will auto-tick. Useful for sanity tests.
 *  Skips steps with no `checklistTaskId` mapping. */
export function sequenceChecklistTaskIds(): string[] {
  return MEDIA_BUYING_SEQUENCE.map((s) => s.checklistTaskId).filter(
    (id): id is string => Boolean(id),
  );
}

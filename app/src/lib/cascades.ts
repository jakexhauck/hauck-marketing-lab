/**
 * Cascade definitions. A cascade is a parallel bundle of form-driven drafts
 * Jake reviews and dispatches in one pass instead of opening 5+ forms one by
 * one. The Phase 1 cascade fires on "Mark client Won": welcome email,
 * expectations email, contract, kickoff calendar invite, intake form share.
 *
 * Keep this file declarative. Runner + UI live in Phase1CascadeModal.tsx.
 * Adding a new cascade later means appending a spec here and wiring a new
 * trigger; the runner is generic over CascadeStep.
 */

import type { FormSurfaceId } from "./formConfigs";

/** What kind of action this step dispatches once Jake approves the draft. */
export type CascadeAction =
  | "gmail-draft"
  | "calendar-invite"
  | "copy-link"
  | "manual";

export interface CascadeStep {
  id: string;
  label: string;
  /** Short eyebrow line shown above the label in the modal. */
  meta: string;
  /** Form whose prompt assembles the draft. When null, the step is action-only
   *  (e.g. copy-link, calendar-invite). */
  formId: FormSurfaceId | null;
  action: CascadeAction;
  /** Activity log line emitted on successful send. */
  activitySummary: string;
  /** OnboardingChecklist task ID to auto-tick on send success. Optional. */
  checklistTaskId?: string;
}

export interface CascadeSpec {
  id: string;
  title: string;
  subtitle: string;
  steps: CascadeStep[];
}

export const PHASE_1_CASCADE: CascadeSpec = {
  id: "phase-1",
  title: "Day 0 cascade",
  subtitle:
    "Five Day-0 deliverables in one pass. Drafts run in parallel. Approve each, then send.",
  steps: [
    {
      id: "welcome-email",
      label: "Welcome email",
      meta: "Gmail draft",
      formId: "welcome-email",
      action: "gmail-draft",
      activitySummary: "Phase 1: welcome email drafted",
    },
    {
      id: "expectations-email",
      label: "Expectations email",
      meta: "Gmail draft",
      formId: "expectations-email",
      action: "gmail-draft",
      activitySummary: "Phase 1: expectations email drafted",
    },
    {
      id: "contract",
      label: "Contract",
      meta: "Markdown, manual countersign",
      formId: "contract",
      action: "manual",
      activitySummary: "Phase 1: contract generated",
    },
    {
      id: "kickoff-invite",
      label: "Kickoff calendar invite",
      meta: "Google Calendar event",
      formId: null,
      action: "calendar-invite",
      activitySummary: "Phase 1: kickoff calendar invite sent",
    },
    {
      id: "intake-form-share",
      label: "Intake form link",
      meta: "Copy to clipboard",
      formId: null,
      action: "copy-link",
      activitySummary: "Phase 1: intake form link shared",
    },
  ],
};

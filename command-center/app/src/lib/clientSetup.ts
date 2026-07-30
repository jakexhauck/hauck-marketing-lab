// Standing a client up, declared as data: every step, in the order it happens.
//
// This is not an invented checklist. It is Jake's own two processes, transcribed:
//
//   - The GoHighLevel build, from docs/build-plans/willis-windows-ghl-setup.md,
//     which was written while doing it for the first client.
//   - The seven-day ads pipeline, from the vault SOP `onboarding-7day-pipeline`,
//     including its phase timings.
//   - The pre-launch QA, from the vault SOP `pre-launch-qa-checklist`, which
//     hangs off the build phase because that is when it is run.
//
// Deliberately absent, at Jake's instruction: Google Analytics access, Google
// Business Profile, and anything about the client's website. The source SOP asks
// for GA4 viewer access at the Day 1 call; he does not do that work, and a step
// nobody intends to do is how a checklist stops being read.
//
// Ticks are stored per tenant in onboarding_checklist, keyed by `key`. A key
// that is retired simply stops being counted (see setupProgress), so renaming
// one loses that client's tick rather than corrupting anything.

export type SetupPhaseKey =
  | "ghl"
  | "day1"
  | "day2"
  | "day34"
  | "day56"
  | "day7";

export interface SetupStep {
  key: string;
  label: string;
  phase: SetupPhaseKey;
  /** One line of detail, where the step name alone would not be enough. */
  note?: string;
  /**
   * Ticked by the live GoHighLevel readiness checks rather than by a click, so
   * the page cannot claim a client is connected when their token died last week.
   */
  auto?: boolean;
  /**
   * Must be done before Go Live. Not every step is: some are judgement calls, and
   * some do not apply to every client. These are the ones that make the client's
   * app and ads actually work, so going live without them ships something broken.
   */
  required?: boolean;
  /** The vault SOP that explains this step. Not linked in the UI yet. */
  sop?: string;
}

export interface SetupPhase {
  key: SetupPhaseKey;
  label: string;
  /** What this phase is for, in one line. */
  blurb: string;
  /** From the SOP's own timings, so a day's work is a known size. */
  timing?: string;
}

export const SETUP_PHASES: SetupPhase[] = [
  {
    key: "ghl",
    label: "GoHighLevel build",
    blurb: "Their sub-account, wired and verified. Nothing else can be tested until this is true.",
  },
  {
    key: "day1",
    label: "Day 1, onboarding call",
    blurb: "Walk their form through with them and collect the access we need.",
    timing: "30 min",
  },
  {
    key: "day2",
    label: "Day 2, research and setup",
    blurb: "The ad account, the pixel, and knowing who we are talking to.",
    timing: "60 min",
  },
  {
    key: "day34",
    label: "Day 3 to 4, creative",
    blurb: "Copy and creative, then their written approval before anything is built.",
    timing: "60 min",
  },
  {
    key: "day56",
    label: "Day 5 to 6, build and QA",
    blurb: "Built, checked, and deliberately not published.",
    timing: "45 min",
  },
  {
    key: "day7",
    label: "Day 7, launch",
    blurb: "Live, and watched.",
    timing: "25 min",
  },
];

export const SETUP_STEPS: SetupStep[] = [
  // --- GoHighLevel build ----------------------------------------------------
  {
    key: "ghl-subaccount",
    label: "Sub-account created, snapshot applied",
    phase: "ghl",
    required: true,
  },
  {
    key: "ghl-dedupe",
    label: "Dedupe what the snapshot copied twice",
    phase: "ghl",
    note: "Pick one of each duplicated workflow and delete the rest before publishing, or both copies fire.",
    required: true,
  },
  {
    key: "ghl-publish-workflows",
    label: "Publish the workflows, activate the triggers",
    phase: "ghl",
    note: "A snapshot arrives with almost everything in draft. Until this is done nothing fires at all.",
    required: true,
  },
  {
    key: "ghl-location-token",
    label: "Set the Location API Token custom value",
    phase: "ghl",
    note: "Blank in a fresh snapshot. The calendar title-flip workflows read it, and fail silently without it.",
    required: true,
  },
  {
    key: "provision-values",
    label: "Custom values written to GHL",
    phase: "ghl",
    auto: true,
    required: true,
  },
  { key: "token-connected", label: "API token valid and connected", phase: "ghl", auto: true, required: true },
  { key: "calendars-present", label: "Calendars exist in the sub-account", phase: "ghl", auto: true, required: true },
  {
    key: "ghl-assign-user",
    label: "Add the rep and assign them to the calendars",
    phase: "ghl",
    note: "Snapshots never carry users, so every calendar arrives with nobody on it and cannot be booked.",
    required: true,
  },
  {
    key: "google-calendar",
    label: "Connect Google Calendar, two-way",
    phase: "ghl",
    note: "Two-way is what pushes the confirmed-title flip onto their real Google event.",
    required: true,
  },
  {
    key: "phone-a2p",
    label: "Phone number provisioned, A2P approved",
    phase: "ghl",
    note: "Needs their EIN, which the intake form deliberately does not ask for. Get it on the call.",
    required: true,
  },
  {
    key: "email-domain",
    label: "Sending email domain verified",
    phase: "ghl",
    note: "Unverified From domains land in spam, which reads as the campaign failing.",
    required: true,
  },
  {
    key: "meta-capi",
    label: "Meta Conversions API connected",
    phase: "ghl",
    note: "The Conversions API workflows ship as drafts and need the connection before they will publish.",
    required: true,
  },
  {
    key: "ghl-verify",
    label: "Book a test appointment and watch it flip",
    phase: "ghl",
    note: "One live pass end to end: book, confirm, and see the title change on the real calendar.",
    required: true,
  },
  {
    key: "owner-login",
    label: "Owner login verified, they can actually sign in",
    phase: "ghl",
    required: true,
  },

  // --- Day 1, onboarding call -----------------------------------------------
  {
    key: "d1-walk-form",
    label: "Walk through their intake form together",
    phase: "day1",
    required: true,
  },
  {
    key: "d1-meta-access",
    label: "Meta Business Manager access, Partner level",
    phase: "day1",
    sop: "client-meta-access-request",
    required: true,
  },
  { key: "d1-website-access", label: "Website access for the pixel install", phase: "day1" },
  {
    key: "d1-assets",
    label: "Brand assets in their Drive folder",
    phase: "day1",
    note: "The folder is created with the client; send them the link.",
  },
  { key: "d1-offer", label: "Confirm the primary offer and CTA", phase: "day1", required: true },
  {
    key: "d1-expectations",
    label: "Set expectations",
    phase: "day1",
    note: "Ads live within 7 days, real data after 5 to 7, weekly update every Monday, call on the 1st.",
  },

  // --- Day 2, research and setup --------------------------------------------
  {
    key: "d2-ad-account",
    label: "Set up or audit the Meta ad account",
    phase: "day2",
    required: true,
  },
  {
    key: "d2-pixel",
    label: "Install the Meta pixel via GTM",
    phase: "day2",
    sop: "meta-pixel-install-gtm",
    required: true,
  },
  {
    key: "d2-pixel-verify",
    label: "Verify the pixel fires",
    phase: "day2",
    note: "Pixel Helper and Test Events. An unverified pixel is an unmeasurable campaign.",
    required: true,
  },
  {
    key: "d2-payment",
    label: "Add a payment method to the ad account",
    phase: "day2",
    required: true,
  },
  {
    key: "d2-research",
    label: "Run the competitor and audience research",
    phase: "day2",
    sop: "audience-research-nexus",
  },

  // --- Day 3 to 4, creative --------------------------------------------------
  {
    key: "d34-copy",
    label: "Twelve or more ad copy variations",
    phase: "day34",
    note: "Across PAS, AIDA, BAB and Story.",
    sop: "ad-copy-12-angle-generation",
  },
  {
    key: "d34-creative",
    label: "Fifteen to twenty-five creatives, four or more formats",
    phase: "day34",
    note: "Image, carousel, video, UGC, before and after.",
    sop: "ad-image-generation",
  },
  {
    key: "d34-approval",
    label: "Client approved the top three to five, in writing",
    phase: "day34",
    required: true,
  },

  // --- Day 5 to 6, build and QA ---------------------------------------------
  {
    key: "d56-build",
    label: "Build the campaign",
    phase: "day56",
    note: "Per the structure SOP: broad targeting, location radius set.",
    sop: "campaign-structure-naming",
    required: true,
  },
  {
    key: "d56-upload",
    label: "Upload the creatives, Advantage Creative off",
    phase: "day56",
    required: true,
  },
  {
    key: "d56-qa",
    label: "Pre-launch QA passed",
    phase: "day56",
    note: "Every check below. Nothing publishes until this is ticked.",
    sop: "pre-launch-qa-checklist",
    required: true,
  },

  // --- Day 7, launch ---------------------------------------------------------
  {
    key: "d7-publish",
    label: "Publish, and wait for Meta review",
    phase: "day7",
    note: "One to twenty-four hours.",
    required: true,
  },
  {
    key: "d7-text-client",
    label: "Tell the client they are live",
    phase: "day7",
    note: "48-hour learning phase, real data after 3 to 5 days.",
    required: true,
  },
  {
    key: "d7-optimizer",
    label: "Set up the optimizer with auto-pause rules",
    phase: "day7",
  },
  {
    key: "d7-daily",
    label: "Schedule the daily 15-minute check-ins",
    phase: "day7",
    sop: "daily-15min-optimization-routine",
  },
  {
    key: "d7-weekly",
    label: "Schedule the first weekly report for Monday",
    phase: "day7",
    sop: "weekly-client-report",
  },
];

// --- The pre-launch QA -------------------------------------------------------
//
// A checklist inside a checklist, and it earns the nesting: it runs at one
// moment, it is thirty items long, and it is the only thing standing between a
// wrong URL and spend against it. Ticked as one step (d56-qa) on the page above,
// opened when it is being worked.

export interface QaGroup {
  key: string;
  label: string;
  items: string[];
}

/** The step these hang off, so the page cannot attach them to the wrong one. */
export const QA_STEP_KEY = "d56-qa";

export const QA_GROUPS: QaGroup[] = [
  {
    key: "tracking",
    label: "Tracking",
    items: [
      "Pixel installed and firing, verified with Pixel Helper",
      "Conversion event set up in Events Manager",
      "Conversion event selected at ad set level",
    ],
  },
  {
    key: "targeting",
    label: "Targeting",
    items: [
      "Location set correctly, address and radius for the business type",
      "Age range matches the offer",
      "No interests stacked, broad only",
      "Audience Network excluded from placements",
    ],
  },
  {
    key: "budget",
    label: "Budget and schedule",
    items: [
      "Daily budget matches what the client agreed",
      "Schedule set, with an end date if there is one",
      "Bid strategy set, lowest cost unless decided otherwise",
    ],
  },
  {
    key: "creative",
    label: "Creative",
    items: [
      "Advantage Creative off on every ad",
      "Every ad proofread",
      "Dimensions right: 1:1 for feed, 9:16 for stories and reels",
      "CTA button matches the objective",
      "Landing page URL pasted correctly on every ad",
      "UTM parameters on every URL",
    ],
  },
  {
    key: "identity",
    label: "Page and identity",
    items: [
      "Correct Facebook page selected",
      "Instagram account linked, if running IG placements",
    ],
  },
  {
    key: "policy",
    label: "Policy",
    items: [
      "No before-and-after health claims without a results-may-vary line",
      "No income or earnings claims",
      "No personal-attribute language in the copy",
      "Special Ad Category set if housing, credit, employment or politics",
      "No misleading or exaggerated claims",
    ],
  },
  {
    key: "naming",
    label: "Naming",
    items: [
      "Campaign: [Client] - [Goal] - [Type]",
      "Ad set: [Audience] - [Location] - [Age]",
      "Ad: [Format] - [Hook] - [Version]",
    ],
  },
  {
    key: "diversity",
    label: "Diversity and preview",
    items: [
      "Fifteen or more creatives across four or more formats",
      "Every ad previewed on mobile",
    ],
  },
];

export const QA_ITEM_COUNT = QA_GROUPS.reduce((n, g) => n + g.items.length, 0);

// --- Shaping -----------------------------------------------------------------

export interface PhaseWithSteps extends SetupPhase {
  steps: SetupStep[];
}

export function setupPhases(): PhaseWithSteps[] {
  return SETUP_PHASES.map((phase) => ({
    ...phase,
    steps: SETUP_STEPS.filter((s) => s.phase === phase.key),
  }));
}

export interface SetupProgress {
  done: number;
  total: number;
  pct: number;
  /** Required steps still outstanding. Empty means Go Live can be pressed. */
  blocking: SetupStep[];
}

/**
 * Progress over the steps we ship, not over whatever rows happen to be saved.
 *
 * A step with no row yet is not done, and a saved row for a step we retired does
 * not inflate the count. Both matter: this number is what Go Live is judged on.
 */
export function setupProgress(states: { taskKey: string; done: boolean }[]): SetupProgress {
  const doneKeys = new Set(states.filter((s) => s.done).map((s) => s.taskKey));
  const done = SETUP_STEPS.filter((s) => doneKeys.has(s.key)).length;
  const total = SETUP_STEPS.length;
  return {
    done,
    total,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
    blocking: SETUP_STEPS.filter((s) => s.required && !doneKeys.has(s.key)),
  };
}

/** Per-phase counts, for the rail down the side of the page. */
export function phaseProgress(
  phase: PhaseWithSteps,
  states: { taskKey: string; done: boolean }[],
): { done: number; total: number } {
  const doneKeys = new Set(states.filter((s) => s.done).map((s) => s.taskKey));
  return {
    done: phase.steps.filter((s) => doneKeys.has(s.key)).length,
    total: phase.steps.length,
  };
}

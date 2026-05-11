// Onboarding plan — single source of truth for the New Client Onboarding Checklist.
// Sourced from the AI Advertiser Course § 3.1 Fulfillment Overview.

export type OnboardingTask = {
  id: string;
  label: string;
  emphasis?: string;
  howto?: string | string[];
};

export type OnboardingSubsection = {
  id: string;
  title: string;
  meta?: string;
  tasks: OnboardingTask[];
};

export type OnboardingPhase = {
  num: number;
  name: string;
  purpose: string;
  hint: string;
  meta: string;
  subsections: OnboardingSubsection[];
};

function task(id: string, label: string, howto?: OnboardingTask["howto"]): OnboardingTask {
  return { id, label, howto };
}

export const ONBOARDING_PLAN: OnboardingPhase[] = [
  {
    num: 1,
    name: "Close the Deal",
    purpose:
      "Contract signed, money in the bank, welcome email out. No work starts until payment clears.",
    hint: "Contract · first payment · welcome email with onboarding form.",
    meta: "Day 0 · 3 tasks",
    subsections: [
      {
        id: "1.1",
        title: "Paperwork & payment",
        tasks: [
          task(
            "01-contract",
            "<strong>Send contract</strong> via DocuSign or PandaDoc.",
            "Use the standard client agreement template. Include scope of work, monthly fee, payment terms, and 30-day cancellation clause.",
          ),
          task(
            "01-payment",
            "<strong>Collect first payment.</strong>",
            "Stripe invoice or direct bank transfer. Don't start ANY work until payment clears. No exceptions.",
          ),
          task(
            "01-welcome",
            "Send welcome email with onboarding form.",
            "Include: what to expect, 7-day timeline, onboarding form link (Google Form or Typeform), calendar link for onboarding call.",
          ),
        ],
      },
    ],
  },
  {
    num: 2,
    name: "Onboarding Call",
    purpose:
      "30 minutes on Zoom. Collect every access and asset, lock the offer, set expectations.",
    hint: "30-min call · BM, site, GA access · brand assets · offer + CTA · expectations.",
    meta: "Day 1 · 7 tasks",
    subsections: [
      {
        id: "2.1",
        title: "Call & access collection",
        tasks: [
          task("02-call", "Conduct 30-min onboarding call."),
          task("02-bm", "Collect Meta Business Manager access."),
          task("02-site", "Collect website access for pixel installation."),
          task("02-ga", "Collect Google Analytics access (if they have it)."),
          task("02-brand", "Get their brand assets."),
          task("02-offer", "Define the primary offer + CTA."),
          task("02-expect", "Set clear expectations."),
        ],
      },
    ],
  },
  {
    num: 3,
    name: "Technical Setup",
    purpose:
      "Pixel firing, ad account funded, competitive intel pulled. Plumbing green before a dollar moves.",
    hint: "Business Manager · pixel install + verify · payment method · competitor research.",
    meta: "Day 2 · 5 tasks",
    subsections: [
      {
        id: "3.1",
        title: "Accounts & tracking",
        tasks: [
          task("03-bm-setup", "Set up or audit Meta Business Manager."),
          task("03-pixel", "Install Meta Pixel on their website."),
          task("03-pixel-verify", "Verify pixel is firing correctly."),
          task("03-payment", "Set up payment method on ad account."),
          task("03-competitors", "Research competitors in the AI Audience Agent."),
        ],
      },
    ],
  },
  {
    num: 4,
    name: "Creative Production",
    purpose:
      "Copy, creative, and audiences all built with the AI agents. Client signs off before anything ships.",
    hint: "10+ ad copy variations · creative concepts · audiences · client approval.",
    meta: "Days 3–4 · 4 tasks",
    subsections: [
      {
        id: "4.1",
        title: "Build & approve",
        tasks: [
          task("04-copy", "Generate 10+ ad copy variations with AI Ad Copy Agent."),
          task("04-creative", "Generate creative concepts with AI Creative Agent."),
          task("04-audiences", "Build audiences with AI Audience Agent."),
          task("04-approval", "Send creatives to client for approval."),
        ],
      },
    ],
  },
  {
    num: 5,
    name: "Campaign Build + QA",
    purpose:
      "Build the campaign structure in Ads Manager, upload every creative as its own ad, QA before launch.",
    hint: "Campaign structure · upload creatives · pre-launch QA checklist.",
    meta: "Days 5–6 · 3 tasks",
    subsections: [
      {
        id: "5.1",
        title: "Build & QA",
        tasks: [
          task("05-structure", "Build campaign structure in Ads Manager."),
          task("05-upload", "Upload all creatives as individual ads."),
          task("05-qa", "QA checklist before launch."),
        ],
      },
    ],
  },
  {
    num: 6,
    name: "Launch + Monitor",
    purpose:
      "Go live, tell the client, hand it off to the AI optimizer, schedule the first Monday report.",
    hint: "Publish · 'ads are live' message · AI Campaign Optimizer · first weekly report.",
    meta: "Day 7 · 4 tasks",
    subsections: [
      {
        id: "6.1",
        title: "Go live",
        tasks: [
          task("06-publish", "Publish all campaigns."),
          task("06-live-msg", "Send <em>ads are live</em> message to client."),
          task("06-optimizer", "Set up AI Campaign Optimizer monitoring."),
          task("06-report", "Schedule first weekly report (Monday)."),
        ],
      },
    ],
  },
];

export function totalTasks(plan: OnboardingPhase[] = ONBOARDING_PLAN): number {
  return plan.reduce(
    (sum, p) => sum + p.subsections.reduce((s, ss) => s + ss.tasks.length, 0),
    0,
  );
}

export function phaseTaskCount(phase: OnboardingPhase): number {
  return phase.subsections.reduce((s, ss) => s + ss.tasks.length, 0);
}

export function phaseTaskIds(phase: OnboardingPhase): string[] {
  return phase.subsections.flatMap((ss) => ss.tasks.map((t) => t.id));
}

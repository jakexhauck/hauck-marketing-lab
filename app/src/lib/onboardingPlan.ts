// Onboarding plan — single source of truth for the New Client Onboarding Checklist.
// Sourced from the AI Advertiser Course § 3.1 Fulfillment Overview, expanded
// 2026-05-18 to cover the full agency onboarding (vault, GHL, mobile app, not
// just media buying).

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

// Phase numbering note: contract signing + first payment used to be Phase 1
// here. They were moved out 2026-05-14 into the Client Hub as persistent
// "Contract due / Invoice due" status flags. The welcome email moved to a
// GHL workflow that fires when the intake form submission lands.
//
// Task IDs (02-call, 03-bm-setup, etc.) kept their original numeric prefixes
// for stable on-disk persistence even after the 8-phase reorg. New IDs use
// a topic prefix (01ag-, 03ghl-, 04app-) so phase number can change without
// breaking stored progress.

export const ONBOARDING_PLAN: OnboardingPhase[] = [
  {
    num: 1,
    name: "Agency Setup",
    purpose:
      "Stand up the client inside our own systems before any external setup. Vault, Drive, profile, memory, ops registry — every later phase reads from these.",
    hint: "Vault folder · Drive folder · Profile.md · Memory.md · ops/clients.json · credentials.yaml.",
    meta: "Day 0 · 6 tasks",
    subsections: [
      {
        id: "1.1",
        title: "Internal provisioning",
        tasks: [
          task(
            "01ag-vault",
            "Create client folder in the vault.",
            "Done automatically when you Add Client. Verify <code>vault/Clients/&lt;Name&gt;/</code> exists.",
          ),
          task(
            "01ag-drive",
            "Connect a Google Drive folder for the client.",
            "Client Hub → Drive → paste the shared Drive folder URL. Used for creative uploads + brand assets.",
          ),
          task(
            "01ag-profile",
            "Fill out Profile.md (business, voice, target customer, offer).",
            "Open <code>vault/Clients/&lt;Name&gt;/Profile.md</code>. Every downstream agent reads from this.",
          ),
          task(
            "01ag-memory",
            "Initialize Memory.md with anything the client told you on the discovery call.",
            "<code>vault/Clients/&lt;Name&gt;/Memory.md</code>. Append-only log of facts about this client.",
          ),
          task(
            "01ag-ops",
            "Add client to ops/clients.json (Client Hub row) and clients.yaml (Meta + GHL credentials map).",
            "ops/clients.json is auto-populated when you Add Client. Confirm clients.yaml has a stanza for the new slug.",
          ),
          task(
            "01ag-credentials",
            "Create a credentials.yaml stub at data/&lt;slug&gt;/credentials.yaml.",
            "Gitignored. Holds Meta access_token, ad_account_id, pixel_id, business_id, plus the GHL token/location captured in Phase 3.",
          ),
        ],
      },
    ],
  },
  {
    num: 2,
    name: "Discovery Call",
    purpose:
      "30 minutes on Zoom. Collect every access and asset, lock the offer, set expectations.",
    hint: "30-min call · BM, site, GA access · brand assets · offer + CTA · expectations.",
    meta: "Day 0 · 8 tasks",
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
          task(
            "02-offer-options",
            "Create 10 different offer/CTA options before the call to show the business owner.",
          ),
          task("02-offer", "Define the primary offer + CTA."),
          task("02-expect", "Set clear expectations."),
        ],
      },
    ],
  },
  {
    num: 3,
    name: "GHL Setup",
    purpose:
      "Stand up the client's GoHighLevel sub-account so leads have somewhere to land. Pipelines, calendars, and a private integration token wired to the desktop app.",
    hint: "Sub-account · sales + onboarding pipelines · booking calendar · private token · location ID.",
    meta: "Day 1 · 6 tasks",
    subsections: [
      {
        id: "3.1",
        title: "Sub-account, pipelines, token",
        tasks: [
          task(
            "03ghl-subaccount",
            "Create a new GHL sub-account for the client.",
            "GHL agency view → Sub-Accounts → Create. Use the client's business name. Apply the standard snapshot.",
          ),
          task(
            "03ghl-pipeline-sales",
            "Build the sales pipeline with stages matching the mobile app (New, Contacted, Estimate Sent, Consultation, Booked, Won, Lost, No-Show).",
            "Sub-account → Opportunities → Pipelines → Create. Stage names must match exactly so the dashboard map works.",
          ),
          task(
            "03ghl-pipeline-onboarding",
            "Build the onboarding pipeline that mirrors this checklist.",
            "Same place. Stages: Discovery, Setup, Creative, Launch. Used so the agency can see at a glance where each client is.",
          ),
          task(
            "03ghl-calendar",
            "Set up a booking calendar for the client's consultation/quote calls.",
            "Sub-account → Calendars → Create. Connect to the client's email if they want bookings on their own calendar.",
          ),
          task(
            "03ghl-token",
            "Generate a Private Integration Token with read+write on contacts, opportunities, conversations.",
            "Sub-account → Settings → Private Integrations → New. Save the token AND the location ID — both are needed in Phase 4.",
          ),
          task(
            "03ghl-verify",
            "Verify GHL data flows into the desktop app and the mobile app reads it.",
            "Desktop: open the client's Sales Hub, confirm pipeline + contacts load. Mobile: skip until Phase 4 provisions the tenant.",
          ),
        ],
      },
    ],
  },
  {
    num: 4,
    name: "Mobile App Setup",
    purpose:
      "Provision the client's leads app and confirm they can sign in. Without this, the client doesn't see their leads on their phone.",
    hint: "Provision tenant (form) · client invite email · confirm sign-in · walk through PWA install.",
    meta: "Day 1 · 3 tasks",
    subsections: [
      {
        id: "4.1",
        title: "Provision & verify",
        tasks: [
          task(
            "04app-provision",
            "Provision the client's mobile app (Supabase tenant + invite).",
            "Opens a form. Paste the GHL location ID + private integration token from Phase 3. Submitting creates the tenant in the client-dashboard project, links the client's email as owner, and emails them an invite.",
          ),
          task(
            "04app-walkthrough",
            "Walk the client through installing the PWA on their phone and signing in for the first time.",
            "Send them the URL (dash.hauckmarketing.com), have them sign in via the magic link, then Add to Home Screen. Confirm they see the Conversations/Contact Status/Opportunities tabs.",
          ),
          task(
            "04app-verify",
            "Confirm the client has signed in at least once.",
            "Admin view → Clients → check the user count for this tenant. Should show ≥ 1.",
          ),
        ],
      },
    ],
  },
  {
    num: 5,
    name: "Technical Setup",
    purpose:
      "Competitive intel pulled first (it feeds every downstream agent), then pixel firing and ad account funded. Plumbing green before a dollar moves.",
    hint: "Competitor research · Business Manager · pixel install + verify · payment method.",
    meta: "Day 2 · 5 tasks",
    subsections: [
      {
        id: "5.1",
        title: "Accounts & tracking",
        tasks: [
          task("03-competitors", "Research competitors first — output feeds audiences, brief, and ad copy."),
          task("03-bm-setup", "Set up or audit Meta Business Manager."),
          task("03-pixel", "Install Meta Pixel on their website."),
          task("03-pixel-verify", "Verify pixel is firing correctly."),
          task("03-payment", "Set up payment method on ad account."),
        ],
      },
    ],
  },
  {
    num: 6,
    name: "Creative Production",
    purpose:
      "Copy, creative, and audiences all built with the AI agents. Client signs off before anything ships.",
    hint: "10+ ad copy variations · creative concepts · static creatives · audiences · client approval.",
    meta: "Days 3–4 · 5 tasks",
    subsections: [
      {
        id: "6.1",
        title: "Build & approve",
        tasks: [
          task("04-copy", "Generate 10+ ad copy variations with AI Ad Copy Agent."),
          task("04-creative", "Generate creative concepts with AI Creative Agent."),
          task("04-creatives", "Build static ad creatives (Nano Banana 2 prompts) from chosen ad copy."),
          task("04-audiences", "Build audiences with AI Audience Agent."),
          task("04-approval", "Send creatives to client for approval."),
        ],
      },
    ],
  },
  {
    num: 7,
    name: "Campaign Build + QA",
    purpose:
      "Build the campaign structure in Ads Manager, upload every creative as its own ad, QA before launch.",
    hint: "Campaign structure · upload creatives · pre-launch QA checklist.",
    meta: "Days 5–6 · 3 tasks",
    subsections: [
      {
        id: "7.1",
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
    num: 8,
    name: "Launch + Monitor",
    purpose:
      "Go live, tell the client, hand it off to the AI optimizer, schedule the first Monday report.",
    hint: "Publish · 'ads are live' message · AI Campaign Optimizer · first weekly report.",
    meta: "Day 7 · 4 tasks",
    subsections: [
      {
        id: "8.1",
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

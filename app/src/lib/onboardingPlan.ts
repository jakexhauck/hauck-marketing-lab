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
// 2026-05-19: pruned Phase 1 down to memory + credentials. Vault folder,
// Drive URL, Profile.md, and ops/clients.json are all handled by the
// Add Client modal + ClientProfileForm, so they don't belong in the
// checklist anymore.
//
// 2026-05-19 (later): reshuffled Phase 1 and Phase 2 around the onboarding
// call. Competitor research and the 10 offer/CTA options moved into Phase 1
// (pre-call) so we walk into the call with concrete options. Memory.md seed
// moved into Phase 2 as a post-call task with a `/remember` shortcut.
// Phase 3 (GHL) trimmed: pipelines + calendar come in via the standard
// snapshot, so the only manual steps are sub-account, snapshot import,
// token, and verify. Phase 5 lost 03-competitors (now Phase 1).
//
// 2026-05-19 (latest): merged GHL Setup and Mobile App Setup into the
// Onboarding Call as subsections 2.2 and 2.3. The plan is to walk the
// client through standing up their sub-account, importing the snapshot,
// and installing the PWA live on the call so they see their dashboard
// come online instead of getting a cold invite email after the fact.
// Phases 5/6/7/8 renumber down to 3/4/5/6.
//
// Task IDs (02-call, 03-bm-setup, etc.) kept their original numeric prefixes
// for stable on-disk persistence even after the 8-phase reorg. New IDs use
// a topic prefix (01ag-, 03ghl-, 04app-) so phase number can change without
// breaking stored progress.

export const ONBOARDING_PLAN: OnboardingPhase[] = [
  {
    num: 1,
    name: "Pre-Call Prep",
    purpose:
      "Everything that should already be done before you dial the client. Credentials slot saved, competitor pass run, 10 offer/CTA options drafted so you have something concrete to put in front of the business owner on the call.",
    hint: "Paste credentials · competitor research · 10 offer/CTA options ready for the call.",
    meta: "Day 0 · 3 tasks",
    subsections: [
      {
        id: "1.1",
        title: "Credentials",
        tasks: [
          task(
            "01ag-credentials",
            "Paste Meta + GHL credentials into the Client Hub.",
            [
              "Client Hub → <strong>Credentials</strong> panel. Paste Meta <code>access_token</code>, <code>ad_account_id</code>, <code>pixel_id</code>, <code>business_id</code>. Saved locally to <code>data/&lt;slug&gt;/credentials.yaml</code> (gitignored).",
              "GHL token + location ID get pasted in <strong>Settings → GHL</strong> after Phase 3.",
              "No YAML editing required — the form writes the file for you.",
            ],
          ),
        ],
      },
      {
        id: "1.2",
        title: "Pre-call research",
        tasks: [
          task(
            "03-competitors",
            "Run competitor research — output feeds audiences, brief, ad copy, and the offer options below.",
            "Open the Competitor Research form. Output saves to the vault; every downstream agent reads it.",
          ),
          task(
            "02-offer-options",
            "Draft 10 offer/CTA options to show the business owner on the call.",
            "Open the Offer + CTA Builder form. Bring the list to the onboarding call so the client picks one live instead of going back-and-forth over email.",
          ),
        ],
      },
    ],
  },
  {
    num: 2,
    name: "Onboarding Call",
    purpose:
      "Long-form Zoom with the client. Walk the offer options, lock the offer + CTA, collect access + assets, then do the GHL and mobile app setup live so the client sees it stand up. End with a memory dump of everything you heard.",
    hint: "Offer + CTA locked · BM, site, GA access · brand assets · GHL sub-account + token · mobile app provisioned + PWA installed · memory dump.",
    meta: "Day 0 · 15 tasks",
    subsections: [
      {
        id: "2.1",
        title: "Call & access collection",
        tasks: [
          task("02-call", "Conduct the onboarding call (Zoom)."),
          task("02-offer", "Lock the primary offer + CTA (pick from the 10 options)."),
          task("02-bm", "Collect Meta Business Manager access."),
          task("02-site", "Collect website access for pixel installation."),
          task("02-ga", "Collect Google Analytics access (if they have it)."),
          task("02-brand", "Get their brand assets."),
          task("02-expect", "Set clear expectations."),
        ],
      },
      {
        id: "2.2",
        title: "GHL setup (on the call)",
        tasks: [
          task(
            "03ghl-subaccount",
            "Create a new GHL sub-account.",
            "GHL agency view → Sub-Accounts → Create. Use the client's business name.",
          ),
          task(
            "03ghl-snapshot",
            "Import the standard client snapshot.",
            "Agency view → Snapshots → load the Hauck Marketing snapshot onto the new sub-account. Brings over pipelines, calendars, and workflows so we don't rebuild them per client.",
          ),
          task(
            "03ghl-token",
            "Generate a Private Integration Token with read + write on contacts, opportunities, and conversations.",
            [
              "<strong>Step 1.</strong> Open the new sub-account → <em>Settings</em> (gear icon, bottom-left).",
              "<strong>Step 2.</strong> Sidebar → <em>Private Integrations</em> → <em>Create new integration</em>.",
              "<strong>Step 3.</strong> Name it <code>Hauck Marketing Lab</code>. Description optional.",
              "<strong>Step 4.</strong> In the <em>Scopes</em> picker, tick all six:",
              "&nbsp;&nbsp;• <code>View Contacts</code> &nbsp;+&nbsp; <code>Edit Contacts</code>",
              "&nbsp;&nbsp;• <code>View Opportunities</code> &nbsp;+&nbsp; <code>Edit Opportunities</code>",
              "&nbsp;&nbsp;• <code>View Conversations</code> &nbsp;+&nbsp; <code>Edit Conversations</code>",
              "<strong>Step 5.</strong> Click <em>Create</em>. The token shows <strong>once</strong> — copy it now.",
              "<strong>Step 6.</strong> Grab the location ID from the URL while you're in the sub-account: <code>app.gohighlevel.com/v2/location/<u>LOCATION_ID</u>/…</code>",
              "<strong>Step 7.</strong> In the desktop app, paste both into <em>Settings → GHL</em>. Token + location go into <code>data/&lt;slug&gt;/credentials.yaml</code>.",
            ],
          ),
          task(
            "03ghl-verify",
            "Verify GHL data flows into the desktop app and the mobile app reads it.",
            "Desktop: open the client's Sales Hub, confirm pipeline + contacts load. Mobile: verified in 2.3 below.",
          ),
        ],
      },
      {
        id: "2.3",
        title: "Mobile app setup (on the call)",
        tasks: [
          task(
            "04app-provision",
            "Provision the client's mobile app (Supabase tenant + invite).",
            "Opens a form. Paste the GHL location ID + private integration token from 2.2. Submitting creates the tenant in the client-dashboard project, links the client's email as owner, and emails them an invite.",
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
      {
        id: "2.4",
        title: "Post-call",
        tasks: [
          task(
            "01ag-memory",
            "Dump everything you heard on the call into Memory.",
            [
              "Fastest path: open the Chat drawer for this client and type <code>/remember &lt;fact&gt;</code> — appends to <code>vault/Clients/&lt;Name&gt;/Memory.md</code> with today's date.",
              "Or paste raw notes straight into <code>Memory.md</code>; format doesn't matter, agents read the lot.",
            ],
          ),
        ],
      },
    ],
  },
  {
    num: 3,
    name: "Technical Setup",
    purpose:
      "Pixel firing and ad account funded. Plumbing green before a dollar moves.",
    hint: "Business Manager · pixel install + verify · payment method.",
    meta: "Day 2 · 4 tasks",
    subsections: [
      {
        id: "3.1",
        title: "Accounts & tracking",
        tasks: [
          task("03-bm-setup", "Set up or audit Meta Business Manager."),
          task("03-pixel", "Install Meta Pixel on their website."),
          task("03-pixel-verify", "Verify pixel is firing correctly."),
          task("03-payment", "Set up payment method on ad account."),
        ],
      },
    ],
  },
  {
    num: 4,
    name: "Creative Production",
    purpose:
      "Copy, creative, and audiences all built with the AI agents. Client signs off before anything ships.",
    hint: "Open the Ads sequence: pixel → audience research → brief → hooks → copy → creative → structure → optimizer. Offer + competitor research happen earlier in Pre-Call Prep.",
    meta: "Days 3–4 · 1 task",
    subsections: [
      {
        id: "4.1",
        title: "Ads",
        tasks: [
          task(
            "06-ads",
            "Ads.",
            "Opens the Ads sequence wizard: pixel install, audience research, creative brief, hooks, ad copy, static ad creatives, campaign structure, optimizer config. One form at a time; completed forms tuck into the side rail. (Offer + CTA and competitor research are owned by Pre-Call Prep, Phase 1.2.)",
          ),
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

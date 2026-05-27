// Onboarding plan — single source of truth for the New Client Onboarding Checklist.
// Sourced from the AI Advertiser Course § 3.1 Fulfillment Overview, expanded
// 2026-05-18 to cover the full agency onboarding (vault, GHL, mobile app, not
// just media buying).

/** Inline field rendered directly on a task row, beneath the "How to" block.
 *  Lets the user lock a single piece of data (a budget number, the chosen
 *  offer + CTA, a Fathom link) without leaving the checklist. The value is
 *  written into the appropriate vault file when the user hits Save; the task
 *  auto-ticks on success.
 *
 *  - `profile-budget` and `profile-offer-cta` upsert an H2 section in
 *    `vault/Clients/<Name>/Profile.md`.
 *  - `memory-fathom` appends a fact line to `vault/Clients/<Name>/Memory.md`. */
export type OnboardingInlineFieldKind =
  | "profile-budget"
  | "profile-offer-cta"
  | "memory-fathom";

export type OnboardingInlineField = {
  kind: OnboardingInlineFieldKind;
  label: string;
  placeholder?: string;
  inputType?: "text" | "url";
};

export type OnboardingTask = {
  id: string;
  label: string;
  emphasis?: string;
  howto?: string | string[];
  /** Optional tasks are still rendered and tickable, but don't block phase
   *  completion. Useful for things like GA access (some clients don't have it).
   *  Excluded from `phaseTaskIds` for "is phase done" math but included in
   *  visible totals. */
  optional?: boolean;
  /** Inline data field — see OnboardingInlineField. */
  inlineField?: OnboardingInlineField;
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

function task(
  id: string,
  label: string,
  howto?: OnboardingTask["howto"],
  opts?: { optional?: boolean; inlineField?: OnboardingInlineField },
): OnboardingTask {
  return {
    id,
    label,
    howto,
    optional: opts?.optional,
    inlineField: opts?.inlineField,
  };
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
// 2026-05-20: removed the 02-call umbrella task (everything in Phase 2 IS
// the call) and merged 03-bm-setup into 02-bm (one Business Manager step,
// not two). Moved 02-expect to the top of 2.1 since you set expectations
// first on a real call. Pixel install came out of the wizard and lives on
// 03-pixel via FORM_BY_TASK.
//
// Task IDs kept their original numeric prefixes for stable on-disk
// persistence even after the reorg. New IDs use a topic prefix (01ag-,
// 03ghl-, 04app-) so phase number can change without breaking stored progress.

export const ONBOARDING_PLAN: OnboardingPhase[] = [
  {
    num: 1,
    name: "Pre-Call Prep",
    purpose:
      "Everything that should already be done before you dial the client. Competitor pass run and 10 offer/CTA options drafted so you have something concrete to put in front of the business owner on the call.",
    hint: "Competitor research · 10 offer/CTA options ready for the call.",
    meta: "Day 0 · 2 tasks",
    subsections: [
      {
        id: "1.1",
        title: "Pre-call research",
        tasks: [
          task(
            "03-competitors",
            "Run competitor research. Output feeds audiences, brief, ad copy, and the offer options below.",
            "Open the chat and paste competitor (and any client) Google reviews. The data analyst pulls out the recurring pain points. Save the reply to the vault; every downstream agent reads it.",
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
        meta: "Record the Zoom · everything below happens on the call",
        tasks: [
          task(
            "02-expect",
            "Set clear expectations (do this first on the call).",
            [
              "Cover up front: launch timeline (7 days), learning phase (first 5 to 7 days post-launch are noisy), weekly Monday report cadence, how to reach you between reports.",
              "Lock the budget number live. Type it in the field below, hit save, and it writes to <code>Profile.md</code> under <em>Monthly Budget</em>.",
              "Confirm they won't pause ads or tweak Ads Manager themselves once live.",
            ],
            {
              inlineField: {
                kind: "profile-budget",
                label: "Monthly budget",
                placeholder: "$1,500/mo",
              },
            },
          ),
          task(
            "02-offer",
            "Lock the primary offer + CTA (pick from the 10 options).",
            [
              "Walk the 10 options live. Don't email them the list, owners stall when they read alone.",
              "Pick exactly one offer + one CTA. Type the winner in the field below and hit save, it writes to <code>Profile.md</code> under <em>Offer + CTA</em>.",
              "If they hate all 10, regenerate live with the Offer + CTA Builder form on the spot.",
            ],
            {
              inlineField: {
                kind: "profile-offer-cta",
                label: "Winner offer + CTA",
                placeholder: "$100 off + free screen cleaning · Get a free quote",
              },
            },
          ),
          task(
            "02-bm",
            "Set up + collect Meta Business Manager access.",
            [
              "<strong>If they have a BM:</strong> ask them to add <code>hauckmarketing@gmail.com</code> as a partner with <em>Admin</em> on the ad account + pixel. Path: business.facebook.com → <em>Business Settings</em> → <em>Partners</em> → <em>Add</em>.",
              "<strong>If they don't have a BM:</strong> create one for them on the call at business.facebook.com → <em>Create Account</em>, then add yourself as Admin and link the ad account.",
              "Don't let this slip past the call. Owners never come back to do it later.",
            ],
          ),
          task(
            "02-site",
            "Collect website access for pixel installation.",
            [
              "Need an admin login or a way to drop the pixel snippet. Options in order of preference: GTM container access, WordPress admin, raw <code>&lt;head&gt;</code> edit access.",
              "If they use Shopify/Wix/Squarespace, just need them to install the official Meta Pixel app + paste the pixel ID.",
            ],
          ),
          task(
            "02-ga",
            "Collect Google Analytics access (skip if they don't have it).",
            [
              "<strong>Step 1.</strong> Have them open analytics.google.com and pick the GA4 property.",
              "<strong>Step 2.</strong> <em>Admin</em> (gear, bottom-left) → <em>Property Access Management</em>.",
              "<strong>Step 3.</strong> <em>Add users</em> → enter <code>hauckmarketing@gmail.com</code> → role <em>Viewer</em> → <em>Add</em>.",
              "Optional, many local-service clients have no GA. Don't block onboarding on this.",
            ],
            { optional: true },
          ),
          task(
            "02-brand",
            "Get their brand assets.",
            [
              "<strong>What you need:</strong> logo (SVG + PNG), brand colours (hex), font (name or file), 5+ photos of work/store/team.",
              "<strong>Step 1.</strong> Screen-share the client's Drive folder (linked on Profile.md) live on the call.",
              "<strong>Step 2.</strong> Have them drag-drop each asset into the folder while you watch. Don't end the call with anything still &lsquo;they'll send later&rsquo;.",
              "<strong>Step 3.</strong> If they have no photos: book a shoot now (calendar invite live), or pull approved images from their Instagram + confirm usage rights on the call.",
              "<strong>Step 4.</strong> Tick this when every required asset is in the Drive folder.",
            ],
          ),
        ],
      },
      {
        id: "2.2",
        title: "GHL setup (on the call)",
        tasks: [
          task(
            "03ghl-subaccount",
            "Create a new GHL sub-account.",
            [
              "<strong>Step 1.</strong> Open the GHL agency view at <code>app.gohighlevel.com</code>.",
              "<strong>Step 2.</strong> Sidebar → <em>Sub-Accounts</em> → <em>Create Sub-Account</em>.",
              "<strong>Step 3.</strong> Pick the <em>Blank</em> template. Use the client's business name verbatim, no abbreviations.",
              "<strong>Step 4.</strong> Fill timezone + country to match the client's local market.",
              "<strong>Step 5.</strong> <em>Save</em>. You should be dropped into the new sub-account.",
            ],
          ),
          task(
            "03ghl-snapshot",
            "Import the standard client snapshot.",
            [
              "<strong>Step 1.</strong> Back in the agency view → <em>Snapshots</em>.",
              "<strong>Step 2.</strong> Find the <em>Hauck Marketing</em> snapshot → <em>Load Snapshot</em>.",
              "<strong>Step 3.</strong> Pick the sub-account you just created. Confirm.",
              "<strong>Step 4.</strong> Wait for the green &lsquo;snapshot loaded&rsquo; toast. Pipelines, calendars, and workflows are now in place.",
            ],
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
            "Verify GHL data flows into the desktop app.",
            [
              "<strong>Step 1.</strong> In the desktop app, open the client's <em>Sales Hub</em> tab.",
              "<strong>Step 2.</strong> Confirm the pipeline stages from the snapshot show up (Lead → Booked → Won, etc.).",
              "<strong>Step 3.</strong> Confirm any test contact you added in GHL also appears in the Contacts list.",
              "<strong>Step 4.</strong> If nothing loads: check the token and location ID in <code>data/&lt;slug&gt;/credentials.yaml</code> match the new sub-account. Mobile verification happens in 2.3 below.",
            ],
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
            [
              "<strong>Step 1.</strong> Click <em>Open form</em> to launch the Provision form.",
              "<strong>Step 2.</strong> Paste the GHL <em>location ID</em> and <em>private integration token</em> from 2.2 (step 03ghl-token).",
              "<strong>Step 3.</strong> Enter the client's email address (the one they'll sign in with).",
              "<strong>Step 4.</strong> Submit. The form creates the Supabase tenant, links the client's email as owner, and emails them an invite.",
              "Wait for the success toast before moving on; the client needs that email landed before step 04app-walkthrough.",
            ],
          ),
          task(
            "04app-walkthrough",
            "Walk the client through installing the PWA + first sign-in.",
            [
              "<strong>Step 1.</strong> Send them the URL <code>dash.hauckmarketing.com</code> in chat or text.",
              "<strong>Step 2.</strong> Have them open the magic-link email from step 04app-provision and tap the link on their phone.",
              "<strong>Step 3.</strong> Once signed in, walk them through <em>Add to Home Screen</em> (Safari: share sheet → Add to Home Screen; Chrome: menu → Install app).",
              "<strong>Step 4.</strong> Have them open it from the home-screen icon and confirm they see the Conversations / Contact Status / Opportunities tabs.",
            ],
          ),
          task(
            "04app-verify",
            "Confirm the client has signed in at least once.",
            [
              "<strong>Step 1.</strong> Open the desktop app → <em>Admin</em> view → <em>Clients</em>.",
              "<strong>Step 2.</strong> Find this client's tenant. User count should show ≥ 1.",
              "<strong>Step 3.</strong> If still 0: the magic link may have expired (15 min). Re-issue from the provision form.",
            ],
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
              "Fastest path: paste the Fathom recording link in the field below and hit save — it appends to <code>Memory.md</code> with today's date.",
              "Or open the Chat drawer and type <code>/remember &lt;fact&gt;</code> for one-off facts, or paste raw notes straight into <code>Memory.md</code>; format doesn't matter, agents read the lot.",
            ],
            {
              inlineField: {
                kind: "memory-fathom",
                label: "Fathom recording link",
                placeholder: "https://fathom.video/calls/...",
                inputType: "url",
              },
            },
          ),
        ],
      },
    ],
  },
  {
    num: 3,
    name: "Technical Setup",
    purpose:
      "Credentials pasted, pixel firing, and ad account funded. Plumbing green before a dollar moves.",
    hint: "Meta credentials · pixel install + verify · payment method.",
    meta: "Day 2 · 4 tasks",
    subsections: [
      {
        id: "3.1",
        title: "Accounts & tracking",
        tasks: [
          task(
            "01ag-credentials",
            "Paste Meta credentials into the Client Hub.",
            [
              "Do this after the client accepts the BM partner invite from 2.1 (step 02-bm). Until then you can't see the IDs.",
              "<strong>Step 1.</strong> Open the Client Hub for this client → <em>Credentials</em> panel.",
              "<strong>Step 2.</strong> Paste the Meta <code>access_token</code> (from business.facebook.com → <em>System Users</em>).",
              "<strong>Step 3.</strong> Paste the <code>ad_account_id</code>, <code>pixel_id</code>, and <code>business_id</code> (all from Business Settings).",
              "<strong>Step 4.</strong> Click <em>Save</em>. Values land in <code>data/&lt;slug&gt;/credentials.yaml</code> (gitignored). The pixel install and payment steps below both read from here.",
            ],
          ),
          task(
            "03-pixel",
            "Install Meta Pixel on their website.",
            [
              "Open the Pixel Install form (button to the right). It walks the platform-specific install steps for WordPress / Shopify / GTM / raw HTML.",
              "You'll need the <code>pixel_id</code> from credentials and the website access collected in 02-site.",
              "Optional, skip if this client is running Meta lead forms only (no landing page traffic to track).",
            ],
            { optional: true },
          ),
          task(
            "03-pixel-verify",
            "Verify pixel is firing correctly.",
            [
              "<strong>Step 1.</strong> Install the <strong>Meta Pixel Helper</strong> Chrome extension.",
              "<strong>Step 2.</strong> Open the client's website in a new tab. Click the extension icon.",
              "<strong>Step 3.</strong> Confirm the pixel ID matches the client's, and that <em>PageView</em> is firing.",
              "<strong>Step 4.</strong> Cross-check in business.facebook.com → <em>Events Manager</em> → the pixel. Real-time activity should appear within 60s of the test load.",
              "<strong>If nothing fires:</strong> the snippet is probably in <code>&lt;body&gt;</code> instead of <code>&lt;head&gt;</code>, or a cookie/consent banner is blocking it.",
              "Optional, skip if 03-pixel was skipped (lead-form-only client).",
            ],
            { optional: true },
          ),
          task(
            "03-payment",
            "Set up payment method on ad account.",
            [
              "<strong>Critical, ads can't run without this. Easy to forget.</strong>",
              "<strong>Step 1.</strong> Open business.facebook.com → <em>Billing &amp; Payments</em> → <em>Payment methods</em>.",
              "<strong>Step 2.</strong> <em>Add</em> → enter the card in the <strong>client's</strong> name, not yours.",
              "<strong>Step 3.</strong> Set the account spending limit to 2x monthly budget so one high-spend day can't pause delivery overnight.",
              "<strong>Step 4.</strong> Confirm the new payment method shows as <em>Primary</em>.",
            ],
          ),
        ],
      },
    ],
  },
  {
    num: 4,
    name: "Creative Production",
    purpose:
      "Copy, creative, and audiences all built with the AI agents. Client signs off before anything ships.",
    hint: "Open the Ads sequence: audience research → brief → hooks → copy → creative → structure → optimizer. Pixel install is Phase 3. Offer + competitor research are Phase 1.",
    meta: "Days 3–4 · 1 task",
    subsections: [
      {
        id: "4.1",
        title: "Ads",
        tasks: [
          task(
            "06-ads",
            "Ads.",
            "Opens the Ads sequence wizard: audience research, creative brief, hooks, ad copy, static ad creatives, campaign structure, optimizer config. One form at a time; completed forms tuck into the side rail. This task auto-ticks when every wizard step is done.",
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
          task(
            "05-structure",
            "Build campaign structure in Ads Manager.",
            [
              "Open the campaign plan from Phase 4 (Structure step in the wizard). It's the spec, translate 1:1.",
              "<strong>Step 1.</strong> Open business.facebook.com → <em>Ads Manager</em> → <em>Create</em>.",
              "<strong>Step 2.</strong> Pick the campaign objective from the plan (usually <em>Leads</em> or <em>Sales</em>).",
              "<strong>Step 3.</strong> Match CBO/ABO + daily budget exactly. Don't round, don't improvise.",
              "<strong>Step 4.</strong> Create each ad set per the plan (name + targeting + budget). Same count as the plan.",
              "<strong>Step 5.</strong> Leave the actual ad slots empty for now, 05-upload fills them.",
            ],
          ),
          task(
            "05-upload",
            "Upload all creatives as individual ads.",
            [
              "<strong>Step 1.</strong> Open the client's Drive folder. The Phase 4 ad-creative step exported the static images there.",
              "<strong>Step 2.</strong> In Ads Manager, open each ad set you just built. <em>Create Ad</em> → upload one image per ad slot.",
              "<strong>Step 3.</strong> Paste the ad copy from Phase 4 (ad-copy step) <strong>verbatim</strong>. Don't rewrite headlines on the fly.",
              "<strong>Step 4.</strong> Mirror the same 3 ads across both ad sets. We're testing audience, not creative.",
              "<strong>Step 5.</strong> Confirm each ad's <em>Preview</em> looks right (image renders, link goes to the right landing page).",
            ],
          ),
          task(
            "05-qa",
            "QA checklist before launch.",
            [
              "<strong>Pixel:</strong> firing on the landing page (Meta Pixel Helper confirms).",
              "<strong>Tracking:</strong> conversion event selected matches what the pixel reports.",
              "<strong>Budget:</strong> daily budget set, not lifetime; spending limit set on the account.",
              "<strong>Targeting:</strong> location is the client's service area, not global; age range matches the brief.",
              "<strong>Schedule:</strong> ads set to start, not paused. Run continuously, not dayparted.",
              "<strong>Creative:</strong> every ad shows in preview, no broken images, links open the right landing page.",
            ],
          ),
        ],
      },
    ],
  },
  {
    num: 6,
    name: "Launch + Monitor",
    purpose:
      "Go live, tell the client, schedule the first Monday report. The auto-optimizer takes over from here on its own cadence.",
    hint: "Publish · 'ads are live' message · first weekly report.",
    meta: "Day 7 · 3 tasks",
    subsections: [
      {
        id: "6.1",
        title: "Go live",
        tasks: [
          task(
            "06-publish",
            "Publish all campaigns.",
            [
              "<strong>Step 1.</strong> Run through 05-qa one final time. Don't skip this.",
              "<strong>Step 2.</strong> In Ads Manager, flip campaign + every ad set + every ad from <em>Draft</em> → <em>Active</em>.",
              "<strong>Step 3.</strong> Hit <em>Publish</em> at the top-right.",
              "<strong>Step 4.</strong> Wait for the <em>In Review</em> banner. Usually approves within 60 min; can be up to 24 hr on a brand-new account.",
              "Ticking this auto-fills <code>adsLaunchedAt</code> on the client's Workspace row.",
            ],
          ),
          task(
            "06-live-msg",
            "Send <em>ads are live</em> message to client.",
            [
              "<strong>Step 1.</strong> Open the GHL sub-account → <em>Conversations</em> → new message to the client.",
              "<strong>Step 2.</strong> Use this template (paste verbatim, tweak the name):<br/>&nbsp;&nbsp;<em>Hi [Name] — ads just went live. First 5 to 7 days are the learning phase, so expect noisy numbers. First weekly report lands Monday with the real read. Reach out any time before then if questions pop up.</em>",
              "<strong>Step 3.</strong> Send. Don't promise lead volume in this message, set expectations toward Monday.",
            ],
          ),
          task(
            "06-report",
            "Schedule first weekly report (Monday).",
            [
              "<strong>Step 1.</strong> Open your calendar. Add a reminder: <em>Run weekly report — [Client Name]</em>, next Monday 9am, recurring weekly.",
              "<strong>Step 2.</strong> On Monday, run the Data Analyst skill against the client's Meta ad account (last 7 days).",
              "<strong>Step 3.</strong> Drop the output into a short message: top numbers + 1 takeaway. Don't dump the full table.",
              "<strong>Step 4.</strong> Deliver via the GHL sub-account → Conversations. First report is light (5 to 7 days of learning-phase data), frame as a baseline not performance.",
            ],
          ),
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

/** Total tasks the user MUST tick to complete the plan (excludes optional). */
export function requiredTotalTasks(plan: OnboardingPhase[] = ONBOARDING_PLAN): number {
  return plan.reduce(
    (sum, p) =>
      sum +
      p.subsections.reduce(
        (s, ss) => s + ss.tasks.filter((t) => !t.optional).length,
        0,
      ),
    0,
  );
}

export function phaseTaskCount(phase: OnboardingPhase): number {
  return phase.subsections.reduce((s, ss) => s + ss.tasks.length, 0);
}

/** Required-only task count for a phase. Used to compute "is phase done." */
export function requiredPhaseTaskCount(phase: OnboardingPhase): number {
  return phase.subsections.reduce(
    (s, ss) => s + ss.tasks.filter((t) => !t.optional).length,
    0,
  );
}

export function phaseTaskIds(phase: OnboardingPhase): string[] {
  return phase.subsections.flatMap((ss) => ss.tasks.map((t) => t.id));
}

/** Required-only task IDs for a phase. */
export function requiredPhaseTaskIds(phase: OnboardingPhase): string[] {
  return phase.subsections.flatMap((ss) =>
    ss.tasks.filter((t) => !t.optional).map((t) => t.id),
  );
}

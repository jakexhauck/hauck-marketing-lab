// The pillar infrastructure: the single source of truth for how the agency runs.
//
// Six pillars. Operations is the hub (order 'hub', sorts first); the other five
// are the value chain it feeds (numbered 01..05). Each pillar is its own little
// business: a tabbed workspace (Overview, its lanes, Team, Tasks, Reporting, and
// per-pillar extras like Operations' Clients + Stack). Every pillar has a Tasks
// tab. The sidebar, the pillar workspaces, and the Infrastructure node map all
// render from this file, so adding a lane, tab, or teammate here shows up
// everywhere with no other code change.
//
// Re-homing rule: existing admin tools are linked from a lane's `links`, never
// moved. A lane's `to` targets keep the current routes working as-is.

export type PillarStatus = "planned" | "building" | "live";
export type LaneMotion = "deploy" | "manage";

export interface LaneLink {
  label: string;
  to: string;
  external?: boolean;
}

export interface ScoreboardField {
  label: string;
  value?: string;
  metricKey?: string;
}

export interface PillarLane {
  id: string;
  label: string;
  what: string;
  status: PillarStatus;
  motion?: LaneMotion; // Service Delivery only: deploy (clone) vs manage (grind)
  needsSetup?: string; // a note shown inside when the lane is not fully set up
  process?: string[];
  assets?: string[];
  links?: LaneLink[];
  scoreboard?: ScoreboardField[];
}

// A pillar's tabs. Every pillar has 'overview', its lanes tab, 'team', 'tasks';
// most have 'reporting'; Operations adds 'clients' and 'stack'.
export type PillarTabKind =
  | "overview"
  | "lanes"
  | "team"
  | "tasks"
  | "reporting"
  | "stack";

export interface PillarTab {
  id: string; // URL segment, e.g. "team"
  label: string; // display, e.g. "Team"
  kind: PillarTabKind;
}

export type TeamKind = "human" | "agent";

export interface TeamMember {
  name: string;
  role: string;
  kind: TeamKind; // 'agent' = a Hermes agent, 'human' = a person
  status: PillarStatus | "active"; // agents start 'planned'; people are 'active'
}

export interface PillarTask {
  title: string;
  status: "todo" | "doing" | "done";
  note?: string; // a constraint to fix or a setup gap
}

export interface Pillar {
  id: string;
  order: number | "hub";
  num?: string;
  label: string;
  icon: string;
  tagline: string;
  shape: "lanes" | "pipeline";
  goal?: string;
  scoreboard?: ScoreboardField[];
  tabs: PillarTab[];
  team: TeamMember[];
  tasks: PillarTask[];
  lanes: PillarLane[];
}

// Shared tab presets. lanesTab takes the per-pillar label (Channels, Pipeline,
// Services, Motions, Functions).
const tab = {
  overview: { id: "overview", label: "Overview", kind: "overview" } as PillarTab,
  team: { id: "team", label: "Team", kind: "team" } as PillarTab,
  tasks: { id: "tasks", label: "Tasks", kind: "tasks" } as PillarTab,
  reporting: { id: "reporting", label: "Reporting", kind: "reporting" } as PillarTab,
  stack: { id: "stack", label: "Stack", kind: "stack" } as PillarTab,
  lanes: (label: string): PillarTab => ({ id: "lanes", label, kind: "lanes" }),
};

// ----------------------------------------------------------------------------
// OPERATIONS (hub) : the backbone the whole line runs in. Holds Clients + Stack.
// ----------------------------------------------------------------------------
const operations: Pillar = {
  id: "operations",
  order: "hub",
  label: "Operations",
  icon: "Settings",
  tagline: "The backbone the whole line runs in.",
  goal: "Run the agency on set systems, not on memory. Every process documented, every tool and client accounted for.",
  shape: "lanes",
  scoreboard: [
    { label: "SOPs documented", metricKey: "sopCount" },
    { label: "Tools in stack", metricKey: "stackCount" },
    { label: "Active clients", metricKey: "activeClients" },
  ],
  // Overview is the command deck (greeting hero + live clients board), so there
  // is no separate Clients tab: the clients live in Operations' Overview.
  tabs: [tab.overview, tab.lanes("Functions"), tab.stack, tab.team, tab.tasks, tab.reporting],
  team: [
    { name: "Jake Hauck", role: "Owner / Operator", kind: "human", status: "active" },
    { name: "Operations Hermes", role: "Conductor: coordinates every pillar agent", kind: "agent", status: "planned" },
  ],
  tasks: [
    { title: "Document the core agency SOPs in the hub", status: "doing", note: "SOP Hub seeded; many processes still need written steps." },
    { title: "Finish the software stack inventory", status: "doing" },
    { title: "Stand up company-wide reporting", status: "todo", note: "Not set up yet." },
  ],
  lanes: [
    {
      id: "sops",
      label: "SOPs + Knowledge",
      what: "Every process written down with steps and the original training video.",
      status: "live",
      links: [{ label: "Open SOP Hub", to: "/admin/sops" }],
      scoreboard: [{ label: "SOPs", metricKey: "sopCount" }],
    },
    {
      id: "tooling",
      label: "Tooling + Infra",
      what: "The Command Center itself, the build pipeline, and every integration.",
      status: "live",
      links: [
        { label: "Build Lab", to: "/admin/build" },
        { label: "Plans", to: "/admin/plans" },
        { label: "Tasks", to: "/admin/tasks" },
      ],
    },
    {
      id: "stack",
      label: "Stack",
      what: "Full inventory of every software the agency, Jake, and Hermes use.",
      status: "building",
      links: [{ label: "Open the Stack", to: "/admin/pillar/operations/stack" }],
      scoreboard: [{ label: "Tools", metricKey: "stackCount" }],
    },
    {
      id: "comms",
      label: "Team Comms",
      what: "Internal chat: roster, channels, DMs, and the line to Jake.",
      status: "live",
      links: [{ label: "Messages", to: "/admin/messages" }],
    },
    { id: "finance", label: "Finance", what: "Invoicing, profit and loss, payroll.", status: "planned", needsSetup: "Not set up yet. Pick the invoicing + bookkeeping tools and wire the numbers." },
    { id: "team", label: "Team + Hiring", what: "Recruiting, training, and managing contractors.", status: "planned", needsSetup: "Not set up yet. Define roles and a hiring pipeline." },
    { id: "reporting", label: "Company Reporting", what: "The numbers across every pillar, in one place.", status: "planned", needsSetup: "Not set up yet. Decide the company KPIs and where they come from." },
    { id: "admin-legal", label: "Admin + Legal", what: "Contracts, accounts, and compliance.", status: "planned", needsSetup: "Not set up yet. Centralize contracts and accounts." },
  ],
};

// ----------------------------------------------------------------------------
// 01 OUTREACH : get prospects in the door. Channels share one lane skeleton.
// ----------------------------------------------------------------------------
const outreach: Pillar = {
  id: "outreach",
  order: 1,
  num: "01",
  label: "Outreach",
  icon: "Megaphone",
  tagline: "Get prospects in the door.",
  goal: "A predictable flow of qualified prospects from channels that run without Jake on every touch.",
  shape: "lanes",
  scoreboard: [
    { label: "Prospects / week", metricKey: "outreachProspects" },
    { label: "Booked calls / week", metricKey: "outreachBooked" },
    { label: "Active channels", metricKey: "outreachChannels" },
  ],
  tabs: [tab.overview, tab.lanes("Channels"), tab.team, tab.tasks, tab.reporting],
  team: [{ name: "Outreach Hermes", role: "Runs sourcing, sequencing, and scorekeeping", kind: "agent", status: "planned" }],
  tasks: [
    { title: "Pick the first channel to systematize", status: "todo", note: "Cold email is the cheapest to automate." },
    { title: "Define the shared lane skeleton (source, capture, sequence, handoff, scoreboard)", status: "todo" },
  ],
  lanes: [
    { id: "cold-email", label: "Cold Email", what: "Sourced lists into sequenced email outreach.", status: "planned", needsSetup: "Channel not built yet." },
    { id: "cold-calling", label: "Cold Calling", what: "Dial lists with a script and a booking goal.", status: "planned", needsSetup: "Channel not built yet." },
    { id: "paid-ads-leadgen", label: "Paid Ads (Lead Gen)", what: "Run our own ads to book agency calls.", status: "planned", needsSetup: "Channel not built yet." },
    { id: "linkedin", label: "LinkedIn / Social", what: "Outbound DMs and content on social.", status: "planned", needsSetup: "Channel not built yet." },
    { id: "referrals", label: "Referrals + Word of Mouth", what: "Turn happy clients into a referral engine.", status: "planned", needsSetup: "Channel not built yet." },
    { id: "partnerships", label: "Partnerships / Affiliates", what: "Partners who send us deals for a cut.", status: "planned", needsSetup: "Channel not built yet." },
  ],
};

// ----------------------------------------------------------------------------
// 02 SALES : turn prospects into paying clients. A pipeline, front to back.
// ----------------------------------------------------------------------------
const sales: Pillar = {
  id: "sales",
  order: 2,
  num: "02",
  label: "Sales",
  icon: "Handshake",
  tagline: "Turn prospects into paying clients.",
  goal: "A repeatable close: every prospect moves through the same stages with the same assets.",
  shape: "pipeline",
  scoreboard: [
    { label: "Calls booked", metricKey: "salesBooked" },
    { label: "Close rate", metricKey: "salesCloseRate" },
    { label: "New clients / month", metricKey: "salesWon" },
  ],
  tabs: [tab.overview, tab.lanes("Pipeline"), tab.team, tab.tasks, tab.reporting],
  team: [{ name: "Sales Hermes", role: "Preps calls, drafts proposals, chases follow-ups", kind: "agent", status: "planned" }],
  tasks: [
    { title: "Write the discovery call script", status: "todo" },
    { title: "Build the proposal template", status: "todo" },
  ],
  lanes: [
    { id: "qualified", label: "Qualified Lead", what: "A prospect worth our time, scored against fit.", status: "planned", needsSetup: "Stage not built yet." },
    { id: "discovery", label: "Discovery Call", what: "The first call: diagnose, qualify, book the pitch.", status: "planned", needsSetup: "Stage not built yet." },
    { id: "proposal", label: "Pitch / Proposal", what: "Present the offer and the price.", status: "planned", needsSetup: "Stage not built yet." },
    { id: "follow-up", label: "Follow-up", what: "Handle objections and chase the decision.", status: "planned", needsSetup: "Stage not built yet." },
    { id: "closed-won", label: "Closed Won", what: "Signed and paid, handed to Onboarding.", status: "planned", needsSetup: "Stage not built yet." },
    { id: "nurture", label: "Nurture", what: "Not-yet prospects kept warm for later.", status: "planned", needsSetup: "Stage not built yet." },
  ],
};

// ----------------------------------------------------------------------------
// 03 ONBOARDING : new client setup, first 14 days. A pipeline. No reporting tab.
// ----------------------------------------------------------------------------
const onboarding: Pillar = {
  id: "onboarding",
  order: 3,
  num: "03",
  label: "Onboarding",
  icon: "Rocket",
  tagline: "New client setup, first 14 days.",
  goal: "Every new client fully stood up in days, the same way, with nothing forgotten.",
  shape: "pipeline",
  scoreboard: [
    { label: "Clients onboarding", metricKey: "onboardingActive" },
    { label: "Days to live", metricKey: "onboardingDaysToLive" },
    { label: "Checklist complete", metricKey: "onboardingComplete" },
  ],
  tabs: [tab.overview, tab.lanes("Pipeline"), tab.team, tab.tasks],
  team: [{ name: "Onboarding Hermes", role: "Drives the checklist and provisioning", kind: "agent", status: "planned" }],
  tasks: [
    { title: "Templatize the GHL snapshot provisioning", status: "doing" },
    { title: "Tighten the access + assets collection step", status: "todo" },
  ],
  lanes: [
    { id: "welcome", label: "Welcome / Paid", what: "Payment confirmed, welcome sent, account provisioned.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }] },
    { id: "kickoff", label: "Kickoff Call", what: "Align on goals, gather the brief.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }] },
    { id: "collect-access", label: "Collect Access + Assets", what: "Logins, brand assets, ad accounts.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }] },
    { id: "tech-setup", label: "Tech / Account Setup", what: "Provision the software, GHL snapshot, tracking.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }] },
    { id: "first-campaign", label: "First Campaign Live", what: "First ads live, handed to Delivery + Retention.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }] },
  ],
};

// ----------------------------------------------------------------------------
// 04 SERVICE DELIVERY : the product. Split by effort: Deploy (clone) vs Manage.
// ----------------------------------------------------------------------------
const service: Pillar = {
  id: "service",
  order: 4,
  num: "04",
  label: "Service Delivery",
  icon: "Wrench",
  tagline: "The product: the actual work.",
  goal: "Deploy lanes near-instant and error-free; manage lanes repeatable and good without Jake.",
  shape: "lanes",
  scoreboard: [
    { label: "Live clients", metricKey: "activeClients" },
    { label: "Ad spend managed", metricKey: "adSpend" },
    { label: "Avg deploy time", metricKey: "deployTime" },
  ],
  tabs: [tab.overview, tab.lanes("Services"), tab.team, tab.tasks, tab.reporting],
  team: [{ name: "Delivery Hermes", role: "Watches campaigns, drafts kill/scale/refresh moves", kind: "agent", status: "planned" }],
  tasks: [
    { title: "Write the paid-ads weekly management SOP", status: "doing" },
    { title: "Turn the software setup into a one-click clone", status: "todo" },
  ],
  lanes: [
    {
      id: "software",
      label: "Software / Dashboard",
      what: "The client reporting platform: build the master once, clone per client.",
      status: "live",
      motion: "deploy",
      process: [
        "Confirm the client record exists in Clients and the plan is paid.",
        "Clone the master Command Center client instance for the new tenant.",
        "Wire the client's data sources: Meta ad account id, GHL sub-account, tracking.",
        "Set branding (logo, colors) from the onboarding brief.",
        "Invite the client's team logins and verify they can sign in.",
        "Smoke-test the dashboard: leads, pipeline, ads, and reporting all render.",
      ],
      assets: [
        "Master client instance (the clone source)",
        "Branding token sheet (logo, colors, fonts)",
        "Per-client config checklist (ad account id, GHL id, tracking)",
      ],
      links: [
        { label: "Build Lab", to: "/admin/build" },
        { label: "Clients", to: "/admin/clients" },
        { label: "GoHighLevel", to: "https://app.gohighlevel.com", external: true },
      ],
      scoreboard: [{ label: "Live clients", metricKey: "activeClients" }],
    },
    { id: "website", label: "Website / Web Design", what: "Template library, customized per client.", status: "building", motion: "deploy" },
    { id: "sales-infra", label: "Sales Infrastructure", what: "The GHL snapshot: funnels, pipelines, automations, calendars, CRM.", status: "building", motion: "deploy" },
    { id: "tracking", label: "Tracking + Attribution", what: "Pixels, conversion API, call tracking. Feeds the software's reporting.", status: "building", motion: "deploy" },
    { id: "ai-agents", label: "AI Agents", what: "Build-once agents dropped into a client, then maintained.", status: "planned", motion: "deploy", needsSetup: "Offer not built yet." },
    { id: "paid-ads", label: "Paid Ads Management", what: "Launch, monitor, kill / scale / refresh. The core ongoing work.", status: "live", motion: "manage", links: [{ label: "Clients", to: "/admin/clients" }], scoreboard: [{ label: "Ad spend managed", metricKey: "adSpend" }] },
    { id: "seo", label: "SEO", what: "Ongoing search optimization as a service.", status: "planned", motion: "manage", needsSetup: "Offer not built yet." },
    { id: "commercial-leadgen", label: "Commercial Lead-Gen (for clients)", what: "Cold email to win commercial jobs for construction + service clients.", status: "planned", motion: "manage", needsSetup: "Possible future offer." },
  ],
};

// ----------------------------------------------------------------------------
// 05 RETENTION : keep clients, report, expand.
// ----------------------------------------------------------------------------
const retention: Pillar = {
  id: "retention",
  order: 5,
  num: "05",
  label: "Retention",
  icon: "HeartHandshake",
  tagline: "Keep clients, report, expand.",
  goal: "Clients stay, see results, and grow their spend. Low churn, rising lifetime value.",
  shape: "lanes",
  scoreboard: [
    { label: "Active clients", metricKey: "activeClients" },
    { label: "Churn rate", metricKey: "churnRate" },
    { label: "Expansion / month", metricKey: "expansion" },
  ],
  tabs: [tab.overview, tab.lanes("Motions"), tab.team, tab.tasks, tab.reporting],
  team: [{ name: "Retention Hermes", role: "Assembles client reports and flags churn risk", kind: "agent", status: "planned" }],
  tasks: [
    { title: "Automate the monthly client report from the software", status: "doing" },
    { title: "Define the churn-risk early-warning signals", status: "todo" },
  ],
  lanes: [
    { id: "reporting", label: "Client Reporting", what: "Weekly and monthly reports. Mostly auto-produced by the software.", status: "building" },
    { id: "relationship", label: "Relationship + Check-ins", what: "Calls and messages that keep the client close.", status: "planned", links: [{ label: "Messages", to: "/admin/messages" }], needsSetup: "Cadence not defined yet." },
    { id: "performance", label: "Performance vs Goals", what: "Are we hitting what the client signed up for.", status: "planned", needsSetup: "Not set up yet." },
    { id: "upsell", label: "Upsell / Expansion", what: "More services, more spend, more value.", status: "planned", needsSetup: "Not set up yet." },
    { id: "saves", label: "Churn-risk Saves", what: "Catch unhappy clients before they leave.", status: "planned", needsSetup: "Not set up yet." },
  ],
};

export const PILLARS: Pillar[] = [operations, outreach, sales, onboarding, service, retention];

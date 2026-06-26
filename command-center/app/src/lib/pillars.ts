// The pillar infrastructure: the single source of truth for how the agency runs.
//
// Six pillars. Operations is the hub (order 'hub', sorts first); the other five
// are the value chain it feeds (numbered 01..05). Every pillar and lane carries
// a declared status (planned | building | live) and a future Hermes slot
// (hermes: null) that an agent profile will fill later. The sidebar, pillar
// pages, lane workspaces, and the Infrastructure map all render from this file,
// so adding a lane here makes it appear everywhere with no other code change.
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
  // A literal value to show now, or a metricKey that, when present in live data,
  // promotes the node to "live" (the hybrid engine, see pillarStatus.ts).
  value?: string;
  metricKey?: string;
}

export interface PillarLane {
  id: string;
  label: string;
  what: string; // one-line "what it is"
  status: PillarStatus; // declared fallback
  motion?: LaneMotion; // Service Delivery only: deploy (clone) vs manage (grind)
  future?: boolean; // greyed on the board
  process?: string[]; // "how we deliver it" steps
  assets?: string[]; // reusable templates/assets
  links?: LaneLink[]; // re-homed tools
  scoreboard?: ScoreboardField[];
  hermes: null; // future agent slot
}

export interface Pillar {
  id: string;
  order: number | "hub"; // 'hub' = Operations, sorts first
  num?: string; // display number "01".."05"
  label: string;
  icon: string; // lucide icon name, resolved in the UI
  tagline: string;
  shape: "lanes" | "pipeline";
  goal?: string;
  scoreboard?: ScoreboardField[];
  hermes: null; // future agent slot
  lanes: PillarLane[];
}

// ----------------------------------------------------------------------------
// OPERATIONS (hub) : the backbone the whole line runs in.
// ----------------------------------------------------------------------------
const operations: Pillar = {
  id: "operations",
  order: "hub",
  label: "Operations",
  icon: "Settings",
  tagline: "The backbone the whole line runs in.",
  goal: "Run the agency on set systems, not on memory. Every process documented, every tool accounted for.",
  shape: "lanes",
  hermes: null,
  scoreboard: [
    { label: "SOPs documented", metricKey: "sopCount" },
    { label: "Tools in stack", metricKey: "stackCount" },
    { label: "Open tasks", metricKey: "openTasks" },
  ],
  lanes: [
    {
      id: "sops",
      label: "SOPs + Knowledge",
      what: "Every process written down with steps and the original training video.",
      status: "live",
      links: [{ label: "Open SOP Hub", to: "/admin/sops" }],
      scoreboard: [{ label: "SOPs", metricKey: "sopCount" }],
      hermes: null,
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
      hermes: null,
    },
    {
      id: "stack",
      label: "Stack",
      what: "Full inventory of every software the agency, Jake, and Hermes use.",
      status: "building",
      links: [{ label: "Open the Stack", to: "/admin/stack" }],
      scoreboard: [{ label: "Tools", metricKey: "stackCount" }],
      hermes: null,
    },
    {
      id: "comms",
      label: "Team Comms",
      what: "Internal chat: roster, channels, DMs, and the line to Jake.",
      status: "live",
      links: [{ label: "Messages", to: "/admin/messages" }],
      hermes: null,
    },
    {
      id: "finance",
      label: "Finance",
      what: "Invoicing, profit and loss, payroll.",
      status: "planned",
      future: true,
      hermes: null,
    },
    {
      id: "team",
      label: "Team + Hiring",
      what: "Recruiting, training, and managing contractors.",
      status: "planned",
      future: true,
      hermes: null,
    },
    {
      id: "reporting",
      label: "Company Reporting",
      what: "The numbers across every pillar, in one place.",
      status: "planned",
      future: true,
      hermes: null,
    },
    {
      id: "admin-legal",
      label: "Admin + Legal",
      what: "Contracts, accounts, and compliance.",
      status: "planned",
      future: true,
      hermes: null,
    },
  ],
};

// ----------------------------------------------------------------------------
// 01 OUTREACH : get prospects in the door. All channels share one lane skeleton.
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
  hermes: null,
  scoreboard: [
    { label: "Prospects / week", metricKey: "outreachProspects" },
    { label: "Booked calls / week", metricKey: "outreachBooked" },
    { label: "Active channels", metricKey: "outreachChannels" },
  ],
  lanes: [
    { id: "cold-email", label: "Cold Email", what: "Sourced lists into sequenced email outreach.", status: "planned", future: true, hermes: null },
    { id: "cold-calling", label: "Cold Calling", what: "Dial lists with a script and a booking goal.", status: "planned", future: true, hermes: null },
    { id: "paid-ads-leadgen", label: "Paid Ads (Lead Gen)", what: "Run our own ads to book agency calls.", status: "planned", future: true, hermes: null },
    { id: "linkedin", label: "LinkedIn / Social", what: "Outbound DMs and content on social.", status: "planned", future: true, hermes: null },
    { id: "referrals", label: "Referrals + Word of Mouth", what: "Turn happy clients into a referral engine.", status: "planned", future: true, hermes: null },
    { id: "partnerships", label: "Partnerships / Affiliates", what: "Partners who send us deals for a cut.", status: "planned", future: true, hermes: null },
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
  hermes: null,
  scoreboard: [
    { label: "Calls booked", metricKey: "salesBooked" },
    { label: "Close rate", metricKey: "salesCloseRate" },
    { label: "New clients / month", metricKey: "salesWon" },
  ],
  lanes: [
    { id: "qualified", label: "Qualified Lead", what: "A prospect worth our time, scored against fit.", status: "planned", future: true, hermes: null },
    { id: "discovery", label: "Discovery Call", what: "The first call: diagnose, qualify, book the pitch.", status: "planned", future: true, hermes: null },
    { id: "proposal", label: "Pitch / Proposal", what: "Present the offer and the price.", status: "planned", future: true, hermes: null },
    { id: "follow-up", label: "Follow-up", what: "Handle objections and chase the decision.", status: "planned", future: true, hermes: null },
    { id: "closed-won", label: "Closed Won", what: "Signed and paid, handed to Onboarding.", status: "planned", future: true, hermes: null },
    { id: "nurture", label: "Nurture", what: "Not-yet prospects kept warm for later.", status: "planned", future: true, hermes: null },
  ],
};

// ----------------------------------------------------------------------------
// 03 ONBOARDING : new client setup, first 14 days. A pipeline.
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
  hermes: null,
  scoreboard: [
    { label: "Clients onboarding", metricKey: "onboardingActive" },
    { label: "Days to live", metricKey: "onboardingDaysToLive" },
    { label: "Checklist complete", metricKey: "onboardingComplete" },
  ],
  lanes: [
    {
      id: "welcome",
      label: "Welcome / Paid",
      what: "Payment confirmed, welcome sent, account provisioned.",
      status: "building",
      links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }],
      hermes: null,
    },
    { id: "kickoff", label: "Kickoff Call", what: "Align on goals, gather the brief.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }], hermes: null },
    { id: "collect-access", label: "Collect Access + Assets", what: "Logins, brand assets, ad accounts.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }], hermes: null },
    { id: "tech-setup", label: "Tech / Account Setup", what: "Provision the software, GHL snapshot, tracking.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }], hermes: null },
    { id: "first-campaign", label: "First Campaign Live", what: "First ads live, handed to Delivery + Retention.", status: "building", links: [{ label: "Onboarding wizard", to: "/admin/onboarding" }], hermes: null },
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
  hermes: null,
  scoreboard: [
    { label: "Live clients", metricKey: "activeClients" },
    { label: "Ad spend managed", metricKey: "adSpend" },
    { label: "Avg deploy time", metricKey: "deployTime" },
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
      hermes: null,
    },
    {
      id: "website",
      label: "Website / Web Design",
      what: "Template library, customized per client.",
      status: "building",
      motion: "deploy",
      hermes: null,
    },
    {
      id: "sales-infra",
      label: "Sales Infrastructure",
      what: "The GHL snapshot: funnels, pipelines, automations, calendars, CRM.",
      status: "building",
      motion: "deploy",
      hermes: null,
    },
    {
      id: "tracking",
      label: "Tracking + Attribution",
      what: "Pixels, conversion API, call tracking. Feeds the software's reporting.",
      status: "building",
      motion: "deploy",
      hermes: null,
    },
    {
      id: "ai-agents",
      label: "AI Agents",
      what: "Build-once agents dropped into a client, then maintained.",
      status: "planned",
      motion: "deploy",
      future: true,
      hermes: null,
    },
    {
      id: "paid-ads",
      label: "Paid Ads Management",
      what: "Launch, monitor, kill / scale / refresh. The core ongoing work.",
      status: "live",
      motion: "manage",
      links: [{ label: "Clients", to: "/admin/clients" }],
      scoreboard: [{ label: "Ad spend managed", metricKey: "adSpend" }],
      hermes: null,
    },
    {
      id: "seo",
      label: "SEO",
      what: "Ongoing search optimization as a service.",
      status: "planned",
      motion: "manage",
      future: true,
      hermes: null,
    },
    {
      id: "commercial-leadgen",
      label: "Commercial Lead-Gen (for clients)",
      what: "Cold email to win commercial jobs for construction + service clients.",
      status: "planned",
      motion: "manage",
      future: true,
      hermes: null,
    },
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
  hermes: null,
  scoreboard: [
    { label: "Active clients", metricKey: "activeClients" },
    { label: "Churn rate", metricKey: "churnRate" },
    { label: "Expansion / month", metricKey: "expansion" },
  ],
  lanes: [
    {
      id: "reporting",
      label: "Client Reporting",
      what: "Weekly and monthly reports. Mostly auto-produced by the software.",
      status: "building",
      hermes: null,
    },
    {
      id: "relationship",
      label: "Relationship + Check-ins",
      what: "Calls and messages that keep the client close.",
      status: "planned",
      links: [{ label: "Messages", to: "/admin/messages" }],
      hermes: null,
    },
    { id: "performance", label: "Performance vs Goals", what: "Are we hitting what the client signed up for.", status: "planned", hermes: null },
    { id: "upsell", label: "Upsell / Expansion", what: "More services, more spend, more value.", status: "planned", hermes: null },
    { id: "saves", label: "Churn-risk Saves", what: "Catch unhappy clients before they leave.", status: "planned", hermes: null },
  ],
};

export const PILLARS: Pillar[] = [operations, outreach, sales, onboarding, service, retention];

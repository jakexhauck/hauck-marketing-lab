// Software inventory for the agency. A flat, hand-authored list of every tool
// the team, Jake, and the Hermes agent run, grouped by category. Pure data, no
// runtime dependency. Rendered by routes/admin/AdminStack.tsx. When the stack
// changes (new SaaS, retired tool), edit this file. used_by tags say who runs
// the tool: agency = the team, jake = Jake personally, hermes = the Hermes agent.

export interface StackTool {
  name: string;
  category: string;
  what: string;
  used_by: ("agency" | "jake" | "hermes")[];
  url?: string;
}

// Ordered list of category names. AdminStack renders sections in this order.
export const STACK_CATEGORIES: string[] = [
  "Infra & Hosting",
  "Dev & Build",
  "Ads & Marketing",
  "AI & Agents",
  "Comms & Productivity",
];

export const STACK_TOOLS: StackTool[] = [
  // Infra & Hosting
  {
    name: "Cloudflare Pages",
    category: "Infra & Hosting",
    what: "Hosts the Command Center app and blueprint map, with Access gating.",
    used_by: ["agency"],
    url: "https://dash.cloudflare.com",
  },
  {
    name: "Vercel",
    category: "Infra & Hosting",
    what: "Hosts the marketing site at hauckmarketing.com, deploys from main.",
    used_by: ["agency"],
    url: "https://vercel.com",
  },
  {
    name: "Namecheap",
    category: "Infra & Hosting",
    what: "DNS for hauckmarketing.com, including custom subdomain CNAMEs.",
    used_by: ["agency"],
    url: "https://www.namecheap.com",
  },
  {
    name: "Supabase",
    category: "Infra & Hosting",
    what: "Postgres, auth, and storage backing the Command Center.",
    used_by: ["agency"],
    url: "https://supabase.com",
  },

  // Dev & Build
  {
    name: "Command Center",
    category: "Dev & Build",
    what: "The React and Tauri admin plus client app the agency runs on.",
    used_by: ["agency", "jake"],
  },
  {
    name: "GitHub",
    category: "Dev & Build",
    what: "jakexhauck/hauck-marketing-lab repo, the Windows and Mac sync backbone.",
    used_by: ["agency", "jake", "hermes"],
    url: "https://github.com",
  },
  {
    name: "Trigger.dev",
    category: "Dev & Build",
    what: "Background jobs and cron for the Command Center.",
    used_by: ["agency"],
    url: "https://trigger.dev",
  },
  {
    name: "Composio",
    category: "Dev & Build",
    what: "OAuth-managed SaaS tools (Gmail, Drive, Calendar) for the agents.",
    used_by: ["agency", "hermes"],
    url: "https://composio.dev",
  },

  // Ads & Marketing
  {
    name: "Meta Ads / Graph API",
    category: "Ads & Marketing",
    what: "Campaign insights and per-client ad accounts via graph.facebook.com.",
    used_by: ["agency"],
    url: "https://business.facebook.com",
  },
  {
    name: "Google Ads",
    category: "Ads & Marketing",
    what: "Search and display campaigns for clients.",
    used_by: ["agency"],
    url: "https://ads.google.com",
  },
  {
    name: "GoHighLevel",
    category: "Ads & Marketing",
    what: "CRM, funnels, snapshots, and calendars for every client subaccount.",
    used_by: ["agency", "jake"],
    url: "https://app.gohighlevel.com",
  },
  {
    name: "GHL CLI",
    category: "Ads & Marketing",
    what: "Internal CLI for provisioning and scripting GoHighLevel subaccounts.",
    used_by: ["agency", "hermes"],
  },

  // AI & Agents
  {
    name: "Claude / Anthropic API",
    category: "AI & Agents",
    what: "The model API powering chat, copy, analysis, and the build agents.",
    used_by: ["agency", "jake", "hermes"],
    url: "https://www.anthropic.com",
  },
  {
    name: "Claude Code",
    category: "AI & Agents",
    what: "The build agent that ships the Command Center and agency tooling.",
    used_by: ["agency", "jake"],
    url: "https://claude.com/claude-code",
  },
  {
    name: "Hermes",
    category: "AI & Agents",
    what: "Telegram ops agent on a VPS that triages and dispatches builds.",
    used_by: ["jake", "hermes"],
  },
  {
    name: "ScreenshotOne",
    category: "AI & Agents",
    what: "Site screenshots for the planned Site Review feature.",
    used_by: ["agency"],
    url: "https://screenshotone.com",
  },

  // Comms & Productivity
  {
    name: "Gmail",
    category: "Comms & Productivity",
    what: "Email via MCP, drafts and read only (no programmatic send).",
    used_by: ["agency", "jake", "hermes"],
    url: "https://mail.google.com",
  },
  {
    name: "Google Drive",
    category: "Comms & Productivity",
    what: "Per-client assets via MCP, surfaced in the client Assets tab.",
    used_by: ["agency", "hermes"],
    url: "https://drive.google.com",
  },
  {
    name: "Google Calendar",
    category: "Comms & Productivity",
    what: "OAuth two-way sync for the admin calendar and call bookings.",
    used_by: ["agency", "jake"],
    url: "https://calendar.google.com",
  },
  {
    name: "Internal Team Chat",
    category: "Comms & Productivity",
    what: "Discord-style internal chat built into the Command Center.",
    used_by: ["agency", "jake"],
  },
  {
    name: "Telegram",
    category: "Comms & Productivity",
    what: "Jake to Hermes ops channel for kicking off and approving work.",
    used_by: ["jake", "hermes"],
    url: "https://telegram.org",
  },
];

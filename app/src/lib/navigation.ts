/**
 * Shared navigation types for the v2 design.
 *
 * Top-level navigation is a "sub-app" model: Dashboard, Clients, Outreach,
 * Sales, Onboarding, Workspace, Settings. The top-bar app switcher swaps
 * between them. Each sub-app owns the sidebar.
 *
 * Internally the existing `View` discriminated union still drives routing;
 * `viewToSubApp(view)` derives which sub-app a given view belongs to, and
 * `subAppToDefaultView(subApp)` produces the landing view when the user
 * picks a different sub-app from the switcher.
 */

export type SubApp =
  | "dashboard"
  | "clients"
  | "outreach"
  | "sales"
  | "onboarding"
  | "workspace"
  | "settings";

export type WorkspaceView =
  | "dashboard"
  | "calendar"
  | "clients"
  | "sales"
  | "onboarding"
  | "tasks"
  | "revenue"
  | "recordings"
  | "sops"
  | "resources"
  | "creative-studio"
  | "automations"
  | "ads";

/** Top-level surfaces inside the Outreach pillar. */
export type OutreachSection =
  | "overview"
  | "lead-scraper"
  | "web-designer"
  | "sequence"
  | "dms" // standalone personalized-DMs workflow (lives outside the main cold-call sequence)
  | "prospect"; // when `prospect`, `slug` field on the view discriminator names which one

/** Top-level surfaces inside the Personal pillar. */
export type PersonalSection = "overview" | "hygiene" | "clothing";

/** Per-client tabs rendered as the nested sidebar list under the active client.
 *  Order in the sidebar:
 *    Onboarding (only when status === pre-launch) · Dashboard · Ads ·
 *    Drive · Recordings · Websites · Reporting · Settings
 *  The "Drive" tab is internally `documents` and handles both the Drive folder
 *  browser and the local doc editor. Settings holds the Profile + Memory view. */
export type ClientSection =
  | "dashboard"
  | "onboarding"
  | "ads"
  | "documents"
  | "recordings"
  | "websites"
  | "reporting"
  | "settings";

/** First section to open when the user clicks a client. Pre-launch clients
 *  land on the Onboarding checklist (the Ads sequence wizard is launched from
 *  the "Ads" task inside that checklist). Live/paused clients land on the
 *  dashboard. */
export function defaultClientSection(status: "pre-launch" | "live" | "paused"): ClientSection {
  return status === "pre-launch" ? "onboarding" : "dashboard";
}

/** Workspace-tab values that belong inside the Workspace sub-app. */
export type WorkspaceSubAppTab =
  | "calendar"
  | "tasks"
  | "revenue"
  | "recordings"
  | "sops"
  | "resources"
  | "personal";

/** Mirror of MainDashboard's internal View, kept loose to avoid a cycle. */
type ViewLike =
  | { kind: "workspace"; tab: WorkspaceView }
  | { kind: "outreach"; section: OutreachSection; prospectSlug?: string }
  | { kind: "client"; slug: string; section: ClientSection }
  | { kind: "personal"; section: PersonalSection };

/** Which sub-app is a given view "inside"? */
export function viewToSubApp(view: ViewLike): SubApp {
  if (view.kind === "client") return "clients";
  if (view.kind === "outreach") return "outreach";
  if (view.kind === "personal") return "workspace";
  // workspace
  switch (view.tab) {
    case "dashboard":
      return "dashboard";
    case "clients":
    case "ads":
      return "clients";
    case "sales":
      return "sales";
    case "onboarding":
      return "onboarding";
    case "calendar":
    case "tasks":
    case "revenue":
    case "recordings":
    case "sops":
    case "resources":
    case "creative-studio":
    case "automations":
      return "workspace";
  }
}

/** Default landing view when the user picks a sub-app from the switcher. */
export function subAppToDefaultView(subApp: SubApp): ViewLike | null {
  switch (subApp) {
    case "dashboard":
      return { kind: "workspace", tab: "dashboard" };
    case "clients":
      return { kind: "workspace", tab: "clients" };
    case "outreach":
      return { kind: "outreach", section: "overview" };
    case "sales":
      return { kind: "workspace", tab: "sales" };
    case "onboarding":
      return { kind: "workspace", tab: "onboarding" };
    case "workspace":
      return { kind: "workspace", tab: "calendar" };
    case "settings":
      // Settings lives in a modal/page outside View; caller routes to it directly.
      return null;
  }
}

export interface SubAppDef {
  id: SubApp;
  name: string;
  subLine: string;
  kbd: string;
}

/** Ordered list used by the AppSwitcher dropdown. */
export const SUB_APPS: SubAppDef[] = [
  { id: "dashboard", name: "Dashboard", subLine: "Agency-wide overview", kbd: "1" },
  { id: "clients", name: "Clients", subLine: "Roster + ads workspace", kbd: "2" },
  { id: "outreach", name: "Outreach", subLine: "Lead-gen, sequences, DMs", kbd: "3" },
  { id: "sales", name: "Sales Pipeline", subLine: "Closes and forecasts", kbd: "4" },
  { id: "onboarding", name: "Onboarding Pipeline", subLine: "Pre-launch clients", kbd: "5" },
  { id: "workspace", name: "Workspace", subLine: "Calendar, tasks, recordings, SOPs", kbd: "6" },
  { id: "settings", name: "Settings", subLine: "App, accounts, integrations", kbd: "," },
];

/**
 * Lightweight prospect entry used to populate the Outreach > Prospects subtree
 * and the prospects table. Backed by `vault/Outreach/<slug>/`.
 */
export interface ProspectEntry {
  slug: string;
  name: string;
  niche?: string | null;
  /** "scraped" | "mockup-ready" | "sequence-sent" | "replied" | "closed" */
  status: ProspectStatus;
  url?: string | null;
  lastTouchedAt?: string | null;
}

export type ProspectStatus =
  | "scraped"
  | "mockup-ready"
  | "sequence-sent"
  | "replied"
  | "scheduled"
  | "showed"
  | "no-show"
  | "closed";

/** Maps a prospect status to a pill colour class used by .hml-pill */
export function prospectStatusPill(status: ProspectStatus): {
  className: string;
  label: string;
} {
  switch (status) {
    case "scraped":
      return { className: "hml-neutral", label: "Scraped" };
    case "mockup-ready":
      return { className: "hml-plum", label: "Mockup Ready" };
    case "sequence-sent":
      return { className: "hml-teal", label: "Sequence Sent" };
    case "replied":
      return { className: "hml-blue", label: "Replied" };
    case "scheduled":
      return { className: "hml-amber", label: "Scheduled" };
    case "showed":
      return { className: "hml-teal", label: "Showed" };
    case "no-show":
      return { className: "hml-neutral", label: "No-show" };
    case "closed":
      return { className: "hml-green", label: "Closed" };
  }
}

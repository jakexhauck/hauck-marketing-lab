/**
 * Shared navigation types for the v2 design.
 *
 * The app sidebar splits into three pillars — Workspace, Outreach, Clients —
 * and the right pane routes off the selection. These types capture every
 * valid landing surface so a single `View` discriminated union can describe
 * the active route in MainDashboard.
 */

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
  | "ads";

/** Top-level surfaces inside the Outreach pillar. */
export type OutreachSection =
  | "overview"
  | "lead-scraper"
  | "web-designer"
  | "sequence"
  | "prospect"; // when `prospect`, `slug` field on the view discriminator names which one

/** Top-level surfaces inside the Personal pillar. */
export type PersonalSection = "overview" | "hygiene" | "clothing";

/** Per-client tabs inside a ClientDashboard.
 *  `service-delivery` is the consolidated Fulfillment tab that holds Forms,
 *  Recordings, Websites, and Drive as sub-tabs (see ClientServiceDelivery.tsx). */
export type ClientSection =
  | "dashboard"
  | "onboarding"
  | "ads"
  | "service-delivery"
  | "profile"
  | "memory";

/** First section to open when the user clicks a client. Pre-launch clients
 *  land on the Onboarding checklist (the Ads sequence wizard is launched from
 *  the "Ads" task inside that checklist). Live/paused clients land on the
 *  dashboard. */
export function defaultClientSection(status: "pre-launch" | "live" | "paused"): ClientSection {
  return status === "pre-launch" ? "onboarding" : "dashboard";
}

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

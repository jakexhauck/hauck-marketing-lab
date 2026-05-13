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
  | "tasks"
  | "recordings"
  | "sops";

/** Top-level surfaces inside the Outreach pillar. */
export type OutreachSection =
  | "overview"
  | "lead-scraper"
  | "web-designer"
  | "prospect"; // when `prospect`, `slug` field on the view discriminator names which one

/** Per-client tabs inside a ClientDashboard. */
export type ClientSection =
  | "profile"
  | "memory"
  | "drive"
  | "media-buying"
  | "website";

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
    case "closed":
      return { className: "hml-green", label: "Closed" };
  }
}

// Shapes returned by /api/admin/sops. These mirror functions/lib/sopTree.ts,
// which is the authority: the Worker and the browser build against separate
// tsconfigs, so the contract is restated here rather than imported across.

export interface SopEntry {
  slug: string;
  title: string;
  fileId: string;
  videoId: string | null;
  webViewLink: string | null;
  modifiedTime: string | null;
}

export interface SopAttachment {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
}

export interface SopCategory {
  key: string;
  name: string;
  sops: SopEntry[];
  attachments: SopAttachment[];
}

// Why the hub cannot show SOPs, when it cannot. Each needs a different fix, so
// the UI states them separately instead of collapsing to one "failed to load".
export type SopHubStatus = "ok" | "not_configured" | "not_connected" | "no_access" | "error";

export interface SopTreeResponse {
  status: SopHubStatus;
  categories: SopCategory[];
  // Which Google account is linked, or null when none is. Shown so consenting
  // as the wrong account is visible rather than arriving as a bare 403.
  connectedEmail?: string | null;
  error?: string;
}

export interface SopDocResponse {
  title: string;
  html: string;
  cached: boolean;
}

// A category label reads better split on its path: "fullfillment/facebook-ads"
// comes back as name "Facebook Ads", but the parent is worth showing.
export function categoryTrail(key: string): string[] {
  return key
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/-/g, " "));
}

export function totalSops(categories: readonly SopCategory[]): number {
  return categories.reduce((n, c) => n + c.sops.length, 0);
}

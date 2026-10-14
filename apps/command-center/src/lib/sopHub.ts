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
  // Folders above this one, real Drive names, nearest last. Optional: a payload
  // cached by a bundle that predates it has none, so always read it through
  // `catTrail()` rather than touching it directly.
  trail?: string[];
  sops: SopEntry[];
  attachments: SopAttachment[];
}

/** The one safe way to read a category's ancestor folders. */
export function catTrail(cat: SopCategory): string[] {
  return Array.isArray(cat.trail) ? cat.trail : [];
}

/** One Drive folder: what is in it, and the folders inside it. */
export interface SopFolder extends SopCategory {
  folders: SopFolder[];
  // Own plus every descendant, so a folder card can say what it holds.
  totalSops: number;
  totalFiles: number;
}

/** The SOP root: its folders, plus anything loose at the top level. */
export interface SopTree {
  folders: SopFolder[];
  sops: SopEntry[];
  attachments: SopAttachment[];
}

export const EMPTY_TREE: SopTree = { folders: [], sops: [], attachments: [] };

// Why the hub cannot show SOPs, when it cannot. Each needs a different fix, so
// the UI states them separately instead of collapsing to one "failed to load".
export type SopHubStatus = "ok" | "not_configured" | "not_connected" | "no_access" | "error";

export interface SopTreeResponse {
  status: SopHubStatus;
  tree: SopTree;
  // Which Google account is linked, or null when none is. Shown so consenting
  // as the wrong account is visible rather than arriving as a bare 403.
  connectedEmail?: string | null;
  error?: string;
}

/**
 * The folder at a path of keys, or null when the path no longer exists.
 *
 * Navigation holds a PATH, never a folder object: the tree refetches while the
 * hub is open, so a held node would pin the view to a stale copy. A path that
 * stops resolving means the folder was renamed or removed in Drive, which the UI
 * has to say rather than render blank.
 */
export function folderAt(tree: SopTree, path: readonly string[]): SopFolder | null {
  let folders = tree.folders;
  let found: SopFolder | null = null;
  for (const key of path) {
    const next = folders.find((f) => f.key === key);
    if (!next) return null;
    found = next;
    folders = next.folders;
  }
  return found;
}

/** Every folder in the tree, depth-first. Used by search, which ignores where you are. */
export function allFolders(tree: SopTree): SopFolder[] {
  const out: SopFolder[] = [];
  const walk = (folders: readonly SopFolder[]): void => {
    for (const f of folders) {
      out.push(f);
      walk(f.folders);
    }
  };
  walk(tree.folders);
  return out;
}

export function treeTotalSops(tree: SopTree): number {
  return tree.sops.length + tree.folders.reduce((n, f) => n + f.totalSops, 0);
}

// One tab of a Google Doc, or the whole document when it has no tabs (in which
// case `title` is null: there is no tab to name, and repeating the document title
// as a heading would invent structure nobody wrote).
export interface SopDocSection {
  title: string | null;
  // Nesting level of the tab, 0 for top level. Sub-tabs indent under their parent
  // in the contents list.
  depth: number;
  html: string;
}

export interface SopDocResponse {
  title: string;
  sections: SopDocSection[];
  cached: boolean;
}

/** The one safe way to read a rendered SOP's sections. */
export function docSections(doc: SopDocResponse | undefined): SopDocSection[] {
  return Array.isArray(doc?.sections) ? doc.sections : [];
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

/**
 * Where a folder sits, as display names. Built from `trail` plus the folder's own
 * name rather than from its key, because the key is slugified: lowercased with
 * the emoji stripped, so "⚙️ | Agency SOPS" comes back as "agency-sops".
 */
export function folderCrumbs(folder: SopFolder): string[] {
  return [...catTrail(folder), folder.name];
}

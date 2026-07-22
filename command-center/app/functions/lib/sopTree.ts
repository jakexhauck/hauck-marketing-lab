import { listFolderChildren, FOLDER_MIME, type DriveFile } from "./driveDirect";

// Turns the agency's "SOPs Templates" Drive folder into the shape the admin hub
// renders. The folder already encodes everything we need, so nothing is invented:
//
//   subfolder                          -> a category
//   Google Doc                         -> an SOP page
//   "3. " filename prefix              -> sort order
//   "1. X.mp4" beside "1.1 X.gdoc"     -> that video belongs to that SOP
//   sheets, PDFs, images               -> attachments, linked out to Drive
//
// The walk is bounded: Drive folders are user-editable, and an accidental
// shortcut loop must not spin a Worker until it times out.

export const DOC_MIME = "application/vnd.google-apps.document";
const MAX_DEPTH = 3;

// Scaffolding, not content: an empty template tree Jake copies per client.
const EXCLUDED_FOLDERS = new Set(["example client folder"]);

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

export interface SopCategoryNode {
  key: string;
  name: string;
  sops: SopEntry[];
  attachments: SopAttachment[];
}

export interface OrderPrefix {
  major: number;
  minor: number;
  title: string;
}

// "3. Static AD Creation SOP" -> { 3, 0, "Static AD Creation SOP" }
// "1.1 Launching our Campaign" -> { 1, 1, "Launching our Campaign" }
// Unprefixed names sort last, keeping their name intact. A decimal inside a title
// ("Meta Ads 2.0 Playbook") is not a prefix, so the match is anchored.
export function parseOrderPrefix(name: string): OrderPrefix {
  const m = /^(\d+)(?:\.(\d+))?\.?\s+(.*)$/.exec(name.trim());
  if (m) {
    return { major: Number(m[1]), minor: m[2] ? Number(m[2]) : 0, title: m[3].trim() };
  }
  // "7.Facebook Pixel SOP" — a prefix with no space after the dot.
  const tight = /^(\d+)\.(?!\d)\s*(.+)$/.exec(name.trim());
  if (tight) return { major: Number(tight[1]), minor: 0, title: tight[2].trim() };

  return { major: Number.MAX_SAFE_INTEGER, minor: 0, title: name.trim() };
}

export function isExcludedFolder(name: string): boolean {
  return EXCLUDED_FOLDERS.has(name.trim().toLowerCase());
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

function stripExtension(name: string): string {
  return name.replace(/\.(gdoc|gsheet|gslides|mp4|mov|pdf|png|jpe?g|lnk|docx?|xlsx?)$/i, "");
}

/** One folder's children sorted into SOP pages and loose attachments. */
export function buildCategory(name: string, key: string, children: DriveFile[]): SopCategoryNode {
  const docs = children.filter((f) => f.mimeType === DOC_MIME);
  const rest = children.filter((f) => f.mimeType !== DOC_MIME && !f.isFolder);

  const ordered = docs
    .map((f) => ({ file: f, order: parseOrderPrefix(stripExtension(f.name)) }))
    .sort((a, b) =>
      a.order.major - b.order.major ||
      a.order.minor - b.order.minor ||
      a.order.title.localeCompare(b.order.title),
    );

  // A video pairs to the Doc sharing its major number ("1. X.mp4" -> "1.1 X.gdoc").
  const videos = rest
    .filter((f) => f.mimeType.startsWith("video/"))
    .map((f) => ({ file: f, order: parseOrderPrefix(stripExtension(f.name)) }));
  const claimed = new Set<string>();

  const seen = new Set<string>();
  const sops: SopEntry[] = ordered.map(({ file, order }) => {
    let slug = slugify(order.title);
    // Two Docs can share a title; a slug is a URL key, so it must stay unique.
    if (seen.has(slug)) slug = `${slug}-${file.id.slice(0, 6).toLowerCase()}`;
    seen.add(slug);

    const match =
      order.major !== Number.MAX_SAFE_INTEGER
        ? videos.find((v) => v.order.major === order.major && !claimed.has(v.file.id))
        : undefined;
    if (match) claimed.add(match.file.id);

    return {
      slug,
      title: order.title,
      fileId: file.id,
      videoId: match?.file.id ?? null,
      webViewLink: file.webViewLink,
      modifiedTime: file.modifiedTime,
    };
  });

  const attachments: SopAttachment[] = rest
    .filter((f) => !claimed.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, webViewLink: f.webViewLink }));

  return { key, name, sops, attachments };
}

/**
 * Walk the SOP root into categories. Each subfolder becomes a category; nested
 * subfolders become their own category keyed by path ("fullfillment/facebook-ads")
 * so "Fullfillment > Facebook Ads" stays distinct from a top-level "Facebook Ads".
 */
export async function buildSopTree(token: string, rootId: string): Promise<SopCategoryNode[]> {
  const out: SopCategoryNode[] = [];
  const visited = new Set<string>([rootId]);

  const walk = async (folderId: string, path: string[], depth: number): Promise<void> => {
    const children = await listFolderChildren(token, folderId);

    if (path.length > 0) {
      const node = buildCategory(path[path.length - 1], path.map(slugify).join("/"), children);
      // A folder that holds only subfolders is a shelf, not a category.
      if (node.sops.length > 0 || node.attachments.length > 0) out.push(node);
    }

    if (depth >= MAX_DEPTH) return;
    for (const child of children) {
      if (child.mimeType !== FOLDER_MIME) continue;
      if (isExcludedFolder(child.name)) continue;
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      await walk(child.id, [...path, child.name], depth + 1);
    }
  };

  // Docs sitting loose at the root become an implicit "General" category.
  const rootChildren = await listFolderChildren(token, rootId);
  const rootNode = buildCategory("General", "general", rootChildren);
  if (rootNode.sops.length > 0) out.push(rootNode);

  for (const child of rootChildren) {
    if (child.mimeType !== FOLDER_MIME) continue;
    if (isExcludedFolder(child.name)) continue;
    if (visited.has(child.id)) continue;
    visited.add(child.id);
    await walk(child.id, [child.name], 1);
  }

  return out;
}

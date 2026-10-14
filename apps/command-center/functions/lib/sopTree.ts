import { FOLDER_MIME, type DriveFile } from "./driveDirect";

// How the walk reads folders. Injected rather than imported so the tree does not
// care whether Drive is reached through our own OAuth grant or brokered by
// Composio; see driveComposio.ts for why there are two.
//
// PLURAL, and that is the whole point: the walk asks for a level at a time, not
// a folder at a time. Must answer with an entry for every id it was given, even
// an empty one.
export type ListFolders = (folderIds: string[]) => Promise<Map<string, DriveFile[]>>;

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
// The real folder reaches five levels deep, so a limit of 3 (what this shipped
// with) hid 27 of its 32 folders and 15 SOPs outright, including the whole Cold
// Email course. Six leaves headroom for a level Jake adds later without another
// silent disappearance. The bound stays because Drive folders are user-editable
// and a shortcut loop must not spin a Worker until it times out; `visited`
// already catches revisits, so this only guards genuine depth.
const MAX_DEPTH = 6;

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
  // The folders above this one, real Drive names, nearest last. Needed because
  // `name` is only the leaf: nested four deep, "Day 2: Find The Right People"
  // says nothing about living under Agency Acquisition > Cold Email. The key
  // cannot stand in for it, being slugified (lowercased, emoji stripped).
  trail: string[];
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
export function buildCategory(
  name: string,
  key: string,
  children: DriveFile[],
  trail: string[] = [],
): SopCategoryNode {
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

  return { key, name, trail, sops, attachments };
}

/** One folder, its contents, and the folders inside it. */
export interface SopFolderNode extends SopCategoryNode {
  folders: SopFolderNode[];
  // Own plus every descendant. A folder card says what is inside it without the
  // browser having to walk the subtree to find out.
  totalSops: number;
  totalFiles: number;
}

/** The SOP root: the folders in it, plus anything sitting loose at the top. */
export interface SopTree {
  folders: SopFolderNode[];
  sops: SopEntry[];
  attachments: SopAttachment[];
}

/**
 * Walk the SOP root into the folder hierarchy as Drive actually has it.
 *
 * This used to FLATTEN: every folder holding Docs became a top-level category and
 * the nesting was thrown away, so a two-folder Drive arrived as 25 sibling cards
 * with "Day 2: Find The Right People" next to "Client Sales". The hub browses the
 * tree instead, so the shape has to survive the walk.
 *
 * A folder with nothing in it is KEPT. Flattening dropped those as "shelves",
 * which is right for a flat list (an empty card says nothing) and wrong for a
 * browser: an empty folder is real structure Jake made, and hiding it means the
 * app disagrees with Drive about what exists.
 *
 * The walk is bounded and tracks visited ids: Drive folders are user-editable and
 * a shortcut loop must not spin a Worker until it times out.
 *
 * It reads BREADTH-first and builds depth-first, which is why the two halves are
 * separate below. Depth-first reading meant one Drive call per folder, 32 of them
 * in sequence on every load, and through Composio's shared quota that burst came
 * back 429. A level at a time is one call per level: six, for the same tree and
 * the same output.
 */
export async function buildSopTree(list: ListFolders, rootId: string): Promise<SopTree> {
  const visited = new Set<string>([rootId]);
  // What the read half hands the build half: every folder's children, and the
  // child folders each one actually claimed.
  const childrenById = new Map<string, DriveFile[]>();
  const walkedUnder = new Map<string, string[]>();

  // A folder reachable from two parents belongs to whichever claimed it first,
  // exactly as the depth-first walk decided it. Without that a Drive shortcut
  // loop would put a folder inside itself.
  const claim = (parentId: string, children: DriveFile[]): string[] => {
    const ids: string[] = [];
    for (const child of children) {
      if (child.mimeType !== FOLDER_MIME) continue;
      if (isExcludedFolder(child.name)) continue;
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      ids.push(child.id);
    }
    walkedUnder.set(parentId, ids);
    return ids;
  };

  const rootChildren = (await list([rootId])).get(rootId) ?? [];
  childrenById.set(rootId, rootChildren);

  let frontier = claim(rootId, rootChildren);
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const level = await list(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      const children = level.get(id) ?? [];
      childrenById.set(id, children);
      // At the bound the folder is still read, so its own SOPs survive; only
      // what sits below it is left out, which is what the depth limit means.
      if (depth < MAX_DEPTH) next.push(...claim(id, children));
      else walkedUnder.set(id, []);
    }
    frontier = next;
  }

  const build = (folderId: string, path: string[]): SopFolderNode => {
    const children = childrenById.get(folderId) ?? [];
    const own = buildCategory(
      path[path.length - 1],
      path.map(slugify).join("/"),
      children,
      path.slice(0, -1),
    );
    // Iterating `children` rather than the claimed ids keeps Drive's own
    // folder,name ordering.
    const claimed = new Set(walkedUnder.get(folderId) ?? []);
    const folders = children
      .filter((c) => claimed.has(c.id))
      .map((c) => build(c.id, [...path, c.name]));

    return {
      ...own,
      folders,
      totalSops: own.sops.length + folders.reduce((n, f) => n + f.totalSops, 0),
      totalFiles: own.attachments.length + folders.reduce((n, f) => n + f.totalFiles, 0),
    };
  };

  // Loose Docs and files at the root belong to no folder, so they sit at the top
  // level beside the folders rather than inside an invented "General" one.
  const rootOwn = buildCategory("General", "general", rootChildren);
  const rootClaimed = new Set(walkedUnder.get(rootId) ?? []);
  const folders = rootChildren
    .filter((c) => rootClaimed.has(c.id))
    .map((c) => build(c.id, [c.name]));

  return { folders, sops: rootOwn.sops, attachments: rootOwn.attachments };
}

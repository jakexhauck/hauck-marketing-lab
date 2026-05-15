export interface DriveFolder {
  name: string;
  id: string;
  url: string;
}

export type DriveNodeType = "folder" | "file";

export interface DriveNode {
  id: string;
  name: string;
  type: DriveNodeType;
  mimeType?: string;
  url?: string;
  children?: DriveNode[];
}

const ROW = /^\|\s*([^|]+?)\s*\|\s*`([A-Za-z0-9_-]{20,})`\s*\|/;

export function parseDriveFolders(body: string): DriveFolder[] {
  const out: DriveFolder[] = [];
  const seen = new Set<string>();
  for (const line of body.split("\n")) {
    const m = line.match(ROW);
    if (!m) continue;
    const name = m[1].trim();
    const id = m[2].trim();
    if (!name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      name,
      id,
      url: `https://drive.google.com/drive/folders/${id}`,
    });
  }
  return out;
}

/**
 * Pull the `## Tree` JSON block out of a drive-index body. Returns null when
 * the index was generated before the tree feature shipped (or when the block
 * is missing / unparseable) so callers can fall back to the flat folder list.
 */
export function parseDriveTree(body: string): DriveNode | null {
  // Locate the first fenced ```json ... ``` after a "## Tree" heading.
  const treeIdx = body.search(/^##\s+Tree\s*$/m);
  const searchFrom = treeIdx >= 0 ? treeIdx : 0;
  const sliced = body.slice(searchFrom);
  const fence = sliced.match(/```json\s*\n([\s\S]*?)```/);
  if (!fence) return null;
  try {
    const parsed = JSON.parse(fence[1]);
    return normalizeNode(parsed);
  } catch {
    return null;
  }
}

function normalizeNode(raw: unknown): DriveNode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  const name = typeof r.name === "string" ? r.name : null;
  if (!id || !name) return null;
  const type: DriveNodeType =
    r.type === "file" || r.type === "folder"
      ? r.type
      : Array.isArray(r.children)
        ? "folder"
        : "file";
  const node: DriveNode = { id, name, type };
  if (typeof r.mimeType === "string") node.mimeType = r.mimeType;
  if (typeof r.url === "string") node.url = r.url;
  else if (typeof (r as { webViewLink?: unknown }).webViewLink === "string")
    node.url = (r as { webViewLink: string }).webViewLink;
  if (type === "folder") {
    const kids = Array.isArray(r.children) ? r.children : [];
    node.children = kids
      .map(normalizeNode)
      .filter((n): n is DriveNode => n !== null);
  }
  return node;
}

export function driveNodeUrl(node: DriveNode): string {
  if (node.url) return node.url;
  if (node.type === "folder")
    return `https://drive.google.com/drive/folders/${node.id}`;
  return `https://drive.google.com/file/d/${node.id}/view`;
}

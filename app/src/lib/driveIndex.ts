export interface DriveFolder {
  name: string;
  id: string;
  url: string;
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

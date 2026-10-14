// The client's live website pages, stored as a manual per-tenant list in
// tenants.website_pages (0028) instead of read from GoHighLevel. The Website >
// Pages tab (client) and Web Design > Pages panel (admin) both need only an
// ordered { name, path } list; everything else (preview, address bar,
// Request-a-Change) is built by joining each path onto the tenant's website_url.
// The array order IS the display order.

export interface WebsitePageRow {
  name: string;
  path: string;
}

const NAME_MAX = 80;
const PATH_MAX = 200;
const LIST_MAX = 50;

// Normalize whatever is stored in / posted to website_pages into a clean list.
// Tolerant by design: the column is jsonb and the admin editor posts raw rows,
// so anything malformed collapses to [] or is dropped rather than throwing.
// Each kept row has a non-empty name and a path with exactly one leading slash.
export function sanitizeWebsitePages(input: unknown): WebsitePageRow[] {
  if (!Array.isArray(input)) return [];
  const rows: WebsitePageRow[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = (typeof r.name === "string" ? r.name : "").trim().slice(0, NAME_MAX);
    let path = (typeof r.path === "string" ? r.path : "").trim();
    if (!name || !path) continue;
    if (!path.startsWith("/")) path = `/${path}`;
    path = path.slice(0, PATH_MAX);
    rows.push({ name, path });
    if (rows.length >= LIST_MAX) break;
  }
  return rows;
}

// Wire shape the Pages panels consume. id = path: paths are the stable page key
// change requests already reference (r.page === p.path), so reusing it keeps a
// request pinned to its page even as rows are reordered.
export function toPageItems(
  rows: WebsitePageRow[],
): { id: string; name: string; path: string }[] {
  return rows.map((r) => ({ id: r.path, name: r.name, path: r.path }));
}

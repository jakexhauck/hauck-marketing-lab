// Pure helpers for the admin Build Lab: parse a vault/Plans/Builds/*.md plan
// file (flat YAML frontmatter) into a BuildItem, and group items into the four
// status columns. No IO here so it stays unit-testable; the function endpoint
// does the GitHub fetch and hands raw markdown to parseBuildPlan.

export type BuildStatus = "idea" | "building" | "ready" | "done";

export interface BuildFile {
  slug: string; // filename without .md
  raw: string; // full markdown contents
}

export interface BuildItem {
  slug: string;
  title: string;
  status: BuildStatus;
  kind: string;
  issue: number;
  issueUrl: string | null;
  planUrl: string;
  created: string;
}

export const REPO = "jakexhauck/hauck-marketing-lab";
const BRANCH = "main";
const BUILDS_DIR = "vault/Plans/Builds";

export const BUILD_STATUS_ORDER: BuildStatus[] = ["idea", "building", "ready", "done"];

export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  idea: "Ideas",
  building: "Building",
  ready: "Ready",
  done: "Done",
};

function coerceStatus(v: string): BuildStatus {
  const s = v.trim().toLowerCase();
  return s === "building" || s === "ready" || s === "done" ? s : "idea";
}

// Strip one layer of matching surrounding quotes from a scalar value.
function unquote(v: string): string {
  const t = v.trim();
  if (
    t.length >= 2 &&
    ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

// Parse a flat `key: value` frontmatter block (the only shape our plans use).
function parseFrontmatter(raw: string): Record<string, string> | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    out[key] = unquote(line.slice(idx + 1));
  }
  return out;
}

export function parseBuildPlan(file: BuildFile): BuildItem | null {
  const fm = parseFrontmatter(file.raw);
  if (!fm) return null;
  const status = coerceStatus(fm.status ?? "");
  const issue = Number.parseInt(fm.issue ?? "", 10);
  const issueNum = Number.isFinite(issue) && issue > 0 ? issue : 0;
  const kind = (fm.kind ?? "").trim() || "feature";
  return {
    slug: file.slug,
    title: (fm.title ?? "").trim() || file.slug,
    status,
    kind,
    issue: issueNum,
    issueUrl: issueNum > 0 ? `https://github.com/${REPO}/issues/${issueNum}` : null,
    planUrl: `https://github.com/${REPO}/blob/${BRANCH}/${BUILDS_DIR}/${file.slug}.md`,
    created: (fm.created ?? "").trim(),
  };
}

export function groupByStatus(items: BuildItem[]): Record<BuildStatus, BuildItem[]> {
  const out: Record<BuildStatus, BuildItem[]> = {
    idea: [],
    building: [],
    ready: [],
    done: [],
  };
  for (const it of items) out[it.status].push(it);
  return out;
}

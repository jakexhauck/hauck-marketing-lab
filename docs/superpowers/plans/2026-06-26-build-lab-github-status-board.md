# Build Lab GitHub Status Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the command-center admin Build Lab into a read-only, GitHub-backed board that visualizes the idea/building/ready/done status of Hermes + Claude builds, sourced from `vault/Plans/Builds/*.md`.

**Architecture:** A thin admin-gated Cloudflare Pages Function authenticates to GitHub and returns the raw markdown of every plan under `vault/Plans/Builds/`. All parsing/grouping lives in a pure, unit-tested `src/lib/builds.ts` used by the rewritten `AdminBuild.tsx`, which polls the endpoint and renders four columns.

**Tech Stack:** React 19 + Vite, TypeScript (strict), Cloudflare Pages Functions, Vitest (node env), GitHub REST API (git trees + contents).

## Global Constraints

- No em dashes anywhere (code, comments, UI text). Use commas, periods, colons.
- Match existing patterns: functions are `PagesFunction<Env, string, ApiData>` exporting `onRequestGet`; admin routes are gated in `functions/api/_middleware.ts` (handler reads `ctx.data.admin`); responses via `Response.json`.
- Tests live at `src/**/*.test.ts` (vitest include). Pure logic goes in `src/lib`.
- Repo for all GitHub calls + URLs: `jakexhauck/hauck-marketing-lab`, branch `main`.
- Board reads ONLY `vault/Plans/Builds/`. Statuses: `idea` | `building` | `ready` | `done`.
- Verify before done: `npm run typecheck` and `npm run test` from `command-center/app`.

---

### Task 1: Pure builds library (parse + group)

**Files:**
- Create: `command-center/app/src/lib/builds.ts`
- Test: `command-center/app/src/lib/builds.test.ts`

**Interfaces:**
- Produces:
  - `type BuildStatus = "idea" | "building" | "ready" | "done"`
  - `interface BuildItem { slug: string; title: string; status: BuildStatus; kind: string; issue: number; issueUrl: string | null; planUrl: string; created: string }`
  - `interface BuildFile { slug: string; raw: string }`
  - `function parseBuildPlan(file: BuildFile): BuildItem | null`
  - `const BUILD_STATUS_ORDER: BuildStatus[]`
  - `const BUILD_STATUS_LABEL: Record<BuildStatus, string>`
  - `function groupByStatus(items: BuildItem[]): Record<BuildStatus, BuildItem[]>`

- [ ] **Step 1: Write the failing test**

```ts
// command-center/app/src/lib/builds.test.ts
import { describe, it, expect } from "vitest";
import {
  parseBuildPlan,
  groupByStatus,
  BUILD_STATUS_ORDER,
  type BuildItem,
} from "./builds";

const md = (fm: string, body = "# Body") => `---\n${fm}\n---\n\n${body}\n`;

describe("parseBuildPlan", () => {
  it("parses frontmatter into a BuildItem with derived urls", () => {
    const item = parseBuildPlan({
      slug: "autosave-onboarding",
      raw: md(
        [
          'type: plan',
          'title: "Autosave onboarding"',
          'status: building',
          'kind: feature',
          'issue: 42',
          'created: "2026-06-26T10:00:00.000Z"',
        ].join("\n"),
      ),
    });
    expect(item).toEqual({
      slug: "autosave-onboarding",
      title: "Autosave onboarding",
      status: "building",
      kind: "feature",
      issue: 42,
      issueUrl: "https://github.com/jakexhauck/hauck-marketing-lab/issues/42",
      planUrl:
        "https://github.com/jakexhauck/hauck-marketing-lab/blob/main/vault/Plans/Builds/autosave-onboarding.md",
      created: "2026-06-26T10:00:00.000Z",
    });
  });

  it("coerces an unknown status to idea and defaults missing fields", () => {
    const item = parseBuildPlan({ slug: "x", raw: md("title: X\nstatus: wat") });
    expect(item?.status).toBe("idea");
    expect(item?.kind).toBe("feature");
    expect(item?.issue).toBe(0);
    expect(item?.issueUrl).toBeNull();
  });

  it("falls back to the slug when title is missing", () => {
    const item = parseBuildPlan({ slug: "my-thing", raw: md("status: done") });
    expect(item?.title).toBe("my-thing");
  });

  it("returns null when there is no frontmatter block", () => {
    expect(parseBuildPlan({ slug: "x", raw: "# just a heading\n" })).toBeNull();
  });
});

describe("groupByStatus", () => {
  it("buckets items by status in declared column order", () => {
    const mk = (slug: string, status: BuildItem["status"]): BuildItem => ({
      slug, title: slug, status, kind: "feature", issue: 0, issueUrl: null,
      planUrl: "", created: "",
    });
    const grouped = groupByStatus([mk("a", "done"), mk("b", "idea"), mk("c", "done")]);
    expect(Object.keys(grouped)).toEqual(BUILD_STATUS_ORDER);
    expect(grouped.done.map((i) => i.slug)).toEqual(["a", "c"]);
    expect(grouped.idea.map((i) => i.slug)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npx vitest run src/lib/builds.test.ts`
Expected: FAIL (Cannot find module './builds').

- [ ] **Step 3: Write minimal implementation**

```ts
// command-center/app/src/lib/builds.ts
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
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
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
  const out: Record<BuildStatus, BuildItem[]> = { idea: [], building: [], ready: [], done: [] };
  for (const it of items) out[it.status].push(it);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd command-center/app && npx vitest run src/lib/builds.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/builds.ts command-center/app/src/lib/builds.test.ts
git commit -m "feat(build-lab): pure builds parser + status grouping"
```

---

### Task 2: Backend endpoint + env

**Files:**
- Create: `command-center/app/functions/api/admin/builds.ts`
- Modify: `command-center/app/functions/lib/env.ts` (add `GITHUB_TOKEN?` and `GITHUB_REPO?`)

**Interfaces:**
- Consumes: `Env`, `ApiData` from `functions/lib/env`.
- Produces: `GET /api/admin/builds` -> `{ files: { slug: string; raw: string }[] }` (admin-gated). Errors: 503 `{ error: "github not configured" }` when no token; 502 `{ error }` on GitHub failure.

- [ ] **Step 1: Add env fields**

In `command-center/app/functions/lib/env.ts`, inside `interface Env`, after the `GOOGLE_OAUTH_*` block:

```ts
  // Build Lab reads vault/Plans/Builds/*.md from the repo over the GitHub REST
  // API. GITHUB_TOKEN is a contents-read (the workflow token, contents+issues
  // read/write, also works). GITHUB_REPO defaults to jakexhauck/hauck-marketing-lab.
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
```

- [ ] **Step 2: Write the endpoint**

```ts
// command-center/app/functions/api/admin/builds.ts
import type { Env, ApiData } from "../../../lib/env";

// GET /api/admin/builds  (admin-only, gated in _middleware.ts)
// Thin authenticated GitHub proxy: list vault/Plans/Builds/*.md on the default
// branch and return each file's raw markdown. All parsing happens client-side
// in src/lib/builds.ts so it stays unit-tested. Response is edge-cached ~60s to
// stay well under the authenticated GitHub rate limit when the board polls.

const DIR = "vault/Plans/Builds";
const BRANCH = "main";
const CACHE_TTL = 60;

interface TreeEntry { path: string; type: string }

async function gh(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hml-build-lab",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = ctx.env.GITHUB_TOKEN;
  if (!token) return Response.json({ error: "github not configured" }, { status: 503 });
  const repo = ctx.env.GITHUB_REPO || "jakexhauck/hauck-marketing-lab";

  // Edge cache lookup.
  const cache = caches.default;
  const cacheKey = new Request(new URL(ctx.request.url).origin + "/__cache/admin/builds");
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // 1. One recursive tree call, filter to our folder.
  const treeRes = await gh(
    `https://api.github.com/repos/${repo}/git/trees/${BRANCH}?recursive=1`,
    token,
  );
  if (!treeRes.ok) {
    return Response.json(
      { error: `github tree ${treeRes.status}` },
      { status: 502 },
    );
  }
  const tree = (await treeRes.json()) as { tree?: TreeEntry[] };
  const paths = (tree.tree ?? [])
    .filter((e) => e.type === "blob" && e.path.startsWith(`${DIR}/`) && e.path.endsWith(".md"))
    .map((e) => e.path);

  // 2. Fetch raw markdown for each plan (parallel).
  const files = await Promise.all(
    paths.map(async (path) => {
      const res = await gh(
        `https://api.github.com/repos/${repo}/contents/${path}?ref=${BRANCH}`,
        token,
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { content?: string; encoding?: string };
      const raw =
        json.encoding === "base64" && json.content
          ? atob(json.content.replace(/\n/g, ""))
          : "";
      const slug = path.slice(DIR.length + 1).replace(/\.md$/i, "");
      return { slug, raw };
    }),
  );

  const body = { files: files.filter((f): f is { slug: string; raw: string } => f !== null) };
  const out = Response.json(body, {
    headers: { "Cache-Control": `max-age=${CACHE_TTL}` },
  });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
};
```

- [ ] **Step 3: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add command-center/app/functions/api/admin/builds.ts command-center/app/functions/lib/env.ts
git commit -m "feat(build-lab): admin GitHub proxy endpoint for build plans"
```

---

### Task 3: Rewrite AdminBuild.tsx as a live board, remove old buildLab

**Files:**
- Modify (full rewrite): `command-center/app/src/routes/admin/AdminBuild.tsx`
- Delete: `command-center/app/src/lib/buildLab.ts`

**Interfaces:**
- Consumes: `parseBuildPlan`, `groupByStatus`, `BUILD_STATUS_ORDER`, `BUILD_STATUS_LABEL`, `type BuildItem`, `type BuildFile` from `../../lib/builds`.

- [ ] **Step 1: Confirm no other importer of buildLab.ts**

Run: `cd command-center/app && grep -rl "lib/buildLab" src` 
Expected: only `src/routes/admin/AdminBuild.tsx` (which we replace). If anything else appears, stop and reassess.

- [ ] **Step 2: Rewrite the page**

```tsx
// command-center/app/src/routes/admin/AdminBuild.tsx
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Hammer, CheckCircle2, PackageCheck, ExternalLink, RefreshCw } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import {
  parseBuildPlan,
  groupByStatus,
  BUILD_STATUS_ORDER,
  BUILD_STATUS_LABEL,
  type BuildItem,
  type BuildFile,
  type BuildStatus,
} from "../../lib/builds";

// Build Lab. A read-only, live status board over the Hermes build pipeline. Each
// card is a plan file in vault/Plans/Builds/ on the repo; Hermes files them and
// the builder moves them idea -> building -> ready -> done. We poll the admin
// GitHub proxy and render the four columns. No capture/edit here: state is owned
// by Hermes + the builder through the repo. See docs/superpowers/specs/2026-06-26.

const POLL_MS = 30_000;

const STATUS_ICON: Record<BuildStatus, typeof Sparkles> = {
  idea: Sparkles,
  building: Hammer,
  ready: PackageCheck,
  done: CheckCircle2,
};

export default function AdminBuild() {
  const [items, setItems] = useState<BuildItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/builds");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `request failed (${res.status})`);
      }
      const { files } = (await res.json()) as { files: BuildFile[] };
      const parsed = files
        .map(parseBuildPlan)
        .filter((i): i is BuildItem => i !== null)
        .sort((a, b) => (b.created || "").localeCompare(a.created || ""));
      setItems(parsed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not load builds");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  const grouped = useMemo(() => groupByStatus(items ?? []), [items]);
  const buildingCount = grouped.building.length;
  const doneCount = grouped.done.length;

  return (
    <DesktopPage
      title="Build Lab"
      subtitle="Live status of what Hermes and the builder are shipping"
      actions={
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[13px] text-text hover:bg-bg"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      }
    >
      <div className="mb-4 flex gap-4 text-[13px] text-faint">
        <span><span className="font-semibold text-text">{buildingCount}</span> building</span>
        <span><span className="font-semibold text-text">{doneCount}</span> shipped</span>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius)] border border-border bg-surface p-4 text-[14px] text-text">
          Could not load builds: {error}
        </div>
      )}

      {items === null && !error ? (
        <div className="text-[14px] text-faint">Loading builds...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BUILD_STATUS_ORDER.map((status) => {
            const Icon = STATUS_ICON[status];
            const col = grouped[status];
            return (
              <section key={status} className="rounded-[var(--radius)] border border-border bg-surface p-3">
                <header className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-text">
                  <Icon size={15} />
                  {BUILD_STATUS_LABEL[status]}
                  <span className="ml-auto text-faint">{col.length}</span>
                </header>
                <div className="flex flex-col gap-2">
                  {col.length === 0 ? (
                    <p className="px-1 py-3 text-[13px] text-faint">Nothing here.</p>
                  ) : (
                    col.map((item) => <BuildCardView key={item.slug} item={item} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </DesktopPage>
  );
}

function BuildCardView({ item }: { item: BuildItem }) {
  return (
    <article className="rounded-[var(--radius)] border border-border bg-bg p-3">
      <h3 className="text-[14px] font-medium text-text">{item.title}</h3>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-faint">
        <span className="rounded-full border border-border px-2 py-0.5">{item.kind}</span>
        {item.issueUrl && (
          <a href={item.issueUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text">
            #{item.issue} <ExternalLink size={11} />
          </a>
        )}
        <a href={item.planUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 hover:text-text">
          plan <ExternalLink size={11} />
        </a>
      </div>
    </article>
  );
}
```

NOTE: `DesktopPage` props (`title`, `subtitle`, `actions`) must match the existing component. Before writing, open `command-center/app/src/components/desktop/DesktopPage.tsx` and adapt prop names/structure to whatever it actually exposes. Same for the styling tokens (`bg-surface`, `border-border`, `text-faint`, `var(--radius)`): use whatever the neighboring admin pages use.

- [ ] **Step 3: Delete the obsolete module**

```bash
git rm command-center/app/src/lib/buildLab.ts
```

- [ ] **Step 4: Typecheck + build + tests**

Run: `cd command-center/app && npm run typecheck && npm run test`
Expected: PASS, no references to the deleted `buildLab`.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/routes/admin/AdminBuild.tsx
git commit -m "feat(build-lab): live read-only status board over Hermes pipeline"
```

---

### Task 4: Live wiring + smoke test (needs the GitHub token)

**Files:** none (config + verification).

- [ ] **Step 1: Set the Cloudflare secret**

Run (from `command-center/app`, token provided by Jake):
`node scripts/cf.mjs env:set GITHUB_TOKEN <token>`
(Confirm the exact cf.mjs subcommand by reading the script first; match how other secrets are set.)

- [ ] **Step 2: Seed one test plan**

Create `vault/Plans/Builds/board-smoke-test.md`:

```markdown
---
type: plan
title: "Board smoke test"
status: building
kind: feature
issue: 0
created: "2026-06-26T00:00:00.000Z"
---

# Board smoke test

> Temporary card to confirm the Build Lab renders. Delete after verifying.
```

Commit + push so the repo has it.

- [ ] **Step 3: Deploy and verify live**

Deploy per the project's normal flow, open the admin Build Lab, confirm the card shows in the Building column with a working "plan" link. Capture a screenshot (Playwright or browser) as evidence.

- [ ] **Step 4: Remove the seed**

`git rm vault/Plans/Builds/board-smoke-test.md`, commit, push.

---

## Self-Review

- **Spec coverage:** data model (Task 1 parse), `vault/Plans/Builds/` scoping (Task 2 filter + Task 1 urls), endpoint + cache + token (Task 2), four-column read-only board + polling + counters + states (Task 3), secret + labels + smoke (Task 4). Labels (`for-builder`/`needs-review`/`done`) are created via the GitHub side (Hermes / one-time `gh`), not app code, so no task owns them beyond the Hermes rundown. Covered.
- **Placeholder scan:** none; all code present. The two NOTEs in Task 3 are deliberate "verify against real component" guards, not deferred work.
- **Type consistency:** `BuildItem`, `BuildFile`, `BuildStatus`, `parseBuildPlan`, `groupByStatus`, `BUILD_STATUS_ORDER`, `BUILD_STATUS_LABEL` names identical across Tasks 1, 2, 3. Endpoint returns `{ files: BuildFile[] }`, consumed as such in Task 3.

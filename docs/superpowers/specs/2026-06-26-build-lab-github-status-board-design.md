# Build Lab: GitHub-backed status board — Design

Date: 2026-06-26
Status: approved (Jake, 2026-06-26)

## Goal

Repurpose the command-center admin **Build Lab** from a localStorage idea board
into a **read-only, GitHub-backed live status board** that visualizes the builds
Hermes (Jake's ops agent) and Claude Code (builder) are working on, as part of the
three-party Hermes build workflow. Jake watches progress; he no longer captures
ideas in this view (Hermes does that via Telegram).

## Source of truth

Build-pipeline plans live as markdown files in the repo at:

```
vault/Plans/Builds/<kebab-slug>.md
```

Frontmatter (the only fields the board reads):

| key       | type   | values                                                  |
| --------- | ------ | ------------------------------------------------------- |
| `type`    | string | `plan`                                                  |
| `title`   | string | short display name                                      |
| `status`  | string | `idea` \| `building` \| `ready` \| `done`               |
| `kind`    | string | `feature`/`backend`/`landing`/`static`/`bugfix`/`new-project` (badge only) |
| `issue`   | number | GitHub issue number (0 until filed)                     |
| `created` | string | ISO timestamp                                           |

Legacy plans elsewhere in `vault/Plans/` are never read; the board scopes to the
`Builds/` folder only, so there is no collision with legacy `draft`/`ready`/`parked`
statuses.

Status is owned as follows: Hermes sets `idea`; the builder sets `building` →
`ready` → `done`. The board keys entirely off frontmatter `status`. The GitHub
issue is a click-through link only (the board does not read issue labels in v1).

## Architecture

### Backend: one new Cloudflare Pages Function

`GET /api/admin/builds` (admin-auth gated, same pattern as other admin endpoints).

1. Read GitHub token from a Cloudflare secret (`GITHUB_TOKEN`), scope contents
   read (the workflow token is contents+issues read/write; the same token works).
2. Call the GitHub Git Trees API once, recursively, for the default branch, and
   filter entries under `vault/Plans/Builds/` ending in `.md`.
3. Fetch each matching blob, parse YAML frontmatter, map to a `BuildItem`.
4. Return JSON `{ items: BuildItem[] }`, sorted newest-first within status.
5. Cache the response ~30-60s (Cache API or in-function memo) to avoid hammering
   the GitHub API and to stay under rate limits.

`BuildItem` shape returned to the client:

```ts
interface BuildItem {
  slug: string;          // filename without .md
  title: string;
  status: "idea" | "building" | "ready" | "done";
  kind: string;
  issue: number;         // 0 = not filed
  issueUrl: string | null;
  planUrl: string;       // GitHub blob URL on the default branch
  created: string;       // ISO; "" when missing
}
```

URL formats:
- issue: `https://github.com/jakexhauck/hauck-marketing-lab/issues/<n>`
- plan:  `https://github.com/jakexhauck/hauck-marketing-lab/blob/main/vault/Plans/Builds/<slug>.md`

### Frontend: rewrite `AdminBuild.tsx`

- Drop localStorage, the composer, the prompt generator, and drag-to-move.
- Fetch `/api/admin/builds` on mount; poll every ~30s for live updates.
- Render four columns: **Ideas → Building → Ready → Done**.
- Card: title, `kind` badge, link to GitHub issue (if `issue > 0`), link to plan file.
- Keep lightweight momentum signals: a "done" counter and a "building" counter.
- States: loading skeleton, empty (no build plans yet), error (token/API failure).

`command-center/app/src/lib/buildLab.ts` is reduced to the new `BuildItem` type,
status constants, and any pure helpers the board needs. The old card/prompt
machinery is removed.

## Secrets / tokens

- Cloudflare Pages secret `GITHUB_TOKEN` on the command-center project: the
  read-write contents+issues token (read is all the board needs).
- Hermes uses its own contents+issues read-write token on the VPS.
- Repo is private, so the token is required to read file contents.

## GitHub labels (one-time setup)

`for-builder`, `needs-review`, `done` created on the repo.

## Testing

- Unit: frontmatter parsing + `BuildItem` mapping (pure function, table-driven:
  valid file, missing fields, bad status coerced/skipped, non-`.md` ignored).
- Unit: status grouping/sorting for the board.
- Manual smoke (needs token): seed one plan in `vault/Plans/Builds/`, hit the
  endpoint, confirm it appears in the right column with working links.

## Out of scope (v1, YAGNI)

In-app idea capture, drag-to-move, writing back to GitHub from the app,
websockets/realtime (polling is enough), reading issue labels for state.

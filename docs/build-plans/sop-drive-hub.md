# SOP Hub, backed by Google Drive

Spec and implementation plan, combined. 2026-07-21.

## Why

The admin has no SOP hub. `adminPillars.ts` Operations has three tabs (Calculator,
Time Audit, Tasks) and no SOPs. The dead `pillars.ts` still renders an "Open SOP Hub"
link to `/admin/sops`, a route that does not exist on main, so that link 404s today.

Meanwhile `src/lib/sopData.ts` carries 125 hardcoded SOPs from the Local Ads School
course. Every one of the 125 bodies is the same placeholder string:

> "Original training video above. Step-by-step SOP to be written from the video."

Zero SOPs have written steps. It is 125 Loom links wearing an SOP shape, orphaned,
imported by nothing but its own test.

Jake has real SOPs, already written, already organised, in Google Drive at
`My Drive / 🌟 Hauck Marketing 🌟 / SOPs Templates`. Roughly 28 Google Docs across
four categories, with number prefixes for ordering and paired `.mp4` videos.

## Decision

Google Drive is the single source of truth for SOP content. Nothing is copied into
the repo, and nothing is authored in-app.

Rejected: an in-app editor with SOPs in Supabase. It means building a rich text
editor, autosave, and version history, and the result is a worse writing experience
than the Google Docs Jake already has. The bottleneck is authoring, not display.

Consequence accepted: SOPs go blank if the Drive connection lapses. Same single
agency account the Assets hub already depends on, so this is not new risk.

## Mapping

Jake's existing folder convention already encodes everything the app needs.

| Drive                                   | App                          |
| --------------------------------------- | ---------------------------- |
| Subfolder (`Sales`, `Fullfillment/…`)   | Category                     |
| Google Doc                              | One SOP page                 |
| `3.` filename prefix                    | Sort order                   |
| `1. X.mp4` paired with `1.1 X.gdoc`     | Video attached to that SOP   |
| Sheets, PDFs, images, `.lnk`            | Category attachments, link out |

Adding an SOP is creating a Doc in the right folder. No deploy.

Confirmed with Jake:

- The 125 Local Ads School entries are **replaced**. `sopData.ts` is deleted.
- Docs render as pages. Everything else is listed as an attachment linking to Drive.

Skipped: `EXAMPLE CLIENT FOLDER` is empty scaffolding, not content. Excluded by name.

## Architecture

Read path, admin only, gated centrally by `functions/api/_middleware.ts` on the
`/api/admin/` prefix.

```
/admin/pillar/operations?tab=sops
  -> GET /api/admin/sops
       walk SOP root folder (listFolderChildren, recursive, depth <= 3)
       -> { categories: [{ key, name, sops: [...], attachments: [...] }] }
  -> GET /api/admin/sops/doc/:fileId
       export Doc as text/html -> sanitize -> cache -> { title, html }
```

### Drive root

Folder id comes from `SOP_DRIVE_FOLDER_ID`. When unset, the tab renders a setup
state rather than guessing or fabricating. No folder id is hardcoded in the repo.

### Caching

Doc export is slow (roughly 300 to 800ms per Doc) and the tree walk is several API
calls. Two caches, both keyed so a Drive edit invalidates naturally.

- `sop_doc_cache` keyed by `file_id`, storing `modified_time` and rendered `html`.
  On read, compare Drive's `modifiedTime`; re-export only on mismatch.
- Tree listing cached in-memory per worker request only. No stale tree persisted.

### HTML sanitizing

Google's `text/html` export is hostile: inline styles on every node, `<span>` soup,
class names like `c3 c17`, wrapping `<html><head><style>`. `sopHtml.ts` reduces it
to a clean subset and is the single most fragile piece of this build, so it is pure
and unit tested.

Keep: `h1-h4, p, ul, ol, li, strong, em, a[href], img[src], table, thead, tbody, tr, td, th, br, blockquote, code, pre`
Drop: all `style`, `class`, `id` attributes, `<style>`, `<script>`, `<meta>`, empty spans.
Unwrap: `<span>` with no semantic meaning, Google's redirect wrapper on `<a href>`.

## Files

New:

1. `supabase/migrations/00XX_sop_doc_cache.sql` — cache table, RLS on, no policies
   (service role only), matching 0017's shape. Number picked at push time.
2. `functions/lib/sopTree.ts` — folder walk, `parseOrderPrefix`, `pairVideosToDocs`,
   `isExcludedFolder`, category assembly. Pure where possible.
3. `functions/lib/sopHtml.ts` — Google Doc HTML to clean HTML. Pure.
4. `functions/api/admin/sops/index.ts` — the tree.
5. `functions/api/admin/sops/doc/[fileId].ts` — one Doc, cached.
6. `src/hooks/useSopHub.ts` — follows `useAdminTaskList.ts` exactly.
7. `src/components/admin/operations/SopsTab.tsx` — the tab plus its `<style>` block.

Modified:

8. `functions/lib/driveDirect.ts` — add `exportDocHtml()`. Does **not** touch
   `GOOGLE_EXPORT_MIME`; Assets depends on Docs exporting as PDF.
9. `functions/lib/env.ts` — declare `SOP_DRIVE_FOLDER_ID`.
10. `src/lib/adminPillars.ts` — add `{ id: "sops", label: "SOPs", ready: true }`.
11. `src/routes/admin/PillarPage.tsx` — add `case "sops"`.
12. `src/lib/sopTriage.ts` — retarget from `sopData` types to the Drive types.
13. `src/lib/sopTriage.test.ts` — same retarget.

Deleted:

14. `src/lib/sopData.ts` — all 125 placeholders.

Reused as-is, no change: `functions/api/admin/sop-flags/index.ts` and migration
0017. The triage checkbox feature keys on `(cat_key, slug)`, both of which the
Drive tree still produces.

## Conventions to match

Verified against `OperationsTasksTab.tsx` and `useAdminTaskList.ts`:

- No react-query in the admin console. Custom hook, `api()`, `useState`/`useEffect`,
  `cancelled` guard on every setter.
- Mutations optimistic with rollback in `catch`, no re-fetch.
- Component default-exported, no props, renders only its body. The kicker, title and
  tabs belong to `PillarPage`.
- Inline `<style>` block colocated at the bottom, every selector prefixed `.pk-kit `,
  namespace `sop`. Dark mode via `[data-theme="dark"]`.
- Do not mount `PillarStyle` again; `AdminLayout.tsx:132` already does.
- State ladder in order: error, loading, empty, content. Nothing fabricates data.

## Testing

TDD on the two pure modules, which is where the real risk lives.

- `sopTree.test.ts` — order prefix parsing (`3.`, `1.1`, unprefixed), video/doc
  pairing by number, excluded folders, nesting, categories with no Docs.
- `sopHtml.test.ts` — style/class stripping, span unwrapping, Google redirect
  unwrapping, script rejection, malformed input, entity preservation.

Not unit tested: the Drive fetch itself. Verified live against the real folder.

## Verification

1. `npm run typecheck` and `npm test` green.
2. Live: connect Drive, open the tab, confirm the four real categories render and
   one Doc renders readably.
3. Assert served bundle hash matches the fresh build before trusting the browser,
   per standing rule, with a cache-buster query param.

## Blocked on Jake

`drive_connection` is **empty**. Verified against prod (local and prod share the
Supabase project `aroapsjifblscheshmst`). Drive has never been connected, so the
Assets OAuth flow was built and never clicked through.

`GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are set in Doppler.
`GOOGLE_OAUTH_REDIRECT` is absent but optional, defaulting correctly.

The connecting account must be **`contact.jakehauck@gmail.com`**, which owns the
SOPs folder. Connecting as `jdhauckmonetization@gmail.com` yields a 403 and an
empty hub. This is admin-gated and a session cannot be minted, so only Jake can do it.

Everything here ships and sits dark until that click.

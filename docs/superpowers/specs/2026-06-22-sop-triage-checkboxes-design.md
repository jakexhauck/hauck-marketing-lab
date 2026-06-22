# SOP Triage Checkboxes — Design

Date: 2026-06-22
Status: Approved (design), pending implementation plan

## Goal

Add a checkbox to every SOP row in the Command Center admin SOP Hub. Ticking a box flags that
SOP as "consider for an SOP checklist" (Jake's triage signal). Unticked SOPs are simply ignored
when building checklists; nothing is deleted or hidden. Jake ticks at his own pace, then tells me
which to build.

This replaces hand-editing the `Action` column in `docs/sop-source/local-ads-school-inventory.md`
with a visual, persisted, in-app workflow.

## Scope

- Per-SOP checkbox in the admin SOP Hub list (`AdminSops.tsx`).
- A "selected" count on each module/category header.
- A "Show selected only" filter toggle at the top of the hub.
- Persistence in Supabase so selections survive reloads and are readable by me to drive the build.

Out of scope: any public/team-facing status badge; changes to the SOP detail page; writing the SOPs
themselves; touching the client-facing SOP hub.

## Meaning of a tick

A private triage signal between Jake and me only. No "Queued for SOP" badge for the team. The flag's
sole job is to record "consider this lesson when we build checklists."

## Data model

New migration `command-center/app/supabase/migrations/0017_admin_sop_flags.sql`:

```sql
create table if not exists public.admin_sop_flags (
  cat_key    text not null,
  slug       text not null,
  considered boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (cat_key, slug)
);
```

- Flags are global (shared across super-admins), not per-admin. Jake is the one triaging; a shared
  list is simplest and matches the single-operator reality.
- Composite PK `(cat_key, slug)` is the upsert target.
- Service-role access only (consistent with other admin tables); no RLS, never exposed to the browser
  directly. All reads/writes go through admin-authed Functions.
- Applied via `npm run db:migrate` (never the SQL editor), per project convention.

## API (Cloudflare Functions, admin-authed)

Two endpoints under the existing `/api/admin/*` surface, gated by the same admin session check as
other admin routes:

- `GET /api/admin/sop-flags`
  - Returns `{ flags: Array<{ catKey: string; slug: string }> }` — only the currently-considered SOPs.
- `PUT /api/admin/sop-flags`
  - Body: `{ catKey: string; slug: string; considered: boolean }`.
  - `considered: true` upserts the row; `considered: false` deletes it. Returns `{ ok: true }`.

Both return 401 when not an admin. Unconfigured Supabase degrades gracefully (GET returns empty,
PUT returns a soft error the UI can surface without crashing).

## Frontend (`AdminSops.tsx`)

State:
- `considered: Set<string>` keyed by `\`${catKey}/${slug}\``, loaded from `GET /api/admin/sop-flags` on mount.
- `selectedOnly: boolean` for the filter toggle.

Row layout change:
- Each row is currently a single `<Link class="hsop-row">`. Restructure to a flex container holding:
  1. a checkbox (`<input type="checkbox">` styled), and
  2. the existing `<Link>` for the rest of the row (emoji/title/desc/arrow).
- The checkbox lives OUTSIDE the `<Link>` so clicking it toggles the flag and never navigates.

Toggle behavior (mirrors the existing admin Tasks checkbox pattern):
- Optimistic: flip membership in `considered` immediately.
- Call `PUT /api/admin/sop-flags`; on failure, roll back and surface a small inline error.

Header count:
- Each category header shows `N selected` when N > 0 (count of considered slugs in that category).

Filter:
- A "Show selected only" toggle at the top. When on, render only considered SOPs and hide categories
  with zero selected.

## Testing

- Pure helpers extracted and unit-tested with the existing Vitest setup (`vitest.config.ts` already in repo):
  - `flagKey(catKey, slug)` and the selected-count / selected-only filtering logic live in a small pure
    module (e.g., `src/lib/sopTriage.ts`) and are covered by `sopTriage.test.ts`.
- The component wiring and Functions are verified manually (M9 visual proof): Playwright screenshot of
  the hub showing checkboxes, a ticked state persisting across reload, and the "Show selected only" filter.

## Reading selections (for the build step)

Because flags live in Supabase, I read the considered set directly (via the admin API or a Supabase
query) when Jake says "go," so the SOP-building work targets exactly what he ticked.

## Success criteria

- A working checkbox on every SOP row that persists across reloads.
- Per-category "N selected" counts and a "Show selected only" filter.
- Selections stored in `admin_sop_flags` and readable by me.
- No public status badge; client SOP hub and SOP detail page unchanged.
- Pure triage helpers unit-tested; the live feature screenshot-verified.

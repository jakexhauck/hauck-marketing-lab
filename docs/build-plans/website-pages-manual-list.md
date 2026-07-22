# Website > Pages: manual per-client page list (drop GHL)

## Problem

The Website > Pages tab (client app) and Web Design > Pages panel (admin cockpit)
both list pages by calling the GoHighLevel funnels API and filtering for the
`type === "website"` funnel. That path is being retired: it depends on a
per-client GHL token carrying the Funnels/Sites scope, which is fragile and, per
Jake, not the route we want. Live symptom: the tab silently shows its
not-connected empty state whenever the deployed token can't read funnels.

## Decision (approved)

Source the page list from a **manual per-client list** the admin edits in-app.
No GHL calls, no crawling. The tab needs only an ordered `{ name, path }` list;
preview/address/Request-a-Change are already built by joining `path` onto the
client's `website_url`.

- Storage: one JSONB column `tenants.website_pages`, default `[]`.
  Shape: `[{ "name": "Home", "path": "/home" }, ...]`. Array order = display order.
- No stored id: the read endpoints set `id = path` (the stable key change
  requests already use, `r.page === p.path`).
- Editing: an Edit mode on the admin PagesPanel (add / remove / rename / move
  up-down / Save). The client's own tab reflects saves immediately (shared row).

## Definition of done

- `tenants.website_pages` column exists (migration applied to prod).
- Client `GET /api/website/pages` and admin `GET .../website/pages` return the
  row's list, never call GHL.
- Admin `PUT .../website/pages` saves a sanitized list (admin-only).
- Admin PagesPanel has a working editor; client tab renders the saved list with
  live preview + Request-a-Change intact.
- No "GoHighLevel"/"GHL" wording in either surface's copy.
- `npm run typecheck` + `vitest` green; live-verified for Willis (enter the 7
  pages, see them in the client tab).

## Files, in order

1. **`supabase/migrations/0028_tenant_website_pages.sql`** (new)
   `alter table public.tenants add column if not exists website_pages jsonb not null default '[]'::jsonb;`
   Schema-only. Willis's list is entered via the new editor during verify (also
   proves the write path end to end).

2. **`functions/lib/websitePages.ts`** (new) — pure, TDD'd.
   - `interface WebsitePageRow { name: string; path: string }`
   - `sanitizeWebsitePages(input: unknown): WebsitePageRow[]` — array-in; per row:
     trim `name` and `path`, force a single leading `/` on `path`, drop rows with
     an empty name or path, cap `name` 80 chars / `path` 200 chars, cap the list
     to 50 rows. Non-array or junk => `[]`.
   - `toPageItems(rows: WebsitePageRow[]): { id: string; name: string; path: string }[]`
     — `id = path`.

3. **`functions/lib/websitePages.test.ts`** (new) — TDD first. Cases: trims,
   adds leading slash, drops empty/blank rows, caps count, coerces non-array to
   `[]`, `toPageItems` sets id=path.

4. **`functions/lib/tenantResolve.ts`** — add `website_pages` to `TenantRow`
   (`WebsitePageRow[] | null`) and to `TENANT_COLS`.

5. **`functions/lib/env.ts`** — add `website_pages?: WebsitePageRow[]` to
   `TenantContext`.

6. **`functions/api/_middleware.ts`** — set `website_pages: tenant?.website_pages ?? []`
   on `ctx.data.tenant` (live path). Test mode: `[]`.

7. **`functions/api/website/pages.ts`** (client) — delete the GHL funnels read;
   return `{ site: null, pages: toPageItems(sanitizeWebsitePages(ctx.data.tenant.website_pages)), unavailable: false }`.

8. **`functions/api/admin/clients/[tenantId]/website/pages.ts`** — `onRequestGet`
   reads `tenant.website_pages` (drop GHL). Add `onRequestPut`: parse `{ pages }`,
   `sanitizeWebsitePages`, `update({ website_pages })`, `logAdminAction`.

9. **`src/hooks/useApi.ts`** — refresh `useAdminWebsitePagesQuery` comment; add
   `useSaveAdminWebsitePages(tenantId)` (PUT `{ pages }`, invalidate the pages
   query key).

10. **`src/components/admin/cockpit/webdesign/PagesPanel.tsx`** — add Edit mode:
    editable name/path rows, add/remove/move up-down, Save (calls the mutation).
    Replace "from their GHL Sites" / "GoHighLevel" copy. Empty list => an
    "Add pages" prompt with an Edit affordance, not an error.

11. **`src/routes/website/WebsitePages.tsx`** + **`src/hooks/useWebsitePages.ts`**
    — refresh the GHL-referencing comments/copy; the empty-state wording stays
    client-safe (it already avoids naming GHL). `site` is now always null so the
    "Site updated" line simply won't render — no code change needed.

## Out of scope / YAGNI

- Crawling or sitemap parsing.
- Drag-and-drop reorder (up/down buttons only).
- Per-page metadata (views, updatedAt).
- Seeding pages inside the migration (done via the editor during verify).

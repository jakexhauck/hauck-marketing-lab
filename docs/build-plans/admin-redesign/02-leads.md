# 02 — Leads (Acquisition pillar tab)

Depends on **00-foundation** (PillarPage shell + `adminPillars.ts` tab bar + data-layer conventions). Read `_architecture.md` and `00-foundation.md` alongside this. Approved mockup: `command-center/docs/mockups/admin-redesign/leads-B.html` (Layout B, dashboard-first).

Phase 1 is **manual entry only**. The app DB is the source of truth. No GHL/Meta auto-fill here (see section 9).

---

## 1. Goal / definition of done

The **Leads** tab of the Acquisition pillar (`/admin/pillar/acquisition?tab=leads`) is Jake's own agency lead book: a hand-kept list of prospects moving from first touch to closed.

Finished behaviour (all manual):
- A strip of **status-count bento tiles** across the top (All + the 7 statuses), each showing a live count. Tapping a tile filters the table to that status; tapping the active tile (or "Clear filter") returns to All.
- A full-width **editable spreadsheet table** below the tiles. Every cell except Status is an inline `<input>`; Status is a colour-coded pill that opens a small status-picker popover.
- **Add lead** (header button and a footer "Add lead" row) inserts a new blank row (status New, first-contact today) and focuses its first cell.
- Editing any cell **persists** to the DB (optimistic: the cell settles instantly, rolls back on error). Changing status via the pill persists immediately.
- A row can be **soft-deleted** (hidden, not hard-erased) from a per-row action.
- Column headers **sort** the visible rows (toggle asc/desc), matching the mockup.
- Data is **agency-global** (no tenant scoping): one shared list for the agency, gated to admins only.
- Empty state: with no leads, the table shows "No leads yet." and the tiles read 0. Nothing is fabricated.

DoD: `npm run typecheck`, `npm run build`, `npm test` green; `npm run db:migrate` applies the new migration; the tab renders in the running app with add / edit / status-change / filter / sort / soft-delete all working against the real endpoint.

---

## 2. Chosen layout

`leads-B.html` (B, dashboard-first). Key structure to port into React under the `.pk-kit` admin theme (Bento Bold):

- **Header**: kicker "Acquisition", `h1` "Leads", tagline. Rendered by the shared `PillarPage` shell (from 00-foundation), NOT by this component.
- **Controls row**: the pillar `pk-tabs` (Leads · Cold Call · SMS, owned by `PillarPage`) plus a right-aligned **Add lead** button owned by this surface.
- **Filter tiles** (`.tiles`): an 8-up grid (All + 7 statuses), each a `.tile` with an icon chip, label, and big count. Active tile gets a coloured border + tint. Collapses to 4-up / 2-up at the mockup's breakpoints.
- **Table card** (`.tablecard`): sticky header row, scrollable body (`overflow:auto`, `min-width:1180px` so it scrolls horizontally inside its card, never the page), a footer "Add lead" row, and a "Clear filter" button shown only while filtered.
- **Status pill + popover** (`.pill` + `.pop`): the pill shows a colour dot + label + caret; clicking opens a fixed-position menu listing all 7 statuses with the current one checked.

This surface is a **CRUD spreadsheet, not a daily-funnel tracker**. It does **not** reuse `DailyTracker`/`trackerMonth` from 00-foundation (no day rows, no month nav, no computed-rate footer). It shares only the Bento Bold visual language and the admin data-layer conventions.

Status colour system (port the mockup's tokens into the `.pk-kit` theme, one source of truth in `src/lib/adminLeads.ts`):

| Status    | Tile/pill class | Swatch    |
|-----------|-----------------|-----------|
| New       | indigo          | `#6366f1` |
| Contacted | sky             | `#0ea5e9` |
| No Answer | amber           | `#f59e0b` |
| Booked    | green           | `#10b981` |
| Qualified | violet          | `#8b5cf6` |
| Closed    | teal            | `#14b8a6` |
| Dead      | rose-grey       | `#c78b93` |

---

## 3. Data model

**Migration**: `command-center/app/supabase/migrations/0027_leads.sql` (next free 4-digit number; latest applied is 0026. If another surface plan lands first, bump to the next free number and keep the slug `_leads`).

**Table**: `public.leads` — agency-global, **no `tenant_id`** (agency-internal surface per `_architecture.md`). Stamp an optional `admin_id` for provenance. Reached only via the service-role client (RLS on, no policies), matching `admin_tasks`.

```sql
-- 0027: Leads — Jake's agency-internal manual lead book (Acquisition > Leads).
--
-- Agency-global: NO tenant_id. This is the agency's own prospect list, hand-kept
-- in the admin console, distinct from per-client GHL opportunities (those come
-- from GoHighLevel via /api/leads and never touch this table). Phase 1 is manual
-- entry; the app DB is the source of truth.
--
-- Run AFTER 0001..0026. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies),
-- matching admin_tasks / admin_audit_log.

create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  first_name          text not null default '',
  last_name           text not null default '',
  phone               text not null default '',
  timezone            text not null default '',
  status              text not null default 'New'
                        check (status in ('New','Contacted','No Answer',
                                          'Booked','Qualified','Closed','Dead')),
  first_contact_date  date,
  source              text not null default '',
  appointment_date    date,
  no_answer           integer not null default 0,
  last_contact        date,
  follow_up_date      date,
  email               text not null default '',
  notes               text not null default '',
  -- Who added the row (best-effort provenance). Null if that admin is removed.
  admin_id            uuid references public.admin_accounts(id) on delete set null,
  -- Soft delete: non-null hides the row from every list. Never hard-deleted here.
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Live-list ordering: newest first, deleted rows excluded by the query.
create index if not exists leads_listing_idx
  on public.leads (created_at desc);

-- Fast status-count tiles + status filtering.
create index if not exists leads_status_idx
  on public.leads (status);

alter table public.leads enable row level security;
-- No policies: service-role only, same as admin_tasks.
```

Notes:
- The 4 date columns are `date` (not timestamptz). Phase 1 stores day-precision. `no_answer` is a running attempt counter (integer), right-aligned in the UI.
- Text columns default to `''` (not null) so blank cells round-trip as empty strings, keeping the whitelist-update logic trivial and inputs controlled.
- Naming: the table is `leads`; there is no existing DB table of that name (the client-facing `ApiLead` is GHL-sourced and has no table). The API path is namespaced under `/api/admin/tracker/leads`, so it never collides with the tenant `/api/leads` route.

---

## 4. API

**File**: `command-center/app/functions/api/admin/tracker/leads.ts` (single tracker file, per `_architecture.md`). Admin-gated centrally by `functions/api/_middleware.ts` (`/api/admin/*` requires `session.adminId` + live `getActiveAdmin`); `ctx.data.admin` is available. Every handler starts with `const client = getServiceClient(ctx.env); if (!client) return 503`.

Shared column whitelist (snake_case) used by POST + PATCH:

```
first_name, last_name, phone, timezone, status,
first_contact_date, source, appointment_date, no_answer,
last_contact, follow_up_date, email, notes
```

Validation helpers: `str(v)` (trim strings), `intOrNull` (coerce `no_answer` to a non-negative integer), `dateOrNull` (accept `YYYY-MM-DD` or empty → null; reject malformed), `status` must be one of the 7 enum values (reuse the `LEAD_STATUSES` const from `src/lib/adminLeads.ts` mirrored server-side, or a local copy in `functions/lib`).

### GET `/api/admin/tracker/leads`
List every non-deleted lead, newest first.
```ts
onRequestGet: select * where deleted_at is null order by created_at desc
→ 200 { leads: AdminLead[] }   // camelCase DTO (map snake→camel)
```

### POST `/api/admin/tracker/leads`
Add a row. Body optional; a bare `{}` creates a blank New lead (matches the mockup's "Add lead" which inserts an empty editable row). Server defaults: `status: 'New'`, `first_contact_date`/`last_contact` = today (UTC date), `no_answer: 0`, `admin_id: ctx.data.admin.id`. Whitelist any supplied fields on top.
```ts
→ 201 { lead: AdminLead }      // the created row, with its real id
logAdminAction(client, admin.id, "leads.create", null, { id })
```

### PATCH `/api/admin/tracker/leads`
Edit one row by id. Body `{ id: string, ...whitelistedFields }`. Only supplied fields update; always set `updated_at = now()`. 404 if the id is missing / already soft-deleted.
```ts
→ 200 { lead: AdminLead }
logAdminAction(client, admin.id, "leads.update", null, { id, fields })
```

### DELETE `/api/admin/tracker/leads`
Soft delete by id. Body `{ id: string }`. Sets `deleted_at = now()` (row stays in the table, drops out of every list).
```ts
→ 200 { ok: true }
logAdminAction(client, admin.id, "leads.delete", null, { id })
```

Audit: `logAdminAction` on every write (create/update/delete). `targetTenantId` is `null` (agency-global). Never echo secrets (there are none here).

---

## 5. Client

### 5a. DTO — `src/lib/api.ts`
Add near the other admin DTOs:
```ts
export type AdminLeadStatus =
  | "New" | "Contacted" | "No Answer"
  | "Booked" | "Qualified" | "Closed" | "Dead";

export interface AdminLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  timezone: string;
  status: AdminLeadStatus;
  firstContactDate: string | null;   // "YYYY-MM-DD"
  source: string;
  appointmentDate: string | null;
  noAnswer: number;
  lastContact: string | null;
  followUpDate: string | null;
  email: string;
  notes: string;
  createdAt: string;
}
```

### 5b. Pure lib — `src/lib/adminLeads.ts` (unit-tested)
No React. The single source of truth for status metadata + list math, so the component and the tests agree:
- `LEAD_STATUSES: AdminLeadStatus[]` — the ordered 7 (New … Dead). Server enum mirrors this.
- `STATUS_META: Record<AdminLeadStatus, { tileClass; pillClass; swatch; label }>` — the colour tokens from section 2.
- `countByStatus(leads): Record<AdminLeadStatus, number>` and `totalCount(leads)` — the tile numbers.
- `filterByStatus(leads, filter: AdminLeadStatus | "All")`.
- `sortLeads(leads, key, dir)` — comparators matching the mockup: text `localeCompare`; `noAnswer` numeric; the 4 date fields by ISO date (nulls last); `status` by `LEAD_STATUSES` index.
- `blankLeadDraft()` — the optimistic client-side new-row shape (temp id, status New, today's date) used before the POST resolves.

### 5c. Hooks — `src/hooks/useApi.ts`
Keyed `["admin","tracker","leads"]`, mirroring the existing admin query + optimistic-mutation patterns (`useToggleTask`, `useMoveLeadStage`):
- `useAdminLeadsQuery(enabled)` — GET the list, `staleTime: 30_000`.
- `useAddAdminLead()` — POST. `onMutate` optimistically appends a `blankLeadDraft()` (temp id); `onSuccess` swaps the temp row for the returned real row; `onError` removes the temp row; `onSettled` invalidates the key.
- `useUpdateAdminLead()` — PATCH `{ id, ...fields }`. Optimistic: snapshot → patch the one row in cache → rollback on error → invalidate on settle. This backs both inline-cell edits and the status pill.
- `useDeleteAdminLead()` — DELETE `{ id }`. Optimistic: drop the row from cache → rollback on error → invalidate on settle.

### 5d. Components
Under `src/components/admin/leads/`:
- `LeadsBoard.tsx` — the surface root. Owns filter state (`"All" | AdminLeadStatus`) and sort state (`{ key, dir }`), reads `useAdminLeadsQuery`, renders `LeadStatusTiles` + the table card + the header **Add lead** button. Loading → skeleton/spinner; error → inline error; empty → "No leads yet.".
- `LeadStatusTiles.tsx` — the bento tile strip from `countByStatus`/`totalCount`; click sets/clears the filter.
- `LeadRow.tsx` — one table row. Inline cells:
  - Text cells (`firstName`, `lastName`, `phone`, `timezone`, `source`, `email`, `notes`) → controlled `<input>`; commit on **blur** (or debounced) via `useUpdateAdminLead`, so a burst of keystrokes is one PATCH. Local state holds the in-flight value.
  - Date cells (`firstContactDate`, `appointmentDate`, `lastContact`, `followUpDate`) → `<input type="date">` styled to match the mockup's compact look; stores ISO, commits on change.
  - `noAnswer` → numeric input (`inputmode="numeric"`), right-aligned, commit on blur.
  - `status` → `LeadStatusPill` (pill + caret) opening `LeadStatusMenu`.
  - A trailing row action (kebab / trash) → `useDeleteAdminLead` (soft delete), with a lightweight confirm.
- `LeadStatusPill.tsx` + `LeadStatusMenu.tsx` — the pill and its fixed-position popover (port `.pill` / `.pop`; close on outside-click, scroll, resize). Selecting a status PATCHes immediately.

### 5e. Mount point
This surface is the **Leads** tab body of the Acquisition `PillarPage` (built in 00-foundation):
- In `src/lib/adminPillars.ts`, the Acquisition pillar's tab config already lists `leads` (id) · `cold-call` · `sms` per 00-foundation F2. Confirm the `leads` tab id/label exist.
- In `PillarPage.tsx` (or the per-pillar Acquisition page), add the `case "leads"` branch of the tab-body switch to render `<LeadsBoard />`. Cold Call / SMS remain their own surface plans; a placeholder body is fine for them until then.
- No new `<Route>` is needed: `/admin/pillar/acquisition` already resolves via the foundation route; the tab is a `?tab=` query param.

---

## 6. Tests

`src/lib/adminLeads.test.ts` (Vitest, Node env, co-located), covering the pure lib only:
- `countByStatus` / `totalCount`: correct per-status counts and total across a mixed fixture; all-zero for `[]`.
- `filterByStatus`: `"All"` returns everything; a status returns only its rows; unknown → empty.
- `sortLeads`: text asc/desc via `localeCompare`; `noAnswer` numeric order; date order with nulls sorted last; `status` order follows `LEAD_STATUSES` index; `dir` flips each.
- `STATUS_META` covers exactly the 7 `LEAD_STATUSES` (no missing/extra keys) — guards the enum against drift with the migration CHECK.
- `blankLeadDraft`: status New, today's date, `noAnswer` 0.

No network/DB tests (the endpoint is thin whitelist CRUD; logic worth testing lives in the pure lib).

---

## 7. File-by-file change list (ordered)

1. `command-center/app/supabase/migrations/0027_leads.sql` — new table (section 3).
2. `command-center/app/functions/api/admin/tracker/leads.ts` — new endpoint: GET / POST / PATCH / DELETE (section 4). Add a server-side `LEAD_STATUSES` copy (or `functions/lib/leadsStatus.ts`) for enum validation.
3. `command-center/app/src/lib/adminLeads.ts` — new pure lib: statuses, meta, counts, filter, sort, draft (section 5b).
4. `command-center/app/src/lib/adminLeads.test.ts` — new unit tests (section 6).
5. `command-center/app/src/lib/api.ts` — add `AdminLeadStatus` + `AdminLead` DTOs (section 5a).
6. `command-center/app/src/hooks/useApi.ts` — add `useAdminLeadsQuery`, `useAddAdminLead`, `useUpdateAdminLead`, `useDeleteAdminLead` (section 5c).
7. `command-center/app/src/components/admin/leads/LeadStatusMenu.tsx` — status popover.
8. `command-center/app/src/components/admin/leads/LeadStatusPill.tsx` — status pill.
9. `command-center/app/src/components/admin/leads/LeadRow.tsx` — editable row.
10. `command-center/app/src/components/admin/leads/LeadStatusTiles.tsx` — filter tiles.
11. `command-center/app/src/components/admin/leads/LeadsBoard.tsx` — surface root.
12. `command-center/app/src/routes/admin/PillarPage.tsx` (from 00-foundation) — add the `leads` tab-body branch rendering `<LeadsBoard />`.
13. `command-center/app/src/lib/adminPillars.ts` (from 00-foundation) — confirm/keep the Acquisition `leads` tab entry.

Port the mockup's CSS into the components under the `.pk-kit` theme (Bento Bold), reusing existing admin tokens where they exist. No em dashes in any code/comment/UI string.

---

## 8. Verify

- `npm run db:migrate` — 0027 applies cleanly (idempotent re-run is a no-op).
- `npm run typecheck` — app + functions tsconfigs clean.
- `npm test` — `adminLeads.test.ts` green with the full suite.
- `npm run build` — clean.
- **Manual in the running app** (admin session, `/admin/pillar/acquisition?tab=leads`):
  1. Empty state shows "No leads yet." and every tile reads 0.
  2. **Add lead** inserts a blank New row, focuses its first cell, and the New + All tiles increment.
  3. Type into text cells → blur → reload the tab: values persist.
  4. Change a date cell and `no_answer` → persist across reload.
  5. Open the status pill, pick a new status → pill recolours, the old/new tiles recount, persists.
  6. Tap a status tile → table filters to that status; "Clear filter" / tapping the active tile returns to All.
  7. Click a column header → rows sort; click again → direction flips.
  8. Soft-delete a row → it disappears, tiles recount, and it stays gone after reload (row remains in the DB with `deleted_at` set).
  9. Confirm no data is fabricated and Cold Call / SMS tabs still switch via `?tab=`.

Evidence: show the passing test output and a screenshot of the real running tab with a few rows, a filtered view, and the status popover open.

---

## 9. Out of scope / Phase 2

- **Auto-fill from GHL / Meta**: none here. Phase 2 will sync inbound GHL opportunities (via the existing `/api/leads` + webhook path) and Meta lead-form leads into this table, or mirror this book into GHL. The manual columns (`source`, `first_contact_date`, `status`) are the fields that later map to GHL opportunity source/stage.
- **Dedup / merge** of duplicate people, bulk import (CSV/paste), and assignment to a rep.
- **Reminders / follow-up automation** off `follow_up_date` (a future Operations/Tasks tie-in).
- **Hard delete / restore UI** for soft-deleted rows (rows are retained; a restore/trash view can come later).
- **Per-admin scoping**: `admin_id` is stamped for provenance only; the list stays agency-global (single agency) in Phase 1.

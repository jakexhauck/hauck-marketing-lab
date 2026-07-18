# 09 — Operations: Time Audit

Depends on `00-foundation.md` (pillar-page shell + `PillarPage`/tab bar for Operations). Read `_architecture.md` alongside. Phase 1 = manual entry, app DB is the source of truth.

## 1. Goal / Definition of done

A "Time Audit" tab under the **Operations** pillar (`/admin/pillar/operations?tab=time-audit`) that shows a weekly calendar grid of where Jake's hours actually go, colored by leverage, with a per-day dollar footer and weekly rollups.

Finished (Phase 1) means:

- A weekly grid: rows = 30-minute blocks from 6:00 AM to 10:00 PM (32 slots), columns = Mon–Sun. Each cell is empty or tagged with a task type; the tag colors the cell by its leverage tier.
- Clicking a cell tags it. Faithful to the mockup: a click cycles the cell through the task types (empty → Sales calls → Roleplays → Outreach → Scraping leads → Admin → Scrolling → empty). The chosen task type sets the cell's leverage from that task's default tier; both `leverage` and `task_type` are persisted.
- A legend rail: a "Value of your week" tile, a Leverage legend (tier → $/30m), and a Task types legend (task → default tier).
- A sticky footer row "Total $ / day" showing each day's dollar value; the rail tile shows the week total plus "% of tagged time is high-leverage".
- Week navigation (prev / this week / next), driven by `week_start` (the Monday of the week).
- Data is agency-global (single agency, no tenant scoping). Persisted in `time_audit_blocks`, one row per tagged (week_start, day_of_week, slot).
- All dollar-value math and rollups live in a pure, unit-tested `src/lib/timeAudit.ts`. Nothing is fabricated: an untagged week shows an empty grid and `$0`.
- `npm run typecheck`, `npm run build`, `npm test`, and `npm run db:migrate` all green.

## 2. Chosen layout

Implement `command-center/docs/mockups/admin-redesign/time-audit-A.html` exactly (Layout A). Port its markup/CSS into React under the `.pk-kit` admin theme (Bento Bold). Structure:

- Header: kicker "Operations", title "Time Audit", tagline.
- Controls row: the Operations `pk-tabs` tab bar (Calculator · Time Audit · Tasks — from the foundation shell, not rebuilt here) plus a right-aligned week pill ("This week · Jul 13 – 19") that doubles as the prev/next week nav.
- `.board` = flex row: a `.gridcard` (the scrolling weekly grid) + a `.rail` (legend/value panels). Collapses to a column under 980px.
- `.gridcard`: header ("Weekly Time Grid" + sub + hint chip "Click any block to cycle its tag"), then a scroll region containing `table.grid` with sticky `thead` (Time + 7 day columns), a `tbody` of 32 rows, and a sticky `tfoot` "Total $ / day" row. First column (`.timecol`) is sticky-left; hour rows get a heavier top border.
- Cell states: `.cell.empty` renders an em-dash placeholder (use a non-em-dash glyph in React per the no-em-dash rule — a middot "·" or the word count, see §7); a tagged cell gets `background:<tier.tint>`, `box-shadow: inset 3px 0 0 <tier.solid>`, and a `.tag` (colored dot + task label).
- Rail panels: `.valuetile` (week value + "% high-leverage" sub), Leverage legend (`#legendLev`), Task types legend (`#legendTask`).

Reference the already-ported Bento Bold table CSS from `command-center/docs/mockups/admin-redesign/cold-calling.html` / the `DailyTracker` component where class names overlap, but the grid here is a **bespoke week grid**, not the shared `DailyTracker` (that engine is a day-per-row funnel table; this is a slot × day matrix). Do not force-fit `DailyTracker`.

## 3. Data model

New migration. **Use the next free 4-digit sequence when this ships (0027+; latest applied is 0026).** If earlier surface plans have already claimed 0027…, bump to the next free number. Filename e.g. `command-center/app/supabase/migrations/00NN_time_audit_blocks.sql`.

Table `time_audit_blocks` — agency-global (NO `tenant_id`, per `_architecture.md` scoping for agency-internal surfaces):

| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `week_start` | `date not null` | the Monday of the week (ISO). Grid key. |
| `day_of_week` | `int not null` | 0 = Mon … 6 = Sun. `check (day_of_week between 0 and 6)` |
| `slot` | `int not null` | 30-min block index, 0 = 6:00 AM … 31 = 9:30 AM start of the last block ending 10:00 PM. `check (slot between 0 and 31)` |
| `leverage` | `text not null` | `check (leverage in ('Low','Low-Mid','Mid','Mid-High','High'))` |
| `task_type` | `text not null` | `check (task_type in ('Outreach','Sales calls','Roleplays','Scraping leads','Scrolling','Admin'))` |
| `updated_by` | `uuid` | admin id, nullable (best-effort stamp) |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | |

- `create table if not exists`. Unique constraint / index: `unique (week_start, day_of_week, slot)` — this is the upsert conflict target (one tag per block). Add `create index if not exists time_audit_blocks_week_idx on public.time_audit_blocks (week_start);` for the by-week GET.
- Enums use `text` + CHECK (repo style), not Postgres enums.
- A cleared cell is a DELETE of that row (untagged = no row), not a null tag — keeps the "no fabricated data" rule and the GET simple.
- No RLS policy needed (service-role client + admin middleware gate).

## 4. API

New file `command-center/app/functions/api/admin/tracker/time-audit.ts` (agency-global tracker path, matches `_architecture.md`). Admin-gated by `functions/api/_middleware.ts`. Start every handler with the service-client guard (copy from `functions/api/admin/tasks/index.ts`):

```ts
const client = getServiceClient(ctx.env);
if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
```

### GET `/api/admin/tracker/time-audit?week=YYYY-MM-DD`
- `week` = the Monday `week_start` (required; 400 if missing/malformed — validate `^\d{4}-\d{2}-\d{2}$`).
- Query: `client.from("time_audit_blocks").select("day_of_week, slot, leverage, task_type").eq("week_start", week)`.
- Response DTO:
  ```ts
  interface TimeAuditWeekResponse {
    weekStart: string;                 // echo of ?week
    blocks: TimeAuditBlock[];          // only tagged blocks
  }
  interface TimeAuditBlock {
    dayOfWeek: number;                 // 0..6
    slot: number;                      // 0..31
    leverage: Leverage;                // 'Low' | 'Low-Mid' | 'Mid' | 'Mid-High' | 'High'
    taskType: TaskType;                // the 6 task labels
  }
  ```
- Empty week → `{ weekStart, blocks: [] }` (200).

### PATCH `/api/admin/tracker/time-audit`
Upsert or clear one block.
- Body: `{ weekStart, dayOfWeek, slot, leverage, taskType }` to set; `{ weekStart, dayOfWeek, slot, taskType: null }` (or `clear: true`) to delete.
- Validate: `weekStart` date shape; `dayOfWeek` 0–6; `slot` 0–31; `leverage` ∈ enum; `taskType` ∈ enum. Reject unknown values with 400 (defense — the same CHECK is in the DB).
- Set: `client.from("time_audit_blocks").upsert({ week_start, day_of_week, slot, leverage, task_type, updated_by: ctx.data.admin!.id, updated_at: new Date().toISOString() }, { onConflict: "week_start,day_of_week,slot" })`.
- Clear: `client.from("time_audit_blocks").delete().match({ week_start, day_of_week, slot })`.
- Whitelist supplied fields into a snake_case update only (never trust the raw body shape).
- On success call `logAdminAction(client, ctx.data.admin!.id, "time_audit.tag" | "time_audit.clear", null, { weekStart, dayOfWeek, slot, taskType })` (best-effort; `targetTenantId` is null for agency-internal).
- Return the updated block (or `{ cleared: true }`) so the client can reconcile.

No POST/DELETE routes needed — PATCH handles both set and clear via one round-trip.

## 5. Client

### DTOs — `src/lib/api.ts`
Add `Leverage`, `TaskType`, `TimeAuditBlock`, `TimeAuditWeekResponse` (the shapes in §4). Export the enum tuples so the lib and UI share one source.

### Pure lib — `src/lib/timeAudit.ts` (unit-tested, no React)
This owns every number.

- `LEVERAGE_TIERS`: ordered config, tier → `{ label, displayLabel, tint, solid, ratePer30m }`. Rates from the mockup: Low $0, Low-Mid $20, Mid $60, Mid-High $160, High $450 per 30-min block. (`displayLabel` renders "Low/Mid" and "Mid/High" per the mockup; the stored enum value stays `Low-Mid` / `Mid-High`.)
- `TASK_TYPES`: ordered config, task → `{ label, color, defaultLeverage }`. Mapping from the mockup: Sales calls → High, Roleplays → Mid-High, Outreach → Mid, Scraping leads → Low-Mid, Admin → Low-Mid, Scrolling → Low.
- `SLOT_COUNT = 32`, `START_HOUR = 6`. `slotLabel(slot)` → `{ text, ampm, isHourStart }` (port the mockup's `timeLabel`).
- `rateForBlock(block)` → the tier's `ratePer30m` for that block's leverage.
- `dayTotal(blocks, dayOfWeek)` → sum of `rateForBlock` for that day.
- `weekTotal(blocks)` → sum across all blocks.
- `hoursByLeverage(blocks)` → `Record<Leverage, number>` (block count × 0.5h).
- `pctHighLeverage(blocks)` → share of tagged blocks whose leverage is `Mid-High` or `High`, rounded int; `0` when nothing tagged.
- `weekRollup(blocks)` → `{ dayTotals: number[7], weekTotal, pctHighLeverage, hoursByLeverage }`.
- `cycleTaskType(current: TaskType | null)` → next task in the mockup's cycle order, wrapping to `null` (empty). Used by click-to-tag; the resulting task's `defaultLeverage` is what gets persisted.
- `mondayOf(date)` / `addWeeks(weekStart, n)` / `formatWeekRange(weekStart)` — week nav + the "Jul 13 – 19" pill label. Keep date math here so it is testable and avoids off-by-one/timezone drift (parse as UTC date-only).
- `money(v)` → `"$" + v.toLocaleString()`.

### Hooks — `src/hooks/useApi.ts`
- `useAdminTimeAuditWeek(weekStart: string)`:
  ```ts
  useQuery({
    queryKey: ["admin", "tracker", "time-audit", weekStart],
    queryFn: () => api<TimeAuditWeekResponse>(`/api/admin/tracker/time-audit?week=${weekStart}`),
  })
  ```
- `useAdminTimeAuditTag()`: `useMutation` PATCHing `/api/admin/tracker/time-audit`, with the optimistic `onMutate` snapshot/rollback pattern already used in `useApi.ts` (see the mutation at lines ~118 and ~168): cancel the week query, patch the cached `blocks` array (set/replace or remove the block), roll back on error, and `qc.invalidateQueries({ queryKey: ["admin","tracker","time-audit", weekStart] })` on settle. Optimistic is important here so click-to-cycle feels instant.

### Components
- `src/components/admin/tracker/TimeAuditGrid.tsx` — the whole surface: controls (week pill nav), `.gridcard` week table, `.rail` legends + value tile. Reads `useAdminTimeAuditWeek(weekStart)`; local `weekStart` state seeded from `mondayOf(new Date())`; prev/next call `addWeeks`. Cell click → compute next task via `cycleTaskType`, resolve its `defaultLeverage`, fire `useAdminTimeAuditTag()`. Footer + rail values come straight from `weekRollup(blocks)` — no math in the component. Legends map over `LEVERAGE_TIERS` / `TASK_TYPES`.
- Mount it as the Operations "Time Audit" tab body. Per the foundation shell, register the tab in `src/lib/adminPillars.ts` (Operations tabs: Calculator · Time Audit · Tasks) and render `<TimeAuditGrid/>` from the Operations pillar page's tab switch when `?tab=time-audit`.

Reuse the `.pk-kit` theme tokens; do not reintroduce the mockup's raw hex where a `pk-` token exists. No em dashes in any UI string, comment, or the empty-cell glyph (use "·" or leave the cell blank, not "—").

## 6. Tests

`src/lib/timeAudit.test.ts` (Vitest, Node env, co-located):
- `rateForBlock` returns the right $/30m for each leverage tier.
- `dayTotal` sums a seeded day; empty day → 0.
- `weekTotal` sums the mockup's seeded week and matches a hand-computed figure.
- `pctHighLeverage`: 0 when no blocks; correct rounded share with a mix of tiers; treats only Mid-High + High as high-leverage.
- `hoursByLeverage`: block counts × 0.5 per tier.
- `cycleTaskType`: full cycle including wrap null → Sales calls → … → Scrolling → null.
- `slotLabel`: slot 0 → 6:00 AM (hour start), slot 1 → 6:30 AM (not hour start), slot 31 → 9:30 PM.
- `mondayOf` / `addWeeks` / `formatWeekRange`: a mid-week date resolves to that week's Monday; +1/-1 week; range label spanning a month boundary; no timezone drift (date-only, UTC).

(Endpoint validation is thin and DB-guarded; the pure lib is where the coverage lives, per `_architecture.md`.)

## 7. File-by-file change list (ordered)

1. `command-center/app/supabase/migrations/00NN_time_audit_blocks.sql` — new table + unique index (§3).
2. `command-center/app/src/lib/timeAudit.ts` — new pure lib (§5).
3. `command-center/app/src/lib/timeAudit.test.ts` — new unit tests (§6).
4. `command-center/app/src/lib/api.ts` — add `Leverage`, `TaskType`, `TimeAuditBlock`, `TimeAuditWeekResponse` DTOs.
5. `command-center/app/functions/api/admin/tracker/time-audit.ts` — new GET (by week) + PATCH (set/clear) handler (§4).
6. `command-center/app/src/hooks/useApi.ts` — `useAdminTimeAuditWeek` + `useAdminTimeAuditTag` (optimistic).
7. `command-center/app/src/components/admin/tracker/TimeAuditGrid.tsx` — new surface component (§5).
8. `command-center/app/src/lib/adminPillars.ts` — ensure the Operations "Time Audit" tab id exists (from foundation; add if the foundation stub left it as a placeholder).
9. Operations pillar page (`src/routes/admin/PillarPage.tsx` or the per-pillar Operations page from foundation) — render `<TimeAuditGrid/>` for the `time-audit` tab.
10. Run `npm run db:migrate` to apply the migration.

## 8. Verify

- `npm run typecheck` (app + functions), `npm run build`, `npm test` — all green; the new `timeAudit.test.ts` cases pass.
- `npm run db:migrate` applies `00NN` cleanly and is idempotent on re-run.
- Manual, in the running app (`/admin/pillar/operations?tab=time-audit`):
  1. Grid renders 32 rows × 7 day columns, 6:00 AM–10:00 PM, sticky Time column + header + footer.
  2. Click an empty cell → it tags "Sales calls" (High, green tint + rail bar), footer "Total $ / day" for that day jumps by $450, week value + "% high-leverage" update.
  3. Click the same cell repeatedly → cycles through all task types then back to empty; each change persists (reload the page → tags survive; check the row exists / is deleted in Supabase).
  4. Prev / next week nav swaps the grid; each week keeps its own tags; the week pill label tracks the range.
  5. An untagged week shows an empty grid and `$0` with no fabricated content.
- Screenshot the live grid (M9 visual proof) against `time-audit-A.html`.

## 9. Out of scope / Phase 2

- **Auto-fill:** Phase 2 will infer blocks from calendar events / GHL call logs / activity signals instead of manual clicks. `time_audit_blocks` already carries `updated_by`; a Phase 2 `source` column (`manual` | `auto`) would let auto-fill and manual tags coexist.
- **Per-task (vs per-leverage) rates + editable rates:** Phase 1 hardcodes the mockup's per-leverage $/30m in `timeAudit.ts`. Later: a settings surface to edit tier rates (or task-specific rates) persisted agency-wide, and independent leverage override on a block (decoupling leverage from the task's default).
- **Longer-range rollups:** month/quarter "value of your time" trends, high-leverage % over time — built on the same table once several weeks exist.
- **Drag-to-paint** multi-block tagging and keyboard entry (Phase 1 is single-click cycle only).

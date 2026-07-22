# 04 — Cold SMS (Acquisition pillar tab)

> Surface plan. Depends on **00-foundation** (F2 pillar framework + F3 shared DailyTracker engine) being built first. Read `_architecture.md` and `00-foundation.md` alongside. Phase 1 = manual entry only, app DB = source of truth.

## 1. Goal / DoD

The **SMS** tab of the Acquisition pillar (`/admin/pillar/acquisition?tab=sms`). One page, three clean sub-views via an in-page sub-nav (Layout B):

- **Daily** — one row per calendar day of the selected month (reuses the shared `DailyTracker` engine). Input columns: SMS Sent, Positive Replies, Meetings Booked, Notes. Computed columns: Reply %, Reply→Book %, Book→Sent %. Sticky Average/day + Total MTD footer. Four stat tiles (SMS Sent MTD, Reply %, Meetings Booked MTD, Book→Sent %). Month nav (prev/next/Today).
- **Monthly** — one editable row per month of agency economics. Input: Total SMS Sent, VA Cost, Calls Booked, Calls Showed, SMS Cost, New Clients, Cash Collected, LTV. Computed: Show Rate, SMS/Client, Total Cost, Cost/Call, Cost/Showed, CAC, ROI. "All months" total footer.
- **Script Test** — one editable row per A/B variation. Input: Variation name, Total Sent, Positive Replies, Calls Booked, Clients Closed. Computed: Positive Reply %, Booking %. "All variations" total footer. Add/remove a variation.

Done when: every cell persists to the agency-global DB and reloads correctly; all rates recompute live; empty months render the auto-generated empty day template (Daily) or an empty-state (Monthly/Script); nothing is fabricated; typecheck/build/tests green. Agency-global data — **no `tenant_id`**.

## 2. Chosen layout

Implement `command-center/docs/mockups/admin-redesign/cold-sms-B.html` exactly (Bento Bold, `.pk-kit` theme).

Structure to port:
- Header: kicker "Acquisition", title "Cold SMS", tagline. (Rendered by the F2 `PillarPage` shell; the surface supplies only its body.)
- `.controls` row: the pillar tab strip (Leads · Cold Call · SMS — owned by F2) plus the `.monthnav` (prev / month label / next / Today).
- `.subnav` (the B differentiator): three underline sub-tabs — Daily, Monthly, Script Test (Script carries a count pill = number of variations).
- `.views` → three `.view` sections toggled by the sub-nav (local state; no route change).
- Daily view = 4 stat tiles + `.tablecard` table. Monthly + Script views = a single `.fillcard` table each.
- Legend ("You type" indigo dot / "Computed" grey dot), footnote.

Layout rules:
- The `.monthnav` drives **only** the Daily view. Render it **only when the Daily sub-view is active** (hide on Monthly/Script — they are all-time, not month-scoped). Do not leave an inert control on screen.
- Sub-view selection is component-local React state (default "daily"). Optional: mirror to a `?view=` param for deep-linking; not required for Phase 1.
- No em dashes anywhere. Use "—" the character only as the computed-empty glyph inside cells (matches the mockup's `fp()`), never in prose/labels.

## 3. Data model

**Migration:** `command-center/app/supabase/migrations/00NN_cold_sms_tracker.sql` — one migration, three tables.

> Sequence note: latest applied = `0026`. This surface is authored after the Leads and Cold Call surface plans, so it takes the **next free 4-digit number** after their migrations (expected `0029`; confirm the actual free number at build time — never reuse or edit an applied file). Style per `_architecture.md`: `create table if not exists`, UUID PK `default gen_random_uuid()`, `timestamptz not null default now()`, guarded `add column if not exists`. Agency-global (no `tenant_id`). Service-role client bypasses RLS; no RLS policies needed.

### `cold_sms_daily` (reuses DailyTracker persistence contract — one row per day)
| column | type | notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `day` | date | **unique** (`unique (day)`); the calendar day this row logs |
| `sms_sent` | integer | nullable, input |
| `positive_replies` | integer | nullable, input |
| `meetings_booked` | integer | nullable, input |
| `note` | text | nullable, input |
| `created_at` | timestamptz | `not null default now()` |
| `updated_at` | timestamptz | `not null default now()` |

Rates (Reply %, Reply→Book %, Book→Sent %) are **computed, never stored**.

### `cold_sms_monthly` (one row per month)
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `month` | date | **unique**; store the first-of-month (`YYYY-MM-01`) |
| `total_sms_sent` | integer | input |
| `va_cost` | numeric(12,2) | input, dollars |
| `calls_booked` | integer | input |
| `calls_showed` | integer | input |
| `sms_cost` | numeric(12,2) | input, dollars |
| `new_clients` | integer | input |
| `cash_collected` | numeric(12,2) | input, dollars |
| `ltv` | numeric(12,2) | input, dollars |
| `created_at`/`updated_at` | timestamptz | |

Computed (client-side): Show Rate, SMS/Client, Total Cost, Cost/Call, Cost/Showed, CAC, ROI.

### `cold_sms_script_test` (one row per variation)
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | `not null`, input |
| `total_sent` | integer | input |
| `positive_replies` | integer | input |
| `calls_booked` | integer | input |
| `clients_closed` | integer | input |
| `sort_order` | integer | `not null default 0`, controls display order |
| `created_at`/`updated_at` | timestamptz | |

Computed (client-side): Positive Reply %, Booking %.

All integer/numeric inputs nullable so a blank cell stays blank (not zero) — matches the mockup where `""` renders as placeholder, not `0`.

## 4. API

All agency-global → under `command-center/app/functions/api/admin/tracker/`. Admin-gated by `functions/api/_middleware.ts` (`session.adminId` + `getActiveAdmin`); no tenant resolution. Every handler starts with `const client = getServiceClient(ctx.env); if (!client) return 503`. Whitelist supplied fields into a snake_case update. `logAdminAction(client, ctx.data.admin!.id, "<action>", null, payload)` on every write (target tenant = `null` — agency data). Copy the shape of `functions/api/admin/tasks/index.ts`.

### `cold-sms-daily.ts`
- **GET** `?month=YYYY-MM` → rows where `day` in `[first, last]` of that month. Returns `{ rows: ColdSmsDailyRow[] }` (the raw persisted rows only; the client fills empty days via the F3 month generator). Validate `month` matches `^\d{4}-\d{2}$` → 400 otherwise.
- **PATCH** body `{ day: "YYYY-MM-DD", sms_sent?, positive_replies?, meetings_booked?, note? }` → **upsert by `day`** (`.upsert(row, { onConflict: "day" })`), set `updated_at = now()`. Whitelist those five keys only. Returns the saved row. Audit `"cold_sms_daily.upsert"`.

### `cold-sms-monthly.ts`
- **GET** → all rows ordered `month desc`. `{ rows: ColdSmsMonthlyRow[] }`.
- **PATCH** body `{ month: "YYYY-MM-01", total_sms_sent?, va_cost?, calls_booked?, calls_showed?, sms_cost?, new_clients?, cash_collected?, ltv? }` → **upsert by `month`** (normalize any `YYYY-MM` / `YYYY-MM-DD` to first-of-month server-side). Whitelist the nine input keys. Audit `"cold_sms_monthly.upsert"`.

### `cold-sms-script.ts`
- **GET** → all rows ordered `sort_order asc, created_at asc`. `{ rows: ColdSmsScriptRow[] }`.
- **POST** body `{ name, total_sent?, positive_replies?, calls_booked?, clients_closed? }` → insert new variation; `name` required (trim, 400 if empty); `sort_order` = current max + 1. Returns row (201). Audit `"cold_sms_script.create"`.
- **PATCH** body `{ id, name?, total_sent?, positive_replies?, calls_booked?, clients_closed? }` → update by `id`. Whitelist. Audit `"cold_sms_script.update"`.
- **DELETE** `?id=` → delete by id. Audit `"cold_sms_script.delete"`.

Validation: coerce numeric inputs; reject non-numeric → keep null. Empty string → null (blank cell). No auth logic in-handler (middleware owns it).

## 5. Client

### DTOs — `src/lib/api.ts`
```ts
export interface ColdSmsDailyRow { id: string; day: string; smsSent: number | null; positiveReplies: number | null; meetingsBooked: number | null; note: string | null; }
export interface ColdSmsMonthlyRow { id: string; month: string; totalSmsSent: number | null; vaCost: number | null; callsBooked: number | null; callsShowed: number | null; smsCost: number | null; newClients: number | null; cashCollected: number | null; ltv: number | null; }
export interface ColdSmsScriptRow { id: string; name: string; totalSent: number | null; positiveReplies: number | null; callsBooked: number | null; clientsClosed: number | null; sortOrder: number; }
```
(Map snake_case → camelCase in the endpoint `toRow` helpers, mirroring `toTask` in `tasks/index.ts`.)

### Hooks — `src/hooks/useApi.ts`
Keyed `["admin","tracker","cold-sms-*", …]` per F4. Use the optimistic snapshot/rollback pattern (like `useMarkNotificationsRead`) for cell edits so typing feels instant:
- `useColdSmsDailyQuery(month: string)` → GET `/api/admin/tracker/cold-sms-daily?month=${month}`, key `["admin","tracker","cold-sms-daily", month]`.
- `useColdSmsDailyUpsert()` → PATCH; `onMutate` patches the cached month rows for that `day`; `onError` rollback; `onSettled` invalidate the month key.
- `useColdSmsMonthlyQuery()` / `useColdSmsMonthlyUpsert()` → key `["admin","tracker","cold-sms-monthly"]`.
- `useColdSmsScriptQuery()` / `useColdSmsScriptCreate()` / `useColdSmsScriptUpdate()` / `useColdSmsScriptDelete()` → key `["admin","tracker","cold-sms-script"]`.

### Pure compute lib — `src/lib/coldSms.ts` (unit-tested, no React)
Reuse `pct` / safe-divide / format helpers from F3's `src/lib/trackerMonth.ts` (do **not** re-implement). Add SMS-specific row/rollup functions:
- `computeDailyRow(row)` → `{ replyPct, replyToBookPct, bookToSentPct }` = `pct(replies, sent)`, `pct(booked, replies)`, `pct(booked, sent)`.
- `computeDailyRollup(rows)` → Average/day (sum ÷ filled-day count; a day counts as filled if any of sent/replies/booked is non-blank) and Total MTD + the three aggregate rates. Mirrors the mockup's `updateRollups()`.
- `computeMonthlyRow(row)` → `showRate = pct(showed, booked)`, `smsPerClient = clients>0 ? sent/clients : null`, `totalCost = vaCost + smsCost`, `costPerCall = totalCost/booked`, `costPerShowed = totalCost/showed`, `cac = totalCost/clients`, `roi = totalCost>0 ? (cash - totalCost)/totalCost * 100 : null`. LTV is passthrough input.
- `computeMonthlyRollup(rows)` → column sums; Show Rate/Cost ratios recomputed from the sums; LTV = **average of rows with LTV > 0** (matches mockup `econFoot()`).
- `computeScriptRow(row)` → `replyPct = pct(replies, sent)`, `bookingPct = pct(booked, sent)`. **Note:** Booking % denominator is Total Sent, not replies — faithful to the mockup (`pct(booked, sent)`). Keep it that way unless Jake says otherwise.
- `computeScriptRollup(rows)` → sums + aggregate reply%/booking% from sums.

### Components
- `src/components/admin/acquisition/ColdSmsSurface.tsx` — the SMS tab body. Owns sub-view state (`"daily" | "monthly" | "script"`) + month state (`{year, month}`, default today). Renders `.subnav`, conditional `.monthnav` (Daily only), and the active view. Mounted from the F2 Acquisition `PillarPage` `switch` on the `sms` tab.
- **Daily view** — render F3's shared `<DailyTracker>` with an SMS column schema: input cols `[smsSent, positiveReplies]`, computed `replyPct`, input `meetingsBooked`, computed `replyToBookPct`, `bookToSentPct`, input `note` (text). Pass `computeRow=computeDailyRow`, `computeRollup=computeDailyRollup`, the four `statTiles`, `data` = F3 month-generated days merged with `useColdSmsDailyQuery(month)` rows, `onEdit(day, field, value)` → `useColdSmsDailyUpsert`. The engine handles the table, footer, weekend/today styling, month nav wiring.
- **Monthly view** — `src/components/admin/acquisition/MonthlyEconomicsTable.tsx`: editable `<input>` table from `cold_sms_monthly` rows, live compute via `computeMonthlyRow`, sticky "All months" footer via `computeMonthlyRollup`. Empty state when no rows: "No months logged yet." Dollar inputs show `$` placeholder.
- **Script view** — `src/components/admin/acquisition/ScriptTestTable.tsx`: editable rows, `computeScriptRow`, "All variations" footer, an "Add variation" button (`useColdSmsScriptCreate`) and per-row delete. Sub-tab count pill = `rows.length`.

Reuse the Bento Bold table CSS from the mockup / the F3 `DailyTracker` styles; Monthly + Script tables share the same `.card`/`.scroll`/`table` styling (they are static-row editable tables, not the day engine).

## 6. Tests

`src/lib/coldSms.test.ts` (Vitest, Node env):
- `computeDailyRow`: normal rates; zero denominators → `null`/"—" (no NaN/Infinity); blank inputs → null.
- `computeDailyRollup`: filled-day counting (blank days excluded), Average vs Total, aggregate rates from sums; all-empty month → zeros / "—".
- `computeMonthlyRow`: show rate, SMS/client, total cost = VA + SMS, cost/call, cost/showed, CAC, ROI (incl. negative ROI when cash < cost, and `totalCost=0` → null).
- `computeMonthlyRollup`: sums; LTV = average of LTV>0 rows only; ratios recomputed from sums.
- `computeScriptRow`: reply% and booking% (booking% denominator = sent — assert explicitly); zero sent → null.
- `computeScriptRollup`: aggregate sums + rates.
- Guard: verify shared `pct`/format helpers come from `trackerMonth.ts` (no duplicate math).

(Endpoint validation — bad `month`, empty `name`, blank→null coercion — can piggyback the existing admin endpoint test style in `functions/api/admin/constraints/index.test.ts` if the foundation adds a tracker test harness; otherwise pure-lib coverage above is the Phase-1 requirement.)

## 7. File-by-file change list (ordered)

1. `command-center/app/supabase/migrations/00NN_cold_sms_tracker.sql` — three tables (§3). Run `npm run db:migrate`.
2. `command-center/app/functions/api/admin/tracker/cold-sms-daily.ts` — GET(month) + PATCH upsert-by-day + audit.
3. `command-center/app/functions/api/admin/tracker/cold-sms-monthly.ts` — GET(all) + PATCH upsert-by-month + audit.
4. `command-center/app/functions/api/admin/tracker/cold-sms-script.ts` — GET + POST + PATCH + DELETE + audit.
5. `command-center/app/src/lib/api.ts` — three DTOs (§5).
6. `command-center/app/src/lib/coldSms.ts` — compute/rollup fns (reusing `trackerMonth.ts` helpers).
7. `command-center/app/src/lib/coldSms.test.ts` — unit tests (§6).
8. `command-center/app/src/hooks/useApi.ts` — the query + mutation hooks (§5).
9. `command-center/app/src/components/admin/acquisition/MonthlyEconomicsTable.tsx`
10. `command-center/app/src/components/admin/acquisition/ScriptTestTable.tsx`
11. `command-center/app/src/components/admin/acquisition/ColdSmsSurface.tsx` — sub-nav + month state + Daily(`<DailyTracker>`)/Monthly/Script.
12. F2 Acquisition `PillarPage` (`src/routes/admin/PillarPage.tsx` or equivalent) — wire the `sms` tab `case` to render `<ColdSmsSurface/>`. (Tab entry itself is registered by F2 in `src/lib/adminPillars.ts`.)

## 8. Verify

- `npm run typecheck` (app + functions), `npm run build`, `npm test` green.
- `npm run db:migrate` applies `00NN_cold_sms_tracker` cleanly (idempotent re-run = no-op).
- Boot the app → `/admin/pillar/acquisition?tab=sms`:
  - Sub-nav switches Daily / Monthly / Script; month nav shows only on Daily.
  - Daily: every day of the month renders; type a cell → rates + footer + stat tiles update live; reload → value persisted; prev/next/Today navigate months and load the right rows.
  - Monthly: add/edit a month row → computed columns + "All months" footer update; persists on reload.
  - Script: add a variation (count pill increments) → edit cells → rates + footer update; delete removes it; persists.
  - Empty month/state renders the honest empty template, no fabricated numbers.
- Manual live check in Jake's browser before ship (per finish-page flow).

## 9. Out of scope / Phase 2

- Auto-fill from GHL: `sms_sent` / `positive_replies` / `meetings_booked` from the SMS conversation + Sales-pipeline booking events (reuse the leads/pipeline endpoints already in the app). Daily rows would prefill and stay editable (manual override wins).
- Monthly `cash_collected` / `new_clients` from the Customers pipeline + invoices join; `sms_cost` from the SMS provider billing.
- Script-test attribution wired to real campaign tags rather than manual counts.
- Cross-surface rollup into Business Health (Command) once Cold Call + SMS + Sales Data all persist.
- All Phase-2 items are additive; Phase-1 manual entry remains the fallback and source of truth on conflict.

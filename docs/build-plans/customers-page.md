# Customers page + job close-out

Combined spec and implementation plan. Locked 2026-07-16.

## 1. What this is

A **Customers** page in the client app, backed by the live GHL **Customers** pipeline, plus the close-out flow that puts people into it. Willis's team can see every past customer, what they paid, what work was done, and when a recurring customer is next due.

Definition of done:

- A client sees One-Time and Recurring customers side by side, with per-type counts and revenue.
- Clicking a customer shows their full job history and next service date, and lets them fix mistakes.
- A completed job cannot quietly go unrecorded: the app nags until someone closes it out.
- Closing out a job writes the truth back to GHL and books the next service on the real calendar.
- The Revenue sidebar row is gone; revenue lives here.

Non-goals: backfilling historical customers, automatic recurring cadence (no cron books anything), any Google Calendar OAuth of our own.

## 2. Live GHL facts

Pulled 2026-07-16 from Willis (`OznT3yyuwK3dqVXDsCaD`) via the `ghl` CLI. Everything below is resolved **by name at runtime**, never by these ids; they are recorded only as a fallback and to prove the shape.

**Customers pipeline** `XYjBgpRZ5mTiTfJNQP8M` (created 2026-07-16 20:02)

| Stage | Id | Colour |
|---|---|---|
| `One-Time Customer 1️⃣` | `cd5c9ca6-a1bb-4f60-b2d6-e6cee678a2c9` | `#2563EB` |
| `Recurring Customer 🔁` | `62c3e2d0-7809-469d-bb94-f72281c4674b` | `#059669` |

**Sales pipeline** `6o9Gx6e0TXRFJdln5d01`, 7 stages, ending `Job Completed ✅` (`a2d3787c-74b8-4178-b501-7a25b6428e87`). That stage is the close-out queue.

**Calendars** (4). Recurring service books onto **Window Cleaning Service** `o6O06jq6QxdLjP0N9Ouz`: round-robin, 3-hour slots, 2 team members assigned, `autoConfirm: true`, `googleInvitationEmails: true`. It has team members, so it does not hit the "no team members" 422 that broke booking elsewhere. The others (Phone Strategy Session, Phone Estimate Session, Home Estimate) are sales calendars and are not used here.

Stage names carry emoji suffixes, so every match is lower-cased `contains`, not equality.

## 3. Decisions locked

| Question | Decision |
|---|---|
| Who is a customer | Anyone with an opportunity in the Customers pipeline. Their stage **is** their type. |
| Layout | Mockup C, recurring-forward. Recurring gets the wider column and carries the next service date. |
| Mobile | Collapses to One-Time / Recurring tabs with counts. |
| Header | Four tiles: Recurring count, Recurring revenue, One-Time count, One-Time revenue. |
| List rows | Name, total value, last job date. No source badge. |
| Job history | Lives in **our** database, not GHL. One row per job. |
| Lead to customer | The **same opportunity moves** Sales to Customers. Not a copy. |
| Repeat customer | One Customers card per contact, always. See §5.2. |
| Customer type | Always a human choice on close-out. Never auto-promoted. |
| Next service | Optional. Three choices: book it now / not scheduled yet / nothing due. |
| Editing jobs | Edit and delete, from the customer detail page. |
| Nudges | Red badge on the card, count badge on the sidebar, banner on Home. No push/email/SMS. |
| Revenue row | Removed from the sidebar. |

## 4. Data model

### 4.1 GHL owns the relationship

One opportunity per contact in the Customers pipeline. Its stage is the customer's type. Nothing else about a customer is stored in GHL by us.

### 4.2 We own the work

Migration `0027_customer_jobs.sql`. Two tables, both following the house convention: `tenant_id` FK cascade, RLS enabled with no policies (service-role only), idempotent, index on `(tenant_id, <sort> desc)`.

```sql
create table if not exists public.customer_jobs (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  ghl_contact_id        text not null,
  description           text not null,
  value_cents           integer not null default 0,
  completed_on          date not null,
  -- The Sales opportunity this job was closed out from. Null for a job added by
  -- hand from the customer page (backfill, or recovery from a partial failure).
  source_opportunity_id text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- The close-out ledger AND the double-submit guard in one. A given Sales
-- opportunity can only ever be closed out once.
create unique index if not exists customer_jobs_source_opp_uidx
  on public.customer_jobs (tenant_id, source_opportunity_id)
  where source_opportunity_id is not null;

create index if not exists customer_jobs_tenant_contact_idx
  on public.customer_jobs (tenant_id, ghl_contact_id, completed_on desc);

create table if not exists public.customer_service_plan (
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  ghl_contact_id     text not null,
  -- null = nothing booked. See status.
  next_service_at    timestamptz,
  -- 'booked'    : next_service_at is real and ghl_appointment_id is set
  -- 'unplanned' : they don't know yet. Amber on the page.
  -- 'none'      : recurring but nothing due. No amber, no nag.
  status             text not null default 'unplanned',
  ghl_appointment_id text,
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, ghl_contact_id)
);
```

Money is integer **cents**. GHL's `monetaryValue` is float dollars; convert at both boundaries.

`completed_on` is a bare date, no time, no timezone. `next_service_at` is a real instant, booked in the GHL calendar's own timezone.

### 4.3 How the page's numbers are computed

Revenue and counts are derived, never stored:

- Customers = opportunities currently in the Customers pipeline, grouped by `contactId`.
- A customer's total = sum of `customer_jobs.value_cents` for their contact id.
- A tile = sum across the customers **currently sitting in that stage**.

So moving someone One-Time to Recurring moves their whole revenue with them. That is the honest reading of "recurring revenue", and it means the tiles always reconcile with the columns below them.

**Accepted consequence:** revenue counts logged jobs only. Every pre-existing customer reads $0 until someone logs a job for them. Backfill is out of scope; the manual "Add job" on the customer page is the escape hatch.

## 5. The close-out flow

### 5.1 First-time customer (the common path)

1. Job lands in Sales / `Job Completed ✅`. Card immediately wears a red **Needs close-out** badge.
2. They open it. Close-out page at `/sales/leads/close-out/:opportunityId`.
3. They fill: what the job was, value (prefilled from the opportunity's `monetaryValue`), date completed (defaults today). Then One-Time or Recurring. If Recurring, the next-service block appears.
4. Save. In order:
   - **GHL first.** One `putOpportunity` call: `pipelineId` → Customers, `pipelineStageId` → chosen stage, `status: "won"`. The same opportunity, moved. Its whole lead history travels with it.
   - **Then our DB.** Insert the `customer_jobs` row, upsert `customer_service_plan`.
   - **Then the calendar,** if they chose "book it now".
5. The card is gone from Job Completed. The alert clears.

### 5.2 Repeat customer

The contact already has an opportunity in Customers. Moving the new Sales opportunity in would give them two cards. Instead:

1. Detect it: look up the contact's existing Customers opportunity before writing.
2. **Move the existing card** to the chosen stage (`putOpportunity`, stage only).
3. **Park the incoming Sales opportunity**: mark it `status: "won"`, leave it in Job Completed.
4. Insert the job row against the contact as normal.

This is why the alert cannot simply mean "cards in Job Completed": a parked card sits there forever. The rule is:

> **A job needs close-out when its opportunity is in Job Completed AND its id is not in `customer_jobs.source_opportunity_id`.**

That rule is correct for both paths (first-timers vanish from the stage; repeats are matched by ledger), which is why it's the only alert logic in the build.

### 5.3 Write ordering and failure

GHL first, database second, calendar third. Rationale: a human can always fix our database from the customer page (add / edit / delete a job), but nobody can fix a half-moved opportunity from the UI.

| Failure | Behaviour |
|---|---|
| GHL move fails | Nothing else runs. Error names the GHL reason, Retry button. No data written, nothing lost. |
| Move succeeds, DB insert fails | Customer is created but shows 0 jobs / $0. Honest error: "Moved them to Customers, but the job did not save. Add it from their customer page." Fully recoverable by hand. |
| Calendar booking fails | Job and move are already saved and stay saved. `next_service_at` is stored with `ghl_appointment_id` null and `status: 'unplanned'`, so the customer shows amber. Error names the reason and offers Retry. Never loses the job over a calendar problem. |
| Double submit / two staff at once | The unique index on `(tenant_id, source_opportunity_id)` rejects the second. Friendly "This job was already closed out" and a link to the customer. |

## 6. Surfaces

### 6.1 Customers page — `/customers`

Sidebar row under Company (`Users` icon), between Contacts and Jobs. Mockup C.

- Four tiles: Recurring count, Recurring revenue, One-Time count, One-Time revenue.
- Search by name, email, phone. Filters both columns, columns stay put.
- Columns are rendered **from the stages GHL returns**, in position order, not hardcoded to two. Any stage whose lower-cased name contains `recurring` gets the rich treatment (job count, since-date, sparkline, next-service line); every other stage gets the plain list. A third stage added in GHL therefore renders as a third column rather than silently swallowing customers. Grid is `auto-fit`.
- Rich rows show the next-service line: booked (`Next service Oct 02 · on the calendar`), overdue or unplanned (amber), or nothing when `status = 'none'`.
- Rows click through to `/customers/:contactId`.
- Desktop is two columns; below `lg` it is a tab strip with counts.

### 6.2 Close-out page — `/sales/leads/close-out/:opportunityId`

Dedicated full page, not a sheet. Deep-linkable, back goes to the board.

- Header: contact name, phone, email. Amber "This job needs closing out" strip.
- Fields: **What was the job?** (required, free text), **Job value** (prefilled, `$0` allowed for a warranty callback, negative rejected), **Date completed** (defaults today, future dates rejected).
- **Customer type**: One-Time or Recurring, always an explicit choice. If the contact is already a customer, the page says so plainly ("Kim is already a One-Time customer. Two jobs usually means recurring.") and still lets them pick either, because a returning one-off is a real thing.
- **Next service** (only when Recurring), three options:
  - *Book it now* — date + time, books on Window Cleaning Service, syncs to Google.
  - *Not scheduled yet* — amber on the Customers page until booked.
  - *No next service planned* — recurring, nothing due, no nag.
- One primary action: **Save + move to Customers**. `loading` latch so a double-tap cannot fire twice.
- Guards: opportunity not in Job Completed → redirect to the board with a note. Opportunity missing → 404 with a back link. Customers pipeline absent for the tenant → the form is disabled with an honest line, not a crash.
- Unsaved changes on dismiss → confirm.

### 6.3 Customer detail — `/customers/:contactId`

- Identity, type pill, lifetime total, job count.
- **Job history**: every job, newest first, each editable and deletable. Delete confirms.
- **Add job** button, for backfill and for recovering a partial failure.
- **Next service**: set, change, or clear. Changing an existing booking calls `rescheduleAppointment` with the stored `ghl_appointment_id` rather than booking a second one. Clearing cancels the GHL appointment; if that fails, our field is cleared anyway and the failure is surfaced.
- **Customer type** switch (One-Time ↔ Recurring), writing the stage to GHL.
- Deleting every job leaves the customer in place at $0. Their stage is the truth, not our rows.

### 6.4 Nudges

All three read one count endpoint, `GET /api/sales/close-outs/count` → `{ count }`, using the §5.2 rule.

- **Red badge on the card**: any Job Completed card needing close-out. Lives in `Board.tsx`.
- **Sidebar count** on the Leads row.
- **Home banner**: amber strip, "3 jobs need closing out", button into the first one. Hidden at zero.

### 6.5 Revenue removal

Remove the `/billing` row from `nav.ts`. Consequent edits, all of which will otherwise break:

- `src/lib/nav.test.ts:35` asserts `/billing` is in the Company section. Update the assertion.
- `src/lib/tourSteps.ts` billing step targets `[data-tour='nav-billing']`, generated from the nav row. Remove the step.
- `src/routes/AllFeatures.tsx:33` lists `/billing`. Remove it, or the tile silently vanishes and leaves dead config.

The `/billing` route itself stays registered so a bookmarked URL does not 404. **Jake to confirm**: leaving a dead route contradicts your delete-it-when-it-ships hygiene, but deleting `Billing.tsx` + `BillingDesktop.tsx` + `revenue.ts` outright is a bigger cut than you asked for, and that page is already known-bugged (invoices + payments return `internal_error`). My recommendation is to unlink now and delete in a follow-up once you have looked at the Customers tiles and agree they replace it.

Out of scope but worth flagging: `src/routes/Home.tsx:192` has a hardcoded `Revenue $12k` demo tile that is not real data and does not link anywhere. It is a live violation of your no-placeholder-chatter rule. Separate fix.

## 7. Scenario matrix

Everything below is decided, not open.

### Close-out

| # | Scenario | Handling |
|---|---|---|
| 1 | New customer, One-Time | Move opp → Customers/One-Time, `won`, insert job |
| 2 | New customer, Recurring + date | As above + upsert plan + book appointment |
| 3 | Recurring, not scheduled yet | `status: 'unplanned'`, amber on page |
| 4 | Recurring, nothing due | `status: 'none'`, no amber |
| 5 | Repeat customer | Move existing card, park incoming (§5.2) |
| 6 | Customer created by hand in GHL, no jobs | Treated as existing. Move stage, add job |
| 7 | Double submit | Unique index rejects. "Already closed out" |
| 8 | Two staff at once | Same guard. Second gets the friendly message |
| 9 | GHL move 502 | Nothing written. Error + retry |
| 10 | DB fails after move | Customer at $0. Honest error, add job by hand |
| 11 | Calendar fails | Job kept. Amber + reason + retry |
| 12 | No phone/email on contact | Fine. Rows tolerate empty |
| 13 | $0 value (warranty) | Allowed |
| 14 | Negative value | Rejected inline |
| 15 | Future completion date | Rejected inline |
| 16 | Very old date | Allowed |
| 17 | Opp not in Job Completed | Redirect to board with a note |
| 18 | Opp deleted | 404 + back link |
| 19 | Tenant has no Customers pipeline | Form disabled, honest line, no crash |
| 20 | Stage renamed in GHL | Lower-cased contains match survives it |

### Customers page

| # | Scenario | Handling |
|---|---|---|
| 21 | No customers | Empty state: "No customers yet. Close out a completed job to add your first." |
| 22 | Search matches nothing | Per-column empty line, columns stay |
| 23 | Loading / error | Spinner; error + Retry, matching `LeadsDesktop` |
| 24 | Customer with no jobs | "No jobs logged", $0. Honest |
| 25 | Contact deleted, opp remains | Row reads "Unknown contact" |
| 26 | Opp deleted, jobs remain | Customer drops out. Orphan rows never counted, because tiles derive from live opportunities |
| 27 | Third stage in GHL | Renders as a third column (§6.1) |
| 28 | Appointment cancelled in GHL | **Known gap.** The list trusts our stored date; the detail page verifies against GHL on open. A cancellation made in GHL shows stale on the list until then. Accepted for v1; fixing it means joining the calendar-events window into the list read. |
| 29 | Mobile | Tab strip with counts |
| 30 | Demo mode | `salesCustomers.ts` handler + `DEMO_CUSTOMERS` fixture |

### Permissions and tenancy

| # | Scenario | Handling |
|---|---|---|
| 31 | Staff permissions | No `capability` on the nav row, matching its neighbours Leads and Jobs. No new capability is introduced. |
| 32 | Preview read-only mode | Writes already blocked centrally in `_middleware.ts` |
| 33 | Another tenant, no Customers pipeline | Short honest empty state. Never a placeholder promise |
| 34 | Tenant scoping | Every DB read/write via `resolveTenantId(client, ctx.data.tenant.slug)`. `TenantContext` has **no** `id` field |

## 8. Implementation plan

Phases ship independently. Each ends green: `npm run typecheck` and `npm test`.

### Phase 1 — Read path and the page

1. `supabase/migrations/0027_customer_jobs.sql` — both tables (§4.2). Apply with `npm run db:migrate`. Note: memory records a pending `0027` from the fulfillment cockpit; the tree's highest is `0026`, so confirm no collision before naming.
2. `functions/lib/customers.ts` — pure, testable: `resolveCustomersPipeline(pipes)` (contains-match, emoji tolerant), `isRecurringStage(name)`, `groupCustomers(opps, jobs, plans)` → the page's shape, `centsFromMoney` / `moneyFromCents`.
3. `functions/api/sales/customers/index.ts` — `GET`. Fetch Customers pipeline opportunities, read `customer_jobs` + `customer_service_plan` for the tenant, join, return `{ columns, customers, tiles }`. Degrade to `{ customers: [], unavailable: true }` when Supabase or the pipeline is absent, per the house pattern.
4. `src/lib/customers.ts` — shared types + `DEMO_CUSTOMERS`.
5. `src/demo/handlers/salesCustomers.ts` — demo route.
6. `src/routes/Customers.tsx` + `src/components/customers/CustomersDesktop.tsx` — mockup C. Reuse `PAGE_CONTAINER`, `EmptyState`, `Button`, `formatMoney`.
7. `src/lib/nav.ts` — add the row. `src/App.tsx` — register `/customers`.
8. Tests: `functions/lib/customers.test.ts` (grouping, tile maths, emoji stage matching, unknown third stage, orphan rows).

### Phase 2 — Close-out

9. `functions/api/sales/close-outs/[opportunityId].ts` — `GET` prefill (contact, value, whether they are already a customer).
10. `functions/api/sales/close-outs/index.ts` — `POST`. The whole §5 flow: existing-customer detection, move-or-park, insert, plan upsert, optional booking. Unique-violation → 409 with a friendly body.
11. `functions/lib/customers.ts` — add `planCloseOut(input, existingCustomerOpp)` returning the intended writes as data, so the decision logic is unit-tested without touching GHL.
12. `functions/api/sales/close-outs/count.ts` — `{ count, opportunityIds }` via the §5.2 rule. Built here, not in Phase 3, because the Board badge below depends on it.
13. `src/routes/sales/CloseOutJob.tsx` — the page (§6.2). Reuse `DateTimeModal` for the next-service instant; a native `date` input for completion.
14. `src/components/Board.tsx` — red **Needs close-out** badge on Job Completed cards, driven by the count endpoint's id list.
15. Tests: `planCloseOut` across first-time, repeat, each next-service option, and every rejection in §7.

### Phase 3 — The rest of the nudges

16. `src/components/Sidebar.tsx` — count badge on Leads, reading the Phase 2 count endpoint.
17. `src/routes/Home.tsx` + `HomeDesktop.tsx` — amber banner, hidden at zero.

### Phase 4 — Customer detail

18. `functions/api/customers/[contactId]/index.ts` — `GET` (identity, jobs, plan).
19. `functions/api/customers/[contactId]/jobs/[jobId].ts` — `PUT`, `DELETE`.
20. `functions/api/customers/[contactId]/jobs/index.ts` — `POST` (add by hand).
21. `functions/api/customers/[contactId]/plan.ts` — `PUT`: book / reschedule via stored `ghl_appointment_id` / clear.
22. `src/routes/CustomerDetail.tsx` — §6.3.
23. Tests: reschedule-not-rebook, clear-cancels, delete-last-job.

### Phase 5 — Revenue removal and docs

24. `src/lib/nav.ts` remove the row; `nav.test.ts:35`; `tourSteps.ts` step; `AllFeatures.tsx:33`.
25. `app/docs/connections/customers.md` — what is wired to what.
26. `git rm docs/build-plans/customers-page.md` in the shipping commit.

## 9. Verification

No "should work" anywhere.

- `npm run typecheck` and `npm test` green.
- Customers page driven in the real running app via `?demo=1`, both breakpoints.
- **Live GHL write test needs Jake's go-ahead.** Moving an opportunity across pipelines cannot be safely proven against Willis by me alone: creating or moving a card in `Job Completed ✅` may fire whatever GHL workflows watch that stage, and could text or email a real contact. Plan: Jake supplies (or approves) a throwaway contact, I run one close-out end to end, we confirm the card lands in Customers and the appointment appears on Window Cleaning Service and on Google, then we delete it.
- Ship per the autopilot loop: build → verify → commit → push → watch deploy → smoke the live URL → report.

## 10. What Jake needs to do

1. **Confirm GHL → Google Calendar sync is on** for the Window Cleaning Service calendar, for whichever team members should see it. Without this the appointment lands in GHL only and never reaches their Google Calendar. (Settings → My Profile → Calendar integration, per user.)
2. **Approve the live write test**, and say whether to use a throwaway contact or one of yours.
3. **Decide the `/billing` route**: unlink now and delete later (my recommendation), or delete the whole page in this build.
4. **Confirm the `0027` migration number** does not collide with the fulfillment cockpit migration that memory says is pending.
5. Eyeball the Customers page live once Phase 1 is up, before I build the close-out on top of it.

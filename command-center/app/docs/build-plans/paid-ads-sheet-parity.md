# Paid Ads: sheet parity (Dashboard + Lead Tracker)

Bring the client tracking sheet's **Dashboard** and **Lead Tracker** tabs into the
client app as live pages, so a client never opens the Google Sheet again.

Source of truth for the copy: the client tracking workbook
(`1YYyOEp7WPN8WnRgm09DisQlnEnhnxyHjiEfNqF0enLM`), tabs Dashboard, Lead Tracker,
META DATA, PipelineStats, How to use.

Status: Phases 1 to 4 built and verified on localhost 2026-07-30. Phases 5 to 7
not started. Nothing deployed.

---

## 1. Definition of done

Opening **Marketing > Paid Ads** as a client lands on a Dashboard that shows the
same twelve headline numbers as the sheet's RESULTS block and the same
campaign / ad set / ad breakdown, for the same four date ranges. The Lead Tracker
tab lists every ad lead with the same columns the sheet showed. Every number is
live: nothing is typed by us, nothing is sample data, and ad spend is no more
than 24 hours old.

Verified on `http://localhost:5174` against the real Willis tenant before
anything is deployed.

---

## 2. Decisions taken (2026-07-30, Jake)

| Question | Decision |
| --- | --- |
| Tab order | Dashboard first and the landing page, then Lead Tracker, then Meta Data |
| Media tab | Cut. It was never in the sheet |
| Job value / revenue | Existing close-out flow on the client Sales page. No new input |
| Spend refresh | Nightly cron worker, plus a manual Refresh button in the admin panel |
| Lead Information column | Generic: print whatever form answers the lead actually carries |
| Notes column | Client-typed free text, saved by us |
| Status labels | Leave the app's automatic 12-status model as-is. Revisit after it is built |

---

## 3. What already exists (do not rebuild)

Checked in the working tree 2026-07-30.

- **All of the arithmetic.** `functions/lib/adTrackerMetrics.ts` is a verbatim
  port of the sheet's Dashboard formulas: `rollup()` returns leads, pickups,
  bookings, sales, revenue, spend, pickup rate, booking rate, sales %, close
  rate and ROAS; `breakdown()` pivots to campaign / ad set / ad with spend,
  leads, bookings, sales, revenue, ROAS, cost per lead and cost per booking.
  Tests assert against numbers transcribed from the sheet.
- **The endpoint.** `GET /api/ads/tracker?range=&level=` already returns
  `{ kpis, breakdown, unattributed, leads, currency, meta }`, tenant-scoped.
  The Dashboard needs no new backend route.
- **The lead list.** `src/routes/paid-ads/AdsLeadTracker.tsx` renders date,
  lead, phone, email, status and when, live.
- **A reference rendering.** `src/components/admin/cockpit/paidads/AdTrackerPanel.tsx`
  already draws the KPI block and breakdown table for the admin. The client
  Dashboard is the same payload with client-facing styling.
- **The spend sync.** `POST /api/admin/ads/sync` fetches Meta ad-day rows and
  upserts them into `meta_ad_days` keyed on `(tenant_id, date, ad_id)`, so
  re-running is a no-op.
- **The revenue path.** `functions/api/sales/close-outs/[opportunityId].ts` plus
  `src/routes/sales/CloseOutJob.tsx` and `src/components/home/CloseOutBanner.tsx`
  let a client enter a job value once the card reaches Sales > Job Completed.
  That writes `customer_jobs`, which is exactly what feeds Revenue and ROAS.
- **Form answers are already on the wire.** GHL's bulk contacts list returns
  `customFields`, and `loadTrackerData()` already fetches those contacts. Lead
  Information costs no extra API call.

## 4. What is actually missing

1. **Nothing runs the spend sync.** No cron, no button. `meta_ad_days` holds 18
   rows, newest 2026-07-18. Until this is fixed, every spend, ROAS, cost per
   lead and cost per booking on the Dashboard is wrong.
2. **No Dashboard page.** The tab was removed in July. The data has been
   flowing the whole time.
3. **`customer_jobs` is empty (0 rows).** The close-out flow works but has never
   been used, so Revenue and ROAS will read zero for every client until a job is
   closed out in the app.
4. **Lead Information and Notes are not in the tracker payload.**
5. **Currency is hardcoded** to `"USD"` in `functions/api/ads/tracker.ts:159`.
6. **The pipeline map was out of date** (found during Phase 3 verification, not
   in the original survey). The 2026-07-28 CRM realignment renamed
   "1) Lead Form" to "1) Leads" and "2) Funnel" to "2) No Answer".
   `trackerPipelineRole()` matched neither, so it saw only the Sales and Trash
   pipelines, both of which are empty. Every Paid Ads surface was therefore
   returning **zero leads** while spend kept arriving: a dashboard that looks
   alive and reads nonsense. `leadStatus.ts` had been updated for the rename;
   `adTrackerMetrics.ts` had not. Fixed, with the four live pipelines and all
   their stages now pinned by test.

---

## 5. Phases

Each phase ends in a state that can be verified on localhost. Build in order.

### Phase 1: spend goes live (backend only)

Without this the Dashboard is decorative, so it goes first.

1. `functions/lib/adsCron.ts` (new). Mirror `functions/lib/healthCron.ts`
   exactly: one exported const path (`/api/admin/ads/sync`), one header name
   (`x-ads-cron`), a 32-character minimum secret, constant-time compare, and one
   pure `isAdsCronRequest(method, pathname, header, secret)`. Differences from
   the health gate, both deliberate and both to be called out in the comment:
   this one allows **POST**, and the handler behind it **writes**. It writes
   only `meta_ad_days` upserts built from Meta's own API response, and it never
   sets `ctx.data.admin`.
2. `functions/lib/adsCron.test.ts` (new). Copy the health cron test table:
   wrong method, wrong path, prefix path, unset secret, short secret, wrong
   secret, correct secret.
3. `functions/lib/env.ts`. Add `ADS_CRON_SECRET?: string`.
4. `functions/api/_middleware.ts`. Add the gate beside the health one at
   line ~103, same shape, same comment discipline.
5. `functions/api/admin/ads/sync.ts`. `logAdminAction` currently dereferences
   `ctx.data.admin!.id`, which is undefined on a cron call. Guard it: log the
   action only when there is an admin, otherwise `console.log` the result.
   Update the SCHEDULING comment, which currently says nothing calls this.
6. `workers/ads-cron/` (new). Copy `workers/health-cron/` wholesale. Cron
   `0 6 * * *` (06:00 UTC, roughly 1am Central, after the Meta day closes).
   `SYNC_URL = "https://app.hauckmarketing.com/api/admin/ads/sync?days=7"`.
   Secret set with `wrangler secret put ADS_CRON_SECRET`, matching the Pages
   project value exactly. README explains the 7-day window: Meta restates
   recent spend, so re-pulling a week and upserting is what keeps history true.
7. Doppler: add `ADS_CRON_SECRET` (`openssl rand -hex 32`) to the
   `hauck-command-center` prd config, then refresh `.dev.vars`.

**Verify:** from localhost, `curl -X POST -H "x-ads-cron: <secret>" http://localhost:5174/api/admin/ads/sync?days=30`
returns a row count, and `meta_ad_days` gains rows dated within the last day.
Confirm a second identical call changes nothing (the upsert holds).

### Phase 2: the manual Refresh button

8. `src/components/admin/cockpit/paidads/AdTrackerPanel.tsx`. A "Refresh spend"
   button in the panel header. Posts to `/api/admin/ads/sync?tenantId=<id>&days=30`
   with the admin session, shows a spinner, then invalidates the
   `["admin-ad-tracker", ...]` query. Show the last synced date beside it, read
   from the existing `meta.spendDays` / a new `meta.lastSpendDate`.
9. `functions/api/ads/tracker.ts` and `functions/api/admin/clients/[tenantId]/ads/tracker.ts`.
   Add `lastSpendDate` to the `meta` block (max date in `spendRows`, or null).
   `src/lib/api.ts`: add it to `AdTrackerResponse["meta"]`.

**Verify:** click it in the admin cockpit on localhost, watch the numbers move.

### Phase 3: the Dashboard page

10. `src/routes/paid-ads/AdsDashboard.tsx` (new). Two blocks, matching the sheet:

    **RESULTS.** A date-range control (All Time / 7 Days / 30 Days / 90 Days)
    and twelve figures in the sheet's own order and wording: Leads, Pickups,
    Pickup Rate, Bookings, Booking Rate, Sales, Sales % (of leads), Close Rate
    (of bookings), Revenue, Ad Spend, ROAS. Null ratios render `-`, never `0`.

    **BREAKDOWN.** A "View by" control (Campaign / Ad Set / Ad) and a table of
    Name, Spend, Leads, Bookings, Sales, Revenue, ROAS, Cost / Lead, Cost /
    Booking. The sheet's ID column is a tooltip, not a column: a client has no
    use for a 17-digit Meta id taking a quarter of the width.

    Reads `useAdsTrackerQuery(range, level, ...)`, which already exists. Both
    controls reuse `Segmented` from `./trackerShared`. Show the `unattributed`
    count under the breakdown, in the sheet's spirit but plainer: "N leads could
    not be matched to an ad."

    Follow `~/.claude/skills/frontend-design` and the Console look already in
    `AdsLeadTracker.tsx`. This is a client-facing page: no jargon, no fabricated
    states, honest zeros before ads have run.
11. `src/lib/pageTabs.ts`. `PAID_ADS_TABS` becomes Dashboard (`end: true`),
    Lead Tracker, Meta Data. Update the comment, which currently records the
    July decision to remove the Dashboard.
12. `src/App.tsx`. `/marketing/paid-ads` renders `AdsDashboard`;
    `/marketing/paid-ads/leads` renders `AdsLeadTracker` (it is currently a
    redirect to the section root, so that line is replaced, not added).
13. Mobile: check the KPI grid and the breakdown table at 390px. The table gets
    the same `overflow-x-auto` treatment the tracker uses.

**Verify:** localhost:5174, all four ranges and all three levels, against the
admin cockpit's numbers for the same tenant. They come from the same maths and
must agree exactly.

### Phase 4: cut the Media tab

14. Delete `src/routes/paid-ads/AdsMedia.tsx`, its route and import in
    `src/App.tsx`, and the `/marketing/paid-ads/creatives` redirect.
15. Leave `src/hooks/useAdsMedia.ts`, `functions/api/ads/media.ts` and
    `AdLibraryPanel.tsx` alone: the admin Ad Library still uses that core.

### Phase 5: Lead Information column

16. `functions/lib/ghl.ts`. Add `customFields?: { id?: string; value?: unknown }[]`
    to `GhlContactRecord`. It is already on the wire, just untyped.
17. `functions/lib/leadFormAnswers.ts` (new). Pure. Given a contact's
    `customFields` and the location's field map (`customFieldKeyMap`, already
    cached), return `{ label, value }[]` for populated fields, excluding the
    plumbing: anything whose key starts `utm_`, plus `ad_id`, `adset_id`,
    `ad_set_id`, `campaign_id`, `ad_account_id`, `status`, `thread`,
    `ai_response`, `last_appt_id`, `closed_revenue`, `price`. Cap at three
    answers so one verbose client cannot wreck the row. Unit tests, including
    the Willis shape: "Are you the home owner?" and "What Is Your Timeline For
    The Window Cleaning".
18. `functions/lib/leadTrackerData.ts`. Fetch `customFieldKeyMap(gctx)` in the
    existing `Promise.all` and return `leadInfoByContact`.
19. `functions/api/ads/tracker.ts`. Add `leadInfo: { label, value }[]` to each
    lead row.
20. `src/lib/api.ts`. Add it to `LeadTrackerLead`.
21. `src/routes/paid-ads/AdsLeadTracker.tsx`. A "Lead information" column after
    Email, rendering `Label: value` pairs, truncated with the full text on
    hover. Empty reads `-`.
22. `src/routes/paid-ads/sampleLeads.ts`. Add the field so the dev sample still
    typechecks and looks right.

**Verify:** localhost, Willis tenant, a Facebook-sourced lead shows
"Homeowner: yes, Timeline: ASAP". A website-form lead shows `-`, not an error.

### Phase 6: Notes column

The only client-typed field in the whole feature, so it gets its own table
rather than being pushed into GHL where it would need a custom field per client.

23. `supabase/migrations/0073_ad_lead_notes.sql` (new).
    `ad_lead_notes (tenant_id uuid, ghl_contact_id text, note text,
    updated_at timestamptz, updated_by text, primary key (tenant_id, ghl_contact_id))`,
    RLS off (service-role only, like the rest), plus an index on `tenant_id`.
24. `functions/api/ads/tracker/notes.ts` (new). `PUT`, body `{ contactId, note }`.
    Tenant comes from the session, never the body. Trim, cap at 500 characters,
    empty string deletes the row. Returns the saved note.
25. `functions/lib/leadTrackerData.ts`. Load `ad_lead_notes` for the tenant in
    the existing `Promise.all` and return `noteByContact`.
26. `functions/api/ads/tracker.ts`. Add `note: string` to each lead row.
27. `src/hooks/useApi.ts`. `useSaveLeadNoteMutation`, optimistic, invalidating
    `["ads-tracker"]`.
28. `src/routes/paid-ads/AdsLeadTracker.tsx`. A Notes column: click to edit,
    blur or Enter saves, Escape cancels. Read-only for a preview session.
29. `src/lib/api.ts` types for both.

**Verify:** type a note on localhost, reload, it is still there. Check it does
not leak across tenants by reading the row directly in Supabase.

### Phase 7: currency, and the revenue reality check

30. `functions/api/ads/tracker.ts:159`. Replace the hardcoded `"USD"`. Willis is
    US so the value is right today, but it should come from the tenant row.
    Add `currency` to `tenants` in the same migration as Phase 6, default
    `'USD'`, and read it through `tenantResolve.ts`.
31. Close-out reality check, no code expected. In Willis's GHL, confirm the
    Sales pipeline has a stage matching "Job Completed" (`closeOutQueue.ts`
    matches lower-cased contains). If it does not, the close-out banner can
    never appear and Revenue stays at zero forever. If it is missing, that is a
    GHL configuration job, not an app change.

---

## 5b. Built so far (2026-07-30)

Phases 1 to 4, verified against the live Willis tenant on localhost.

**Phase 1, spend goes live.** New `functions/lib/adsCron.ts` + `.test.ts` (10
tests), `ADS_CRON_SECRET` in `env.ts`, the gate in `_middleware.ts`, the audit
guard in `admin/ads/sync.ts`, and `workers/ads-cron/` (worker, wrangler.toml,
package.json, tsconfig, README). Verified: no header 401, wrong same-length
secret 401, GET with the right secret 401, POST with the right secret synced 67
rows. `meta_ad_days` went from 18 rows stuck on 18 July to 67 rows through 29
July.

**Phase 2, Refresh button.** `lastSpendDate()` in `adTrackerMetrics.ts`, carried
by both tracker endpoints and typed in `src/lib/api.ts`. `useAdsSyncMutation` in
`useApi.ts`. Button plus a "Spend is N days behind" line in `AdTrackerPanel.tsx`.

**Phase 3, the Dashboard.** New `src/routes/paid-ads/AdsDashboard.tsx`. Tabs
reordered in `pageTabs.ts`, routes rewired in `App.tsx` (`/marketing/paid-ads` =
Dashboard, `/marketing/paid-ads/leads` = Lead Tracker), and the retired
`/sales/leads*` redirects repointed at the Lead Tracker rather than the section
root, so a bookmark that used to show leads still shows leads.

**Phase 4, Media cut.** `AdsMedia.tsx` deleted, route redirected, references
updated in `connectionRegistry.ts` and `softwareMap.test.ts`. The admin Ad
Library keeps the shared `adsMedia` core.

**Unplanned, the pipeline map.** See §4.6. `trackerPipelineRole()` and
`STAGE_LEVELS` updated to the realigned four pipelines, pre-realignment names
kept for unmigrated clients, and 5 new tests pinning every stage of all four.

Whole suite green: 174 files, 2432 tests. Typecheck clean.

Live payload after the fix, Willis, all time: 15 leads (was 0), all attributed,
$468.93 spend, 15 breakdown rows, cost per lead computing. Revenue and ROAS read
zero because `customer_jobs` is still empty, exactly as §4.3 predicted.

## 5c. Live-campaign scope (2026-07-30, Jake)

The breakdown was listing every campaign a client had ever run, so the same
creative appeared three times under three dead campaigns. Jake's rule:

- The breakdown shows **only the campaign Meta says is live**, at all three
  levels. Its ad set and its ads, nothing else.
- **Every** ad in that campaign is listed, including ones that have never spent.
- The ones actually running are **badged Live and sorted to the top**.
- **Results is not scoped.** It stays the true total for the selected date
  range, because that is what the sheet's date filter meant. The two therefore
  will not add up, so the page says which campaign the breakdown is showing and
  that paused campaigns still count above.

Built as: migration `0073_meta_ad_entities.sql` (structure plus Meta's
`effective_status`, replaced whole on each sync so a deleted campaign cannot
keep filtering the page), `functions/lib/metaAdEntities.ts`, `syncEntities()` in
`admin/ads/sync.ts`, `liveCampaignIds()` and the `entities` argument to
`breakdown()` in `adTrackerMetrics.ts`, `meta.liveCampaigns` on both endpoints,
and the Live badge plus scope note on the page. 10 new tests.

No live campaign, or no structure synced yet, means no filtering: a blank
breakdown is a worse answer than an unfiltered one.

Verified on Willis: campaign level 1 row (live), ad set level 1 row (live), ad
level 16 rows with Video 2 and SIGN 1 badged and on top. Results unchanged at 15
leads and $468.93.

## 6. Verification before ship

- `npm run typecheck` and `npm run test` clean.
- Both pages walked on `http://localhost:5174` as a real client session, all
  ranges and levels, against the admin cockpit for the same tenant.
- Playwright screenshots of Dashboard and Lead Tracker, desktop and 390px.
- `security-review` on Phase 1 (a new unauthenticated write path) and Phase 6
  (a new client-writable table).
- Deploy is a separate, approved step. Push to main, watch with
  `npm run cf`, smoke-test app.hauckmarketing.com.

## 7. Open, deliberately deferred

- **Status labels.** The app's automatic 12-status model stays. Jake will
  decide after seeing it whether to map down to the sheet's 8 typed labels.
- **PipelineStats tab.** Not being rebuilt. It existed to sync the sheet to a
  master sheet; the app already holds every client's numbers.
- **How to use tab.** Not being rebuilt.

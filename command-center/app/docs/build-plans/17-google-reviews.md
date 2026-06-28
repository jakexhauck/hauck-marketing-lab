# 17. Google Reviews: completed-job review requests

## Objective

Turn the stubbed `/marketing/reviews` page into a working "Google Reviews" section.
When a job is marked complete in GHL, that customer shows up in a list. Each row has a
**Start Campaign** button. Pressing it adds the `request review` tag to that contact in
GHL, which fires the existing **Ongoing Review Campaign** workflow (the per-customer review
ask). One responsive page serves both phone and desktop.

## Why it matters

Today the review campaign never starts on its own. The "Ongoing Review Campaign" workflow
is triggered by the `request review` tag, and nothing in the account ever adds that tag, so
every review request is manual and most never happen. This page closes that gap with a
one-tap, per-customer ask that a non-technical client can run after each completed job. It
is the highest-leverage hole found in the 2026-06-28 account audit.

## Dependencies and prerequisites

These live in the client's GHL sub-account, not in this repo. The page is harmless without
them (the button will add a tag that nothing listens to), but it only produces reviews once
they are true:

1. **The "Ongoing Review Campaign" workflow is published and active** in the client's GHL
   sub-account, triggered by the `request review` contact tag. In the test master template
   it exists but is in draft (`active: false`), like everything else.
2. **The campaign's Google review link is set** (the custom value the campaign's SMS/email
   uses to send the customer to the right Google review page). This is the "Google review
   page" part: we are not building a page here, we are pointing the campaign at the client's
   real Google review URL.
3. **The tag string is exactly `request review`** (lower-case), matching the workflow's
   existing trigger condition. Do not invent a new tag.

No new GHL workflow is built in this doc. We reuse what exists.

In-repo: nothing blocks this. It follows the read-plus-single-write pattern already proven
by `08-contact-notes.md`. Supabase is optional (see "Started state" below).

## Current state

- Nav entry already exists, stubbed:
  `src/lib/nav.ts:106`
  ```ts
  { to: "/marketing/reviews", label: "Google Reviews", shortLabel: "Reviews", icon: Star, comingSoon: true },
  ```
  `comingSoon: true` routes it to `ComingSoon.tsx`. No route, component, or endpoint exists.

- GHL reads are ready. `functions/lib/ghl.ts`:
  - `fetchAllOpportunities(ctx, { pipelineId })` (line 128) paginates opportunities, optionally
    scoped to one pipeline. `GhlOpportunity` carries `contactId`, `pipelineStageId`,
    `contact.{firstName,lastName,phone,email}`, and `createdAt`.
  - `ghlJson(ctx, path, init)` (line 48) is the low-level authed call used for writes.
  - Tenant creds come from `ctx.data.tenant` (`ghl_token`, `ghl_location_id`) via
    `functions/api/_middleware.ts`. Never read env tokens directly.

- The write pattern to copy is `functions/api/contacts/[contactId]/notes.ts`: a GET that
  reads from GHL and a POST that writes one object back through `ghlJson`.

## Target state

A `/marketing/reviews` page that:

1. Lists contacts whose Sales-pipeline opportunity is in the **Job Completed** stage, newest
   first: name, when the job completed, phone/email, and a status pill.
2. Shows **Start Campaign** per row. Pressing it `POST`s to our backend, which adds the
   `request review` tag to the contact in GHL. On success the row flips to **Campaign
   started** and the button disables.
3. Reflects already-started rows on reload (a contact that already carries the tag shows
   **Campaign started**, not an active button), so the client cannot double-send.

### Resolving "Job Completed" per tenant

Pipeline and stage IDs differ per client, so do not hardcode the test IDs. Resolve by name
against the tenant's pipelines (the app already fetches these via `PipelinesContext` /
`/api/pipelines`):

- Pipeline whose name matches `Sales Pipeline` (case-insensitive, trimmed).
- Stage within it whose name matches `Job Completed`.

If either is missing, the endpoint returns an empty list plus a `configError` flag the page
surfaces as a quiet "No Sales / Job Completed stage found" note rather than a crash. Add an
optional override later (a `reviews_stage_id` tenant config value) if name-matching proves
fragile; name-match is the right default for the first clients.

(Test account reference only, do not hardcode: Sales Pipeline `bKDivijtLXU8QvIPxMIz`, Job
Completed stage `39b46809-5847-4571-b1ef-835f9d476103`.)

### Started state

The opportunity-search list omits tags (by design, for cost), so "has the contact already
been asked?" needs a source of truth. Pick the lightest that fits:

- **Default (no Supabase):** in the reviews GET, for the completed-job set only (a small
  list), read each contact's tags and set `started = tags.includes("request review")`. Cap
  the enrichment (for example newest 50) and note the cap in the response so the UI can say
  "showing most recent 50". Completed-jobs volume is low, so this is acceptable.
- **If Supabase is wired (03):** also log a `review_campaign_started` row in `activity_log`
  when the button is pressed, and prefer that for instant, tag-fetch-free status. The tag in
  GHL stays the source of truth; the log is a fast cache.

Start with the default. The button must always write the tag regardless, the tag is what
makes the campaign fire.

## Step by step

1. **Backend GET** `functions/api/reviews/index.ts` (`onRequestGet`):
   - Read `ctx.data.tenant`. Fetch pipelines (reuse the pipelines helper / endpoint logic),
     resolve the Sales Pipeline id and Job Completed stage id by name. If unresolved, return
     `{ contacts: [], configError: "stage_not_found" }`.
   - `fetchAllOpportunities(ctx, { pipelineId: salesPipelineId })`, filter to
     `pipelineStageId === jobCompletedStageId`.
   - Map to `{ contactId, name, phone, email, completedAt }`. Sort newest first. Enrich
     `started` per the "Started state" default. Return `{ contacts, started?, truncatedAt? }`.

2. **Backend POST** `functions/api/reviews/start.ts` (or `onRequestPost` in the same file),
   body `{ contactId }`:
   - Validate `contactId`. Add the tag via
     `ghlJson(ctx, '/contacts/' + encodeURIComponent(contactId) + '/tags', { method: 'POST', body: JSON.stringify({ tags: ['request review'] }) })`.
   - If Supabase is present, write the `activity_log` row. Return `{ ok: true }`.
   - Idempotent: re-adding an existing tag is a no-op in GHL, so a double press is safe.

3. **Types** in `src/lib/api.ts`: `ApiReviewContact { contactId; name; phone; email; completedAt; started: boolean }`
   and `ApiReviewsResponse { contacts: ApiReviewContact[]; configError?: string; truncatedAt?: number }`.

4. **Hook** `src/hooks/useReviews.ts`: a `useApi('/api/reviews')` query plus a
   `startCampaign(contactId)` mutation that POSTs and invalidates the query (optimistically
   flip `started` for snappy feel).

5. **Route component** `src/routes/GoogleReviews.tsx`: Shell + TopBar, list of rows with the
   status pill and Start Campaign button. Empty state: "No completed jobs yet, finished jobs
   show up here to request a review." Use the existing design tokens (`DESIGN.md`); no em
   dashes in any copy.

6. **Desktop variant** if the list needs a wider layout: `src/components/reviews/ReviewsDesktop.tsx`,
   following the `LeadDetailDesktop` pattern. A single responsive list is fine to start.

7. **Wire the route** in `src/App.tsx`: protected route at `/marketing/reviews` rendering
   `GoogleReviews`.

8. **Flip the nav** `src/lib/nav.ts:106`: `comingSoon: true` to `comingSoon: false`. Decide
   whether Reviews earns a phone bottom-nav tab (it is in Marketing; the bottom bar already
   holds five). Recommendation: leave it off the bottom bar, reachable from the menu/sidebar,
   to avoid a sixth tab.

## Testing (test mode)

Use `TEST_GHL_*` env and the test password. In the test account:

1. Put a test contact's opportunity into the Sales Pipeline "Job Completed" stage. Confirm it
   appears on `/marketing/reviews`.
2. Press **Start Campaign**. Confirm in GHL the contact now has the `request review` tag, and
   the row shows **Campaign started**.
3. Reload. Confirm the started row stays **Campaign started** (no active button).
4. Temporarily rename the stage. Confirm the page shows the quiet config note, not a crash.
5. Publish the Ongoing Review Campaign in the test account and confirm pressing the button
   enrolls the contact (the campaign's first SMS/email goes out).

## Acceptance criteria

- [ ] Completed-job contacts list on `/marketing/reviews`, newest first, on phone and desktop.
- [ ] Start Campaign adds the exact `request review` tag to the contact in GHL.
- [ ] Started rows render as started on reload and cannot double-send.
- [ ] Missing Sales / Job Completed stage degrades to an empty state with a note, never a crash.
- [ ] No hardcoded pipeline/stage IDs; resolved per tenant by name.
- [ ] No em dashes in code, comments, or UI copy.

## Rollback

Set `src/lib/nav.ts` back to `comingSoon: true` to hide the page instantly. The endpoints are
additive (`functions/api/reviews/*`) and read-only except the single tag write, which is
idempotent and reversible (remove the tag in GHL). No migrations are required unless the
optional Supabase `activity_log` logging is added.

## Open product questions (decide before build)

- Bottom-nav tab on phone, yes or no (recommendation: no).
- Cap on the started-state enrichment if a client has a very large completed-jobs history
  (recommendation: newest 50, surfaced in the UI).
- Should an already-started contact drop off the list after N days, or stay with a started
  pill (recommendation: stay, so the client has a record).

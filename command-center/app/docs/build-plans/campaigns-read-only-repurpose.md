# Campaigns — read-only "done-for-you" repurpose (spec + plan)

## Goal / definition of done

Repurpose the client-facing Campaigns section from a tool clients **operate** (compose + send their own SMS/email) into a read-only **transparency window** on the campaigns the agency sends on their behalf, and how they perform. No client ever creates, drafts, schedules, or sends anything.

Done when:
- Every create/send/AI affordance is gone from the client UI.
- The Templates tab is removed.
- Audiences shows real customer counts from the client's own contacts.
- Overview / Campaigns / What's working read real sent-campaign data from an agency-owned log (empty and honest until we log our first send).
- Reactivation is untouched (already read-only + live).
- Verified in Jake's authed browser, shipped, connection doc updated.

## Decisions (locked with Jake)

- **Data source = we log what we send.** Agency records each send in our own Supabase table; the client page reads it. No dependence on GHL's thin campaign-stats API (same wall that dead-ended Reviews/Social). Reactivation still reads its GHL pipeline directly.
- **Templates tab = cut entirely.** Client-authoring concept, dead in a done-for-you model.

## New tab lineup

| Tab | Route | Change |
|---|---|---|
| Overview | `/marketing/campaigns` | Read-only glance. Remove "New campaign". |
| Campaigns | `/marketing/campaigns/all` | Read-only history. Remove "New campaign" + composer. |
| Audiences | `/marketing/campaigns/audiences` | Read-only. Remove "New list". Wire real counts. |
| Reactivation | `/marketing/campaigns/reactivation` | Unchanged. |
| What's working | `/marketing/campaigns/insights` | Read-only (already no create). |
| ~~Templates~~ | ~~`/marketing/campaigns/templates`~~ | **Deleted.** |

---

## Phase A — read-only repurpose + real Audiences (ships first)

Pure frontend plus one real endpoint. Always correct regardless of whether we've sent anything.

### A1. Remove the create/send surface

- **Delete** `src/components/campaigns/NewCampaignDialog.tsx`.
- **Keep** `src/components/campaigns/CampaignDialog.tsx` (shared modal shell; still used by the report + audience dialogs).
- **Keep** `CampaignReportDialog.tsx` (read-only report) and `AudienceDetailDialog.tsx` (read-only detail; strip its `onSend`/"send to this list" affordance so it's view-only).

### A2. Cut Templates

- **Delete** `src/routes/campaigns/CampaignsTemplates.tsx`.
- `src/lib/pageTabs.ts`: remove the Templates entry from `CAMPAIGNS_TABS`.
- `src/App.tsx`: remove the `CampaignsTemplates` import and its `<Route>`.
- `src/routes/campaigns/shared.tsx`: remove `DemoTemplate` + `DEMO_TEMPLATES`.

### A3. Strip create affordances from the three surfaces

- `CampaignsOverview.tsx`: remove the `NewCampaignDialog` import/state and the "New campaign" button (`PageBar` `actions`). Keep the read-only KPI row, Up next, and Recently sent (opens `CampaignReportDialog`). **Remove the "Ideas for you" panel and the "Send it again next month?" nudge** — both invite a client action that no longer exists in a done-for-you model.
- `CampaignsList.tsx`: remove `NewCampaignDialog` + "New campaign" button. Keep the status filters and read-only rows/report.
- `CampaignsAudiences.tsx`: remove `NewCampaignDialog` + "New list" button. Keep the segment cards + read-only detail dialog.

### A4. Empty-state copy flip

The current banner (`NotConnectedNotice` in `shared.tsx`) tells the client to "connect your messaging" — a client action that no longer exists. Replace with done-for-you language:
- Overview/List: "Your campaigns will appear here once we start sending for you."
- Audiences: keep the real-data view; only show an empty note if the contact list is genuinely empty.
- Remove the disabled "Connect messaging (coming soon)" button entirely.
- Cleanup: `CampaignsInsights.tsx` uses an em-dash (`"—"`) as the non-demo KPI placeholder. Replace it (blank or `"0"`) to honour the no-em-dash rule.

### A5. Wire Audiences to real contacts

New endpoint `functions/api/campaigns/audiences.ts` (GET), tenant-scoped like the others.

- Source: `fetchAllContacts` + `fetchAllOpportunities` (both already in `functions/lib/ghl.ts`).
- Segments computed for v1 (drop the two trade-specific demo segments — 5★ jobs, "No A/C in 12mo" — they need review/service data we don't reliably have):
  - **All customers** — contacts with a phone or email on file.
  - **New customers** — first opportunity (or `dateAdded`) within 60 days.
  - **Repeat / VIP** — 3+ won opportunities (group opportunities by `contactId`).
  - **Past customers** — most recent opportunity older than 12 months (or no open opp).
- Returns `{ segments: [{ id, name, count, desc }], configError? }`. On an unresolved/empty location, return `configError` so the surface shows its honest empty state, never zeros-as-data.
- Client shape + demo payload in a new `src/lib/campaignsAudiences.ts` (mirror of the reactivation pattern). `?demo=1` short-circuits to the Willis-flavored demo counts.
- Cache in KV ~15 min (two upstream GHL calls per load).

**Phase A ships here.** Overview/List/Insights still read the existing demo constants (populated only under `?demo=1`; empty + honest in a real session). That is correct until Phase B.

---

## Phase B — agency campaign log (real Overview/List/Insights)

Turns the read-only reporting real. Empty until we log our first Willis send.

### B1. Supabase table (new migration)

`client_campaigns`:
- `id` (uuid, pk), `tenant_id` (fk), `channel` ('sms'|'email')
- `title`, `subject` (nullable, email only), `body`
- `audience_label`, `audience_size` (int)
- `status` ('draft'|'scheduled'|'sent')
- `scheduled_at` (nullable), `sent_at` (nullable)
- `recipients`, `delivered`, `opens`, `clicks`, `replies`, `jobs_booked` (ints, nullable)
- `created_by`, `created_at`, `updated_at`
- RLS: client reads own tenant rows; agency (service role) writes.

### B2. Read endpoint

`functions/api/campaigns/index.ts` (GET) — tenant-scoped list of `client_campaigns` rows, newest first, shaped for the client surfaces (KPIs, Up next = scheduled, Recently sent = sent). Returns `[]` cleanly when empty.

### B3. Agency logging path (minimal)

A small admin form (in the existing admin app) to insert/edit a `client_campaigns` row per send: channel, title, subject, body, audience label + size, status, scheduled/sent date, and the result numbers we fill in after. No bulk-send integration; we run the actual send in GHL, then log the record here. YAGNI: a single form, not a CRUD suite.

### B4. Client wiring

- `CampaignsOverview.tsx`, `CampaignsList.tsx`, `CampaignsInsights.tsx`: read from `/api/campaigns` (real session) / demo payload (`?demo=1`). Replace the `DEMO_CAMPAIGNS` / `DEMO_INSIGHTS` reads with the live hook; keep demo constants only as the `?demo=1` payload.
- KPIs, Up next, Recently sent, Top campaigns, and the report dialog all bind to real rows.

---

## Empty-state principle (unchanged golden rule)

A real connected client only ever sees their own data or an honest empty state. Never fabricated content. Reactivation already models this; every repurposed surface follows it.

## Verification

- Typecheck + build.
- `?demo=1` preview: every surface renders its populated read-only layout; no create/send buttons anywhere; no Templates tab.
- Authed Willis session (Jake's browser): Audiences shows real counts; Overview/List/Insights show the honest empty state (Phase A) or real logged campaigns (Phase B).

## Ship

Autopilot once Jake verifies: commit, push origin main, watch Cloudflare (`hauck-dashboard`), grep live JS bundle to confirm the new build serves.

## Follow-ups / out of scope

- GHL live delivery/open/reply stats as a later enrichment layer, only if the API proves reachable.
- Actual bulk-send automation (A2P 10DLC number + verified email domain) — separate infrastructure track, not part of this repurpose.

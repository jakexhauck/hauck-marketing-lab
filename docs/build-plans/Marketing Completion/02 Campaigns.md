# 02 Campaigns

Routes: `command-center/app/src/routes/campaigns/` — `CampaignsOverview`, `CampaignsList`, `CampaignsReactivation`, `CampaignsAudiences`, `CampaignsTemplates`, `CampaignsInsights`, `shared.tsx`.
Components: `components/campaigns/NewCampaignDialog` (Send button disabled), `CampaignReportDialog`, `AudienceDetailDialog`.
Demo data: `routes/campaigns/shared.tsx`.

**Area status:** 6 pages, all fully designed, all demo-only. No `/api/campaigns*` endpoints, no campaign Supabase tables. This is SMS/email marketing run through GHL.

**Area-wide dependencies:** F3 (GHL campaigns/conversations + contact search), F4 (attribution, for every "jobs booked" number), new Supabase tables `campaigns`, `campaign_sends`, `campaign_results`, `audiences`, `templates`.

**The recurring hard problem:** "Jobs booked" appears on Overview, Insights, and Reactivation. It is pure attribution (F4): tag contacts at send, credit the campaign when their opportunity reaches Won within the window. Build F4 before any results page.

---

## Page: Overview (`/marketing/campaigns`)

**Current:** designed; demo shows 4 KPIs (sent this month, email open rate, replies, jobs booked), "up next", "recently sent", "ideas". Real session zeroed.

**Information needed:** counts of sent campaigns, aggregate open/reply rates, jobs booked (attributed), scheduled + recently-sent campaign lists, suggested campaign ideas.

**Connections:** Supabase `campaigns` + `campaign_results` (own data), F4 (jobs booked), optional Claude (ideas).

**APIs / endpoints:** `GET /api/campaigns/overview` (aggregate from `campaigns`/`campaign_results`/`attributions`).

**Backend:** `functions/api/campaigns/overview.ts`.

**Open questions:** ideas can be a simple heuristic list to start (seasonal, win-back, review-ask); Claude generation is a later enhancement, not a blocker.

---

## Page: Campaigns list (`/marketing/campaigns/all`)

**Current:** designed; filter tabs (All/Scheduled/Drafts/Sent), campaign rows with status or results. `NewCampaignDialog` Send button is disabled.

**Information needed:** all campaigns with title, audience size, schedule, status, and (for sent) open/reply/jobs results.

**Connections:** Supabase `campaigns`; GHL `/conversations/messages` to actually send; F4 for results.

**APIs / endpoints:**
- `GET /api/campaigns` (list), `POST /api/campaigns` (create + queue), `GET /api/campaigns/:id` (results).
- Send path: enqueue per-recipient sends to GHL, tag each contact `campaign:<id>` (feeds F4).

**Backend:** `functions/api/campaigns/index.ts`; `campaigns` + `campaign_sends` tables; a dispatch path (queue or scheduled function) to send via GHL and record `campaign_sends.status`. Enable the dialog's Send button once wired.

**Open questions:** send-at-scale needs throttling and a scheduler. Decide queue (trigger.dev) vs simple cron-drained table.

---

## Page: Reactivation (`/marketing/campaigns/reactivation`)

**Current:** designed; demo shows dormant/reached/replied/booked KPIs, a 4-stage "where they are now" funnel, a 3-step SMS/email sequence, and recent win-backs. This is the database win-back play.

**Information needed:** count of dormant customers, how many reached/replied/booked, funnel stage counts, the live sequence definition, recently won-back contacts + their revenue.

**Connections:** GHL "Database Reactivation" pipeline (stage counts, recent Won), a definition of "dormant" (which tag/custom field), F4 (booked + revenue).

**APIs / endpoints:**
- `GET /api/campaigns/reactivation` → GHL pipeline stage counts + `attributions` filtered to `source_type=reactivation`.

**Backend:** `functions/api/campaigns/reactivation.ts`. Maps GHL reactivation pipeline stages to the 4 funnel buckets.

**Open questions (decide before building):**
- **What defines "dormant"?** No booking in 12 months (computed from opportunities) vs a tag vs a custom field. Pick one.
- The sequence is hardcoded in the UI. Does it stay agency-managed (read-only display) or become client-editable? Recommend read-only for v1.
- This is the live answer to your earlier attribution question: tag every reactivation recipient, credit the booking. F4 is the whole game here.

---

## Page: Audiences (`/marketing/campaigns/audiences`)

**Current:** designed; demo shows 6 audience cards with counts, detail modal with sample members + "send to this list". "New list" disabled.

**Information needed:** named segments, each with a live member count and a way to resolve members; criteria definition for smart segments (e.g. "no A/C service in 12mo").

**Connections:** GHL `/contacts/search` with tag/custom-field/opportunity filters; Supabase `audiences` for saved definitions.

**APIs / endpoints:**
- `GET /api/audiences` (list + counts), `POST/PUT/DELETE /api/audiences/:id`, `GET /api/audiences/:id/members`.

**Backend:** `functions/api/audiences/`; `audiences` table storing `criteria_json`; resolver that translates criteria to a GHL contact search.

**Open questions:** smart segments like "no A/C service in 12mo" need a defined source signal (service-type custom field or opportunity history). Define the queryable fields first; static lists work immediately, smart segments need the field design.

---

## Page: Templates (`/marketing/campaigns/templates`)

**Current:** designed; demo shows 6 SMS/email templates grouped by category, "Use" prefills the new-campaign dialog. "New template" disabled. "Used in N campaigns" hardcoded.

**Information needed:** stored templates (channel, category, title, subject, body) and a real usage count.

**Connections:** Supabase only. No external API. **This is the simplest page to finish.**

**APIs / endpoints:** `GET /api/templates`, `POST/PUT/DELETE /api/templates/:id`.

**Backend:** `functions/api/templates/`; `templates` table. Usage count derived from `campaigns.template_id`.

**Open questions:** none. Self-contained CRUD. Good warm-up page.

---

## Page: What's working (`/marketing/campaigns/insights`)

**Current:** designed; demo shows summary KPIs (messages sent, email open rate, SMS reply rate, jobs booked), top campaigns ranked by jobs, a takeaway line.

**Information needed:** aggregate sent volume, open/reply rates, jobs booked + revenue per campaign, ranking.

**Connections:** Supabase `campaign_sends`/`campaign_results` (volume, opens, replies via GHL webhooks) + F4 (jobs, revenue).

**APIs / endpoints:** `GET /api/campaigns/insights`.

**Backend:** `functions/api/campaigns/insights.ts`. Requires GHL delivery/open/reply webhooks populating `campaign_results`.

**Open questions:** open/reply tracking depends on GHL emitting those events. Confirm which engagement webhooks GHL provides for bulk sends before promising open rate.

---

## Area build order

1. **Templates** (pure CRUD warm-up). 2. F4 attribution. 3. **Reactivation** (active play, mostly read of existing GHL pipeline + F4). 4. `campaigns` + send path → **List** + **Overview**. 5. **Audiences** (static first, smart segments after field design). 6. **Insights** (needs engagement webhooks).

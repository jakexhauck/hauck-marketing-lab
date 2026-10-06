# 5. Lead form into Meta

## Goal

The Instant Form drafted in Paid Ads > Ad Builder > Lead Form gets a "Create in Meta" button that builds it on the client's Facebook Page. No more rebuilding it by hand in Ads Manager.

## Definition of done

- The client has a Facebook Page picked (new: `tenants.meta_page_id`), chosen from the Pages the agency's Meta system user can reach. Picker on the Lead Form page when it is empty.
- "Start from SOP template" on an empty draft fills the SOP form: name "<Company> | OG Form", More volume, greeting headline, 3 checkmark lines (Claude writes them for the trade, plan 0), homeowner question (No closes the form), timing question (30 Days+ closes the form), full name + phone, the phone note, privacy link (client website or our funnel domain), lead end page (Call Business with the GHL number) and the non-lead end page (View Website).
- "Create in Meta" posts the draft to `POST /{page_id}/leadgen_forms` with a Page access token, stores the returned form id + created time on the draft, and shows "In Meta" with a link to the form.
- Meta forms cannot be edited once made. After creation the draft locks; "Duplicate draft" makes a new editable copy for the next version.
- Clear errors for: no Page picked, Page not reachable by the system user ("Give the system user access to <Page> in Business Settings"), Meta rejecting a field (Meta's message shown).

## What exists

- `ad_lead_forms` (0090/0099) with every section Meta asks for: intro, questions (`showIf` conditional follow-ups, `disqualify` answers), privacy, consents, completion page, locale, sharing, tracking params. Today it only exports text to paste.
- Agency token (`metaToken.ts`) has `pages_manage_ads`, `leads_retrieval`, `pages_show_list`, `ads_management`. Reachable Pages today: Made Better Landscapes & Co, Willis Window Washing. Not AAG yet.

## Design

- `functions/lib/metaLeadForm.ts` (pure): `toMetaPayload(form, facts)` maps the draft to Graph API fields: `name`, `questions` (FULL_NAME/PHONE prefill types, CUSTOM with `options`), `privacy_policy`, `follow_up_action_url`, `thank_you_page` / end pages, `is_optimized_for_quality` from intent, `locale`, `tracking_parameters`, `context_card` (intro).
- Conditional logic and the "close the form" answers are the risk: Meta's API expresses conditional answers through `conditional_questions_group_id` and the non-lead ending through end-page logic. Task 1 proves what the API accepts before the mapper is written; anything the API cannot express is listed on the button as "Set by hand in Meta after: ...".
- `functions/lib/metaPages.ts`: `listReachablePages(token)` and `pageToken(token, pageId)`.
- Migration 0143: `tenants.meta_page_id text`, `ad_lead_forms.meta_form_id text`, `ad_lead_forms.meta_created_at timestamptz`.
- API: `GET /api/admin/meta/pages`, `PATCH /api/admin/clients/:id` (page id, existing route), `POST /api/admin/clients/:id/ads/lead-forms/:formId/create-in-meta`, `POST .../duplicate`.

## Files

- Create: `functions/lib/metaLeadForm.ts` (+ test), `functions/lib/metaPages.ts`, `functions/api/admin/meta/pages.ts`, `functions/api/admin/clients/[tenantId]/ads/lead-forms/[formId]/create-in-meta.ts`, `.../duplicate.ts`, `supabase/migrations/0143_meta_lead_form_push.sql`
- Modify: `src/components/admin/cockpit/paidads/LeadFormsPanel.tsx`, `LeadFormEditor.tsx`, `src/hooks/useApi.ts`, `functions/api/admin/clients/[tenantId]/index.ts` (accept `metaPageId`), `src/lib/releaseNotes.ts`

## Tasks

1. Spike (needs Jake's OK, it writes to a real Page): create one test form named "zz-api-test" on Willis's Page with a conditional question and two end pages, read it back, then archive it. Record exactly which fields the API accepted.
2. TDD `toMetaPayload` from the spike's accepted shape (prefill types, choice options, privacy, end pages, intent, tracking params, unsupported features listed).
3. Migration 0143, Page picker, create + duplicate endpoints.
4. SOP template filler (Claude writes the 3 checkmark lines; the rest is fixed text).
5. UI: lock after create, "In Meta" badge, error messages.
6. Release note, blueprint.

## Tests

Vitest for the mapper and the template filler. Live: the spike form, then one real form for a client Jake names.

## Jake owes

1. Say yes to the test form on Willis's Page (it gets archived straight after).
2. Give the Meta system user access to Above All Garage Doors' Page in Business Settings.

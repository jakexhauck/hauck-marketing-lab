# 1. Long Term Nurture texts

## Goal

On a client's GHL > Follow-up Texts page, one click writes the 4 Long Term Nurture texts for that client's trade, ready to copy into the LTN workflow.

## Definition of done

- Page `/admin/client/:id/ghl/follow-ups`, row "Follow-up Texts" in the GHL group. Two sections: Long Term Nurture (this plan) and Lead Form (plan 2).
- Write button produces SMS 1 to 4. Each text shows its wait ("after 10 days", "14", "10", "15", from the SOP), a character count with SMS segment count, and a Copy button.
- Texts use GHL merge fields exactly: `{{contact.first_name}}`, `{{custom_values.user_first_name}}`, `{{custom_values.company_name}}`.
- Each text is editable in place and saved. Rewrite one text, or all four.
- Rules enforced in the prompt AND checked after: no em dashes, no "near you" / address claims unless the lead form asks for an address, max 2 segments (320 chars), sign-off line on texts 1, 2 and 4 as in the SOP examples.
- Last written date shown on the section.

## What exists

- SOP examples for Brick Paving and Window Cleaning (copied into the prompt as style references).
- Plan 0 helper + `clientFacts`.

## Design

- Table `client_copy` (migration 0141): `tenant_id, kind ('ltn' | 'lead_fu'), items jsonb, written_at, edited_at`, primary key `(tenant_id, kind)`. `items` = `[{ key: "sms1", text }]`.
- `functions/lib/ltnPrompt.ts`: system prompt + JSON schema `{ sms1, sms2, sms3, sms4 }`.
- `functions/lib/smsRules.ts` (pure, shared with plan 2): `checkSms(text, facts)` returns problems (em dash, too long, unknown merge field, address claim when no address). Shown as a small warning under a text, never blocking.
- API: `GET/PUT /api/admin/clients/:tenantId/copy/ltn`, `POST .../copy/ltn/write` (optionally `{ only: "sms2" }`).
- UI: `components/admin/cockpit/ghl/FollowUpTextsPanel.tsx` + `CopyTextCard.tsx` (shared with plan 2).

## Files

- Create: `supabase/migrations/0141_client_copy.sql`, `functions/lib/ltnPrompt.ts`, `functions/lib/smsRules.ts`, `functions/lib/smsRules.test.ts`, `functions/api/admin/clients/[tenantId]/copy/[kind].ts`, `functions/api/admin/clients/[tenantId]/copy/[kind]/write.ts`, `src/components/admin/cockpit/ghl/FollowUpTextsPanel.tsx`, `src/components/admin/cockpit/ghl/CopyTextCard.tsx`
- Modify: `src/lib/clientNav.ts` (+ test), `src/routes/admin/ClientPage.tsx`, `src/components/admin/clientRowIcons.ts`, `src/hooks/useApi.ts`, `src/lib/releaseNotes.ts`

## Tasks

1. Mockups: 2 to 3 layouts for the Follow-up Texts page (cards vs. a phone-thread preview). Jake picks.
2. TDD `smsRules`: segment count (GSM vs unicode), em dash, unknown merge field, address claim.
3. Migration 0141.
4. Endpoints (admin only, tenant scoped). `write` calls plan 0, runs `checkSms`, saves, returns items + warnings.
5. Nav row + page + cards, copy buttons, inline edit with save.
6. Release note, blueprint.

## Tests

Vitest: smsRules, clientNav row, endpoint handler with a fake Claude. Live: write Willis's LTN texts, compare to the SOP examples by eye.

## Jake owes

1. Read the first Willis and Made Better results and say if the voice is right before AAG.

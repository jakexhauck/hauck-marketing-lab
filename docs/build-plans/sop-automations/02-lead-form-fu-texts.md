# 2. Lead form follow-up texts

## Goal

The Lead Form section of GHL > Follow-up Texts (same page as plan 1). Claude writes the three per-client texts; the two alert messages are filled from a template; the universal texts are not shown.

## Definition of done

Per client (Jake, 2026-10-06: "personalise a few"):

| Text | How | SOP spot |
|---|---|---|
| First text (inside hours) | Claude | "Hey {{contact.first_name}}, It's {{custom_values.user_first_name}} here from ... P.S. attached is a pic of ..." |
| SMS 3 | Claude, plus a one-line photo idea that backs it up | "SMS 3, tailor the copy" |
| Hail Mary | Claude | "Hail Mary, personalise this copy" |
| Client alert | Template | "🔥 New Lead ... This lead is being dialed and followed up with right now!" |
| Agency alert | Template with the client's name | "🔥 New Lead For <Client> ... Dial This Lead NOW!" |

- A "Photo" choice on the section: Owner alone / Owner and crew. The first text's P.S. line follows it (SOP: "if there is just a photo of the owner alone tweak the copy").
- Same card, copy, edit, rewrite and warning behaviour as plan 1 (`CopyTextCard`, `smsRules`).
- Not shown, on purpose: enquiry confirmation, outside-hours text, Recent Work and Owner Story texts. They are universal and live in the GHL snapshot.

## What exists

- Plan 1's table (`client_copy`, kind `lead_fu`), endpoints (`[kind]`), card and rules.
- Universal decision recorded in `functions/lib/conversionAssets.ts` header. This plan narrows it: three texts become per-client. Update that comment.

## Design

- `functions/lib/leadFuPrompt.ts`: schema `{ first, sms3, sms3Photo, hailMary }`. Inputs: facts + photo choice + the SOP originals as style references.
- `functions/lib/leadFuAlerts.ts` (pure): `clientAlert()` and `agencyAlert(businessName)` return the exact SOP text with GHL merge fields.
- `items` stores `photo: "owner" | "crew"` beside the texts.

## Files

- Create: `functions/lib/leadFuPrompt.ts`, `functions/lib/leadFuAlerts.ts`, `functions/lib/leadFuAlerts.test.ts`
- Modify: `functions/api/admin/clients/[tenantId]/copy/[kind]/write.ts` (kind `lead_fu`), `src/components/admin/cockpit/ghl/FollowUpTextsPanel.tsx`, `functions/lib/conversionAssets.ts` (comment), `src/lib/releaseNotes.ts`

## Tasks

1. TDD `leadFuAlerts` (client name inserted, merge fields intact, no em dash).
2. Prompt + schema; `write` handles `lead_fu`, keeps the photo choice.
3. UI section under LTN with the photo choice and five cards (alerts marked as template, no Rewrite button).
4. Release note.

## Tests

Vitest: alerts, write handler with fake Claude for `lead_fu`. Live: Willis and Made Better.

## Jake owes

Nothing new beyond plan 0's key.

# 3. Custom values sheet

## Goal

GHL > Custom Values: every custom value the SOP lists for a client, what the app thinks it should be, what GHL actually holds, a Copy button on each, and one Push button that writes the app's values into GHL.

## Definition of done

- Page `/admin/client/:id/ghl/custom-values`, row "Custom Values" in the GHL group.
- Rows grouped as the SOP groups them: API Tokens, Business/Owner, Emails/SMS/Internal Notifications, Facebook Ads, Calendars, plus the rest of `ONBOARDING_FIELDS`.
- Each row: name, app value (editable, saves to `onboarding.fields`), live GHL value (read on page load), a match tick or a mismatch dot, Copy.
- Push writes through the existing `writeCustomValues` (same code path as linking a sub-account) and re-reads GHL after.
- New: **Ad Account ID** custom value (merge field `{{custom_values.ad_account_id}}`, confirmed in Willis's GHL 2026-10-06), filled from `tenants.meta_ad_account_id`. The SOP doc wrongly says `client_ad_account_id`.
- New: **Company Phone Number** defaults to the sub-account's bought GHL number when there is one (SOP: "Local GHL Number"), instead of the client's own phone that intake seeds today. The client's phone stays on User Personal Phone.
- The Location API Token row shows "Set" / "Missing", never the token.
- Unlinked sub-account: page shows the app values and Copy only, Push disabled with "Link GHL first".

## What exists

- `src/lib/onboarding.ts` `ONBOARDING_FIELDS` (about 30 mapped custom values) + `buildProvisionPlan`.
- `functions/lib/customValuesProvision.ts` `writeCustomValues` (preflight, PUT each, records result, ticks checklist).
- `functions/lib/onboardingSeed.ts` seeds fields from intake.
- `ghlCreds.ts` resolves the tenant's GHL key.

## Design

- `src/lib/customValuesSheet.ts` (pure): `buildSheet(fields, tenant, liveValues, phoneNumbers)` returns grouped rows with `appValue`, `ghlValue`, `state: "match" | "differs" | "missing-in-ghl" | "empty"`. Fully unit tested.
- Add `{ key: "ad_account_id", customValue: "Ad Account ID" }` to `ONBOARDING_FIELDS`, filled at read time from the tenant (not typed).
- GHL phone lookup: `GET /phone-system/numbers/location/{locationId}` (check scope on the app token first; if the scope is missing, keep the typed value and show a note row).
- API: `GET /api/admin/clients/:tenantId/custom-values` (sheet), `PATCH` (save one app value), `POST .../push` (wraps `writeCustomValues`).

## Files

- Create: `src/lib/customValuesSheet.ts` (+ test), `functions/api/admin/clients/[tenantId]/custom-values/index.ts`, `.../custom-values/push.ts`, `src/components/admin/cockpit/ghl/CustomValuesPanel.tsx`
- Modify: `src/lib/onboarding.ts` (new key), `functions/lib/customValuesProvision.ts` (fill ad account id + GHL number before planning), `src/lib/clientNav.ts` (+ test), `ClientPage.tsx`, `clientRowIcons.ts`, `useApi.ts`, `releaseNotes.ts`

## Tasks

1. Spike: confirm the GHL phone-numbers endpoint works with the linked token on Willis (read only).
2. TDD `buildSheet` (match, differs, missing in GHL, empty, token masked, unlinked).
3. Endpoints, page (mockup first), Push with a result line ("12 written, 1 not in GHL").
4. Release note, blueprint.

## Tests

Vitest for `buildSheet` and the provision plan with the new key. Live: Willis sheet read only first; Push only after Jake says so (it writes to a real client).

## Jake owes

Nothing.

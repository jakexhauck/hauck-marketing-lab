# Finishing the onboarding flow — wiring the new-client wizard

**Status:** planned, 2026-07-30
**Surface:** `/admin/clients/new` (Fulfillment > Onboarding > New client)

## The one broken link

Everything downstream of client creation already works: the Onboarding roster,
a client's record (`/admin/onboarding/:tenantId`), the checklist, the live GHL
readiness checks, and "Push values to GHL". The record even has somewhere to
put the client's intake answers (`onboarding.intake`, migration 0054).

The wizard that feeds all of it does not. `src/routes/admin/AdminClientNew.tsx`
collects six steps and a review screen, saves a draft to `localStorage`, and
ends at a **disabled Create button with no API calls in the file**. A client is
still stood up by hand somewhere else, which is why the roster is the only door
into the wizard and the wizard is a dead end.

This plan closes that loop and nothing else.

## Definition of done

Pressing **Create client** on the review screen:

1. creates the tenant, its entitlements and the owner login,
2. stores the step 3 connection values that already have columns
   (`website_url`, `meta_ad_account_id`, `ga4_property_id`, `google_place_id`),
3. saves the client's own intake answers (steps 4-6) to `onboarding.intake`,
4. seeds `onboarding.fields` with the answers that map to GHL custom values, so
   "Push values to GHL" on the record arrives half-filled instead of blank,
5. creates the client's Google Drive folder and maps it in `client_folders`,
6. clears the draft and lands on `/admin/onboarding/:tenantId`.

Not in scope: a client-facing intake link (Jake fills all six steps himself), and
in-app file uploads (see Decisions).

## Decisions taken

**One request, not four.** The wizard calls `POST /api/admin/clients` once. That
endpoint grows optional `intake`, `onboardingFields` and Drive handling rather
than the browser firing four calls it would have to unwind on a partial failure.
Every addition is optional, so the existing callers are untouched.

**Drive folders, not in-app uploads.** The wizard's three file fields (logo,
headshot, past-work photos) are removed. Instead, creating a client creates their
Drive folder and the success state opens it.

Why: `functions/lib/driveDirect.ts` (the only path that can move file bytes) runs
on the agency's own Google Cloud OAuth client, whose consent screen is still in
Testing. Google expires those refresh tokens every 7 days, so an in-app uploader
would fail roughly weekly until the app clears verification (restricted Drive
scope: CASA assessment, weeks of work). The Composio grant that the SOP hub uses
stays connected but cannot transfer bytes. Creating folders is metadata only, so
it goes through Composio's proxy and keeps working. Jake drops the files into
Drive himself, which is what he does today anyway.

**Drive failure is never fatal.** If Drive is throttled or disconnected, the
client is still created and the response carries a warning. A missing folder is
a thing to retry, not a reason to lose an owner login that was already written.

## Files

### Backend

- `functions/lib/onboardingSeed.ts` — **new.** Pure mapping: wizard answers ->
  `onboarding.fields` keys (from `src/lib/onboarding.ts`'s `ONBOARDING_FIELDS`).
  Exported so it can be unit-tested without a network.
- `functions/lib/onboardingSeed.test.ts` — **new.** The map, blanks skipped,
  no key invented that the provisioner does not know.
- `functions/lib/driveComposio.ts` — **edit.** Add `proxyPost` (the existing
  `proxyGet` hard-codes `method: "GET"`) and `createDriveFolder`.
- `functions/lib/clientDriveFolder.ts` — **new.** Create "🤝 | <Client>" under
  the configured root and return its id + link. One folder, empty: there is no
  agreed structure for the inside of a client folder yet, and inventing one
  would put a shape in Drive that nobody agreed to. Keeps the naming convention
  in one place for when that structure is decided.
- `functions/lib/clientDriveFolder.test.ts` — **new.** Folder naming, and that a
  Drive error surfaces as a warning rather than a throw.
- `functions/api/admin/clients/index.ts` — **edit.** Accept the new optional
  body fields; write the tenant columns; upsert the `onboarding` row (fields +
  intake); create the Drive folder and insert `client_folders`; return
  `{ id, slug, ownerWarning, driveWarning, driveFolderUrl }`.

### Frontend

- `src/lib/clientOnboarding.ts` — **edit.** Drop the three `file` fields and the
  now-unused `file` field type usage; add `buildCreatePayload(values)` so the
  request body is built (and tested) outside the component.
- `src/lib/clientOnboarding.test.ts` — **edit.** Cover `buildCreatePayload`.
- `src/lib/api.ts` — **edit.** `createAdminClient(payload)` + its response type.
- `src/hooks/useApi.ts` — **edit.** `useAdminClientCreate()`, invalidating the
  onboarding list and the clients list on success.
- `src/components/admin/onboarding/WizardField.tsx` — **edit.** Remove the file
  input branch.
- `src/routes/admin/AdminClientNew.tsx` — **edit.** Wire Create: submit, disable
  while pending, show the API error inline, then a success state naming the
  client with "Open their Drive folder" and "Go to their onboarding record".
  Clear the draft only after a 201.

### Config

- `CLIENT_DRIVE_ROOT_FOLDER_ID` — new env var, same shape as the existing
  `SOP_DRIVE_FOLDER_ID`. Needs adding to Doppler and to Cloudflare Pages.
  Unset means "skip the folder, warn", so nothing breaks before it is set.

## Order of work

1. `onboardingSeed.ts` + tests (pure, no network).
2. `driveComposio` POST support + `clientDriveFolder.ts` + tests.
3. `POST /api/admin/clients` extension.
4. `buildCreatePayload` + api/hooks.
5. The wizard's submit, error and success states; file fields removed.
6. Verify on localhost against a throwaway client, then delete its rows.
7. Ship as a separate, approved step.

## Verification

`npm test` for the pure units, then localhost (wrangler on 8788 + vite on 5173,
which point at the **production** Supabase). Verification therefore creates a
real tenant: it will be named obviously (`Zzz Test Client`), checked end to end
(tenant row, owner login, onboarding row with intake, Drive folder, redirect),
then removed with a scripted delete of the tenant row (cascades) and its Drive
folder trashed. Evidence captured before deletion.

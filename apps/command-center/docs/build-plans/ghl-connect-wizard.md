# GHL connect wizard

Fulfillment > GHL gets the same connect screen Paid Ads has. Two fields, one
button, a bar and a tick: the client's Private Integration token and their
location id, proven against GoHighLevel before either is stored.

## Why

The two values already live on the tenant row (`ghl_location_id`, `ghl_token`)
and the only way to set them today is a pair of boxes buried in Management >
GoHighLevel connection, which saves whatever is typed without ever asking GHL
whether it works. A half-wired client then reads as connected everywhere and
fails silently on every page that needs the sub-account.

## Done means

- Fulfillment > GHL opens on "Connect GHL" for an unwired client, with
  Calendars and Connection withheld until the creds are real.
- Pasting a token and a location id proves them against GHL, and a rejection
  comes back in GHL's words with nothing written.
- Once saved, the wizard is a green line and the sub-tabs come back.

## Files

1. `functions/lib/ghlVerify.ts` (new) — probe ladder against GHL, plus
   `ghlVerify.test.ts`.
2. `functions/api/admin/clients/[tenantId]/ghl.ts` (new) — GET the live state,
   POST to prove and save. Never returns the token.
3. `functions/api/admin/clients/index.ts` — carry `ghlConnected` on the roster
   so the page can gate its tabs without a second request.
4. `src/lib/api.ts` — `ghlConnected` on `AdminClient`.
5. `src/hooks/useApi.ts` — `useAdminGhlConnectionQuery`, `useSaveGhlCreds`.
6. `src/components/admin/cockpit/ghl/GhlSetupWizard.tsx` (new) — the screen,
   wearing the same `SetupWizard` shell as the Meta one.
7. `src/lib/fulfillmentPages.ts` — `GHL_SETUP_SUB` + `ghlSubTabs()`.
8. `src/routes/admin/FulfillmentPage.tsx` — gate the GHL page on it.
9. `src/components/admin/cockpit/ghl/GhlTab.tsx` — route the setup sub-tab.

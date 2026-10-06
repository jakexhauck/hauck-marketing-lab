# 7. CAPI values

## Goal

GHL > CAPI: two boxes per client, Dataset ID and Access Token, saved in the app with Copy buttons. Replaces "Copy Dataset ID / Access Token, paste in Google Doc" in the SOP's CAPI steps. Creating the dataset stays by hand (Jake, 2026-10-06: "just store the two values").

## Definition of done

- Page `/admin/client/:id/ghl/capi`, row "CAPI" in the GHL group.
- Dataset ID: digits only, validated. Access Token: saved, shown masked (`EAAG...x9Qk`), Show and Copy buttons.
- Saving records who and when; the page shows "Saved 6 Oct by Jake".
- The token is never sent to the client app, never logged, and only returned to an owner admin session.
- Optional quick check: "Test" button sends `GET /{dataset_id}?fields=name` with the stored token and shows the dataset name or Meta's error. Read only, no events sent.

## What exists

- Willis's funnel pixel is hard-coded in `functions/lib/metaCapi.ts` (`FUNNEL_CAPI`). Out of scope here; a later step can read this table instead.
- Admin routes are owner-gated in `_middleware.ts`; `admin_audit_log` records admin writes.

## Design

- Migration 0145: `client_capi(tenant_id uuid primary key references tenants, dataset_id text, access_token text, updated_at, updated_by)`, RLS on, no policies (service role only).
- `functions/lib/capiValues.ts` (pure): `cleanDatasetId`, `maskToken`.
- API: `GET /api/admin/clients/:tenantId/capi` (dataset id + masked token), `GET .../capi?reveal=1` (full token, audit-logged), `PUT .../capi`, `POST .../capi/test`.

## Files

- Create: `supabase/migrations/0145_client_capi.sql`, `functions/lib/capiValues.ts` (+ test), `functions/api/admin/clients/[tenantId]/capi/index.ts`, `.../capi/test.ts`, `src/components/admin/cockpit/ghl/CapiPanel.tsx`
- Modify: `src/lib/clientNav.ts` (+ test), `ClientPage.tsx`, `clientRowIcons.ts`, `useApi.ts`, `releaseNotes.ts`

## Tasks

1. TDD `cleanDatasetId` / `maskToken`.
2. Migration 0145, endpoints (reveal and save write to `admin_audit_log`).
3. Page (mockup first, it is two boxes so one layout plus a variant is enough).
4. Security review pass (M8: stores a token).
5. Release note.

## Tests

Vitest for the pure parts and the handler's owner-only guard. Live: save Willis's values, Test, reveal.

## Jake owes

1. Paste each client's Dataset ID and token once the page is live.

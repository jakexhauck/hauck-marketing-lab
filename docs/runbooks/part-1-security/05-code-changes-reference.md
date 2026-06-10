# Reference: Part 1 code changes (already made, 2026-06-10)

## Manual actions checklist

None. This file is reference only: the record of what changed in the repo and why, for future debugging and for the eventual client-onboarding checklist. Every action you must take lives in files 01 through 04.

## Webhook endpoint: `functions/api/webhook.ts` (rewritten)

- **Fail-closed auth.** Requires `WEBHOOK_SECRET` to be configured (503 otherwise) and a matching token on every request: `?token=...` in the URL or an `x-webhook-token` header. 401 on mismatch. Comparison is SHA-256-digest based, so timing leaks nothing.
- **Why a URL token instead of signatures:** GHL marketplace webhooks sign with an RSA key under `x-wh-signature`, and GHL workflow webhook actions send no signature at all. The old code computed an HMAC that could never match real GHL traffic, and then ignored the mismatch anyway.
- **Tenant routing by location.** `event.locationId` is matched against `GHL_LOCATION_ID` (live tenant) and `TEST_GHL_LOCATION_ID` (test tenant). Anything else is acknowledged with `ignored` and dropped. Previously every event from anywhere was written to the test tenant.
- **Push off the response path.** Web pushes now go through `ctx.waitUntil`, so GHL gets its 200 immediately.
- Malformed JSON now returns 400 instead of being half-processed.

## Tenant scoping: `functions/lib/env.ts`, `functions/api/_middleware.ts`, plus 7 routes

- New env vars `TENANT_SLUG` (default `live-client`) and `TEST_TENANT_SLUG` (default `test-account`). Nothing client-specific lives in code; each client's slug is configuration.
- The middleware resolves the slug from the session mode and passes it via `ctx.data.tenant.slug` (TenantContext also gained `mode`).
- The hardcoded `'test-account'` slug was removed from: `api/activity.ts`, `api/notifications/index.ts`, `api/notifications/read.ts`, `api/push/subscribe.ts`, `api/push/unsubscribe.ts`, `api/me/identity.ts`, `api/team/sync.ts`. `lib/push.ts` now takes a resolved tenant id parameter instead of resolving a hardcoded slug.
- **Onboarding consequence:** when any client goes live, set `TENANT_SLUG` to their tenant slug and seed their tenants row; live sessions then automatically read and write that tenant with zero code edits. This is the copy-paste-per-client property the whole plan is building toward.

## Sessions: `functions/lib/session.ts`

- Removed the `'dev-secret'` static fallback. Signing key is `SESSION_SECRET`, falling back to `APP_PASSWORD`; with neither set, no session can be minted or verified (fail closed). Previously, an env without secrets silently signed cookies with a publicly known string, making them forgeable.

## Login: `functions/api/auth/login.ts` + new `functions/lib/ratelimit.ts`

- Rate limiting: 10 failed attempts per IP per 15 minutes returns 429. Two layers: durable counts in the Supabase `login_attempts` table (migration 0006) plus an in-memory per-isolate map. Fails open on infrastructure errors so a Supabase outage cannot lock clients out.
- Password comparison now compares SHA-256 digests (fixed-length), removing the password-length timing leak in the old length-check short-circuit.

## Admin authority: `functions/lib/admin.ts`

- `isAdmin` now matches `admins.ghl_user_id` (text, the GHL user id the identity step stores). It previously queried `admins.user_id`, a uuid column, with a GHL text id; Postgres errored on the cast and the check always returned false, leaving POST /api/team/sync permanently 403.
- Known limitation, accepted for now: identity arrives via a client-supplied `x-identity` header, so this is an allowlist authorization, not authentication. Nothing destructive may sit behind it until identity is bound into the session cookie.

## Middleware hardening: `functions/api/_middleware.ts`

- CORS: unrecognized origins now receive **no** CORS headers (previously a fallback origin got credentialed headers for any origin). `x-identity` added to allowed headers so cross-origin deploys can pass it.
- 500 responses return a generic `internal_error`; the real upstream message (which can embed GHL error bodies) is logged server-side only.

## Public health endpoint: `functions/api/health/supabase.ts`

- No longer echoes raw Supabase/Postgres error messages to the public; logs them server-side, returns `"error"`.

## Push subscribe: `functions/api/push/subscribe.ts`

- Rejects non-https endpoints (each stored endpoint gets POSTed signed push payloads on every event, so an arbitrary URL was an SSRF/beacon vector).
- Caps stored subscriptions at 50 per tenant (429 beyond), while still allowing already-stored endpoints to refresh at the cap.

## Database migrations

- **`0006_security_fixes.sql` (new):**
  - Restores a primary key on `tenant_users` (0004 dropped the old composite PK and never replaced it): surrogate `id bigint identity`.
  - Replaces the partial unique index on `(tenant_id, ghl_user_id)` with a full one. PostgREST upserts (`ON CONFLICT (tenant_id, ghl_user_id)`) cannot infer partial indexes, so team sync's upsert failed outright; a full unique index behaves identically for non-null ids because NULLs never conflict.
  - Creates `login_attempts` (RLS enabled, no policies: service-role only).
- **`0004_ghl_identity_and_test_tenant.sql` (bug fixed in place):** original ordering tried `alter column user_id drop not null` while `user_id` was still part of the primary key, which Postgres rejects (error 42P16). The PK drop now comes first. Discovered when applying it live on 2026-06-10.
- **Client seed defused and genericized:** the old `0002` per-client seed's `on conflict (slug) do update` would have overwritten a real tenant's credentials with placeholder strings on any re-run; it now does `on conflict do nothing`. The file was then moved out of `migrations/` entirely and rewritten as a neutral template at `supabase/templates/client-seed-template.sql` (all values are `__PLACEHOLDER__`s). Migrations are now 0001, 0003, 0004, 0005, 0006; there is intentionally no 0002.

## Production build backdoors: `src/App.tsx`, `src/lib/devMode.ts`

- `/showroom` is only routed when `import.meta.env.DEV` is true. It auto-signed-in a mock user that satisfied `ProtectedRoute`, letting an unauthenticated visitor browse the app shell. Verified tree-shaken out of the production bundle (the `demo@hauck.dev` override is gone from `dist/`).
- `devMode()` is compile-time false in production builds, so `?dev=1` and the persisted localStorage flag no longer enable the DevPanel for real clients.

## Follow-up pass (2026-06-10, pre-deploy verification)

- All changes above were re-verified present in the working tree, file by file, before the manual steps began.
- `src/components/TopBar.tsx`: the DevPanel mount is now gated on `import.meta.env.DEV` at the mount site, so the panel and the mock-data modules it imports are tree-shaken out of production bundles entirely (previously the component shipped as unreachable dead code, including a "Launch Showroom" button string).
- `src/components/TopBar.tsx`: removed an em dash from the visible test-mode banner text (now "Test account: staging data, not a live client").

## Verified after the changes

- `pnpm typecheck` passes (app + functions tsconfigs).
- `pnpm build` passes; production bundle contains no Showroom, DevPanel, or dev-override code path (verified by grepping `dist/assets` for `showroom`, `DevPanel`, `devMode`, and `demo@hauck`: zero hits).

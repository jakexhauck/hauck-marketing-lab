# Production Login Recovery — Follow-ups

Context: 2026-06-22. Admin and staff login on `app.hauckmarketing.com` went down.
Two stacked causes were fixed live via Cloudflare Pages env (no app code changed).
This plan captures what is still undone.

## What happened (summary)

1. **503 "login unavailable"**: production Cloudflare Pages env had empty
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, so `getServiceClient()`
   (`functions/lib/supabase.ts`) returned null and every login bailed before the
   password check. Hit admin and staff login alike.
2. **500 internal_error** (surfaced while fixing #1): a read-modify-write PATCH
   blanked the other secrets. The Cloudflare API hides secret values on read
   (returns `""`), so echoing the read map back wrote empties over
   `SESSION_SECRET`, `APP_PASSWORD`, etc. Empty `SESSION_SECRET` makes
   `mintAdminSessionToken` throw "SESSION_SECRET not configured" (`functions/lib/session.ts`).
3. **Recovery**: restored all 13 functional secrets from
   `command-center/app/.env.local` plus a freshly generated `SESSION_SECRET`
   (the original only lived in CF and was already dead, so regenerating is
   harmless), redeployed, and verified a fake-credential login returns `401`
   (not `500`/`503`).

The full runbook + footgun are also in agent memory (`incident_prod_login_unavailable`).

## Undone / follow-ups

### 1. Fix the `cf.mjs env:set` footgun (HIGH)
`command-center/app/scripts/cf.mjs` `env:set`/`env:unset` read the whole
`env_vars` map (secret values come back as `""`), mutate one key, and PATCH the
**full** map back, which blanks every other secret. This is what turned the 503
into a 500.
- Cloudflare PATCH **merges** (keys absent from the payload are preserved), so
  send ONLY the target key: `PATCH { deployment_configs: { production: { env_vars: { [key]: {...} } } } }`.
- Add a guard that refuses to PATCH a `secret_text` with an empty value.
- TDD where feasible.

### 2. Investigate the original secret wipe (HIGH)
The root cause of the *initial* empty Supabase secrets (and likely
`SESSION_SECRET` / `APP_PASSWORD`, which were also empty) was never found.
- Check: Cloudflare dashboard audit log; the build-loop automation (commit
  `1300ddb`); anything that calls `cf env:set`; recent manual dashboard edits.
- Until the cause is known it can recur.

### 3. APP_PASSWORD (MEDIUM)
Left unset by Jake's choice. Admin + staff login do not need it; only the legacy
shared-password **owner** login does.
- If owner login is still used, Jake sets it himself. Do NOT use `cf.mjs env:set`
  for this until follow-up #1 is fixed (it would re-blank the other secrets) —
  use a single-key API call or the CF dashboard.

### 4. Verify real login end-to-end (LOW, needs Jake)
Only the fake-credential `401` was verified. Jake to confirm a real admin login
and a real staff login both succeed and land in the app. Note: everyone was
effectively logged out while `SESSION_SECRET` was blank, so all users must log in
again.

### 5. Branch `feat/sop-triage-checkboxes` does not build (HIGH, separate issue)
`npm run typecheck` fails: `src/components/comms/Roster.tsx` references modules
that do not exist on this branch — `./PresenceDot`, `../../hooks/useChat`,
`../../context/ChatContext`, and `ChatMember` from `lib/api`.
- Team comms is shipped/live on `main`, so these files exist there. This branch
  diverged: it carries `Roster.tsx` and a comms-fix commit (`71e6f2c`) without
  the supporting files.
- Resolve before merge/deploy: bring the branch up to date with `main`'s comms
  files (merge or rebase `main`), or remove the orphaned comms references.
- The `HomeDesktop` ClientHero refactor was committed as part of this push. It is
  fine on its own, but the branch as a whole will not deploy until the comms
  breakage above is resolved.

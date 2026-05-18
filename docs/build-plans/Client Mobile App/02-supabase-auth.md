# Section 02: Supabase auth + tenants

## Goal

Replace the mock `AuthContext` and `ClientContext` with real Supabase magic-link auth and a real tenants table. End state: Jake's email gets a magic link, click → he lands on the dashboard, app loads Willis Windows tenant config (brand color, app name, pipeline mirrored from GHL) from Supabase, sessions persist across reloads.

Estimated time: ~2 hours.

## Depends on

Section 01 (Supabase project exists, anon + service-role keys collected, env vars added to Pages).

## Files created / modified

```
client-dashboard/
  .env.local                                (gitignored — Jake's local copy)
  .env.example                              (committed)
  supabase/
    migrations/
      0001_init.sql                         (tenants, tenant_users, push_subscriptions, RLS)
      0002_seed_willis_windows.sql          (one-off seed; ghl_token via env-var fn at runtime, not in SQL)
  src/
    lib/
      supabase.ts                           (browser client singleton)
      tenant.ts                             (loadMyTenant() RPC wrapper)
    context/
      AuthContext.tsx                       (rewritten: real Supabase session + magic-link signIn)
      ClientContext.tsx                     (rewritten: pulls tenant config from Supabase, not hard-coded clients)
    routes/
      Login.tsx                             (modified: magic-link UI states — idle / sent / error)
      AuthCallback.tsx                      (new: handles the redirect from the email link)
  vite.config.ts                            (modified: define env vars, ensure /auth/callback works in dev)
```

## Steps

1. **Env scaffolding (5 min)**
   - `.env.example` lists `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - `.env.local` (gitignored — already covered by repo `.gitignore` for `*.local`) gets the real values Jake pasted.
   - Add `.env*.local` to `.gitignore` if not already.

2. **Supabase schema migration (15 min)**
   - Create `supabase/migrations/0001_init.sql` with `tenants`, `tenant_users`, `push_subscriptions`, `activity_log` tables.
   - RLS policies: a row is readable only if `auth.uid()` exists in `tenant_users.user_id` for that tenant.
   - Add a `get_my_tenant()` SQL function that returns the calling user's tenant config (joined view of tenants + their role).
   - Apply via Supabase dashboard SQL editor (paste-and-run), not CLI today.

3. **Seed Willis Windows (10 min)**
   - In Supabase SQL editor: INSERT a row in `tenants` with Willis-specific brand, pipeline placeholders, GHL location_id.
   - Store `ghl_token` server-side only — set it via `update tenants set ghl_token = '...'` from the SQL editor. Never echoed to the browser.
   - In Supabase **Authentication → Users**, manually invite Jake's email. Then INSERT a row in `tenant_users` linking his `user_id` to the Willis tenant with role `owner`.

4. **Supabase client singleton (5 min)**
   - `src/lib/supabase.ts` — single browser-side `createClient()` instance using anon key.
   - Auto-refresh tokens, persist session in localStorage.

5. **Rewrite AuthContext (20 min)**
   - On mount: `supabase.auth.getSession()`, subscribe to `onAuthStateChange`.
   - `signIn(email)` → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: 'https://dash.hauckmarketing.com/auth/callback' } })`. In dev, override to `http://localhost:5173/auth/callback`.
   - `signOut()` → `supabase.auth.signOut()`.
   - Expose `{ session, user, signIn, signOut, status }` to consumers. Drop the `currentUser` shape from the mock auth — replace usages with `user`.

6. **AuthCallback route (10 min)**
   - New `src/routes/AuthCallback.tsx`. Handles the `?code=...` magic-link redirect. Calls `supabase.auth.exchangeCodeForSession()`. On success → navigate to `/dashboard`. On error → navigate to `/login?error=…`.
   - Register the route in `App.tsx`.

7. **Rewrite ClientContext (25 min)**
   - On session change, call `supabase.rpc('get_my_tenant')`. Cache the result in IndexedDB via TanStack Query for offline.
   - The shape returned matches the existing `Client` TypeScript type so downstream components don't change. Pipeline `stages` array stays a placeholder for now — section 03 fills it from GHL.
   - Drop `allClients` and `setClient` from the dev mode. Replace with a "switch tenant" only when Jake's user has multiple tenant memberships (his own dev login can be member of all three test tenants — but only one is real today).

8. **Login UI states (15 min)**
   - Idle: email input + "Send sign-in link" button.
   - Submitting: button disabled, spinner.
   - Sent: "Check your email. We sent a link to `foo@bar.com`." with a "Use a different email" link.
   - Error: inline error message under the input.

9. **Guard the routes (5 min)**
   - `ProtectedRoute` keeps working but checks `session` now instead of mock `currentUser`.

10. **Local end-to-end test (10 min)**
    - `pnpm dev`. Enter your email. Check inbox. Click magic link.
    - Should land on `/dashboard`, see Willis Windows branding, the existing mock leads still showing because section 03 hasn't replaced them yet.
    - Reload — session persists, no re-login.

## Acceptance criteria

- Magic-link email arrives within 30 seconds.
- Click → app shows Willis Windows branded dashboard.
- Reload → still signed in.
- Sign out → returns to `/login`.
- Dev mode (`?dev=1`) still exposes the gear icon, but the role/client switcher is hidden when there's only one tenant. The theme toggle stays.
- `pnpm typecheck` clean.
- No GHL or push-related work yet — section 02 stops at "real auth, real tenant, mock leads still."

## Stop condition

Commit when the magic-link round-trip works and `get_my_tenant()` returns the right shape against the live Willis row.

**Commit message:** `client-dashboard: supabase magic-link auth + tenants table (section 02)`

## Notes

- We do NOT mirror leads into Supabase. Supabase is only auth + tenant config + push subscriptions + activity log. GHL is source-of-truth for leads.
- The `ghl_token` column needs care. Today we store it as plain text in a column that's never selected by RLS-permitted reads — only the Pages Function (with the service_role key) can read it. A future hardening pass moves to Supabase Vault or env-per-tenant.
- If Supabase's default SMTP rate-limits us, we won't notice today (under 5 emails). Production switch to Resend happens next week.

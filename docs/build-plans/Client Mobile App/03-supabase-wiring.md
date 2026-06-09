# 03: Wire Supabase (the Foundation)

## Objective

Instantiate Supabase on both the backend (service-role, in Functions) and the frontend
(anon key, in the React app), run the existing migrations against a real Supabase project, and
provide a tiny helper module each later doc imports. This is the foundation for user
management (04), the activity feed (05), and push subscriptions (06).

## Why it matters

The schema already exists and `@supabase/supabase-js@^2.105.4` is already installed, but no
client is ever created. Three later features all need a small amount of persistent,
queryable state: who the users are, what happened recently, and which devices to push to.
Wiring Supabase once means we build that plumbing a single time instead of three times against
KV. Do this before 04, 05, and 06.

## Dependencies

- 01 (need a live deploy to test against).

## Prerequisites

- A Supabase project (free tier is fine for the test app). Capture:
  - Project URL (`https://xxxx.supabase.co`)
  - `anon` public key (frontend)
  - `service_role` secret key (backend Functions only, never shipped to the browser)

## Current state

### The schema is already written

Three migrations exist in the repo (under `client-dashboard/supabase/migrations/` or similar,
confirm the path):

- `0001_init.sql` — `tenants`, `tenant_users`, `push_subscriptions`, `activity_log` tables,
  RLS policies, and a `get_my_tenant()` RPC.
- `0002_seed_willis_windows.sql` — seeds a Willis Windows tenant row with placeholder GHL creds.
- `0003_admins.sql` — an `admins` table for global admin role management.

### Env vars are already declared

`functions/lib/env.ts:1-15` already includes:

```ts
SUPABASE_URL?: string;
SUPABASE_SERVICE_ROLE_KEY?: string;
```

And `.env.example` declares the frontend pair:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Nothing is instantiated

A grep for `createClient` / `supabase` across `src/` and `functions/` returns no client
creation. The package is installed and unused.

## Target state

- A backend helper `functions/lib/supabase.ts` exporting a `getServiceClient(env)` that returns
  a service-role client (bypasses RLS, used only in trusted Functions).
- A frontend helper `src/lib/supabase.ts` exporting a configured anon client (subject to RLS).
- The migrations applied to the real Supabase project.
- A health probe confirming the backend can read the `tenants` table.

## Step-by-step

### 1. Apply the migrations

Using the Supabase CLI (preferred) or the SQL editor in the dashboard, run `0001`, `0002`,
`0003` in order. With the CLI:

```
cd client-dashboard
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Confirm in the dashboard that `tenants`, `tenant_users`, `push_subscriptions`, `activity_log`,
and `admins` exist and that RLS is enabled on each (the migrations enable it).

### 2. Decide what "tenant" means for the test app

The current app is single-tenant per deploy (creds come from env, not Supabase). The Supabase
schema is multi-tenant. For the test app, seed exactly one tenant row representing the test
account and reference it by a constant slug. Do **not** try to make routing read creds from
Supabase yet; that is the future multi-tenant effort. Supabase here is only for users,
activity, and push, all scoped to the one test tenant.

Add a test tenant row (adapt the seed migration, or insert directly):

```sql
insert into tenants (slug, name, niche)
values ('test-account', 'Test Account', 'home-services')
on conflict (slug) do nothing;
```

Note the resulting tenant `id`; later docs scope rows to it.

### 3. Backend helper: `functions/lib/supabase.ts`

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

/**
 * Service-role client. Bypasses RLS. Only ever called from trusted Functions,
 * never exposed to the browser. Returns null if Supabase is not configured so
 * callers can degrade gracefully (the app still works without it).
 */
export function getServiceClient(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the tenant id for the current session mode. Test app: one tenant. */
export async function resolveTenantId(
  client: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}
```

Key choices:

- **Graceful null.** If Supabase env vars are unset, `getServiceClient` returns null and every
  caller treats the feature as off. The app must keep working without Supabase, because doc 01
  shipped it without Supabase. Supabase is additive, never required.
- **`persistSession: false`.** Functions are stateless; there is no session to persist.

### 4. Frontend helper: `src/lib/supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Anon client, subject to RLS. Null when not configured. */
export const supabase =
  url && anon ? createClient(url, anon) : null;
```

For the test app you may not need the frontend client at all (04 can read users through a
Function instead, keeping the service role server-side). Prefer routing reads through Functions
so the anon key and RLS surface stay small. Create this file only if a route genuinely needs
direct client reads. Default: skip it, go through `/api/*`.

### 5. Set the env vars in Cloudflare

Add to the Pages project (encrypted):

| Var | Scope | Value |
|-----|-------|-------|
| `SUPABASE_URL` | backend | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | service_role key |
| `VITE_SUPABASE_URL` | build | project URL (only if you built the frontend client) |
| `VITE_SUPABASE_ANON_KEY` | build | anon key (only if you built the frontend client) |

`VITE_*` vars are inlined at build time, so a change requires a rebuild, not just a restart.

### 6. Add a backend health probe

Extend `functions/api/health.ts` (or add `functions/api/health/supabase.ts`) to confirm the
service client can read:

```ts
import { getServiceClient } from "../lib/supabase";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ ok: true, supabase: "unconfigured" });
  const { error } = await client.from("tenants").select("id").limit(1);
  return Response.json({ ok: !error, supabase: error ? error.message : "ok" });
};
```

Keep this path public (add it to `PUBLIC_PATHS` in `_middleware.ts` if it is a new route) so you
can curl it without a session.

## Testing

```
curl -s https://YOUR-APP.pages.dev/api/health/supabase
```

Expect `{"ok":true,"supabase":"ok"}`. If you get `"supabase":"unconfigured"`, the env vars are
not set. If you get an error string, the service key or RLS is wrong (service role should bypass
RLS, so an RLS error here means the key is actually the anon key).

## Acceptance criteria

- [ ] All three migrations applied; five tables present with RLS enabled.
- [ ] A `test-account` tenant row exists; its id is recorded.
- [ ] `functions/lib/supabase.ts` exists and returns null when unconfigured.
- [ ] `/api/health/supabase` returns `ok` on the live deploy.
- [ ] The app still works fully with Supabase env vars temporarily removed (graceful
      degradation verified, not assumed).

## Rollback

Supabase is additive. To disable: unset `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and every
caller falls back to its no-Supabase path. The helper files can stay; they are inert without
env vars. The migrations are forward-only; rolling them back means dropping the tables, which is
safe because nothing else reads them yet.

## Note on the future multi-tenant promotion

This doc deliberately keeps tenant creds in env vars and uses Supabase only for users, activity,
and push. The bigger move (routing GHL creds out of env and into the `tenants` table so one
deploy serves many clients) reuses `getServiceClient` and `resolveTenantId` but rewrites
`_middleware.ts` to look up the tenant by hostname or session. That is a separate, later effort.

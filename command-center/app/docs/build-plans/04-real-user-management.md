# 04: Real User Management

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

## Objective

Replace the hardcoded mock users and the `?dev=1` query-param gating with real team members
sourced from GHL, with roles stored in Supabase (`tenant_users`), so that the role-based UI
(revenue visibility, assigned-only filtering) reflects who is actually logged in.

## Why it matters

Today the app fakes the entire concept of "who am I." `currentUser` resolves to a hardcoded
"Owner" object (`src/context/AuthContext.tsx:126-136`), or to whatever the dev panel overrides
it to. The role-based features are real and working, they are just driven by a fiction. Before
multiple Willis reps use the app, "logged in as a rep, sees only my assigned leads" has to be
true, not simulated.

## Dependencies

- 03 (Supabase wired, `tenant_users` table available, `getServiceClient` exists).

## Current state

### Roles and permissions are real and good

`src/lib/rolePermissions.ts`:

```ts
export const RolePermissions = {
  owner:   { seeRevenue: true,  assignedOnly: false },
  manager: { seeRevenue: false, assignedOnly: false },
  rep:     { seeRevenue: false, assignedOnly: true },
} as const;
```

`Role = "owner" | "manager" | "rep"` (`src/types/index.ts:1`). The `User` type is
`{ id, clientId, name, email, role }` (`src/types/index.ts:36-42`). These are correct, keep them.

### Users are mock

`src/mock/users.ts` hardcodes 13 users across three fake clients (Smith's Roofing, Glow Med Spa,
Apex Detailing). None correspond to the test GHL account.

### currentUser is a fiction

`src/context/AuthContext.tsx:126-136`:

```ts
const currentUser = useMemo<User | null>(() => {
  if (override) return override;               // dev panel override
  if (status !== "authenticated") return null;
  return { id: "owner", clientId: "", name: "Owner", email: "", role: "owner" as Role };
}, [override, status]);
```

So a logged-in user is always "owner" unless the dev panel overrides them via `setUser`.

### Assigned users are mock too

`Lead.assignedUserId` exists (`src/types/index.ts:47`) but is only populated by random mock
assignment (`src/mock/leads.ts:103,107`). The rep-only filter reads it
(`src/routes/Today.tsx:31`, `src/routes/Dashboard.tsx:52`: `l.assignedUserId === currentUser.id`).
GHL's real `assignedTo` on opportunities is never surfaced: `shapeOpportunity`
(`functions/lib/ghl.ts:84-103`) does not map it.

### Admin gating is client-side only

`src/lib/devMode.ts` gates the dev panel on `?dev=1` or `localStorage.devMode === "1"`. The
DevPanel renders only when `devMode()` and `currentUser` are truthy
(`src/components/DevPanel.tsx:37-38`). No server enforcement.

## Target state

1. Login optionally identifies *which* user logged in (not just "the password was right").
2. `currentUser` reflects a real user with a real role from `tenant_users`.
3. Opportunities carry their real GHL `assignedUserId`, so rep filtering is truthful.
4. Admin status is checked server-side against the `admins` table, not a URL param.

> Scope decision for the test app: keep the single shared password login (it is the
> product's model: one client, one password). Layering full per-user auth is a bigger
> change and not needed to make roles real. Instead, after the shared-password login, let the
> user pick their identity from the real team list (a "who are you?" step), and store that
> choice. This is honest enough for the test app and for early clients. Full per-user
> credentials become a later doc if a client demands it.

## Step-by-step

### 1. Surface real GHL team members

Add a GHL users endpoint to the lib and a Function to expose it.

GHL: `GET /users/?locationId=...` returns the sub-account's team. Add to a new
`functions/api/team.ts`:

```ts
import { ghlJson } from "../lib/ghl";
import type { Env, ApiData } from "../lib/env";

interface GhlUser { id: string; name?: string; firstName?: string; lastName?: string; email?: string; }
interface GhlUsersResp { users?: GhlUser[] }

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const data = await ghlJson<GhlUsersResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/users/?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const team = (data.users ?? []).map((u) => ({
    id: u.id,
    name: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || "Unknown",
    email: u.email ?? "",
  }));
  return Response.json({ team });
};
```

If the test GHL token lacks the users scope, this 403s. In that case fall back to deriving the
team from distinct `assignedTo` ids seen on opportunities (less complete, but tokenless).

### 2. Map roles in Supabase `tenant_users`

`tenant_users` links a user id to a tenant with a role. For the test app, seed it from the GHL
team once: for each real team member, insert a row scoped to the `test-account` tenant with a
sensible default role (`rep`), then promote one to `owner` by hand in the dashboard.

Add `functions/api/team/sync.ts` (admin-only, see step 5) that upserts the GHL team into
`tenant_users`:

```ts
const client = getServiceClient(ctx.env);
if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
const tenantId = await resolveTenantId(client, "test-account");
// ...fetch GHL team as in step 1...
for (const m of team) {
  await client.from("tenant_users").upsert(
    { tenant_id: tenantId, ghl_user_id: m.id, name: m.name, email: m.email, role: "rep" },
    { onConflict: "tenant_id,ghl_user_id" },
  );
}
```

(Adjust column names to the actual `0001_init.sql` schema. If `tenant_users` keys on a Supabase
auth uid rather than a GHL user id, add a `ghl_user_id` column in a new migration.)

### 3. "Who are you?" identity step after login

After the shared-password login succeeds, if no identity is stored, show a one-time picker of
the real team (`GET /api/team`). Store the chosen user id in `localStorage` (e.g.
`hml_identity`). Expose it through a new endpoint `GET /api/me/identity` that reads
`tenant_users` for that id and returns `{ id, name, email, role }`.

Wire `AuthContext.currentUser` to that instead of the hardcoded owner:

```ts
// AuthContext: replace the hardcoded owner fallback
const currentUser = useMemo<User | null>(() => {
  if (override) return override;            // keep dev override for testing
  if (status !== "authenticated") return null;
  return identity;                          // fetched from /api/me/identity
}, [override, status, identity]);
```

Keep the `override` path: it is still useful for testing role behaviour without re-logging.

### 4. Surface real assignedUserId on opportunities

In `functions/lib/ghl.ts`, extend `GhlOpportunity` and `shapeOpportunity` to carry the GHL
assignment:

```ts
// shapeOpportunity additions
assignedUserId: o.assignedTo ?? null,
```

Add `assignedTo?: string` to the `GhlOpportunity` interface. Now `Lead.assignedUserId` is real,
and the rep-only filters in `Today.tsx` / `Dashboard.tsx` (`l.assignedUserId === currentUser.id`)
become truthful, provided `currentUser.id` is the GHL user id chosen in step 3. Make sure the id
spaces match: the identity picker must store the **GHL user id**, the same value GHL puts in
`assignedTo`.

### 5. Server-side admin check

Replace `?dev=1` as the source of truth for admin actions (team sync, anything destructive).
Add `functions/lib/admin.ts`:

```ts
export async function isAdmin(env: Env, identityId: string): Promise<boolean> {
  const client = getServiceClient(env);
  if (!client || !identityId) return false;
  const { data } = await client.from("admins").select("id").eq("ghl_user_id", identityId).maybeSingle();
  return Boolean(data);
}
```

Gate `/api/team/sync` and any future admin endpoint on this. Keep `devMode()` purely for showing
dev UI conveniences (it is harmless client-side), but never let it authorize a write.

## Testing

- [ ] `GET /api/team` returns the real test-account team (or the assignedTo-derived fallback).
- [ ] Run `/api/team/sync` once; confirm `tenant_users` is populated in the Supabase dashboard.
- [ ] Promote one row to `owner`; log in, pick that identity, confirm revenue is visible.
- [ ] Pick a `rep` identity; confirm Today/Dashboard show only that rep's assigned leads, and
      revenue is hidden.
- [ ] Confirm an opportunity assigned to you in GHL actually appears in your rep queue (proves
      the `assignedTo` mapping in step 4).
- [ ] Confirm a non-admin identity cannot call `/api/team/sync` (403).

## Acceptance criteria

- [ ] `currentUser` reflects a real team member with a real role, not the hardcoded owner.
- [ ] Rep filtering uses real GHL assignment ids end to end.
- [ ] Admin writes are gated server-side on the `admins` table, not on `?dev=1`.
- [ ] The app still works if Supabase is unconfigured (falls back to the current
      hardcoded-owner behaviour, so it never hard-fails).

## Rollback

Each piece degrades independently. Remove the identity step and `currentUser` returns to the
hardcoded owner. The new `/api/team*` endpoints are additive. `shapeOpportunity` gaining a field
is backward compatible (the client ignores unknown fields). Roll back by reverting AuthContext
and deleting the new endpoints.

## Future client promotion

When promoting to a real client, the team sync runs against that client's GHL token, populating
`tenant_users` for the client's tenant. If a client wants true per-user passwords instead of the
shared-password-plus-identity-picker model, that becomes a dedicated auth doc (likely Supabase
Auth with magic links), reusing this role and assignment plumbing.

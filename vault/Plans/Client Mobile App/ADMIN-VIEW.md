---
type: plan
title: "Mobile App — Admin View"
status: draft
tags: [plan, feature]
plan_kind: feature
created: "2026-05-19T13:54:53.000Z"
source: "docs/build-plans/Client Mobile App/ADMIN-VIEW.md"
---

# Mobile App — Admin View

What Jake sees when he logs into `dash.hauckmarketing.com` with `contact.jakehauck@gmail.com`.

## Who can access

Anyone whose `user_id` is present in the Supabase `admins` table. Admins have no implicit tenant access — provisioning Jake's row in `admins` is what makes him land on `/admin`. Clients who are NOT in `admins` get routed to `/dashboard` automatically.

## What it shows

`/admin` renders a single view: **list of all clients on the mobile app**.

Each row shows:
- Brand-color tile with brand initials (e.g. "WW" on Willis blue)
- Client name + niche + app name
- Monthly ad spend
- Number of users linked to that tenant

A search bar at the top filters by name, slug, or niche.

The top bar carries sign-out + theme toggle. No view tabs (admins don't see Conversations/Contact Status/Opportunities — those are tenant-scoped).

## Routes

- `/admin` — the only admin route today.
- `/login` — same as client login. Sign-in flow auto-detects admin status post-auth and redirects.

## Data flow

```
Admin → /admin
   ↓
useAdminClientsQuery → GET /api/admin/clients
   ↓
_middleware.ts sees path prefix `/api/admin/*`
   ↓
isUserAdmin(userId) checked against admins table (service role)
   ↓ (if admin)
Skips tenant lookup; passes userId only
   ↓
admin/clients.ts handler
   ↓
service-role queries tenants + tenant_users (count per tenant)
   ↓
Returns AdminClient[] (brand info, GHL location, member count, monthly spend)
```

## Key files

- `client-dashboard/src/routes/Admin.tsx` — the page.
- `client-dashboard/src/hooks/useApi.ts` — `useAdminClientsQuery`.
- `client-dashboard/src/context/AuthContext.tsx` — queries `admins` table directly via RLS to set `isAdmin`.
- `client-dashboard/src/App.tsx` — `AdminRoute` and `RootRedirect` use `isAdmin` + `adminChecked` to route post-login.
- `client-dashboard/functions/api/admin/clients.ts` — backend endpoint.
- `client-dashboard/functions/lib/admin.ts` — `isUserAdmin` helper.
- `client-dashboard/functions/api/_middleware.ts` — admin-path branch.
- `client-dashboard/supabase/migrations/0003_admins.sql` — `admins` table + `admins_read_self` RLS policy.

## How a new admin is added

Insert into `admins` via SQL:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'new.admin@example.com'
on conflict do nothing;
```

The user must already exist as an auth user (sign in once via magic link, or pre-create via Authentication → Users → Add user).

## What this view does NOT do today

Single-page. No drill-in, no per-client editing, no billing status, no GHL health check, no campaign overview. Add those by extending `Admin.tsx` (UI) and `functions/api/admin/` (data). The admin path branch in `_middleware.ts` already handles auth for any new admin endpoints — just create files under `functions/api/admin/*`.

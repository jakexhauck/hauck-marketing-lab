# Architecture conventions (read before writing any surface plan)

App root: `command-center/app/` (Vite + React 19 + React Router 7, TanStack Query 5, Cloudflare Pages Functions, Supabase Postgres).

## DB / migrations
- Files: `command-center/app/supabase/migrations/NNNN_slug.sql`. 4-digit zero-padded sequence. **Latest = 0026; next new = 0027, then 0028…** (one per surface, in build order).
- Runner: `npm run db:migrate` → `scripts/db-migrate.mjs` (Supabase Management API + `_hml_migrations` ledger). Idempotent.
- Style: `create table if not exists`, UUID PK `default gen_random_uuid()`, `text` + CHECK for enums, `timestamptz not null default now()`, guarded `add column if not exists`. NEVER edit an applied migration; add a new one.
- **Scoping (important):**
  - **Agency-internal surfaces (NO tenant_id):** Business Health, Leads, Cold Call, Cold SMS, Sales Data, Scaling Calculator, Time Audit, Tasks. This is Jake's own agency data. Tables are agency-global (single agency). Optionally stamp `admin_id` if useful, but a single-agency global row set is fine.
  - **Per-client surfaces (tenant_id FK):** Client Billing and Ad Tracking. `tenant_id uuid references public.tenants(id) on delete cascade`.
- Backend uses the **service-role client (bypasses RLS)** and enforces access in middleware, so new admin tables do not need RLS policies to work through the API.
- **Reuse note:** an `admin_tasks` table already exists (migration `0012_admin_tasks`). The Tasks surface should extend/reuse it, not create a new one, unless the shape differs materially.

## API endpoints
- File-routed under `command-center/app/functions/api/**`; `onRequestGet/Post/Patch/Delete`. Dynamic segs `[param].ts`.
- Middleware `functions/api/_middleware.ts` gates **`/api/admin/*`** → requires `session.adminId` + live `getActiveAdmin()`; admin routes are **cross-tenant** (no tenant resolution). `ctx.data.admin` available.
- Server Supabase: `functions/lib/supabase.ts` → `getServiceClient(env)` (service role) or `null`→503. Start every handler: `const client = getServiceClient(ctx.env); if (!client) return 503`.
- Admin helpers: `functions/lib/adminAuth.ts` (`getActiveAdmin`, `getTenantById`, `logAdminAction` → `admin_audit_log`).
- **New agency-internal endpoints:** put under `functions/api/admin/tracker/<surface>.ts` (e.g. `cold-calls.ts`, `leads.ts`). GET list, POST/PATCH upsert. Whitelist supplied fields into a snake_case update. `logAdminAction` on writes.
- **New per-client endpoints:** under `functions/api/admin/clients/[tenantId]/<surface>.ts` (matches Billing/Ad Tracking living in the cockpit). Read `ctx.params.tenantId`, `getTenantById` → 404.
- Reference endpoint to copy: `functions/api/admin/clients/[tenantId].ts` (GET fan-out + PATCH whitelist + audit; `ghl_token` never returned).

## Client data
- Request helper: `src/lib/api.ts` → `api<T>(path, init)` (`credentials:"include"`, throws `ApiError`, `hml:unauthorized` on 401, demo-mode short-circuit). Add typed DTOs here.
- Hooks: `src/hooks/useApi.ts` (TanStack Query). Keys are arrays; admin keys `["admin", ...]`.
  - Query: `useQuery({ queryKey:["admin","tracker","cold-calls", month], queryFn:()=>api(...) })`.
  - Mutation: `useMutation({ mutationFn, onSuccess:()=>qc.invalidateQueries({queryKey:[...]}) })`. Optimistic pattern (onMutate snapshot/rollback) used for row edits; reload+invalidate pattern used by ClientConfigPanel.
- **Editable-save template:** `src/components/admin/ClientConfigPanel.tsx` — `<Card>`-per-section forms, `useSaver` hook `run(path, body, method="PATCH")`, then re-load + `invalidateQueries`. This is the closest existing pattern for the new manual-entry pages.

## Routing + nav
- Register in `src/App.tsx`: `<Route path="/admin/…" element={<AdminRoute><X/></AdminRoute>} />`.
- Spine: `src/routes/admin/AdminLayout.tsx` `SPINE_NAV` array `{to,label,icon,end?}`. Command `/admin`, Acquisition `/admin/pillar/acquisition`, Sales `/admin/pillar/sales`, Fulfillment `/admin/delivery`, Operations `/admin/pillar/operations`.
- Pillar page being gutted/replaced: `src/routes/admin/AdminPillarPage.tsx` (`/admin/pillar/:pillarId`). New pillars = a page with a per-pillar TAB BAR (mirror the cockpit's `pk-tabs`), one tab per surface, `?tab=` query param.
- **Cockpit tab recipe** (for Billing + Ad Tracking): (1) add id to `ServiceTab` union + `SERVICE_TABS` entry in `src/lib/deliveryCockpit.ts`; (2) build `components/admin/cockpit/<X>Tab.tsx`; (3) add a branch to the `switch` in `routes/admin/DeliveryCockpit.tsx`; (4) endpoint under `functions/api/admin/clients/[tenantId]/…` + `useAdmin…Query(tenantId)`.

## Testing / build
- Vitest. `npm test` → `vitest run`. Co-located `*.test.ts` (Node env). Extract pure logic (rate math, month generation, rollups) into `src/lib/*.ts` or `functions/lib/*.ts` and unit-test it.
- `npm run typecheck` (app + functions tsconfigs). `npm run build`. Migrations: `npm run db:migrate`.

## Design
- Chosen system: Bento Bold. Reference impl: `command-center/docs/mockups/admin-redesign/cold-calling.html`. The picked layout per surface is the `<surface>-<letter>.html` mockup in that folder. Port its markup/CSS into React components under the existing admin theme (`.pk-kit`). No em dashes in code/UI.

# Section 04: Wire frontend to real data

## Goal

Replace all mock-data calls in the PWA with real fetches against the `/api/*` Pages Functions built in section 03. End state: dashboard, lead list, lead detail, and pipeline screens all show live Willis Windows data. Pipeline stages are rendered dynamically from whatever Willis has configured in GHL. Won/Lost actions write back to GHL with a confirm modal.

Estimated time: ~2.5 hours.

## Depends on

Section 02 (Supabase auth + `get_my_tenant` RPC live) and section 03 (`/api/*` endpoints returning real GHL data).

## Files created / modified

```
client-dashboard/
  src/
    lib/
      api.ts                                  (new: typed fetch wrapper, attaches Supabase JWT, base URL switch dev/prod)
      queryClient.ts                          (new: TanStack QueryClient singleton with IndexedDB persistence)
    hooks/
      useLeads.ts                             (new: useQuery wrapper around /api/leads)
      useLead.ts                              (new: useQuery wrapper around /api/leads/:id)
      usePipeline.ts                          (new: useQuery wrapper around /api/pipeline)
      useUpdateStage.ts                       (new: useMutation around /api/leads/:id/stage)
    routes/
      Dashboard.tsx                           (modified: pull stats from real leads + pipeline)
      Leads.tsx                               (modified: list from useLeads, search/filter client-side)
      LeadDetail.tsx                          (modified: useLead, stage selector, Won/Lost actions)
      Pipeline.tsx                            (modified: dynamic columns from usePipeline)
    components/
      ConfirmModal.tsx                        (new: reusable confirm dialog, used by stage changes)
      EmptyState.tsx                          (new: shown when GHL returns zero leads)
      ErrorState.tsx                          (new: shown on API failure with retry)
    main.tsx                                  (modified: wrap app in QueryClientProvider)
```

Mock-data files (`src/data/mockLeads.ts`, etc.) get deleted after this section.

## Steps

1. **API client (15 min)**
   - `src/lib/api.ts` exports `api<T>(path, init?)` that:
     - Resolves base URL: dev → `http://localhost:8788` (wrangler pages dev) or empty string (Vite proxy); prod → empty string (same origin).
     - Pulls the current Supabase session via `supabase.auth.getSession()`, attaches `Authorization: Bearer <access_token>`.
     - Throws a typed `ApiError` with status + JSON body on non-2xx.
   - Add a Vite dev proxy to forward `/api/*` to `http://localhost:8788` so the same paths work in dev.

2. **Query client + persistence (10 min)**
   - `src/lib/queryClient.ts` creates one `QueryClient`. Default `staleTime: 30s`, `gcTime: 24h`.
   - Use `@tanstack/query-sync-storage-persister` with `localStorage` (simple) or `idb-keyval` for IndexedDB (preferred for size). Persist only successful queries.
   - Wrap `<App />` in `<QueryClientProvider>` and `<PersistQueryClientProvider>` in `main.tsx`.

3. **Pipeline hook (15 min)**
   - `usePipeline()` → `GET /api/pipeline`. Returns `{ id, name, stages: [{ id, name, position }] }`.
   - Cache for the whole session (`staleTime: Infinity`). Pipeline shape rarely changes mid-day.
   - Section 03's response is the source of truth — match its TypeScript types.

4. **Leads list hook (15 min)**
   - `useLeads({ stageId?, search? })` → `GET /api/leads?stage=&q=`.
   - Returns paginated `{ items, nextCursor }`. Use `useInfiniteQuery` so scroll triggers next-page.
   - Optimistic refetch on focus (mobile users tab back into the app often).

5. **Lead detail hook (10 min)**
   - `useLead(id)` → `GET /api/leads/:id`. Includes contact, opportunity, conversation thread (last 50 messages).
   - `staleTime: 10s` so opening a lead twice in a row doesn't re-hit GHL.

6. **Stage update mutation (20 min)**
   - `useUpdateStage()` → `POST /api/leads/:id/stage` with `{ stageId, reason? }`.
   - Optimistic update: patch the cached lead immediately, roll back on error.
   - Invalidate `useLeads` and `usePipeline` counts on success.
   - ConfirmModal shows for Won and Lost (terminal stages); other stage changes are silent.

7. **Dashboard rewrite (20 min)**
   - Stat tiles pull from real data: `leadsThisWeek = leads.filter(createdAt > weekStart).length`, `wonThisMonth = leads.filter(stage.name === tenant.won_label && updatedAt > monthStart).length`, `pipelineValue = leads.filter(open).sum(opportunityValue)`.
   - Loading skeletons (existing `LoadingShell` component) while queries resolve.
   - ErrorState if `useLeads` errors.

8. **Leads list rewrite (15 min)**
   - Drop `mockLeads` import. Replace with `useLeads()`.
   - Search input filters client-side over the loaded pages (server-side `q=` param available but not used today).
   - Stage filter chips read from `usePipeline().stages`.
   - EmptyState if `leads.length === 0`: copy "No leads yet. Once a Willis form fills, it lands here."

9. **Lead detail rewrite (25 min)**
   - Header: contact name, phone, source. Body: opportunity value, stage, custom fields shown as a definition list.
   - Stage selector: dropdown of `pipeline.stages`. Selecting Won or Lost opens ConfirmModal. Selecting any other stage updates immediately.
   - Conversation thread placeholder ("messages render in section 05"). Don't ship the thread yet, just the empty container.
   - Tap-to-call button is a stub (section 05).

10. **Pipeline screen rewrite (15 min)**
    - Columns = `usePipeline().stages`, ordered by `position`.
    - Each column lists leads in that stage with horizontal scroll. Drag-and-drop is out of scope today (Tier 2).
    - Tap a card → navigate to lead detail.

11. **Delete mock data (5 min)**
    - Remove `src/data/mockLeads.ts`, `src/data/mockPipeline.ts`, any related files.
    - Grep for `mockLeads` and other dead refs; fix or delete.

12. **Local end-to-end test (15 min)**
    - `pnpm dev`. Sign in. Dashboard loads Willis stats. Leads list shows real Willis contacts. Open a lead. Change stage to a middle stage — should update silently. Change to Won — confirm modal appears, accept, refresh GHL on laptop — opportunity should be Won.

## Acceptance criteria

- Zero references to `mockLeads` or `mockPipeline` remain in the codebase (`grep` clean).
- Dashboard, Leads, LeadDetail, Pipeline screens all render real Willis data.
- Pipeline columns match Willis' actual GHL stages in correct order.
- Won/Lost shows confirm modal. Non-terminal stages don't.
- Sign-out clears the cache (TanStack Query reset on auth state change).
- `pnpm typecheck` clean.

## Stop condition

Commit when you can sign in, see real leads, change a stage, and confirm the change in GHL.

**Commit message:** `client-dashboard: wire frontend to real GHL via /api/* (section 04)`

## Notes

- Don't introduce a generic "data fetching abstraction" beyond the four hooks above. Each hook is small and explicit. Premature abstraction is the enemy.
- Optimistic updates only on the stage mutation. Everything else just refetches.
- `useLeads` returns 50 per page; that's enough for Willis (under 200 active leads). Pagination UI lives in section 04 but the loaded data is small enough that it'll feel instant.

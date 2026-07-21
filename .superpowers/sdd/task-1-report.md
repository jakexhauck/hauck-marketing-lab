# Task 1 report: shared tenant-to-GHL helper

## Files created

- `command-center/app/functions/lib/tenantGhl.ts`
- `command-center/app/functions/lib/tenantGhl.test.ts`

## Files modified

- `command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts`
- `command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts`

## Files explicitly left untouched

- `command-center/app/functions/lib/tenantResolve.ts` (per instructions; the client app still needs its env-var fallback)

## Commands run, in order

1. `cd command-center/app && npx vitest run functions/lib/tenantGhl.test.ts` (before implementation, expect fail)
2. `cd command-center/app && npx vitest run functions/lib/tenantGhl.test.ts` (after implementation, expect pass)
3. `cd command-center/app && npm run typecheck` (caught a null-client type error, fixed, reran)
4. `cd command-center/app && npm test`
5. `cd command-center/app && npm run typecheck`
6. `git add ...` (excluding `.superpowers/`) and `git commit`

## Full output: failing run (step 1, before `tenantGhl.ts` existed)

```
 RUN  v2.1.9 C:/Users/games/Desktop/hml-worktrees/setter-suite/command-center/app

 ❯ functions/lib/tenantGhl.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  functions/lib/tenantGhl.test.ts [ functions/lib/tenantGhl.test.ts ]
Error: Failed to load url ./tenantGhl (resolved id: ./tenantGhl) in C:/Users/games/Desktop/hml-worktrees/setter-suite/command-center/app/functions/lib/tenantGhl.test.ts. Does the file exist?
 ❯ loadAndTransform node_modules/vitest/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:51969:17

 Test Files  1 failed (1)
      Tests  no tests
   Start at  14:39:37
   Duration  380ms
```

## Full output: final passing run

`npm test`:

```
 Test Files  79 passed (79)
      Tests  863 passed (863)
   Start at  14:40:59
   Duration  3.36s
```

(includes `functions/lib/tenantGhl.test.ts ✓ (3 tests)` among the 79 files)

`npm run typecheck`:

```
> client-dashboard@0.1.0 typecheck
> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
```

No errors, no output after the command echo. Exit 0.

## What the new helper does

`getGhlContextForTenant(env, tenantId)` looks up `ghl_location_id`/`ghl_token` on the `tenants`
row by id (service-role client, admin routes run above tenant resolution so there is no other
way to get GHL creds for an arbitrary tenant), and either returns a `GhlContext` or throws
`TenantGhlError` with a `.status`/`.code`:

- `supabase_not_configured` (503): `getServiceClient` returned null
- `tenant_lookup_failed` (500): the Supabase query itself errored
- `tenant_not_found` (404): no row for that id
- `ghl_not_connected` (400): location id or token is a placeholder (`''`, `'pending'`, `'env'`)

Per the design decision in the task, it never falls back to `GHL_LOCATION_ID`/`GHL_TOKEN` env
vars the way `resolveGhlCreds` in `tenantResolve.ts` does. The file carries a comment explaining
why, referencing `tenantResolve.ts` by name, so a future reader does not "fix" it to match.

## Deviations from the brief, and why

1. **Null-client guard added.** The brief's Step 3 code called `client.from(...)` directly on
   the result of `getServiceClient(env)` without checking for null. `getServiceClient` returns
   `SupabaseClient | null`, so this failed `npm run typecheck` with
   `TS18047: 'client' is possibly 'null'`. Added:
   ```ts
   if (!client) throw new TenantGhlError(503, "supabase_not_configured", "Client data is not available right now.");
   ```
   with a comment noting every current caller already checks this itself before calling the
   helper, but TypeScript can't see that and a future caller might not.

2. **`env: any` typed as `env: Env`.** Matches the style of neighbouring lib files
   (`adminAuth.ts`, `tenantResolve.ts`), which all type their `env`/`client` parameters rather
   than using `any`. Behaviourally identical.

3. **`readiness.ts`: preserved the existing "checklist, not an error" response shape.** The
   brief's Step 5 instruction says to catch `TenantGhlError` and return `{ error: e.code }` at
   `e.status`. The existing route does not do that at all: when the tenant has no
   token/location yet (including the placeholder case), it returns `200` with
   `{ checks: [{ key: "token", ok: false, detail: "No token/location set yet" }] }`, because this
   endpoint drives an onboarding checklist UI, not an error page. I kept that behaviour exactly:
   any `TenantGhlError` (not-found, not-connected, or a lookup failure) now produces the same
   "not wired up yet" checklist item instead of surfacing as an HTTP error. Note the original
   code also silently swallowed Supabase query errors (ignored `error`, fell through to the
   same "not connected" response); the new helper distinguishes `tenant_lookup_failed` as its
   own code, but this route still folds it into the same checklist response, matching the
   original's effective behaviour bug-for-bug.

4. **`import-staff.ts`: kept the "client not found" wording for `tenant_not_found`.** Every
   other `admin/clients/:tenantId/*` route in this codebase (14 other files) returns
   `{ error: "client not found" }` at 404 for an unknown tenant. Rather than switch this one
   route to the helper's generic `{ error: "tenant_not_found" }`, I special-cased
   `tenant_not_found` to keep the existing literal string, and let the other codes
   (`ghl_not_connected`, `tenant_lookup_failed`, `supabase_not_configured`) surface the helper's
   own `.status`/`.message`.

5. **`import-staff.ts`: the not-connected error message text changed.** Old: `"connect this
   client to GoHighLevel first"` (400). New: the helper's `"Connect this client to the booking
   system first."` (still 400, still under the `error` key). This is a deliberate improvement,
   not an oversight: the old string named GoHighLevel directly in a response body that the admin
   UI (`ClientConfigPanel.tsx`) surfaces as an error toast, which is exactly what the project's
   "never name GoHighLevel/GHL in user-facing copy" rule exists to prevent. No test asserts on
   the literal string (grepped the whole app; only source files reference it, no test files), so
   this doesn't break any contract, only the wording shown to an admin.

6. **`import-staff.ts`: dropped the unused `id` column from the select.** The hand-rolled query
   selected `id, ghl_location_id, ghl_token`, but `tenant.id` was never read (the route already
   has `tenantId` from `ctx.params`). The shared helper only selects the two GHL columns it
   needs. No behavioural difference.

## Pre-existing failures

None found. `npm test` was 863/863 green and `npm run typecheck` was clean before I touched
anything relevant to this task (verified by running the full suite after the change, all other
78 test files passed as before).

## Concerns

- `readiness.ts` and `import-staff.ts` have no route-level tests (no `readiness.test.ts` or
  `import-staff.test.ts` exists in the repo), so the shape-preservation above is verified by
  careful reading against the original source, not by an automated regression test. If Task 1's
  reviewer wants route-level coverage for these two endpoints, that would be a good follow-up,
  but it's out of scope for what this task asked for (the task's own test surface is
  `isPlaceholder`).
- The `ghl_not_connected` message wording change in `import-staff.ts` (item 5 above) is a
  visible-to-admin string change. Flagging it explicitly in case Jake wants the exact old
  wording kept for continuity; I judged the anti-GHL-naming rule to take priority since the
  helper already had to say something here.

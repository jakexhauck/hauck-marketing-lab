# Review package: Task final-fix (995c3c6..5c48196)

## Commits
5c48196 fix(setter): pre-merge review batch, chunk dials lookup, guard rate strip, re-read on tag write, debounce slot lookup, tenant-context tests, drop dead computeRates

## Stat
 .superpowers/sdd/final-fix-report.md               | 223 +++++++++++++++++++++
 .../app/functions/api/admin/setter/leads.ts        |  29 ++-
 .../app/functions/lib/setterMetrics.test.ts        |  58 ++----
 command-center/app/functions/lib/setterMetrics.ts  |  38 +---
 command-center/app/functions/lib/tenantGhl.test.ts | 141 ++++++++++++-
 .../app/src/components/admin/SetterRateStrip.tsx   |   7 +-
 .../app/src/components/admin/setter/SlotPicker.tsx |  54 ++++-
 command-center/app/src/hooks/useApi.ts             |  11 +
 command-center/app/src/lib/setterRates.test.ts     |  26 +++
 command-center/app/src/lib/setterRates.ts          |  32 +--
 .../app/src/routes/admin/SetterSuite.tsx           |   2 +-
 11 files changed, 522 insertions(+), 99 deletions(-)

## Diff
```diff
diff --git a/.superpowers/sdd/final-fix-report.md b/.superpowers/sdd/final-fix-report.md
new file mode 100644
index 0000000..7a6f9e1
--- /dev/null
+++ b/.superpowers/sdd/final-fix-report.md
@@ -0,0 +1,223 @@
+# Final pre-merge fix batch: Setter Suite
+
+Six findings from the final review, fixed in one pass, in the worktree
+`C:\Users\games\Desktop\hml-worktrees\setter-suite`.
+
+## Finding 1 (BLOCKER): dials lookup fails on a real-sized pipeline
+
+`functions/api/admin/setter/leads.ts` was calling `.in("contact_id", contactIds)`
+with up to 1000 unbatched CRM ids, which postgrest-js serializes straight into
+the GET query string. A pipeline with a few hundred leads could build a query
+string long enough for Supabase's edge to reject, 500ing the whole board.
+
+**Change:**
+- Added a generic `chunk<T>(items: T[], size: number): T[][]` helper to
+  `functions/lib/setterMetrics.ts` (kept next to `rollUpByContact`, which
+  `leads.ts` already imports from there).
+- `leads.ts` now batches `contactIds` into groups of 100, runs the batches in
+  parallel via `Promise.all`, checks all results for an error before merging,
+  then rolls up the merged dial rows.
+- Also removed `computeRates` from the same file per Finding 6 (see below);
+  it lived right next to `chunk`.
+
+**Tests (TDD: written first, run, seen failing, then implemented):**
+`functions/lib/setterMetrics.test.ts`, new `describe("chunk", ...)` block:
+- empty list -> `[]`
+- fewer ids than one batch -> one batch
+- exactly one batch (100 items, size 100) -> one batch of 100
+- more than one batch (250 items, size 100) -> three batches (100/100/50),
+  flattened order preserved
+
+## Finding 2 (BLOCKER): rate strip shows a synthetic zero on a failed fetch
+
+`SetterRateStrip` was rendered above `leadsQuery.isError` in
+`src/routes/admin/SetterSuite.tsx`, so a failed leads fetch showed
+"Total leads in: 0" directly above the board's own error state.
+`computeSetterRateStrip` could not tell "zero leads" from "no data".
+
+**Change:**
+- `src/lib/setterRates.ts`: `computeSetterRateStrip` now takes a second
+  `failed = false` parameter. When `true`, all five tiles go `pending: true`
+  with `value: ""` and a `pendingReason` of `"Could not load leads"`
+  (distinct from the pre-existing `"No leads yet"` zero-denominator copy and
+  the `"Needs close-out flow"` missing-feature copy, so the three pending
+  reasons never get confused with each other).
+- `src/components/admin/SetterRateStrip.tsx`: added a `failed?: boolean`
+  prop, threaded straight through to `computeSetterRateStrip`.
+- `src/routes/admin/SetterSuite.tsx`: `<SetterRateStrip ... failed={leadsQuery.isError} />`.
+
+**Tests (TDD):** `src/lib/setterRates.test.ts`, three new cases:
+- a failed fetch with non-empty, fully-contacted/fully-booked input still
+  marks all five tiles pending with no value (proves it isn't just reusing
+  the zero-denominator path)
+- the failure copy and the honest-empty copy are provably different strings
+- an empty array with `failed: false` still renders the honest zero-leads
+  copy, unchanged from before
+
+## Finding 3 (BLOCKER): partly-applied tag write leaves stale tags on screen
+
+`useSetterTagsMutation` (`src/hooks/useApi.ts`) only had `onSuccess`. The
+tags endpoint applies removes then adds as two separate CRM calls; if the
+remove succeeds and the add throws, the CRM's tags already changed but the
+cockpit kept showing the pre-write list.
+
+**Change:** added `onSettled` that invalidates
+`["admin", "setter", "lead", tenantId, contactId]` unconditionally, so the
+detail query always re-fetches the CRM's real state after a write, success
+or failure. `onSuccess`'s optimistic cache write is kept for the fast,
+non-flickering common case; `onSettled` is the safety net.
+
+No new test added (this hook has no existing render/mutation test harness in
+this repo: `vitest.config.ts` only includes `*.test.ts`, environment is
+`node`, and there is no `@testing-library/react` install anywhere in the
+codebase to exercise a `useMutation` against a live `QueryClient`). Verified
+by reading the `onSettled` contract against React Query's own semantics
+(runs after success or error) and by typecheck/build passing.
+
+## Finding 4 (BLOCKER): every keystroke fires two live CRM calls
+
+`SlotPicker.tsx`'s `calendarName` state fed the query key directly with no
+debounce, and defaulted to the Willis-shaped `"Home Estimate"`.
+
+**Change:**
+- Added a 400ms-debounced `debouncedCalendarName` state, updated via a
+  `setTimeout`/`clearTimeout` effect keyed on `calendarName`. The live
+  query (`useSetterSlotsQuery`) now keys off `debouncedCalendarName`, not
+  the raw keystroke value.
+- Default value changed from `"Home Estimate"` to `""`. `useSetterSlotsQuery`
+  already gates on a non-empty name, so an empty/untouched field fires no
+  request.
+- Added an explicit "Enter a calendar name to see available times." prompt
+  for the empty-debounced-name state, so the panel never falls into the
+  generic "No open times" message when nothing has been entered yet.
+- Every other render branch (loading, needs-staff, not-found, generic error,
+  empty grid, slot grid) now also gates on `debouncedCalendarName` being
+  non-empty, so nothing can flash mid-typing.
+- The Book mutation now sends `calendarName: debouncedCalendarName` (the
+  value the displayed slots were actually fetched against) instead of the
+  raw field, so a booked slot can never be attributed to a calendar name the
+  slots were never fetched for.
+- Booking's non-retry behaviour (`retry: false` in `useSetterBookMutation`)
+  was not touched.
+
+No new test added, same reasoning as Finding 3 (no component/hook test
+harness in this repo). Verified by reading through the render-branch gating
+by hand and by typecheck/build passing.
+
+## Finding 5: `getGhlContextForTenant` had no tests
+
+`functions/lib/tenantGhl.test.ts` only tested `isPlaceholder`. This function
+is the only thing stopping the Setter Suite from falling back to
+`resolveGhlCreds`'s env-var credentials, which belong to a live production
+client.
+
+**Change:** rewrote `tenantGhl.test.ts`, mocking `./supabase` wholesale (same
+seam as the existing `functions/lib/googleCalendar.test.ts` pattern: replace
+the module binding rather than spy on it) with a stub chain for
+`client.from("tenants").select(...).eq("id", ...).maybeSingle()`. Added:
+- `it.each(["", "pending", "env"])` for both fields placeholder together
+- `it.each(["", "pending", "env"])` for only `ghl_location_id` placeholder
+- `it.each(["", "pending", "env"])` for only `ghl_token` placeholder
+- `tenant_not_found` when the row is `null`
+- returns the tenant's real creds unchanged when both fields are real
+- explicit sentinel-leak test: `env.GHL_LOCATION_ID` /
+  `env.GHL_TOKEN` are set to obviously-wrong sentinel strings
+  (`ENV-SENTINEL-LOCATION-DO-NOT-USE` / `ENV-SENTINEL-TOKEN-DO-NOT-USE`); the
+  test asserts the returned context never contains them, on the success path
+  (the placeholder-case tests already prove the failure path throws instead
+  of falling back)
+- bonus: `tenant_lookup_failed` on a raw Supabase error, also proving it
+  does not fall through to env creds on that path either
+
+Kept the original `isPlaceholder` describe block unchanged. Did not touch
+`tenantGhl.ts` itself, `tenantResolve.ts`, or any endpoint's use of
+`getGhlContextForTenant` (constraint: tenant-credential handling unchanged).
+
+## Finding 6: dead `computeRates`, drifted from the live rate strip
+
+`computeRates` in `functions/lib/setterMetrics.ts` was imported by nothing
+except its own test; the live rate strip computes booking rate client-side
+in `src/lib/setterRates.ts` with a different implementation.
+
+**Change:** deleted `computeRates`, its `Rates` type, and its
+`describe("computeRates", ...)` test block. Left `rollUpByContact` and its
+tests completely untouched. Updated one stale comment in
+`src/lib/setterRates.ts` that referenced the now-deleted `Rates` type.
+Confirmed via repo-wide grep that nothing else referenced `computeRates`.
+
+## Commands run
+
+```
+cd command-center/app
+npx vitest run functions/lib/setterMetrics.test.ts   # TDD red, then green
+npx vitest run src/lib/setterRates.test.ts            # TDD red, then green
+npx vitest run functions/lib/tenantGhl.test.ts         # new tests, green
+npm test
+npm run typecheck
+npm run build
+```
+
+## Final verification output
+
+### `npm test`
+
+```
+ Test Files  89 passed (89)
+      Tests  958 passed (958)
+   Duration  3.62s (transform 3.53s, setup 0ms, collect 10.72s, tests 1.06s, environment 23ms, prepare 15.36s)
+```
+
+### `npm run typecheck`
+
+```
+> client-dashboard@0.1.0 typecheck
+> tsc --noEmit && tsc --noEmit -p functions/tsconfig.json
+```
+
+(no output, exit 0: clean)
+
+### `npm run build`
+
+```
+> client-dashboard@0.1.0 build
+> tsc && vite build
+
+vite v7.3.6 building client environment for production...
+transforming...
+✓ 2256 modules transformed.
+rendering chunks...
+computing gzip size...
+dist/registerSW.js               0.13 kB
+dist/manifest.webmanifest        0.44 kB
+dist/index.html                  1.47 kB │ gzip:   0.64 kB
+dist/assets/index-BnF8-Bth.css  105.45 kB │ gzip:  18.41 kB
+dist/assets/index-Cfw_D_j6.js   1,514.75 kB │ gzip: 396.17 kB
+✓ built in 4.89s
+
+PWA v1.3.0
+Building src/sw.ts service worker ("es" format)...
+✓ 88 modules transformed.
+✓ built in 154ms
+
+PWA v1.3.0
+mode      injectManifest
+format:   es
+precache  19 entries (2663.95 KiB)
+files generated
+  dist/sw.js
+```
+
+(the >500kB chunk-size warning predates this change and is unrelated to any
+of the six findings)
+
+## Constraints honoured
+
+- No em dashes anywhere in the diff (grepped every changed file).
+- No "GoHighLevel"/"GHL" added to any UI-facing copy (checked the `src/`
+  diff specifically; internal comments still say GHL/CRM where the existing
+  file already did).
+- No raw hex colors added; only text/logic changes.
+- `getGhlContextForTenant` untouched; every setter endpoint still uses it;
+  `resolveGhlCreds` untouched and still unused by any setter endpoint.
+- `useSetterBookMutation`'s `retry: false` and its call sites' non-retry
+  discipline untouched.
diff --git a/command-center/app/functions/api/admin/setter/leads.ts b/command-center/app/functions/api/admin/setter/leads.ts
index b3d14a8..0f6c1b5 100644
--- a/command-center/app/functions/api/admin/setter/leads.ts
+++ b/command-center/app/functions/api/admin/setter/leads.ts
@@ -1,19 +1,19 @@
 import type { Env, ApiData } from "../../../lib/env";
 import {
   ghlJson,
   fetchAllOpportunities,
   type GhlOpportunity,
 } from "../../../lib/ghl";
 import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
 import { getServiceClient } from "../../../lib/supabase";
-import { rollUpByContact, type ContactRollUp, type DialRow } from "../../../lib/setterMetrics";
+import { rollUpByContact, chunk, type ContactRollUp, type DialRow } from "../../../lib/setterMetrics";
 
 // GET /api/admin/setter/leads?tenantId=&pipelineId= (admin-only, gated in
 // _middleware.ts). Every opportunity in ONE pipeline (the board shows one
 // pipeline's columns at a time), each merged with its dial history so the
 // card can show attempts/contacted/last outcome without a second round-trip
 // per lead.
 //
 // Deliberately excludes `tags`: fetching a contact's tags per card would be
 // an N+1 contact fetch across the whole board (see ghl.ts:108-110, the same
 // cost reason the list-view ApiLead omits attribution/tags). Tags belong to
@@ -100,27 +100,40 @@ export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) =>
     const opps = await fetchAllOpportunities(gctx, { pipelineId, truncated });
 
     const contactIds = [
       ...new Set(opps.map((o) => o.contact?.id ?? o.contactId).filter((id): id is string => !!id)),
     ];
 
     let rollUps = new Map<string, ContactRollUp>();
     if (contactIds.length) {
       const client = getServiceClient(ctx.env);
       if (client) {
-        const { data: dials, error } = await client
-          .from("setter_dials")
-          .select("contact_id, dialed_at, spoke, outcome")
-          .eq("tenant_id", tenantId)
-          .in("contact_id", contactIds);
-        if (error) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });
-        rollUps = rollUpByContact((dials ?? []) as DialRow[]);
+        // Batched: postgrest-js serializes .in() straight into the URL query
+        // string, and a pipeline holding a few hundred leads would otherwise
+        // build one contact_id=in.(...) list far past what Supabase's edge
+        // will accept, failing the whole board (see chunk's header comment
+        // in ../../../lib/setterMetrics.ts). Run the batches in parallel,
+        // then merge before rolling up.
+        const DIALS_BATCH_SIZE = 100;
+        const results = await Promise.all(
+          chunk(contactIds, DIALS_BATCH_SIZE).map((batch) =>
+            client
+              .from("setter_dials")
+              .select("contact_id, dialed_at, spoke, outcome")
+              .eq("tenant_id", tenantId)
+              .in("contact_id", batch),
+          ),
+        );
+        const firstError = results.find((r) => r.error)?.error;
+        if (firstError) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });
+        const dials = results.flatMap((r) => (r.data ?? []) as DialRow[]);
+        rollUps = rollUpByContact(dials);
       }
     }
 
     const leads = opps.map((o) => shapeSetterLead(o, stageNames, rollUps));
 
     return Response.json({ leads, truncated: truncated.value });
   } catch (e) {
     if (!(e instanceof TenantGhlError)) throw e;
     return Response.json({ error: e.code }, { status: e.status });
   }
diff --git a/command-center/app/functions/lib/setterMetrics.test.ts b/command-center/app/functions/lib/setterMetrics.test.ts
index 0249e6f..ed5d24d 100644
--- a/command-center/app/functions/lib/setterMetrics.test.ts
+++ b/command-center/app/functions/lib/setterMetrics.test.ts
@@ -1,12 +1,12 @@
 import { describe, it, expect } from "vitest";
-import { rollUpByContact, computeRates } from "./setterMetrics";
+import { rollUpByContact, chunk } from "./setterMetrics";
 
 const dial = (contact: string, at: string, spoke: boolean, outcome: string) =>
   ({ contact_id: contact, dialed_at: at, spoke, outcome });
 
 describe("rollUpByContact", () => {
   it("counts attempts and takes the earliest dial as first call", () => {
     const r = rollUpByContact([
       dial("c1", "2026-07-20T14:00:00Z", false, "no_answer"),
       dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
       dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
@@ -64,54 +64,40 @@ describe("rollUpByContact", () => {
   });
 
   it("falls back to the raw value when no dial for a contact has a parseable timestamp", () => {
     const r = rollUpByContact([dial("c1", "", false, "no_answer")]);
     expect(r.get("c1")!.attempts).toBe(1);
     expect(r.get("c1")!.firstDialedAt).toBe("");
     expect(r.get("c1")!.lastOutcome).toBe("no_answer");
   });
 });
 
-describe("computeRates", () => {
-  it("returns null rates rather than NaN when there are no leads", () => {
-    const r = computeRates([], new Map(), []);
-    expect(r.totalLeads).toBe(0);
-    expect(r.contactRate).toBeNull();
-    expect(r.bookingRate).toBeNull();
-  });
-
-  it("counts a lead as contacted only via its own roll-up", () => {
-    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
-    const rollUps = rollUpByContact([dial("c1", "2026-07-20T09:00:00Z", true, "booked")]);
-    const r = computeRates(leads, rollUps, []);
-    expect(r.totalLeads).toBe(2);
-    expect(r.contactRate).toBeCloseTo(0.5);
-  });
+describe("chunk", () => {
+  // functions/api/admin/setter/leads.ts batches the setter_dials .in() lookup
+  // through this, so a pipeline with a few hundred leads never serializes a
+  // single CRM-id list long enough for Supabase's edge to reject the URL.
 
-  it("never computes show or close rate", () => {
-    const r = computeRates([{ contactId: "c1" }], new Map(), [{ contactId: "c1" }]);
-    expect(r.showRate).toBeNull();
-    expect(r.closeRate).toBeNull();
+  it("returns an empty array for an empty list", () => {
+    expect(chunk([], 100)).toEqual([]);
   });
 
-  it("pins bookingRate to a real fraction of leads booked", () => {
-    const leads = [{ contactId: "c1" }, { contactId: "c2" }, { contactId: "c3" }];
-    const r = computeRates(leads, new Map(), [{ contactId: "c2" }]);
-    expect(r.bookingRate).toBeCloseTo(1 / 3);
+  it("returns one batch when the list is shorter than the batch size", () => {
+    expect(chunk(["a", "b"], 100)).toEqual([["a", "b"]]);
   });
 
-  it("uses lead count as the bookingRate denominator, not appointment count", () => {
-    // Three appointments land, but only one lead. If the denominator were
-    // accidentally the appointment count, this would compute 1/3 instead of 1.
-    const leads = [{ contactId: "c1" }];
-    const appointments = [{ contactId: "c1" }, { contactId: "c2" }, { contactId: "c3" }];
-    const r = computeRates(leads, new Map(), appointments);
-    expect(r.bookingRate).toBe(1);
+  it("returns exactly one batch when the list is exactly the batch size", () => {
+    const ids = Array.from({ length: 100 }, (_, i) => `id${i}`);
+    const batches = chunk(ids, 100);
+    expect(batches).toHaveLength(1);
+    expect(batches[0]).toHaveLength(100);
   });
 
-  it("does not let an appointment for a non-lead contact inflate bookingRate", () => {
-    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
-    const appointments = [{ contactId: "c2" }, { contactId: "not-a-lead" }];
-    const r = computeRates(leads, new Map(), appointments);
-    expect(r.bookingRate).toBeCloseTo(0.5);
+  it("splits into multiple batches, preserving order, when over the batch size", () => {
+    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
+    const batches = chunk(ids, 100);
+    expect(batches).toHaveLength(3);
+    expect(batches[0]).toHaveLength(100);
+    expect(batches[1]).toHaveLength(100);
+    expect(batches[2]).toHaveLength(50);
+    expect(batches.flat()).toEqual(ids);
   });
 });
diff --git a/command-center/app/functions/lib/setterMetrics.ts b/command-center/app/functions/lib/setterMetrics.ts
index 2996426..3354f5e 100644
--- a/command-center/app/functions/lib/setterMetrics.ts
+++ b/command-center/app/functions/lib/setterMetrics.ts
@@ -59,39 +59,21 @@ export function rollUpByContact(dials: DialRow[]): Map<string, ContactRollUp> {
       cur.lastOutcome = d.outcome;
       latestAt.set(d.contact_id, epoch);
     }
 
     if (d.spoke) cur.contacted = true;
     out.set(d.contact_id, cur);
   }
   return out;
 }
 
-export type Rates = {
-  totalLeads: number;
-  contactRate: number | null;
-  bookingRate: number | null;
-  showRate: null;
-  closeRate: null;
-};
-
-export function computeRates(
-  leads: { contactId: string }[],
-  rollUps: Map<string, ContactRollUp>,
-  appointments: { contactId: string }[],
-): Rates {
-  const total = leads.length;
-  if (total === 0) {
-    return { totalLeads: 0, contactRate: null, bookingRate: null, showRate: null, closeRate: null };
-  }
-  const contacted = leads.filter((l) => rollUps.get(l.contactId)?.contacted).length;
-  const booked = new Set(appointments.map((a) => a.contactId));
-  const bookedLeads = leads.filter((l) => booked.has(l.contactId)).length;
-  return {
-    totalLeads: total,
-    contactRate: contacted / total,
-    bookingRate: bookedLeads / total,
-    // Both require the Estimate and Job Close-out flows, which do not exist.
-    showRate: null,
-    closeRate: null,
-  };
+// Split an array into groups of at most `size`, preserving order. Used by
+// functions/api/admin/setter/leads.ts to keep the setter_dials .in() lookup
+// within a URL length Supabase's edge will accept: postgrest-js serializes
+// .in("contact_id", ids) straight into the query string, CRM ids are 24
+// characters each, and a pipeline holding a few hundred leads would
+// otherwise send one query string tens of kilobytes long.
+export function chunk<T>(items: T[], size: number): T[][] {
+  const out: T[][] = [];
+  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
+  return out;
 }
diff --git a/command-center/app/functions/lib/tenantGhl.test.ts b/command-center/app/functions/lib/tenantGhl.test.ts
index 64a415b..f0f4e4a 100644
--- a/command-center/app/functions/lib/tenantGhl.test.ts
+++ b/command-center/app/functions/lib/tenantGhl.test.ts
@@ -1,17 +1,154 @@
-import { describe, it, expect } from "vitest";
-import { isPlaceholder } from "./tenantGhl";
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { getServiceClient } from "./supabase";
+import { getGhlContextForTenant, isPlaceholder, TenantGhlError } from "./tenantGhl";
+import type { Env } from "./env";
+
+// Mock the transport wholesale, same seam as functions/lib/googleCalendar.test.ts:
+// getGhlContextForTenant is the ONLY thing standing between an admin write and
+// resolveGhlCreds's env-var fallback (see this file's own header comment), so
+// these tests stub Supabase directly rather than hitting a real database.
+vi.mock("./supabase", () => ({
+  getServiceClient: vi.fn(),
+}));
+
+// Sentinel values that are obviously wrong for a real tenant: if any
+// assertion below ever sees these strings in a returned GhlContext, that
+// proves the function read the env fallback instead of the tenant row.
+const ENV_SENTINEL_LOCATION = "ENV-SENTINEL-LOCATION-DO-NOT-USE";
+const ENV_SENTINEL_TOKEN = "ENV-SENTINEL-TOKEN-DO-NOT-USE";
+
+function envWithSentinels(): Env {
+  return {
+    GHL_LOCATION_ID: ENV_SENTINEL_LOCATION,
+    GHL_TOKEN: ENV_SENTINEL_TOKEN,
+  } as unknown as Env;
+}
+
+// Stubs the one call chain getGhlContextForTenant makes:
+// client.from("tenants").select(...).eq("id", tenantId).maybeSingle().
+function stubClient(result: { data: unknown; error: unknown }) {
+  const maybeSingle = vi.fn().mockResolvedValue(result);
+  const eq = vi.fn(() => ({ maybeSingle }));
+  const select = vi.fn(() => ({ eq }));
+  const from = vi.fn(() => ({ select }));
+  return { from } as unknown as ReturnType<typeof getServiceClient>;
+}
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
 
 describe("isPlaceholder", () => {
   it("rejects the three known placeholder values", () => {
     expect(isPlaceholder("")).toBe(true);
     expect(isPlaceholder("pending")).toBe(true);
     expect(isPlaceholder("env")).toBe(true);
   });
   it("accepts a real value", () => {
     expect(isPlaceholder("r0WfsA12qpBv7M185V3v")).toBe(false);
   });
   it("treats null and undefined as placeholder", () => {
     expect(isPlaceholder(null)).toBe(true);
     expect(isPlaceholder(undefined)).toBe(true);
   });
 });
+
+describe("getGhlContextForTenant", () => {
+  const REAL_LOCATION = "loc_r0WfsA12qpBv7M185V3v";
+  const REAL_TOKEN = "tok_9f8e7d6c5b4a39281706";
+
+  it.each(["", "pending", "env"])(
+    "throws ghl_not_connected when both fields hold the placeholder %j",
+    async (placeholder) => {
+      vi.mocked(getServiceClient).mockReturnValue(
+        stubClient({
+          data: { ghl_location_id: placeholder, ghl_token: placeholder },
+          error: null,
+        }),
+      );
+      await expect(getGhlContextForTenant(envWithSentinels(), "tenant-1")).rejects.toMatchObject({
+        code: "ghl_not_connected",
+        status: 400,
+      });
+    },
+  );
+
+  it.each(["", "pending", "env"])(
+    "throws ghl_not_connected when only ghl_location_id is the placeholder %j",
+    async (placeholder) => {
+      vi.mocked(getServiceClient).mockReturnValue(
+        stubClient({
+          data: { ghl_location_id: placeholder, ghl_token: REAL_TOKEN },
+          error: null,
+        }),
+      );
+      const err = await getGhlContextForTenant(envWithSentinels(), "tenant-1").catch((e) => e);
+      expect(err).toBeInstanceOf(TenantGhlError);
+      expect(err).toMatchObject({ code: "ghl_not_connected" });
+    },
+  );
+
+  it.each(["", "pending", "env"])(
+    "throws ghl_not_connected when only ghl_token is the placeholder %j",
+    async (placeholder) => {
+      vi.mocked(getServiceClient).mockReturnValue(
+        stubClient({
+          data: { ghl_location_id: REAL_LOCATION, ghl_token: placeholder },
+          error: null,
+        }),
+      );
+      await expect(getGhlContextForTenant(envWithSentinels(), "tenant-1")).rejects.toMatchObject({
+        code: "ghl_not_connected",
+      });
+    },
+  );
+
+  it("throws tenant_not_found when there is no row for the id", async () => {
+    vi.mocked(getServiceClient).mockReturnValue(stubClient({ data: null, error: null }));
+    await expect(getGhlContextForTenant(envWithSentinels(), "no-such-tenant")).rejects.toMatchObject({
+      code: "tenant_not_found",
+      status: 404,
+    });
+  });
+
+  it("returns the tenant's own real credentials", async () => {
+    vi.mocked(getServiceClient).mockReturnValue(
+      stubClient({
+        data: { ghl_location_id: REAL_LOCATION, ghl_token: REAL_TOKEN },
+        error: null,
+      }),
+    );
+    const ctx = await getGhlContextForTenant(envWithSentinels(), "tenant-1");
+    expect(ctx).toEqual({ locationId: REAL_LOCATION, token: REAL_TOKEN });
+  });
+
+  it("never reads env.GHL_LOCATION_ID or env.GHL_TOKEN, even as an env-var fallback", async () => {
+    // This is the divergence from resolveGhlCreds (tenantResolve.ts) that
+    // the header comment on getGhlContextForTenant calls out by name: that
+    // helper falls back to these two env vars, which belong to a live
+    // production client. This helper must throw instead, never fall back.
+    // A real-creds row proves the sentinels never leak through on the
+    // success path; the placeholder cases above already prove it throws
+    // instead of falling back on the failure path.
+    vi.mocked(getServiceClient).mockReturnValue(
+      stubClient({
+        data: { ghl_location_id: REAL_LOCATION, ghl_token: REAL_TOKEN },
+        error: null,
+      }),
+    );
+    const ctx = await getGhlContextForTenant(envWithSentinels(), "tenant-1");
+    expect(ctx.locationId).not.toBe(ENV_SENTINEL_LOCATION);
+    expect(ctx.token).not.toBe(ENV_SENTINEL_TOKEN);
+    expect(JSON.stringify(ctx)).not.toContain("SENTINEL");
+  });
+
+  it("throws tenant_lookup_failed on a Supabase error, never falling through to env creds", async () => {
+    vi.mocked(getServiceClient).mockReturnValue(
+      stubClient({ data: null, error: { message: "connection reset" } }),
+    );
+    await expect(getGhlContextForTenant(envWithSentinels(), "tenant-1")).rejects.toMatchObject({
+      code: "tenant_lookup_failed",
+      status: 500,
+    });
+  });
+});
diff --git a/command-center/app/src/components/admin/SetterRateStrip.tsx b/command-center/app/src/components/admin/SetterRateStrip.tsx
index b4aca61..b1112e7 100644
--- a/command-center/app/src/components/admin/SetterRateStrip.tsx
+++ b/command-center/app/src/components/admin/SetterRateStrip.tsx
@@ -1,35 +1,40 @@
 import { computeSetterRateStrip } from "../../lib/setterRates";
 import type { ApiSetterLead } from "../../lib/api";
 
 interface Props {
   leads: ApiSetterLead[];
+  // True while the leads fetch that would populate `leads` has failed: every
+  // tile goes pending with failure copy instead of computing off an empty
+  // array, so a dead request never reads as an honest "zero leads in".
+  failed?: boolean;
 }
 
 // The Setter Suite's headline rate strip (Task 9): five tiles, in the exact
 // order and wording the client specified. Lives outside
 // src/components/admin/setter/ deliberately: two other fix tasks are editing
 // that folder concurrently.
 //
 // Show rate and Close rate have no data behind them yet (they need the
 // Estimate and Job close-out flows, which do not exist), so they always
 // render with the shared `.pk-report-tile.pk-pending` treatment instead of a
 // number. A synthetic zero here would read as "our show rate is 0 percent",
 // a catastrophe, when the truth is "we are not measuring this yet." Contact
 // rate and Booking rate get the same pending treatment for the narrower case
 // of a zero-lead denominator, since 0/0 is undefined, not 0.
 //
 // All the math is pure and unit-tested in src/lib/setterRates.ts; this
 // component only renders what that function returns.
-export default function SetterRateStrip({ leads }: Props) {
+export default function SetterRateStrip({ leads, failed = false }: Props) {
   const tiles = computeSetterRateStrip(
     leads.map((l) => ({ contacted: l.contacted, lastOutcome: l.lastOutcome })),
+    failed,
   );
 
   return (
     <div className="pk-report" aria-label="Headline rates">
       {tiles.map((tile) => (
         <div key={tile.key} className={`pk-report-tile${tile.pending ? " pk-pending" : ""}`}>
           <div className={`pk-report-val font-data${tile.pending ? "" : " tabular-figs"}`}>
             {tile.pending ? tile.pendingReason : tile.value}
           </div>
           <div className="pk-report-label">{tile.label}</div>
diff --git a/command-center/app/src/components/admin/setter/SlotPicker.tsx b/command-center/app/src/components/admin/setter/SlotPicker.tsx
index ccd158d..c930f96 100644
--- a/command-center/app/src/components/admin/setter/SlotPicker.tsx
+++ b/command-center/app/src/components/admin/setter/SlotPicker.tsx
@@ -5,42 +5,67 @@ import { useToast } from "../../../context/ToastContext";
 import { ApiError } from "../../../lib/api";
 import { formatSlotDay, formatSlotTime, computeSlotEnd } from "../../../lib/setterCockpit";
 
 interface Props {
   tenantId: string;
   contactId: string;
   leadName: string;
 }
 
 const DAYS_AHEAD = 14;
+// Typing "Estimate" one keystroke at a time must not fire eight live CRM
+// lookups (a calendars list plus a free-slots call, each), so the value that
+// actually drives the query only updates once typing has paused.
+const CALENDAR_NAME_DEBOUNCE_MS = 400;
 const fieldClass =
   "w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-brand/50";
 
 // Live slot lookup + booking, scoped to a calendar chosen by name (the
 // Setter Suite works every pipeline for a client, so there is no single
 // fixed calendar to hardcode the way the client-facing "Home Estimate"
 // visit flow does; see functions/api/admin/setter/slots.ts + book.ts, both
 // generic on calendarName). A day selector narrows the live slot grid to
 // one day at a time so the docked panel stays compact.
 //
+// The name field starts empty and the live lookup is driven by a debounced
+// copy of it (CALENDAR_NAME_DEBOUNCE_MS below), not the raw keystroke value:
+// every keystroke would otherwise fire a calendars list plus a free-slots
+// call, both against the live client's API token, and flash a
+// "could not find a calendar" error for every incomplete prefix. Starting
+// empty also matters on its own: a hardcoded default here would be shaped
+// for one client (Willis's "Home Estimate") and error on first paint for
+// every other client on this cross-client screen.
+//
 // Booking is terminal: functions/api/admin/setter/book.ts deliberately does
 // not retry (a retry can double-book a real customer), and this component
 // honours that by disabling the Book button the instant the mutation is
 // in flight, with no retry wired anywhere in the call chain.
 export default function SlotPicker({ tenantId, contactId, leadName }: Props) {
   const { showToast } = useToast();
-  const [calendarName, setCalendarName] = useState("Home Estimate");
+  const [calendarName, setCalendarName] = useState("");
+  const [debouncedCalendarName, setDebouncedCalendarName] = useState("");
   const [durationMinutes, setDurationMinutes] = useState(60);
   const [selectedDate, setSelectedDate] = useState<string | null>(null);
   const [picked, setPicked] = useState<string | null>(null);
 
-  const slotsQuery = useSetterSlotsQuery(tenantId, calendarName, DAYS_AHEAD, true);
+  useEffect(() => {
+    const t = setTimeout(
+      () => setDebouncedCalendarName(calendarName.trim()),
+      CALENDAR_NAME_DEBOUNCE_MS,
+    );
+    return () => clearTimeout(t);
+  }, [calendarName]);
+
+  // useSetterSlotsQuery already gates on a non-empty calendar name
+  // (src/hooks/useApi.ts), so an untouched or cleared field fires no request
+  // at all rather than erroring on an empty lookup.
+  const slotsQuery = useSetterSlotsQuery(tenantId, debouncedCalendarName, DAYS_AHEAD, true);
   const bookMutation = useSetterBookMutation();
 
   const days = slotsQuery.data?.days ?? [];
 
   // Keep the selected day valid as the live data changes (a fresh calendar
   // name, or a day that has since emptied out): fall back to the first day
   // with slots rather than showing an empty grid for a day the API no
   // longer lists.
   useEffect(() => {
     if (days.length === 0) {
@@ -62,21 +87,24 @@ export default function SlotPicker({ tenantId, contactId, leadName }: Props) {
       : null;
   const needsStaff = errorCode === "needs_staff";
   const notFound = errorCode === "calendar_not_found";
 
   const book = () => {
     if (!picked || bookMutation.isPending) return;
     const endTime = computeSlotEnd(picked, durationMinutes);
     bookMutation.mutate(
       {
         tenantId,
-        calendarName,
+        // The debounced value, not the raw field: it is what the displayed
+        // slots were actually fetched for, so booking against it guarantees
+        // the calendar matches the slot the setter picked.
+        calendarName: debouncedCalendarName,
         contactId,
         startTime: picked,
         endTime,
         title: `Estimate for ${leadName}`,
       },
       {
         onSuccess: () => {
           showToast(`Booked ${formatSlotDay(picked.slice(0, 10))} at ${formatSlotTime(picked)}`);
           setPicked(null);
         },
@@ -115,54 +143,60 @@ export default function SlotPicker({ tenantId, contactId, leadName }: Props) {
             type="number"
             min={15}
             step={15}
             value={durationMinutes}
             onChange={(e) => setDurationMinutes(Math.max(15, Number(e.target.value) || 60))}
             className={`${fieldClass} mt-1 normal-case`}
           />
         </label>
       </div>
 
-      {slotsQuery.isLoading && (
+      {!debouncedCalendarName && (
+        <p className="py-2 text-[12.5px] text-muted">
+          Enter a calendar name to see available times.
+        </p>
+      )}
+
+      {!!debouncedCalendarName && slotsQuery.isLoading && (
         <div className="flex items-center gap-2 py-4 text-[12.5px] text-muted">
           <Loader2 size={14} className="animate-spin" /> Loading available times...
         </div>
       )}
 
-      {!slotsQuery.isLoading && needsStaff && (
+      {!!debouncedCalendarName && !slotsQuery.isLoading && needsStaff && (
         <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
           <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
           <span>This calendar has no team members assigned, so it cannot return availability.</span>
         </div>
       )}
 
-      {!slotsQuery.isLoading && notFound && (
+      {!!debouncedCalendarName && !slotsQuery.isLoading && notFound && (
         <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
           <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
-          <span>Could not find a calendar named &quot;{calendarName}&quot;. Check the name and try again.</span>
+          <span>Could not find a calendar named &quot;{debouncedCalendarName}&quot;. Check the name and try again.</span>
         </div>
       )}
 
-      {!slotsQuery.isLoading && slotsQuery.isError && !needsStaff && !notFound && (
+      {!!debouncedCalendarName && !slotsQuery.isLoading && slotsQuery.isError && !needsStaff && !notFound && (
         <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
           <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
           <span>Could not load available times. Try again.</span>
         </div>
       )}
 
-      {!slotsQuery.isLoading && !slotsQuery.isError && days.length === 0 && (
+      {!!debouncedCalendarName && !slotsQuery.isLoading && !slotsQuery.isError && days.length === 0 && (
         <p className="py-2 text-[12.5px] text-muted">
           No open times on this calendar in the next {DAYS_AHEAD} days.
         </p>
       )}
 
-      {!slotsQuery.isLoading && !slotsQuery.isError && days.length > 0 && (
+      {!!debouncedCalendarName && !slotsQuery.isLoading && !slotsQuery.isError && days.length > 0 && (
         <>
           <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
             {days.map((d) => {
               const on = d.date === selectedDate;
               return (
                 <button
                   key={d.date}
                   type="button"
                   onClick={() => {
                     setSelectedDate(d.date);
diff --git a/command-center/app/src/hooks/useApi.ts b/command-center/app/src/hooks/useApi.ts
index 9045fb1..65e0e60 100644
--- a/command-center/app/src/hooks/useApi.ts
+++ b/command-center/app/src/hooks/useApi.ts
@@ -552,35 +552,46 @@ export interface SetterTagsInput {
   add?: string[];
   remove?: string[];
 }
 
 // Adds/removes tags on the live CRM contact (POST /api/admin/setter/tags),
 // then writes the RESPONSE's tag list into the lead detail cache: the API
 // re-reads the contact after writing rather than echoing the request
 // (functions/api/admin/setter/tags.ts), and this does the same on the
 // client, so the cockpit only ever shows what the CRM actually holds, never
 // an optimistic guess, since these tags fire live automations.
+//
+// The endpoint applies removes then adds as two separate CRM calls, so a
+// request that dies partway through (remove succeeded, add threw) already
+// changed the CRM's real tag list before the caller ever sees an error. An
+// onSuccess-only cache write would leave the panel showing the pre-write
+// tags, including one that no longer exists, on that failure path. onSettled
+// re-reads the lead detail query unconditionally, so the panel always ends
+// up showing the CRM's true state, success or failure alike.
 export function useSetterTagsMutation() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: (input: SetterTagsInput) =>
       api<{ tags: string[] }>("/api/admin/setter/tags", {
         method: "POST",
         body: JSON.stringify(input),
       }),
     onSuccess: (data, input) => {
       const detailKey = ["admin", "setter", "lead", input.tenantId, input.contactId];
       const previous = qc.getQueryData<{ lead: ApiSetterLeadDetail }>(detailKey);
       if (previous) {
         qc.setQueryData(detailKey, { lead: { ...previous.lead, tags: data.tags } });
       }
     },
+    onSettled: (_data, _err, input) => {
+      qc.invalidateQueries({ queryKey: ["admin", "setter", "lead", input.tenantId, input.contactId] });
+    },
   });
 }
 
 export interface SetterSlotDay {
   date: string; // "YYYY-MM-DD"
   slots: string[]; // ISO start times with offset
 }
 export interface SetterSlotsResponse {
   ok: true;
   timezone: string;
diff --git a/command-center/app/src/lib/setterRates.test.ts b/command-center/app/src/lib/setterRates.test.ts
index 7de4e1d..8faa1c5 100644
--- a/command-center/app/src/lib/setterRates.test.ts
+++ b/command-center/app/src/lib/setterRates.test.ts
@@ -82,11 +82,37 @@ describe("computeSetterRateStrip", () => {
     expect(booking.value).toBe("");
     expect(booking.pendingReason).toBe("No leads yet");
   });
 
   it("a real zero (leads exist, none contacted or booked yet) is a genuine 0%, not pending", () => {
     const leads = [lead(false, null), lead(false, "no_answer")];
     const tiles = computeSetterRateStrip(leads);
     expect(tile(tiles, "contactRate")).toMatchObject({ pending: false, value: "0%" });
     expect(tile(tiles, "bookingRate")).toMatchObject({ pending: false, value: "0%" });
   });
+
+  it("marks all five tiles pending when the leads fetch failed, never a synthetic zero", () => {
+    // Same non-empty input as the "would produce a fake number" case above:
+    // if `failed` were ignored, this would render real-looking numbers
+    // straight through a failed fetch instead of "we don't know".
+    const leads = [lead(true, "booked"), lead(true, "booked")];
+    const tiles = computeSetterRateStrip(leads, true);
+    for (const key of ["totalLeads", "contactRate", "bookingRate", "showRate", "closeRate"]) {
+      const t = tile(tiles, key);
+      expect(t.pending).toBe(true);
+      expect(t.value).toBe("");
+    }
+  });
+
+  it("a failed fetch is never mistaken for the honest zero-leads case: the copy differs", () => {
+    const failed = tile(computeSetterRateStrip([], true), "totalLeads");
+    const empty = tile(computeSetterRateStrip([], false), "contactRate");
+    expect(failed.pendingReason).not.toBe(empty.pendingReason);
+    expect(failed.pendingReason).toMatch(/could not load/i);
+  });
+
+  it("an empty leads array without a failure is still the honest zero, not the failure copy", () => {
+    const tiles = computeSetterRateStrip([], false);
+    expect(tile(tiles, "totalLeads")).toMatchObject({ pending: false, value: "0" });
+    expect(tile(tiles, "contactRate").pendingReason).toBe("No leads yet");
+  });
 });
diff --git a/command-center/app/src/lib/setterRates.ts b/command-center/app/src/lib/setterRates.ts
index 11d5ffb..5e4651a 100644
--- a/command-center/app/src/lib/setterRates.ts
+++ b/command-center/app/src/lib/setterRates.ts
@@ -1,23 +1,21 @@
 // Pure math for the Setter Suite's headline rate strip (Task 9). Built from
 // the exact leads array the board already has on screen (one pipeline's
 // worth of functions/api/admin/setter/leads.ts's ApiSetterLead): no new
 // fetch, no new endpoint, nothing sampled.
 //
 // The client specified five rates, word for word, in this order:
 //   Total leads in, Contact rate, Booking rate, Show rate, Close rate.
 // Only the first three have data behind them. Show rate (showed / booked)
 // and Close rate (won / showed) need the Estimate and Job close-out flows,
 // which do not exist yet, so they are ALWAYS pending here, independent of
-// the input: mirrors functions/lib/setterMetrics.ts's Rates type, which
-// types showRate/closeRate as the literal `null` so fabricating them is a
-// type error there too.
+// the input.
 
 export interface SetterRateTile {
   key: "totalLeads" | "contactRate" | "bookingRate" | "showRate" | "closeRate";
   label: string;
   formula: string;
   // true when there is no honest number to show: either the data source
   // doesn't exist yet (show/close), or the denominator is zero (no leads
   // loaded yet, so "contacted / leads" is 0/0, not 0).
   pending: boolean;
   // Formatted display value, e.g. "42%" or "7". Empty when pending: a
@@ -36,64 +34,72 @@ interface RateLead {
 // "No leads yet" instead of a lying "0%".
 function safeRate(numerator: number, denominator: number): number | null {
   if (denominator === 0) return null;
   return numerator / denominator;
 }
 
 function formatPercent(rate: number): string {
   return `${Math.round(rate * 100)}%`;
 }
 
-export function computeSetterRateStrip(leads: RateLead[]): SetterRateTile[] {
+// "Could not load leads" and "No leads yet" both render a pending tile, but
+// they are not the same claim: one says the board has zero real leads, the
+// other says we have no idea because the fetch itself failed. Conflating
+// them is exactly the synthetic-zero failure this file exists to prevent,
+// so a failed fetch gets its own copy on every tile, including the two
+// (Show/Close) that are pending for an unrelated reason.
+const FAILED_REASON = "Could not load leads";
+
+export function computeSetterRateStrip(leads: RateLead[], failed = false): SetterRateTile[] {
   const total = leads.length;
   const contacted = leads.filter((l) => l.contacted).length;
   // "booked" is the same dial outcome a setter logs the moment they lock in
   // a time (functions/api/admin/setter/dials.ts's OUTCOMES), already carried
   // on every board card as lastOutcome. No appointments fetch required.
   const booked = leads.filter((l) => l.lastOutcome === "booked").length;
 
-  const contactRate = safeRate(contacted, total);
-  const bookingRate = safeRate(booked, total);
+  const contactRate = failed ? null : safeRate(contacted, total);
+  const bookingRate = failed ? null : safeRate(booked, total);
 
   return [
     {
       key: "totalLeads",
       label: "Total leads in",
       formula: "count of leads",
-      pending: false,
-      value: String(total),
-      pendingReason: null,
+      pending: failed,
+      value: failed ? "" : String(total),
+      pendingReason: failed ? FAILED_REASON : null,
     },
     {
       key: "contactRate",
       label: "Contact rate",
       formula: "contacted / leads",
       pending: contactRate === null,
       value: contactRate === null ? "" : formatPercent(contactRate),
-      pendingReason: contactRate === null ? "No leads yet" : null,
+      pendingReason: contactRate === null ? (failed ? FAILED_REASON : "No leads yet") : null,
     },
     {
       key: "bookingRate",
       label: "Booking rate",
       formula: "booked / leads",
       pending: bookingRate === null,
       value: bookingRate === null ? "" : formatPercent(bookingRate),
-      pendingReason: bookingRate === null ? "No leads yet" : null,
+      pendingReason: bookingRate === null ? (failed ? FAILED_REASON : "No leads yet") : null,
     },
     {
       key: "showRate",
       label: "Show rate",
       formula: "showed / booked",
       pending: true,
       value: "",
-      pendingReason: "Needs close-out flow",
+      pendingReason: failed ? FAILED_REASON : "Needs close-out flow",
     },
     {
       key: "closeRate",
       label: "Close rate",
       formula: "won / showed",
       pending: true,
       value: "",
-      pendingReason: "Needs close-out flow",
+      pendingReason: failed ? FAILED_REASON : "Needs close-out flow",
     },
   ];
 }
diff --git a/command-center/app/src/routes/admin/SetterSuite.tsx b/command-center/app/src/routes/admin/SetterSuite.tsx
index cd7972f..9d64232 100644
--- a/command-center/app/src/routes/admin/SetterSuite.tsx
+++ b/command-center/app/src/routes/admin/SetterSuite.tsx
@@ -87,21 +87,21 @@ export default function SetterSuite() {
       </div>
 
       {clientsQuery.isLoading ? (
         <div className="pk-empty">Loading clients...</div>
       ) : clientsQuery.isError ? (
         <div className="pk-empty">Could not load clients.</div>
       ) : clients.length === 0 ? (
         <div className="pk-empty">No clients yet.</div>
       ) : !activeTenantId || !activeClient ? null : (
         <>
-          <SetterRateStrip leads={leadsQuery.data?.leads ?? []} />
+          <SetterRateStrip leads={leadsQuery.data?.leads ?? []} failed={leadsQuery.isError} />
 
           <nav className="pk-tabs" aria-label="Pipelines">
             {pipelines.map((p) => (
               <button
                 key={p.id}
                 type="button"
                 className={`pk-tab${p.id === activePipelineId ? " on" : ""}`}
                 onClick={() => selectPipeline(p.id)}
               >
                 {p.name}
```

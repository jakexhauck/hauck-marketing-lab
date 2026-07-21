# Review package: Task 1 (3079046..e2d9785)

## Commits
e2d9785 refactor(admin): extract getGhlContextForTenant, the missing shared helper

## Stat
 .../api/admin/clients/[tenantId]/import-staff.ts   | 36 +++++++--------
 .../api/admin/onboarding/[tenantId]/readiness.ts   | 24 +++++-----
 command-center/app/functions/lib/tenantGhl.test.ts | 17 +++++++
 command-center/app/functions/lib/tenantGhl.ts      | 52 ++++++++++++++++++++++
 4 files changed, 96 insertions(+), 33 deletions(-)

## Diff
```diff
diff --git a/command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts b/command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts
index cac3090..4dc0ab8 100644
--- a/command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts
+++ b/command-center/app/functions/api/admin/clients/[tenantId]/import-staff.ts
@@ -1,52 +1,46 @@
 import type { Env, ApiData } from "../../../../lib/env";
 import { getServiceClient } from "../../../../lib/supabase";
 import { logAdminAction } from "../../../../lib/adminAuth";
 import { hashPassword } from "../../../../lib/password";
 import { listGhlLocationUsers } from "../../../../lib/staff";
+import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
+import type { GhlContext } from "../../../../lib/ghl";
 
 // POST /api/admin/clients/:tenantId/import-staff  (admin-only)
 // Pre-populate a client's team from the users GoHighLevel already has on their
 // sub-account. Each imported person becomes a staff_accounts row linked by
 // ghl_user_id, but DISABLED with an unusable random password: the owner sets a
 // real password (and grants) on the Team screen before they can sign in. People
 // already imported (matched by email) are skipped, never overwritten.
 export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
   const client = getServiceClient(ctx.env);
   if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
 
   const tenantId = ctx.params.tenantId as string;
 
-  // ghl_token is intentionally excluded from getTenantById, so read the creds
-  // we need directly here (service client, never exposed to the browser).
-  const { data: tenant } = await client
-    .from("tenants")
-    .select("id, ghl_location_id, ghl_token")
-    .eq("id", tenantId)
-    .maybeSingle();
-  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });
-
-  const t = tenant as { id: string; ghl_location_id: string; ghl_token: string };
-  const placeholder = (v: string) => {
-    const s = (v ?? "").trim().toLowerCase();
-    return s === "" || s === "pending" || s === "env";
-  };
-  if (placeholder(t.ghl_location_id) || placeholder(t.ghl_token)) {
-    return Response.json(
-      { error: "connect this client to GoHighLevel first" },
-      { status: 400 },
-    );
+  let gctx: GhlContext;
+  try {
+    gctx = await getGhlContextForTenant(ctx.env, tenantId);
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    // tenant_not_found keeps this route's existing "client not found" wording,
+    // which matches every other admin/clients/:tenantId endpoint. The other
+    // codes (ghl_not_connected, tenant_lookup_failed, supabase_not_configured)
+    // surface the helper's own status and message.
+    const error = e.code === "tenant_not_found" ? "client not found" : e.message;
+    return Response.json({ error }, { status: e.status });
   }
 
   const users = await listGhlLocationUsers({
-    token: t.ghl_token,
-    locationId: t.ghl_location_id,
+    token: gctx.token,
+    locationId: gctx.locationId,
   });
   if (users.length === 0) {
     return Response.json({ imported: 0, skipped: 0, total: 0 });
   }
 
   // Existing staff emails for this tenant, to skip rather than clobber.
   const { data: existingRows } = await client
     .from("staff_accounts")
     .select("email")
     .eq("tenant_id", tenantId);
diff --git a/command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts b/command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts
index a4dcd64..bea7c0d 100644
--- a/command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts
+++ b/command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts
@@ -1,44 +1,44 @@
 import type { Env, ApiData } from "../../../../lib/env";
 import { getServiceClient } from "../../../../lib/supabase";
-import { ghlFetch } from "../../../../lib/ghl";
+import { ghlFetch, type GhlContext } from "../../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
 import { summarizeReadiness, type GhlCustomValue } from "../../../../../src/lib/onboarding";
 
 // GET /api/admin/onboarding/:tenantId/readiness -> live auto-checks
 export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
   const client = getServiceClient(ctx.env);
   if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
   const tenantId = ctx.params.tenantId as string;
 
-  const { data: tenant } = await client
-    .from("tenants")
-    .select("ghl_location_id, ghl_token")
-    .eq("id", tenantId)
-    .maybeSingle();
-  const locationId = (tenant?.ghl_location_id as string) ?? "";
-  const token = (tenant?.ghl_token as string) ?? "";
-  if (!locationId || !token || locationId === "pending" || token === "pending") {
+  let gctx: GhlContext;
+  try {
+    gctx = await getGhlContextForTenant(ctx.env, tenantId);
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    // Not found, not connected, or the lookup itself failed: this screen's
+    // job is a checklist, not an error page, so any of those states surfaces
+    // as the same "not wired up yet" item rather than an HTTP error.
     return Response.json({ checks: [{ key: "token", ok: false, detail: "No token/location set yet" }] });
   }
-  const gctx = { token, locationId };
 
   let tokenValid = false;
   let customValues: GhlCustomValue[] = [];
-  const cvRes = await ghlFetch(gctx, `/locations/${encodeURIComponent(locationId)}/customValues`);
+  const cvRes = await ghlFetch(gctx, `/locations/${encodeURIComponent(gctx.locationId)}/customValues`);
   if (cvRes.ok) {
     tokenValid = true;
     const data = (await cvRes.json()) as { customValues?: GhlCustomValue[] };
     customValues = data.customValues ?? [];
   }
 
   let calendarIds: string[] = [];
-  const calRes = await ghlFetch(gctx, `/calendars/?locationId=${encodeURIComponent(locationId)}`, {
+  const calRes = await ghlFetch(gctx, `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`, {
     headers: { Version: "2021-04-15" },
   });
   if (calRes.ok) {
     const data = (await calRes.json()) as { calendars?: { id: string }[] };
     calendarIds = (data.calendars ?? []).map((c) => c.id);
   }
 
   const checks = summarizeReadiness({ fields: {}, customValues, calendarIds, tokenValid });
   return Response.json({ checks });
 };
diff --git a/command-center/app/functions/lib/tenantGhl.test.ts b/command-center/app/functions/lib/tenantGhl.test.ts
new file mode 100644
index 0000000..64a415b
--- /dev/null
+++ b/command-center/app/functions/lib/tenantGhl.test.ts
@@ -0,0 +1,17 @@
+import { describe, it, expect } from "vitest";
+import { isPlaceholder } from "./tenantGhl";
+
+describe("isPlaceholder", () => {
+  it("rejects the three known placeholder values", () => {
+    expect(isPlaceholder("")).toBe(true);
+    expect(isPlaceholder("pending")).toBe(true);
+    expect(isPlaceholder("env")).toBe(true);
+  });
+  it("accepts a real value", () => {
+    expect(isPlaceholder("r0WfsA12qpBv7M185V3v")).toBe(false);
+  });
+  it("treats null and undefined as placeholder", () => {
+    expect(isPlaceholder(null)).toBe(true);
+    expect(isPlaceholder(undefined)).toBe(true);
+  });
+});
diff --git a/command-center/app/functions/lib/tenantGhl.ts b/command-center/app/functions/lib/tenantGhl.ts
new file mode 100644
index 0000000..bde08d0
--- /dev/null
+++ b/command-center/app/functions/lib/tenantGhl.ts
@@ -0,0 +1,52 @@
+import type { Env } from "./env";
+import { getServiceClient } from "./supabase";
+import type { GhlContext } from "./ghl";
+
+const PLACEHOLDERS = new Set(["", "pending", "env"]);
+
+export function isPlaceholder(v: string | null | undefined): boolean {
+  return v == null || PLACEHOLDERS.has(v.trim().toLowerCase());
+}
+
+export class TenantGhlError extends Error {
+  constructor(readonly status: number, readonly code: string, message: string) {
+    super(message);
+  }
+}
+
+// Admin routes run above tenant resolution (functions/api/_middleware.ts:87-100),
+// so ctx.data.tenant is never populated. This is the one place that turns a
+// tenantId into a usable GHL context for those routes. Note getTenantById in
+// adminAuth.ts deliberately omits ghl_token, so it cannot be used here.
+//
+// Deliberate divergence from resolveGhlCreds in tenantResolve.ts: that helper
+// falls back to the GHL_LOCATION_ID / GHL_TOKEN env vars when a tenant's stored
+// creds are placeholders, because it backs the live client app where "show the
+// env sub-account" is an acceptable degrade. The env vars hold a real
+// production client's credentials. Admin tooling built on this helper (the
+// Setter Suite client switcher) WRITES: it applies tags that fire live
+// automations. If an admin picked a half-configured client and this fell back
+// to the env creds, it would silently tag a different client's real customers.
+// So this throws instead of falling back. Do not change this to match
+// resolveGhlCreds; the two helpers serve different trust boundaries on
+// purpose.
+export async function getGhlContextForTenant(env: Env, tenantId: string): Promise<GhlContext> {
+  const client = getServiceClient(env);
+  // getServiceClient returns null when Supabase env vars are unset. Every
+  // current caller already checks this itself before reaching here, but
+  // TypeScript cannot see that, and a future caller might not: fail loudly
+  // rather than crash on client.from below.
+  if (!client) throw new TenantGhlError(503, "supabase_not_configured", "Client data is not available right now.");
+  const { data, error } = await client
+    .from("tenants")
+    .select("ghl_location_id, ghl_token")
+    .eq("id", tenantId)
+    .maybeSingle();
+
+  if (error) throw new TenantGhlError(500, "tenant_lookup_failed", error.message);
+  if (!data) throw new TenantGhlError(404, "tenant_not_found", "No such client.");
+  if (isPlaceholder(data.ghl_location_id) || isPlaceholder(data.ghl_token)) {
+    throw new TenantGhlError(400, "ghl_not_connected", "Connect this client to the booking system first.");
+  }
+  return { token: data.ghl_token, locationId: data.ghl_location_id };
+}
```

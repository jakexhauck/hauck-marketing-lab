# Review package: Task 5 (3463889..3b32c9a)

## Commits
3b32c9a feat(setter): lead detail, dial logging, and tag add/remove

## Stat
 .../app/functions/api/admin/setter/dials.test.ts   |  28 ++++
 .../app/functions/api/admin/setter/dials.ts        | 154 +++++++++++++++++++++
 .../functions/api/admin/setter/lead/[contactId].ts |  82 +++++++++++
 .../app/functions/api/admin/setter/tags.test.ts    |  45 ++++++
 .../app/functions/api/admin/setter/tags.ts         | 115 +++++++++++++++
 5 files changed, 424 insertions(+)

## Diff
```diff
diff --git a/command-center/app/functions/api/admin/setter/dials.test.ts b/command-center/app/functions/api/admin/setter/dials.test.ts
new file mode 100644
index 0000000..c2be9b8
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/dials.test.ts
@@ -0,0 +1,28 @@
+import { describe, it, expect } from "vitest";
+import { validateDialBody } from "./dials";
+
+// validateDialBody is the only pure logic in this route (the rest is a
+// Supabase insert), so this covers every 400 path, including the one input
+// that would otherwise silently corrupt the Contact rate.
+
+describe("validateDialBody", () => {
+  it("rejects an outcome outside the five allowed values", () => {
+    const r = validateDialBody({ tenantId: "t", contactId: "c", spoke: true, outcome: "maybe" });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("bad_outcome");
+  });
+  it("accepts each of the five allowed outcomes", () => {
+    for (const o of ["booked","not_interested","no_answer","reschedule","bad_lead"]) {
+      expect(validateDialBody({ tenantId:"t", contactId:"c", spoke:false, outcome:o }).ok).toBe(true);
+    }
+  });
+  it("requires tenantId and contactId", () => {
+    expect(validateDialBody({ contactId: "c", spoke: true, outcome: "booked" }).ok).toBe(false);
+    expect(validateDialBody({ tenantId: "t", spoke: true, outcome: "booked" }).ok).toBe(false);
+  });
+  it("rejects a no_answer that claims someone spoke", () => {
+    const r = validateDialBody({ tenantId:"t", contactId:"c", spoke:true, outcome:"no_answer" });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("contradictory");
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/dials.ts b/command-center/app/functions/api/admin/setter/dials.ts
new file mode 100644
index 0000000..e17eda0
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/dials.ts
@@ -0,0 +1,154 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { readJsonBody } from "../../../lib/body";
+import { getServiceClient } from "../../../lib/supabase";
+import { logAdminAction } from "../../../lib/adminAuth";
+
+// POST /api/admin/setter/dials (admin-only, gated in _middleware.ts). Appends
+// one row to setter_dials for a phone call a setter just made. Every derived
+// per-lead stat and headline rate (functions/lib/setterMetrics.ts) is built
+// from these rows, never stored redundantly, so this is the single write
+// path for the whole Setter Suite's history. See migration 0040 for the
+// column set and the DB-level check constraint on outcome.
+
+export const OUTCOMES = ["booked", "not_interested", "no_answer", "reschedule", "bad_lead"] as const;
+export type Outcome = (typeof OUTCOMES)[number];
+
+export interface DialBody {
+  tenantId?: string;
+  contactId?: string;
+  opportunityId?: string | null;
+  pipelineName?: string | null;
+  stageName?: string | null;
+  spoke?: boolean;
+  outcome?: string;
+  note?: string | null;
+  tagsApplied?: string[];
+}
+
+export interface ValidationResult {
+  ok: boolean;
+  code?: string;
+  error?: string;
+}
+
+// Pure, split out so it is unit-testable without a request. Every field the
+// DB also constrains (the outcome enum) is checked here too, so a bad
+// request 400s instead of surfacing the DB's check-constraint violation as a
+// 500.
+export function validateDialBody(body: DialBody): ValidationResult {
+  if (!body.tenantId || !body.tenantId.trim()) {
+    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
+  }
+  if (!body.contactId || !body.contactId.trim()) {
+    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
+  }
+  if (!body.outcome || !OUTCOMES.includes(body.outcome as Outcome)) {
+    return { ok: false, code: "bad_outcome", error: "outcome must be one of: " + OUTCOMES.join(", ") };
+  }
+  // The one input that silently corrupts the Contact rate metric: no_answer
+  // means nobody picked up, so it can never be paired with spoke: true. Must
+  // be a hard validation error, not a row that quietly overstates contacts.
+  if (body.outcome === "no_answer" && body.spoke === true) {
+    return {
+      ok: false,
+      code: "contradictory",
+      error: "outcome 'no_answer' cannot be paired with spoke: true",
+    };
+  }
+  return { ok: true };
+}
+
+// The shape returned to the client, camelCased, shared with the lead detail
+// endpoint's `dials` array (functions/api/admin/setter/lead/[contactId].ts).
+export interface ApiDialRow {
+  id: string;
+  contactId: string;
+  opportunityId: string | null;
+  pipelineName: string | null;
+  stageName: string | null;
+  dialedAt: string;
+  spoke: boolean;
+  outcome: string;
+  note: string | null;
+  tagsApplied: string[];
+  createdBy: string | null;
+  createdAt: string;
+}
+
+// The raw setter_dials row shape as it comes back from Supabase (0040).
+export interface RawDialRow {
+  id: string;
+  contact_id: string;
+  opportunity_id: string | null;
+  pipeline_name: string | null;
+  stage_name: string | null;
+  dialed_at: string;
+  spoke: boolean;
+  outcome: string;
+  note: string | null;
+  tags_applied: string[] | null;
+  created_by: string | null;
+  created_at: string;
+}
+
+export const DIAL_SELECT =
+  "id, contact_id, opportunity_id, pipeline_name, stage_name, dialed_at, spoke, outcome, note, tags_applied, created_by, created_at";
+
+export function shapeDialRow(row: RawDialRow): ApiDialRow {
+  return {
+    id: row.id,
+    contactId: row.contact_id,
+    opportunityId: row.opportunity_id,
+    pipelineName: row.pipeline_name,
+    stageName: row.stage_name,
+    dialedAt: row.dialed_at,
+    spoke: row.spoke,
+    outcome: row.outcome,
+    note: row.note,
+    tagsApplied: row.tags_applied ?? [],
+    createdBy: row.created_by,
+    createdAt: row.created_at,
+  };
+}
+
+export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const body = await readJsonBody<DialBody>(ctx.request);
+  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
+
+  const validation = validateDialBody(body);
+  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });
+
+  const client = getServiceClient(ctx.env);
+  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
+
+  const adminId = ctx.data.admin!.id;
+
+  const { data, error } = await client
+    .from("setter_dials")
+    .insert({
+      tenant_id: body.tenantId,
+      contact_id: body.contactId,
+      opportunity_id: body.opportunityId ?? null,
+      pipeline_name: body.pipelineName ?? null,
+      stage_name: body.stageName ?? null,
+      spoke: body.spoke === true,
+      outcome: body.outcome,
+      note: body.note && body.note.trim() ? body.note.trim() : null,
+      tags_applied: body.tagsApplied ?? [],
+      created_by: adminId,
+    })
+    .select(DIAL_SELECT)
+    .single();
+  if (error || !data) {
+    return Response.json({ error: error?.message ?? "could not save dial" }, { status: 500 });
+  }
+
+  const dial = shapeDialRow(data as unknown as RawDialRow);
+  await logAdminAction(client, adminId, "setter.dial", body.tenantId!, {
+    contactId: body.contactId,
+    outcome: body.outcome,
+    spoke: dial.spoke,
+  });
+
+  return Response.json({ dial }, { status: 201 });
+};
diff --git a/command-center/app/functions/api/admin/setter/lead/[contactId].ts b/command-center/app/functions/api/admin/setter/lead/[contactId].ts
new file mode 100644
index 0000000..cc10468
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/lead/[contactId].ts
@@ -0,0 +1,82 @@
+import type { Env, ApiData } from "../../../../lib/env";
+import { ghlJson } from "../../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
+import { getServiceClient } from "../../../../lib/supabase";
+import { DIAL_SELECT, shapeDialRow, type ApiDialRow, type RawDialRow } from "../dials";
+
+// GET /api/admin/setter/lead/:contactId?tenantId= (admin-only, gated in
+// _middleware.ts). The cockpit's single-lead panel: one contact's live CRM
+// details plus its full dial history from setter_dials, newest first.
+//
+// Unlike the board list (functions/api/admin/setter/leads.ts), which
+// deliberately omits tags to avoid an N+1 contact fetch across a whole
+// column, this is exactly one contact, so fetching its tags here costs
+// nothing extra: one /contacts/{id} call already returns them.
+
+interface GhlContactResponse {
+  contact: {
+    id: string;
+    contactName?: string;
+    firstName?: string;
+    lastName?: string;
+    email?: string;
+    phone?: string;
+    tags?: string[];
+  };
+}
+
+export interface ApiSetterLeadDetail {
+  contactId: string;
+  name: string;
+  phone: string;
+  email: string;
+  tags: string[];
+  dials: ApiDialRow[];
+}
+
+export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
+  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
+  const contactId = ctx.params.contactId as string;
+  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
+  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+    const data = await ghlJson<GhlContactResponse>(
+      gctx,
+      `/contacts/${encodeURIComponent(contactId)}`,
+    );
+    const c = data.contact;
+    const name =
+      c.contactName ||
+      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
+      "Unknown";
+
+    let dials: ApiDialRow[] = [];
+    const client = getServiceClient(ctx.env);
+    if (client) {
+      const { data: rows, error } = await client
+        .from("setter_dials")
+        .select(DIAL_SELECT)
+        .eq("tenant_id", tenantId)
+        .eq("contact_id", contactId)
+        .order("dialed_at", { ascending: false });
+      if (error) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });
+      dials = ((rows ?? []) as unknown as RawDialRow[]).map(shapeDialRow);
+    }
+
+    const lead: ApiSetterLeadDetail = {
+      contactId,
+      name,
+      phone: c.phone ?? "",
+      email: c.email ?? "",
+      tags: c.tags ?? [],
+      dials,
+    };
+
+    return Response.json({ lead });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/api/admin/setter/tags.test.ts b/command-center/app/functions/api/admin/setter/tags.test.ts
new file mode 100644
index 0000000..d1c3732
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/tags.test.ts
@@ -0,0 +1,45 @@
+import { describe, it, expect } from "vitest";
+import { validateTagsBody } from "./tags";
+
+// validateTagsBody is the only pure logic in this route (the rest is a live
+// CRM round-trip), so this covers every 400 path before a request ever
+// reaches the tags API.
+
+describe("validateTagsBody", () => {
+  it("requires tenantId and contactId", () => {
+    expect(validateTagsBody({ contactId: "c", add: ["x"] }).ok).toBe(false);
+    expect(validateTagsBody({ tenantId: "t", add: ["x"] }).ok).toBe(false);
+  });
+
+  it("rejects a body with neither add nor remove", () => {
+    const r = validateTagsBody({ tenantId: "t", contactId: "c" });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("nothing_to_do");
+  });
+
+  it("rejects a body where add and remove are both empty arrays", () => {
+    const r = validateTagsBody({ tenantId: "t", contactId: "c", add: [], remove: [] });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("nothing_to_do");
+  });
+
+  it("rejects a body where add/remove contain only blank strings", () => {
+    const r = validateTagsBody({ tenantId: "t", contactId: "c", add: ["  ", ""] });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("nothing_to_do");
+  });
+
+  it("accepts add only", () => {
+    expect(validateTagsBody({ tenantId: "t", contactId: "c", add: ["hot lead"] }).ok).toBe(true);
+  });
+
+  it("accepts remove only", () => {
+    expect(validateTagsBody({ tenantId: "t", contactId: "c", remove: ["cold"] }).ok).toBe(true);
+  });
+
+  it("accepts both add and remove together", () => {
+    expect(
+      validateTagsBody({ tenantId: "t", contactId: "c", add: ["hot"], remove: ["cold"] }).ok,
+    ).toBe(true);
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/tags.ts b/command-center/app/functions/api/admin/setter/tags.ts
new file mode 100644
index 0000000..ea9fe63
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/tags.ts
@@ -0,0 +1,115 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { readJsonBody } from "../../../lib/body";
+import { ghlJson } from "../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+import { getServiceClient } from "../../../lib/supabase";
+import { logAdminAction } from "../../../lib/adminAuth";
+
+// POST /api/admin/setter/tags (admin-only, gated in _middleware.ts). Adds
+// and/or removes tags on a live CRM contact. These tags fire that client's
+// automations, so this is the riskiest write in the Setter Suite: it MUST
+// use getGhlContextForTenant (never resolveGhlCreds, which falls back to a
+// different, live production client's credentials on a half-configured
+// tenant) and it MUST re-read the contact after writing rather than echo the
+// request, so the setter sees what the CRM actually holds.
+//
+// ADD is proven live: POST /contacts/{id}/tags {"tags":[...]} -> 201,
+// tagsAdded (functions/api/reviews/index.ts:170 uses the same call style).
+// REMOVE is proven live too: DELETE /contacts/{id}/tags {"tags":[...]} ->
+// 200, tagsRemoved, confirmed gone on re-read. The GHL CLI's remove
+// (gohighlevel_cli.py) sends no body and silently drops its tags argument;
+// do not copy it.
+
+export interface TagsBody {
+  tenantId?: string;
+  contactId?: string;
+  add?: string[];
+  remove?: string[];
+}
+
+export interface ValidationResult {
+  ok: boolean;
+  code?: string;
+  error?: string;
+}
+
+// Trim and drop blanks; a caller that sends only whitespace tags has really
+// sent nothing.
+function cleanTags(list: string[] | undefined): string[] {
+  if (!Array.isArray(list)) return [];
+  return list.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean);
+}
+
+// Pure, split out so it is unit-testable without a request.
+export function validateTagsBody(body: TagsBody): ValidationResult {
+  if (!body.tenantId || !body.tenantId.trim()) {
+    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
+  }
+  if (!body.contactId || !body.contactId.trim()) {
+    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
+  }
+  if (cleanTags(body.add).length === 0 && cleanTags(body.remove).length === 0) {
+    return { ok: false, code: "nothing_to_do", error: "add or remove must contain at least one tag" };
+  }
+  return { ok: true };
+}
+
+interface GhlContactTagsResponse {
+  contact?: { tags?: string[] };
+}
+
+export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const body = await readJsonBody<TagsBody>(ctx.request);
+  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
+
+  const validation = validateTagsBody(body);
+  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });
+
+  const tenantId = body.tenantId!.trim();
+  const contactId = body.contactId!.trim();
+  const add = cleanTags(body.add);
+  const remove = cleanTags(body.remove);
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+
+    // Fixed order: remove first, then add. A tag present in both lists ends
+    // up added (add wins), rather than the outcome depending on request-body
+    // key order.
+    if (remove.length) {
+      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
+        method: "DELETE",
+        body: JSON.stringify({ tags: remove }),
+      });
+    }
+    if (add.length) {
+      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
+        method: "POST",
+        body: JSON.stringify({ tags: add }),
+      });
+    }
+
+    // Re-read so the setter sees what the CRM actually holds, not an echo of
+    // the request: these tags fire live automations, so the real state is
+    // what matters.
+    const data = await ghlJson<GhlContactTagsResponse>(
+      gctx,
+      `/contacts/${encodeURIComponent(contactId)}`,
+    );
+    const tags = data.contact?.tags ?? [];
+
+    const client = getServiceClient(ctx.env);
+    if (client) {
+      await logAdminAction(client, ctx.data.admin!.id, "setter.tags", tenantId, {
+        contactId,
+        add,
+        remove,
+      });
+    }
+
+    return Response.json({ tags });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
```

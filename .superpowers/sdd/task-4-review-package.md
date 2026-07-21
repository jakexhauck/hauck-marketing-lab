# Review package: Task 4 (fb8970d..3463889)

## Commits
3463889 feat(setter): read endpoints for pipelines and board leads

## Stat
 .../app/functions/api/admin/setter/leads.test.ts   |  88 ++++++++++++++
 .../app/functions/api/admin/setter/leads.ts        | 127 +++++++++++++++++++++
 .../functions/api/admin/setter/pipelines.test.ts   |  50 ++++++++
 .../app/functions/api/admin/setter/pipelines.ts    |  77 +++++++++++++
 command-center/app/functions/lib/ghl.test.ts       |  98 ++++++++++++++++
 command-center/app/functions/lib/ghl.ts            |  17 ++-
 6 files changed, 456 insertions(+), 1 deletion(-)

## Diff
```diff
diff --git a/command-center/app/functions/api/admin/setter/leads.test.ts b/command-center/app/functions/api/admin/setter/leads.test.ts
new file mode 100644
index 0000000..c1cb81d
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/leads.test.ts
@@ -0,0 +1,88 @@
+import { describe, it, expect } from "vitest";
+import { shapeSetterLead } from "./leads";
+import { rollUpByContact } from "../../../lib/setterMetrics";
+import type { GhlOpportunity } from "../../../lib/ghl";
+
+const stageNames = new Map([
+  ["s1", "Opted In (needs dialing)"],
+  ["s2", "Long Term Nurture"],
+]);
+
+describe("shapeSetterLead", () => {
+  it("merges a contact's dial roll-up into the card", () => {
+    const rollUps = rollUpByContact([
+      { contact_id: "c1", dialed_at: "2026-07-20T09:00:00Z", spoke: false, outcome: "no_answer" },
+      { contact_id: "c1", dialed_at: "2026-07-20T17:00:00Z", spoke: true, outcome: "booked" },
+    ]);
+    const o: GhlOpportunity = {
+      id: "o1",
+      name: "Jane Doe",
+      pipelineStageId: "s1",
+      contact: { id: "c1", phone: "555-1000", city: "Garden City" },
+      createdAt: "2026-07-19T00:00:00Z",
+    };
+
+    const lead = shapeSetterLead(o, stageNames, rollUps);
+
+    expect(lead).toEqual({
+      id: "o1",
+      contactId: "c1",
+      name: "Jane Doe",
+      phone: "555-1000",
+      city: "Garden City",
+      stageName: "Opted In (needs dialing)",
+      createdAt: "2026-07-19T00:00:00Z",
+      attempts: 2,
+      firstDialedAt: "2026-07-20T09:00:00Z",
+      contacted: true,
+      lastOutcome: "booked",
+    });
+  });
+
+  it("defaults every dial field for a lead never dialed", () => {
+    const o: GhlOpportunity = {
+      id: "o2",
+      contactId: "c2",
+      pipelineStageId: "s2",
+      contact: { id: "c2" },
+    };
+
+    const lead = shapeSetterLead(o, stageNames, new Map());
+
+    expect(lead.attempts).toBe(0);
+    expect(lead.firstDialedAt).toBeNull();
+    expect(lead.contacted).toBe(false);
+    expect(lead.lastOutcome).toBeNull();
+  });
+
+  it("falls back to the contact's first+last name when the opportunity has no name", () => {
+    const o: GhlOpportunity = {
+      id: "o3",
+      pipelineStageId: "s1",
+      contact: { id: "c3", firstName: "Sam", lastName: "Rivera" },
+    };
+    expect(shapeSetterLead(o, stageNames, new Map()).name).toBe("Sam Rivera");
+  });
+
+  it("falls back to Unknown when there is no opportunity name or contact name at all", () => {
+    const o: GhlOpportunity = { id: "o4", pipelineStageId: "s1", contact: { id: "c4" } };
+    expect(shapeSetterLead(o, stageNames, new Map()).name).toBe("Unknown");
+  });
+
+  it("resolves stageName to empty string for an unknown stage id, never a stale guess", () => {
+    const o: GhlOpportunity = { id: "o5", pipelineStageId: "does-not-exist", contact: { id: "c5" } };
+    expect(shapeSetterLead(o, stageNames, new Map()).stageName).toBe("");
+  });
+
+  it("prefers contact.id over the opportunity's own contactId when both are present", () => {
+    const o: GhlOpportunity = { id: "o6", contactId: "wrong", pipelineStageId: "s1", contact: { id: "right" } };
+    expect(shapeSetterLead(o, stageNames, new Map()).contactId).toBe("right");
+  });
+
+  it("defaults phone and city to empty strings, never undefined, when the contact omits them", () => {
+    const o: GhlOpportunity = { id: "o7", pipelineStageId: "s1", contact: { id: "c7" } };
+    const lead = shapeSetterLead(o, stageNames, new Map());
+    expect(lead.phone).toBe("");
+    expect(lead.city).toBe("");
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/leads.ts b/command-center/app/functions/api/admin/setter/leads.ts
new file mode 100644
index 0000000..b3d14a8
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/leads.ts
@@ -0,0 +1,127 @@
+import type { Env, ApiData } from "../../../lib/env";
+import {
+  ghlJson,
+  fetchAllOpportunities,
+  type GhlOpportunity,
+} from "../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+import { getServiceClient } from "../../../lib/supabase";
+import { rollUpByContact, type ContactRollUp, type DialRow } from "../../../lib/setterMetrics";
+
+// GET /api/admin/setter/leads?tenantId=&pipelineId= (admin-only, gated in
+// _middleware.ts). Every opportunity in ONE pipeline (the board shows one
+// pipeline's columns at a time), each merged with its dial history so the
+// card can show attempts/contacted/last outcome without a second round-trip
+// per lead.
+//
+// Deliberately excludes `tags`: fetching a contact's tags per card would be
+// an N+1 contact fetch across the whole board (see ghl.ts:108-110, the same
+// cost reason the list-view ApiLead omits attribution/tags). Tags belong to
+// the per-lead detail endpoint (Task 5), which fetches one contact at a time.
+
+interface GhlStage {
+  id: string;
+  name: string;
+}
+interface GhlPipeline {
+  id: string;
+  name: string;
+  stages?: GhlStage[];
+}
+interface PipelinesResponse {
+  pipelines: GhlPipeline[];
+}
+
+export interface ApiSetterLead {
+  id: string;
+  contactId: string;
+  name: string;
+  phone: string;
+  city: string;
+  stageName: string;
+  createdAt: string;
+  attempts: number;
+  firstDialedAt: string | null;
+  contacted: boolean;
+  lastOutcome: string | null;
+}
+
+// Pure: shape one live opportunity plus its already-computed dial roll-up
+// into a board card. No I/O, so this (and rollUpByContact, tested in
+// setterMetrics.test.ts) is the unit-testable core of the route.
+export function shapeSetterLead(
+  o: GhlOpportunity,
+  stageNames: Map<string, string>,
+  rollUps: Map<string, ContactRollUp>,
+): ApiSetterLead {
+  const contactId = o.contact?.id ?? o.contactId ?? "";
+  const fullName =
+    o.contact?.name ||
+    [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(" ").trim();
+  const rollUp = rollUps.get(contactId);
+  return {
+    id: o.id,
+    contactId,
+    name: o.name || fullName || "Unknown",
+    phone: o.contact?.phone ?? "",
+    city: o.contact?.city ?? "",
+    stageName: stageNames.get(o.pipelineStageId ?? "") ?? "",
+    createdAt: o.createdAt ?? new Date().toISOString(),
+    attempts: rollUp?.attempts ?? 0,
+    firstDialedAt: rollUp?.firstDialedAt ?? null,
+    contacted: rollUp?.contacted ?? false,
+    lastOutcome: rollUp?.lastOutcome ?? null,
+  };
+}
+
+export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const url = new URL(ctx.request.url);
+  const tenantId = url.searchParams.get("tenantId");
+  const pipelineId = url.searchParams.get("pipelineId");
+  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
+  if (!pipelineId) return Response.json({ error: "missing_pipeline_id" }, { status: 400 });
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+
+    // Stage names are resolved live, by id, from THIS tenant's pipeline list
+    // (never a hardcoded map): a stage rename in the CRM is reflected on the
+    // very next load.
+    const pipeData = await ghlJson<PipelinesResponse>(
+      gctx,
+      `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
+    );
+    const pipeline = (pipeData.pipelines ?? []).find((p) => p.id === pipelineId);
+    if (!pipeline) return Response.json({ error: "pipeline_not_found" }, { status: 404 });
+    const stageNames = new Map<string, string>();
+    for (const s of pipeline.stages ?? []) stageNames.set(s.id, s.name);
+
+    const truncated = { value: false };
+    const opps = await fetchAllOpportunities(gctx, { pipelineId, truncated });
+
+    const contactIds = [
+      ...new Set(opps.map((o) => o.contact?.id ?? o.contactId).filter((id): id is string => !!id)),
+    ];
+
+    let rollUps = new Map<string, ContactRollUp>();
+    if (contactIds.length) {
+      const client = getServiceClient(ctx.env);
+      if (client) {
+        const { data: dials, error } = await client
+          .from("setter_dials")
+          .select("contact_id, dialed_at, spoke, outcome")
+          .eq("tenant_id", tenantId)
+          .in("contact_id", contactIds);
+        if (error) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });
+        rollUps = rollUpByContact((dials ?? []) as DialRow[]);
+      }
+    }
+
+    const leads = opps.map((o) => shapeSetterLead(o, stageNames, rollUps));
+
+    return Response.json({ leads, truncated: truncated.value });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/api/admin/setter/pipelines.test.ts b/command-center/app/functions/api/admin/setter/pipelines.test.ts
new file mode 100644
index 0000000..080b830
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/pipelines.test.ts
@@ -0,0 +1,50 @@
+import { describe, it, expect } from "vitest";
+import { shapeSetterPipeline } from "./pipelines";
+
+describe("shapeSetterPipeline", () => {
+  it("sorts stages by live position, not array order", () => {
+    const p = shapeSetterPipeline({
+      id: "p1",
+      name: "Lead Form Pipeline",
+      stages: [
+        { id: "s2", name: "Second", position: 1 },
+        { id: "s1", name: "First", position: 0 },
+      ],
+    });
+    expect(p.stages.map((s) => s.id)).toEqual(["s1", "s2"]);
+  });
+
+  it("flags a stage as needsDialing on a case-insensitive match anywhere in the name", () => {
+    const p = shapeSetterPipeline({
+      id: "p1",
+      name: "Funnel Pipeline",
+      stages: [
+        { id: "s1", name: "Survey Completed No Call Booked (needs dialing)", position: 0 },
+        { id: "s2", name: "NEEDS DIALING", position: 1 },
+        { id: "s3", name: "Survey Follow Up", position: 2 },
+      ],
+    });
+    expect(p.stages.find((s) => s.id === "s1")!.needsDialing).toBe(true);
+    expect(p.stages.find((s) => s.id === "s2")!.needsDialing).toBe(true);
+    expect(p.stages.find((s) => s.id === "s3")!.needsDialing).toBe(false);
+  });
+
+  it("carries the live stage color through unchanged", () => {
+    const p = shapeSetterPipeline({
+      id: "p1",
+      name: "Customers Pipeline",
+      stages: [{ id: "s1", name: "Recurring Customer", position: 0, color: "#16A34A" }],
+    });
+    expect(p.stages[0].color).toBe("#16A34A");
+  });
+
+  it("handles a pipeline with no stages at all", () => {
+    const p = shapeSetterPipeline({ id: "p1", name: "Empty", stages: [] });
+    expect(p.stages).toEqual([]);
+  });
+
+  it("handles a pipeline where stages is undefined", () => {
+    const p = shapeSetterPipeline({ id: "p1", name: "Empty" } as { id: string; name: string });
+    expect(p.stages).toEqual([]);
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/pipelines.ts b/command-center/app/functions/api/admin/setter/pipelines.ts
new file mode 100644
index 0000000..9313431
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/pipelines.ts
@@ -0,0 +1,77 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { ghlJson } from "../../../lib/ghl";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+
+// GET /api/admin/setter/pipelines?tenantId= (admin-only, gated in
+// _middleware.ts). Every pipeline and stage for the client, resolved live
+// from the CRM, sorted, unfiltered. Feeds the Setter Suite board's pipeline
+// switcher.
+//
+// Unlike the client-facing PipelinesContext (functions/api/pipelines.ts),
+// which hides retired/system stages and pipelines from the client view, an
+// admin working the account cross-pipeline needs to see everything: Trash,
+// Cancelled Appointments, Google Reviews, Reactivation included. So nothing
+// here is filtered.
+
+interface GhlStage {
+  id: string;
+  name: string;
+  position: number;
+  color?: string;
+}
+interface GhlPipeline {
+  id: string;
+  name: string;
+  stages?: GhlStage[];
+}
+interface PipelinesResponse {
+  pipelines: GhlPipeline[];
+}
+
+export interface ApiSetterStage {
+  id: string;
+  name: string;
+  color?: string;
+  // True when the LIVE stage name matches /needs dialing/i. No mapping
+  // table: if the pipeline is renamed in the CRM this flag follows
+  // automatically, rather than silently going stale.
+  needsDialing: boolean;
+}
+
+export interface ApiSetterPipeline {
+  id: string;
+  name: string;
+  stages: ApiSetterStage[];
+}
+
+// Pure: sort a pipeline's stages by their live `position` and flag which ones
+// need a dial. No I/O, so this is the unit-testable core of the route.
+export function shapeSetterPipeline(p: GhlPipeline): ApiSetterPipeline {
+  const stages = [...(p.stages ?? [])]
+    .sort((a, b) => a.position - b.position)
+    .map((s) => ({
+      id: s.id,
+      name: s.name,
+      color: s.color,
+      needsDialing: /needs dialing/i.test(s.name),
+    }));
+  return { id: p.id, name: p.name, stages };
+}
+
+export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
+  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+    const data = await ghlJson<PipelinesResponse>(
+      gctx,
+      `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
+    );
+    const pipelines = (data.pipelines ?? []).map(shapeSetterPipeline);
+    return Response.json({ pipelines });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/lib/ghl.test.ts b/command-center/app/functions/lib/ghl.test.ts
new file mode 100644
index 0000000..9f53ccf
--- /dev/null
+++ b/command-center/app/functions/lib/ghl.test.ts
@@ -0,0 +1,98 @@
+import { describe, it, expect, vi, afterEach } from "vitest";
+import { fetchAllOpportunities, type GhlContext } from "./ghl";
+
+// fetchAllOpportunities pages until either a short (natural last) page, or the
+// maxPages cap. Return value alone cannot distinguish "the tenant has exactly
+// maxPages*100 records and there truly is no more" from "there IS more but we
+// stopped fetching it": both leave `all.length === maxPages * 100`. The
+// optional `truncated` output parameter is the only honest way to tell the
+// two apart, so it is asserted directly here rather than inferred from length.
+
+afterEach(() => {
+  vi.unstubAllGlobals();
+});
+
+function jsonRes(data: unknown) {
+  return { ok: true, json: async () => data };
+}
+
+const ctx: GhlContext = { token: "tok", locationId: "loc-1" };
+
+function opp(id: string) {
+  return { id, contactId: `c-${id}`, pipelineStageId: "s1" };
+}
+
+describe("fetchAllOpportunities truncation reporting", () => {
+  it("does not report truncated when the last page is short", async () => {
+    vi.stubGlobal(
+      "fetch",
+      vi.fn().mockResolvedValue(
+        jsonRes({
+          opportunities: [opp("1"), opp("2")],
+          meta: { total: 2 },
+        }),
+      ),
+    );
+
+    const truncated = { value: false };
+    const all = await fetchAllOpportunities(ctx, { maxPages: 10, truncated });
+
+    expect(all).toHaveLength(2);
+    expect(truncated.value).toBe(false);
+  });
+
+  it("does not report truncated when a full final page is genuinely the last (no next cursor)", async () => {
+    const fullPage = Array.from({ length: 100 }, (_, i) => opp(String(i)));
+    vi.stubGlobal(
+      "fetch",
+      vi.fn().mockResolvedValue(
+        jsonRes({
+          opportunities: fullPage,
+          // No nextPageUrl/startAfterId: this really is the last page even
+          // though it is full.
+          meta: { total: 100 },
+        }),
+      ),
+    );
+
+    const truncated = { value: false };
+    const all = await fetchAllOpportunities(ctx, { maxPages: 10, truncated });
+
+    expect(all).toHaveLength(100);
+    expect(truncated.value).toBe(false);
+  });
+
+  it("reports truncated when pagination stops because maxPages was hit, not because data ran out", async () => {
+    let call = 0;
+    vi.stubGlobal(
+      "fetch",
+      vi.fn().mockImplementation(async () => {
+        call += 1;
+        const page = Array.from({ length: 100 }, (_, i) => opp(`${call}-${i}`));
+        // Always claims there is a next page: the tenant genuinely has more
+        // than maxPages * 100 records.
+        return jsonRes({
+          opportunities: page,
+          meta: { startAfterId: `cursor-${call}`, startAfter: String(call) },
+        });
+      }),
+    );
+
+    const truncated = { value: false };
+    const all = await fetchAllOpportunities(ctx, { maxPages: 3, truncated });
+
+    expect(all).toHaveLength(300);
+    expect(truncated.value).toBe(true);
+  });
+
+  it("leaves an unsupplied truncated output alone (backward compatible for existing callers)", async () => {
+    vi.stubGlobal(
+      "fetch",
+      vi.fn().mockResolvedValue(jsonRes({ opportunities: [opp("1")], meta: {} })),
+    );
+
+    // No truncated param passed: must not throw, matching every one of the
+    // 21 existing call sites that predate this option.
+    await expect(fetchAllOpportunities(ctx, { maxPages: 10 })).resolves.toHaveLength(1);
+  });
+});
diff --git a/command-center/app/functions/lib/ghl.ts b/command-center/app/functions/lib/ghl.ts
index f75ee65..43c31db 100644
--- a/command-center/app/functions/lib/ghl.ts
+++ b/command-center/app/functions/lib/ghl.ts
@@ -80,20 +80,24 @@ export interface GhlOpportunity {
   updatedAt?: string;
   lastStatusChangeAt?: string;
   contactId?: string;
   contact?: {
     id?: string;
     name?: string;
     firstName?: string;
     lastName?: string;
     email?: string;
     phone?: string;
+    // Present on some locations' opportunity search responses, absent on
+    // others; the Setter Suite board reads it for the lead card when GHL
+    // supplies it, and falls back to an empty string when it does not.
+    city?: string;
   };
   source?: string;
   // GHL user id this opportunity is assigned to (drives rep-only filtering).
   assignedTo?: string;
 }
 
 export interface ApiLead {
   id: string;
   name: string;
   phone: string;
@@ -122,21 +126,31 @@ interface OpportunitySearchResponse {
   };
 }
 
 // Paginated fetch of every opportunity for a location (optionally one
 // pipeline), capped at maxPages * 100. GHL's opportunities-search may return
 // either a full nextPageUrl (like contacts) or startAfterId / startAfter
 // cursor fields; both styles are handled. Used by the leads list and summary
 // so counts cover all opportunities, not page 1.
 export async function fetchAllOpportunities(
   ctx: GhlContext,
-  opts: { pipelineId?: string | null; maxPages?: number } = {},
+  opts: {
+    pipelineId?: string | null;
+    maxPages?: number;
+    // Output parameter: when supplied, its `.value` is set to true if
+    // pagination stopped because the maxPages cap was hit rather than
+    // because a real last page was reached. Optional and additive so every
+    // existing caller (21 across the app) is unaffected; only a caller that
+    // needs to tell an honest "there may be more" apart from "this is
+    // everything" passes it. See the Setter Suite leads endpoint.
+    truncated?: { value: boolean };
+  } = {},
 ): Promise<GhlOpportunity[]> {
   const maxPages = opts.maxPages ?? 10;
   const base = `/opportunities/search?location_id=${encodeURIComponent(ctx.locationId)}&limit=100${
     opts.pipelineId ? `&pipeline_id=${encodeURIComponent(opts.pipelineId)}` : ""
   }`;
 
   const all: GhlOpportunity[] = [];
   const seen = new Set<string>();
   let nextPageUrl: string | undefined;
   let startAfterId: string | undefined;
@@ -179,20 +193,21 @@ export async function fetchAllOpportunities(
       startAfter = nextTs;
     }
 
     pageCount += 1;
   }
 
   if (pageCount >= maxPages) {
     console.warn(
       `opportunity pagination hit maxPages cap for location ${ctx.locationId}`,
     );
+    if (opts.truncated) opts.truncated.value = true;
   }
 
   return all;
 }
 
 export interface GhlConversation {
   id: string;
   contactId?: string;
   fullName?: string;
   contactName?: string;
```

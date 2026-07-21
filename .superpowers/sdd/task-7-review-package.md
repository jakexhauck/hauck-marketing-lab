# Review package: Task 7 (1774821..1b1b49b)

## Commits
1b1b49b feat(setter): pipeline board across all 8 pipelines

## Stat
 command-center/app/src/App.tsx                     |  11 ++
 .../src/components/admin/setter/SetterBoard.tsx    | 112 +++++++++++++++++
 .../app/src/components/admin/setter/SetterCard.tsx |  67 +++++++++++
 command-center/app/src/hooks/useApi.ts             |  32 +++++
 command-center/app/src/lib/api.ts                  |  45 +++++++
 command-center/app/src/lib/setterModel.test.ts     | 112 +++++++++++++++++
 command-center/app/src/lib/setterModel.ts          |  56 +++++++++
 .../app/src/routes/admin/AdminLayout.tsx           |   5 +-
 .../app/src/routes/admin/SetterSuite.tsx           | 134 +++++++++++++++++++++
 9 files changed, 573 insertions(+), 1 deletion(-)

## Diff
```diff
diff --git a/command-center/app/src/App.tsx b/command-center/app/src/App.tsx
index 2a357ed..0b84ced 100644
--- a/command-center/app/src/App.tsx
+++ b/command-center/app/src/App.tsx
@@ -53,20 +53,21 @@ import OutreachEmails from "./routes/outreach/OutreachEmails";
 import OutreachData from "./routes/outreach/OutreachData";
 import OutreachSms from "./routes/outreach/OutreachSms";
 import ReactivationPipeline from "./routes/reactivation/ReactivationPipeline";
 import ReactivationData from "./routes/reactivation/ReactivationData";
 import GroupOutreachOverview from "./routes/groups/GroupOutreachOverview";
 import AdminLayout from "./routes/admin/AdminLayout";
 import AdminClientDetail from "./routes/admin/AdminClientDetail";
 import AdminCommand from "./routes/admin/AdminCommand";
 import AdminDelivery from "./routes/admin/AdminDelivery";
 import DeliveryCockpit from "./routes/admin/DeliveryCockpit";
+import SetterSuite from "./routes/admin/SetterSuite";
 import PillarPage from "./routes/admin/PillarPage";
 import AdminSettings from "./routes/admin/AdminSettings";
 import Shell from "./components/Shell";
 import IdentityPicker from "./components/IdentityPicker";
 import OfflineBanner from "./components/OfflineBanner";
 import PreviewBanner from "./components/PreviewBanner";
 import { isPreviewFrame } from "./lib/previewFrame";
 import DemoBanner from "./components/DemoBanner";
 import IncomingCallBanner from "./components/call/IncomingCallBanner";
 import ScrollToTop from "./components/ScrollToTop";
@@ -551,20 +552,30 @@ export default function App() {
                 }
               />
               <Route
                 path="/admin/delivery/:tenantId"
                 element={
                   <AdminRoute>
                     <DeliveryCockpit />
                   </AdminRoute>
                 }
               />
+              {/* Sales: the Setter Suite, one client's leads worked across
+                  every one of that client's pipelines. */}
+              <Route
+                path="/admin/setter"
+                element={
+                  <AdminRoute>
+                    <SetterSuite />
+                  </AdminRoute>
+                }
+              />
               <Route
                 path="/admin/settings"
                 element={
                   <AdminRoute>
                     <AdminSettings />
                   </AdminRoute>
                 }
               />
               {/* Legacy 6-pillar ids fold into the new 4-pillar spine. Static
                   segments out-rank the :pillarId route, so these win. */}
diff --git a/command-center/app/src/components/admin/setter/SetterBoard.tsx b/command-center/app/src/components/admin/setter/SetterBoard.tsx
new file mode 100644
index 0000000..239c7e0
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/SetterBoard.tsx
@@ -0,0 +1,112 @@
+import { useMemo } from "react";
+import { AlertTriangle } from "lucide-react";
+import SetterCard from "./SetterCard";
+import type { ApiSetterLead, ApiSetterPipeline } from "../../../lib/api";
+
+interface Props {
+  pipeline: ApiSetterPipeline;
+  leads: ApiSetterLead[];
+  truncated: boolean;
+  now: number;
+  selectedLeadId: string | null;
+  onSelectLead: (lead: ApiSetterLead) => void;
+}
+
+// One pipeline's stage columns, real GHL stage names verbatim, structured
+// exactly like the client-facing kanban (src/components/Board.tsx): a dot +
+// name + count header, a needs-dialing chip under flagged stages, and a
+// rounded well of cards. Unlike that board this one never hides a stage or a
+// pipeline, and it groups by stage NAME (ApiSetterLead has no stage id, only
+// stageName, since the leads endpoint resolves it live per lead).
+export default function SetterBoard({
+  pipeline,
+  leads,
+  truncated,
+  now,
+  selectedLeadId,
+  onSelectLead,
+}: Props) {
+  const byStage = useMemo(() => {
+    const m = new Map<string, ApiSetterLead[]>();
+    for (const s of pipeline.stages) m.set(s.name, []);
+    for (const l of leads) {
+      const list = m.get(l.stageName);
+      // A lead whose stage name has no matching column (stale cache, a stage
+      // renamed between the pipeline and lead fetch) is dropped from the
+      // board rather than crashing it; the count in its real stage stays
+      // accurate for everything else.
+      if (list) list.push(l);
+    }
+    return m;
+  }, [leads, pipeline.stages]);
+
+  return (
+    <div className="pt-2">
+      {truncated && (
+        <div className="mx-1 mb-3 flex items-center gap-2 rounded-xl border border-warning/35 bg-warning-tint px-3 py-2 text-[12.5px] font-semibold text-warning">
+          <AlertTriangle size={14} aria-hidden />
+          Showing the first 1,000 leads in this pipeline. There are more that are not shown here.
+        </div>
+      )}
+
+      <div className="no-scrollbar flex items-start gap-3 overflow-x-auto pb-2">
+        {pipeline.stages.map((stage) => {
+          const items = byStage.get(stage.name) ?? [];
+          return (
+            <section key={stage.id} className="flex w-[280px] shrink-0 flex-col gap-2">
+              <header className="flex items-baseline justify-between gap-2 px-1">
+                <span className="flex min-w-0 items-center gap-1.5">
+                  {stage.color && (
+                    <span
+                      className="h-2 w-2 shrink-0 rounded-full"
+                      style={{ background: stage.color }}
+                      aria-hidden
+                    />
+                  )}
+                  <span
+                    className="truncate font-display text-[14px] font-bold text-text"
+                    title={stage.name}
+                  >
+                    {stage.name}
+                  </span>
+                </span>
+                <span className="font-data shrink-0 text-[12px] font-semibold text-muted">
+                  {items.length}
+                </span>
+              </header>
+
+              {stage.needsDialing && (
+                <div className="px-1">
+                  <span className="inline-flex items-center rounded-full bg-warning-tint px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">
+                    Needs dialing
+                  </span>
+                </div>
+              )}
+
+              <div className="flex min-h-[96px] flex-col gap-2 rounded-2xl bg-surface-2 p-2">
+                {items.length === 0 ? (
+                  <p className="px-2 py-6 text-center text-[12px] text-faint">
+                    {stage.needsDialing
+                      ? "No leads waiting on a dial."
+                      : "No leads in this stage yet."}
+                  </p>
+                ) : (
+                  items.map((lead) => (
+                    <SetterCard
+                      key={lead.id}
+                      lead={lead}
+                      stageNeedsDialing={stage.needsDialing}
+                      now={now}
+                      selected={lead.id === selectedLeadId}
+                      onSelect={onSelectLead}
+                    />
+                  ))
+                )}
+              </div>
+            </section>
+          );
+        })}
+      </div>
+    </div>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/SetterCard.tsx b/command-center/app/src/components/admin/setter/SetterCard.tsx
new file mode 100644
index 0000000..7a69585
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/SetterCard.tsx
@@ -0,0 +1,67 @@
+import { cardRail, formatOutcome } from "../../../lib/setterModel";
+import { timeAgo } from "../../../lib/timeAgo";
+import type { ApiSetterLead } from "../../../lib/api";
+
+interface Props {
+  lead: ApiSetterLead;
+  stageNeedsDialing: boolean;
+  now: number;
+  selected: boolean;
+  onSelect: (lead: ApiSetterLead) => void;
+}
+
+// One board card. Deliberately does not open anything: the lead detail
+// cockpit is a separate, later task. This just tracks selection and calls
+// back, the seam that task hooks into.
+export default function SetterCard({ lead, stageNeedsDialing, now, selected, onSelect }: Props) {
+  const rail = cardRail(lead, stageNeedsDialing, now);
+
+  // Composed by hand rather than via Tailwind box-shadow utility classes,
+  // because the rail and the selection ring can both be present at once and
+  // only the last box-shadow class wins when two are applied via className.
+  const shadows: string[] = [];
+  if (rail === "danger") shadows.push("inset 3px 0 0 var(--danger)");
+  else if (rail === "warning") shadows.push("inset 3px 0 0 var(--warning)");
+  if (selected) shadows.push("0 0 0 2px var(--brand)");
+  const style = shadows.length ? { boxShadow: shadows.join(", ") } : undefined;
+
+  return (
+    <button
+      type="button"
+      onClick={() => onSelect(lead)}
+      style={style}
+      className={
+        "relative w-full overflow-hidden rounded-xl border bg-surface p-3 text-left transition-colors " +
+        (selected ? "border-brand" : "border-border")
+      }
+    >
+      <div className="truncate font-display text-[13.5px] font-semibold text-text">{lead.name}</div>
+      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-faint">
+        <span className="font-data truncate">{lead.city || "City unknown"}</span>
+        <span className="opacity-50">·</span>
+        <span className="font-data shrink-0">{timeAgo(lead.createdAt, now)}</span>
+      </div>
+      <div className="mt-2 flex flex-wrap items-center gap-1.5">
+        {lead.attempts > 0 ? (
+          <span className="font-data rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
+            {lead.attempts} {lead.attempts === 1 ? "dial" : "dials"}
+          </span>
+        ) : (
+          <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-danger">
+            Never dialed
+          </span>
+        )}
+        {lead.contacted && (
+          <span className="rounded-full bg-positive-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-positive">
+            Spoke
+          </span>
+        )}
+        {lead.lastOutcome && (
+          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-muted">
+            {formatOutcome(lead.lastOutcome)}
+          </span>
+        )}
+      </div>
+    </button>
+  );
+}
diff --git a/command-center/app/src/hooks/useApi.ts b/command-center/app/src/hooks/useApi.ts
index 1b67fec..9db518c 100644
--- a/command-center/app/src/hooks/useApi.ts
+++ b/command-center/app/src/hooks/useApi.ts
@@ -38,20 +38,22 @@ import {
   type AdminClientBillingResponse,
   type AdTrackerLevel,
   type AdTrackerRange,
   type AdTrackerResponse,
   type ApiReviewsResponse,
   type PillarConstraint,
   getSalesData,
   saveSalesDataDay,
   type SalesDataRow,
   type SalesDataPatch,
+  type ApiSetterPipeline,
+  type ApiSetterLeadsResponse,
 } from "../lib/api";
 import type { BusinessHealthInputs, PeriodType } from "../lib/businessHealth";
 import {
   type CustomersResponse,
   type CustomerDetailResponse,
   type CustomerJobInput,
   type ServicePlanInput,
 } from "../lib/customers";
 import {
   type CloseOutPrefill,
@@ -396,20 +398,50 @@ interface SendConversationSmsInput {
 export function useAdminClientsQuery(enabled: boolean) {
   return useQuery({
     queryKey: ["admin", "clients"],
     enabled,
     staleTime: 60_000,
     queryFn: () =>
       api<{ clients: AdminClient[]; total: number }>("/api/admin/clients"),
   });
 }
 
+// Setter Suite: every pipeline and stage for the selected client, resolved
+// live and unfiltered (unlike the client-facing PipelinesContext, nothing is
+// hidden here). Feeds the pipeline tab strip on /admin/setter.
+export function useSetterPipelinesQuery(tenantId: string, enabled = true) {
+  return useQuery({
+    queryKey: ["admin", "setter", "pipelines", tenantId],
+    enabled: enabled && !!tenantId,
+    staleTime: 30_000,
+    queryFn: () =>
+      api<{ pipelines: ApiSetterPipeline[] }>(
+        `/api/admin/setter/pipelines?tenantId=${encodeURIComponent(tenantId)}`,
+      ),
+  });
+}
+
+// Setter Suite: every open lead in one pipeline, merged with its dial
+// history. Re-fetched per pipeline tab rather than once for all 8, so
+// switching tabs never fires 8 requests up front.
+export function useSetterLeadsQuery(tenantId: string, pipelineId: string, enabled = true) {
+  return useQuery({
+    queryKey: ["admin", "setter", "leads", tenantId, pipelineId],
+    enabled: enabled && !!tenantId && !!pipelineId,
+    staleTime: 15_000,
+    queryFn: () =>
+      api<ApiSetterLeadsResponse>(
+        `/api/admin/setter/leads?tenantId=${encodeURIComponent(tenantId)}&pipelineId=${encodeURIComponent(pipelineId)}`,
+      ),
+  });
+}
+
 // One client's full admin detail (business info, entitlements, staff,
 // GHL-identified members, recent activity) for the Service Delivery cockpit.
 // Keyed by tenantId so the header and the Overview tab (Task 3.3) mounting
 // side by side share one cached request instead of fetching twice.
 export function useAdminClientDetailQuery(tenantId: string, enabled = true) {
   return useQuery({
     queryKey: ["admin", "clients", tenantId],
     enabled: enabled && !!tenantId,
     staleTime: 30_000,
     queryFn: () => api<AdminClientDetailResponse>(`/api/admin/clients/${tenantId}`),
diff --git a/command-center/app/src/lib/api.ts b/command-center/app/src/lib/api.ts
index c377fa1..f6e4972 100644
--- a/command-center/app/src/lib/api.ts
+++ b/command-center/app/src/lib/api.ts
@@ -857,10 +857,55 @@ export interface ColdSmsMonthlyRow {
 
 export interface ColdSmsScriptRow {
   id: string;
   name: string;
   totalSent: number | null;
   positiveReplies: number | null;
   callsBooked: number | null;
   clientsClosed: number | null;
   sortOrder: number;
 }
+
+// Setter Suite (Sales / admin-only). Mirrors the shapes returned by
+// functions/api/admin/setter/pipelines.ts and functions/api/admin/setter/leads.ts
+// exactly; see those files for the shaping logic.
+export interface ApiSetterStage {
+  id: string;
+  name: string;
+  // Live GHL hex, e.g. "#F97316". Rendered as an 8px dot only, per Board.tsx's
+  // convention: never a background, border, or text color.
+  color?: string;
+  // True when the live stage name matches /needs dialing/i. No mapping table.
+  needsDialing: boolean;
+}
+
+export interface ApiSetterPipeline {
+  id: string;
+  name: string;
+  stages: ApiSetterStage[];
+}
+
+// Deliberately has no `tags` field: the list endpoint cannot supply it
+// without an N+1 contact fetch per card across the whole board (see
+// functions/api/admin/setter/leads.ts). Tags belong to the per-lead detail
+// endpoint (a later task), which fetches one contact at a time.
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
+export interface ApiSetterLeadsResponse {
+  leads: ApiSetterLead[];
+  // The leads endpoint caps at 1000 opportunities per pipeline
+  // (functions/lib/ghl.ts fetchAllOpportunities, maxPages: 10 at 100/page).
+  // The board must show this honestly rather than silently drop leads.
+  truncated: boolean;
+}
diff --git a/command-center/app/src/lib/setterModel.test.ts b/command-center/app/src/lib/setterModel.test.ts
new file mode 100644
index 0000000..7c3e75d
--- /dev/null
+++ b/command-center/app/src/lib/setterModel.test.ts
@@ -0,0 +1,112 @@
+import { describe, it, expect } from "vitest";
+import { needsDialing, isStaleUncontacted, cardRail, formatOutcome } from "./setterModel";
+
+describe("needsDialing", () => {
+  it("matches the live stage names case-insensitively", () => {
+    expect(needsDialing("Opted In (needs dialing)")).toBe(true);
+    expect(needsDialing("No Answer Day 4 (Needs Dialing)")).toBe(true);
+  });
+  it("does not match stages without the marker", () => {
+    expect(needsDialing("Long Term Nurture")).toBe(false);
+    expect(needsDialing("Estimate Booked")).toBe(false);
+  });
+});
+
+const DAY = 24 * 60 * 60 * 1000;
+const NOW = new Date("2026-07-20T12:00:00Z").getTime();
+
+describe("isStaleUncontacted", () => {
+  it("is false when the stage does not need dialing", () => {
+    expect(
+      isStaleUncontacted(
+        { attempts: 2, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        false,
+        NOW,
+      ),
+    ).toBe(false);
+  });
+
+  it("is false once the lead has been contacted, no matter how old", () => {
+    expect(
+      isStaleUncontacted(
+        { attempts: 2, contacted: true, createdAt: new Date(NOW - 5 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe(false);
+  });
+
+  it("is false under 24 hours old", () => {
+    expect(
+      isStaleUncontacted(
+        { attempts: 1, contacted: false, createdAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe(false);
+  });
+
+  it("is true past 24 hours, uncontacted, in a needs-dialing stage", () => {
+    expect(
+      isStaleUncontacted(
+        { attempts: 3, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe(true);
+  });
+});
+
+describe("cardRail", () => {
+  it("is danger for a lead with zero attempts, regardless of stage or age", () => {
+    expect(
+      cardRail({ attempts: 0, contacted: false, createdAt: new Date(NOW).toISOString() }, false, NOW),
+    ).toBe("danger");
+  });
+
+  it("danger outranks warning when both conditions hold", () => {
+    expect(
+      cardRail(
+        { attempts: 0, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe("danger");
+  });
+
+  it("is warning for a dialed-but-stale lead in a needs-dialing stage", () => {
+    expect(
+      cardRail(
+        { attempts: 2, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBe("warning");
+  });
+
+  it("is null for a dialed, contacted, or fresh lead", () => {
+    expect(
+      cardRail(
+        { attempts: 2, contacted: true, createdAt: new Date(NOW - 2 * DAY).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBeNull();
+    expect(
+      cardRail(
+        { attempts: 1, contacted: false, createdAt: new Date(NOW).toISOString() },
+        true,
+        NOW,
+      ),
+    ).toBeNull();
+  });
+});
+
+describe("formatOutcome", () => {
+  it("title-cases the underscore-separated enum", () => {
+    expect(formatOutcome("no_answer")).toBe("No Answer");
+    expect(formatOutcome("not_interested")).toBe("Not Interested");
+    expect(formatOutcome("booked")).toBe("Booked");
+    expect(formatOutcome("bad_lead")).toBe("Bad Lead");
+  });
+});
diff --git a/command-center/app/src/lib/setterModel.ts b/command-center/app/src/lib/setterModel.ts
new file mode 100644
index 0000000..dafdbe4
--- /dev/null
+++ b/command-center/app/src/lib/setterModel.ts
@@ -0,0 +1,56 @@
+// Pure model helpers for the Setter Suite board (src/routes/admin/SetterSuite.tsx
+// + src/components/admin/setter/*). No I/O, no React: everything here is a
+// plain function of the API response so it stays unit-testable without a
+// server or a browser.
+
+// A stage's live GHL name flags a setter needs to work it, matched purely by
+// text against the live stage name. No mapping table to keep in sync: if the
+// pipeline is renamed in the CRM the flag follows on the very next load.
+// Mirrors functions/api/admin/setter/pipelines.ts:shapeSetterPipeline exactly.
+export const needsDialing = (stageName: string): boolean => /needs dialing/i.test(stageName);
+
+const DAY_MS = 24 * 60 * 60 * 1000;
+
+export interface SetterRailLead {
+  attempts: number;
+  contacted: boolean;
+  createdAt: string;
+}
+
+// True once a lead has sat in a needs-dialing stage for over 24 hours without
+// ever being spoken to. Independent of attempts: a lead dialed four times and
+// still never answered is "stale" here too, the never-dialed case below is
+// the separate, more urgent one.
+export function isStaleUncontacted(
+  lead: SetterRailLead,
+  stageNeedsDialing: boolean,
+  now: number,
+): boolean {
+  if (!stageNeedsDialing || lead.contacted) return false;
+  const createdAt = new Date(lead.createdAt).getTime();
+  if (Number.isNaN(createdAt)) return false;
+  return now - createdAt > DAY_MS;
+}
+
+export type CardRail = "danger" | "warning" | null;
+
+// The card's inset rail tone. Never-dialed (danger) always wins over stale
+// (warning) when both hold, since it is the more urgent state for a setter
+// to notice first.
+export function cardRail(lead: SetterRailLead, stageNeedsDialing: boolean, now: number): CardRail {
+  if (lead.attempts === 0) return "danger";
+  if (isStaleUncontacted(lead, stageNeedsDialing, now)) return "warning";
+  return null;
+}
+
+// Dial outcomes come back from the API as the setter_dials enum (booked,
+// not_interested, no_answer, reschedule, bad_lead). This is display
+// formatting of an internal enum, not a stage name, so title-casing it is
+// fine (unlike stage names, which must render verbatim).
+export function formatOutcome(outcome: string): string {
+  return outcome
+    .split("_")
+    .filter(Boolean)
+    .map((w) => w[0].toUpperCase() + w.slice(1))
+    .join(" ");
+}
diff --git a/command-center/app/src/routes/admin/AdminLayout.tsx b/command-center/app/src/routes/admin/AdminLayout.tsx
index efcfc52..3183494 100644
--- a/command-center/app/src/routes/admin/AdminLayout.tsx
+++ b/command-center/app/src/routes/admin/AdminLayout.tsx
@@ -31,21 +31,24 @@ interface SpineItem {
   label: string;
   icon: LucideIcon;
   // Command matches only its exact path; every other item matches its subtree
   // (e.g. Service Delivery is active for any /admin/delivery/:tenantId).
   end?: boolean;
 }
 
 const SPINE_NAV: SpineItem[] = [
   { to: "/admin", label: "Command", icon: LayoutDashboard, end: true },
   { to: "/admin/pillar/acquisition", label: "Acquisition", icon: Megaphone },
-  { to: "/admin/pillar/sales", label: "Sales", icon: Handshake },
+  // Sales points at the Setter Suite (the cross-pipeline lead-working board),
+  // not the old Sales Data pillar tab. That tab still exists at
+  // /admin/pillar/sales for anyone who links to it directly.
+  { to: "/admin/setter", label: "Sales", icon: Handshake },
   { to: "/admin/delivery", label: "Fulfillment", icon: HeartHandshake },
   { to: "/admin/pillar/operations", label: "Operations", icon: Wrench },
 ];
 
 function SpineLink({ item }: { item: SpineItem }) {
   return (
     <NavLink
       to={item.to}
       end={item.end}
       className={({ isActive }) => `adm-spine-btn${isActive ? " on" : ""}`}
diff --git a/command-center/app/src/routes/admin/SetterSuite.tsx b/command-center/app/src/routes/admin/SetterSuite.tsx
new file mode 100644
index 0000000..92273b9
--- /dev/null
+++ b/command-center/app/src/routes/admin/SetterSuite.tsx
@@ -0,0 +1,134 @@
+import { useState } from "react";
+import {
+  useAdminClientsQuery,
+  useSetterPipelinesQuery,
+  useSetterLeadsQuery,
+} from "../../hooks/useApi";
+import { useNow } from "../../context/NowContext";
+import SetterBoard from "../../components/admin/setter/SetterBoard";
+import type { ApiSetterLead } from "../../lib/api";
+
+// /admin/setter: the Setter Suite. One client's leads worked across every one
+// of that client's pipelines, unfiltered (unlike the client-facing app, which
+// hides retired/system pipelines and stages). Pipeline tabs across the top,
+// the real stage columns underneath.
+//
+// Selecting a card only tracks which lead is active and fires onSelectLead;
+// the docked cockpit that reads that selection (dial logging, tags, booking)
+// is a separate later build. Nothing here renders a side panel yet, but the
+// selection state and the callback are the seam it plugs into.
+export default function SetterSuite() {
+  const clientsQuery = useAdminClientsQuery(true);
+  const clients = clientsQuery.data?.clients ?? [];
+
+  const [tenantId, setTenantId] = useState<string | null>(null);
+  const activeTenantId = tenantId ?? clients[0]?.id ?? null;
+  const activeClient = clients.find((c) => c.id === activeTenantId) ?? null;
+
+  const pipelinesQuery = useSetterPipelinesQuery(activeTenantId ?? "", !!activeTenantId);
+  const pipelines = pipelinesQuery.data?.pipelines ?? [];
+
+  const [pipelineId, setPipelineId] = useState<string | null>(null);
+  const activePipelineId = pipelineId ?? pipelines[0]?.id ?? null;
+  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;
+
+  const leadsQuery = useSetterLeadsQuery(
+    activeTenantId ?? "",
+    activePipelineId ?? "",
+    !!activeTenantId && !!activePipelineId,
+  );
+
+  const [selectedLead, setSelectedLead] = useState<ApiSetterLead | null>(null);
+  const now = useNow();
+
+  const selectClient = (id: string) => {
+    setTenantId(id);
+    setPipelineId(null);
+    setSelectedLead(null);
+  };
+
+  const selectPipeline = (id: string) => {
+    setPipelineId(id);
+    setSelectedLead(null);
+  };
+
+  const selectLead = (lead: ApiSetterLead) => {
+    setSelectedLead((prev) => (prev?.id === lead.id ? null : lead));
+  };
+
+  return (
+    <div className="pk-root">
+      <div className="flex flex-wrap items-start justify-between gap-4">
+        <div>
+          <div className="pk-kicker">Sales / Setter Suite</div>
+          <h1 className="pk-title">Setter Suite</h1>
+          <p className="pk-tagline">
+            Work one client&apos;s leads across every pipeline, live from the booking system.
+          </p>
+        </div>
+
+        {clients.length > 0 && (
+          <label className="flex items-center gap-2 text-[13px] text-muted">
+            Client
+            <select
+              className="pk-select"
+              value={activeTenantId ?? ""}
+              onChange={(e) => selectClient(e.target.value)}
+              aria-label="Client"
+            >
+              {clients.map((c) => (
+                <option key={c.id} value={c.id}>
+                  {c.name}
+                </option>
+              ))}
+            </select>
+          </label>
+        )}
+      </div>
+
+      {clientsQuery.isLoading ? (
+        <div className="pk-empty">Loading clients...</div>
+      ) : clientsQuery.isError ? (
+        <div className="pk-empty">Could not load clients.</div>
+      ) : clients.length === 0 ? (
+        <div className="pk-empty">No clients yet.</div>
+      ) : !activeTenantId || !activeClient ? null : (
+        <>
+          <nav className="pk-tabs" aria-label="Pipelines">
+            {pipelines.map((p) => (
+              <button
+                key={p.id}
+                type="button"
+                className={`pk-tab${p.id === activePipelineId ? " on" : ""}`}
+                onClick={() => selectPipeline(p.id)}
+              >
+                {p.name}
+              </button>
+            ))}
+          </nav>
+
+          {pipelinesQuery.isLoading ? (
+            <div className="pk-empty">Loading pipelines...</div>
+          ) : pipelinesQuery.isError ? (
+            <div className="pk-empty">Could not load pipelines for {activeClient.name}.</div>
+          ) : !activePipeline ? (
+            <div className="pk-empty">No pipelines found for {activeClient.name}.</div>
+          ) : leadsQuery.isLoading ? (
+            <div className="pk-empty">Loading leads...</div>
+          ) : leadsQuery.isError ? (
+            <div className="pk-empty">Could not load leads for {activePipeline.name}.</div>
+          ) : (
+            <SetterBoard
+              pipeline={activePipeline}
+              leads={leadsQuery.data?.leads ?? []}
+              truncated={leadsQuery.data?.truncated ?? false}
+              now={now}
+              selectedLeadId={selectedLead?.id ?? null}
+              onSelectLead={selectLead}
+            />
+          )}
+        </>
+      )}
+    </div>
+  );
+}
```

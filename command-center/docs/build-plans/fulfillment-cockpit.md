# Fulfillment Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the admin "Service Delivery" area to "Fulfillment" and turn the per-client cockpit into a client-first workbench where each service we sell (Paid Ads, Web Design, Google Reviews, Reactivation) is a tab with its own sub-tabs.

**Architecture:** The front door stays the client roster (`/admin/delivery`). Clicking a client opens the cockpit (`/admin/delivery/:tenantId`), which today has a single row of tabs. This plan replaces that flat tab model with a two-level model: a **service tab** row, and, when a service has sub-sections, a **sub-tab** row beneath it. Both levels live in URL state (`?tab=` and `?sub=`) so views are deep-linkable. Phase 1 builds the shell (rename + new tab model + honest placeholders) with zero backend work. Phases 2 to 5 fill one service each and get their own detailed plans, because each needs backend endpoints that accept an admin-supplied tenantId (the current cockpit only has Overview + Config wired for that).

**Tech Stack:** React + TypeScript, react-router-dom (`useSearchParams`), React Query, Tailwind + the `pk-` design-kit classes, Vitest for unit tests. Backend is Cloudflare Pages Functions (`functions/api/...`) reading GHL / Meta / GA4. Secrets via Doppler.

## Global Constraints

- **Never use em dashes** in any output: code, comments, UI copy, docs. Use commas, periods, parentheses, or colons.
- **Never name GoHighLevel / GHL / Meta internals in client-facing UI.** This cockpit is admin-only, so vendor names are allowed here (it is not client-facing).
- **Honest empty / error states only.** Never fabricate a number. Every not-yet-wired surface shows an explicit "coming in the next phase" or "not set up yet" state, matching the existing cockpit convention in `deliveryCockpit.ts`.
- **TDD:** pure config and resolver logic (`lib/deliveryCockpit.ts`) is covered by Vitest before the component consumes it.
- **Test command:** `npm run test` (from `command-center/app`), which runs `vitest run`. Typecheck: `npm run typecheck`.
- **Secrets:** any new secret goes into Doppler (`hauck-command-center` / `prd`), never committed.
- **Read-only by default.** Every service surface in this build is a viewer. The only write action in the whole plan is Paid Ads "Push to Meta" (Phase 2), and it drops to a later phase if the Meta upload proves hard.

---

## The Design (locked with Jake)

### Front door: client-first

- `/admin/delivery` (renamed **Fulfillment**) = the full client roster. Unchanged behavior, new name.
- Click a client -> the cockpit opens with **service tabs**.

### Service tabs inside a client

`Overview · Paid Ads · Web Design · Google Reviews · Reactivation · Config`

- **Overview** and **Config** already work and keep working. No sub-tabs.
- The four service tabs each carry sub-tabs.

### Sub-tabs per service

**Paid Ads**
- **Campaigns**: read-only mirror of Meta's structure (campaign -> ad set -> ad). A pseudo Ads Manager. No pushing changes.
- **Ad Library**: input creatives (image/video, headline, primary text, status draft/approved/live). A "Push to Meta" action uploads the creative into that client's Meta media library. Target build one if the upload is easy; otherwise it drops to a later phase.
- **Funnel**: view the active lead-capture surface for the ads: the lead form by default, or the funnel when the client is on one.
- **Data & Leads**: one stacked page: per-ad metrics, then totals, then the incoming leads.

**Web Design**
- **Site**: live preview + URL of their site.
- **Pages**: their funnels / landing pages.
- **Change Requests**: read-only view of what the client wants changed. Jake makes the edit himself in GHL.
- **Analytics**: GA4 traffic (its own sub-tab, per Jake).

**Google Reviews**
- **Funnel**: request -> click -> review pipeline.
- **All Reviews**: every review + the live star rating.
- **Requests**: read-only log of review requests sent and who converted.
- **Reputation Report**: the shareable summary.

**Reactivation**
- **Campaign**: the active reactivation blast: offer, message copy, audience size, send status.
- **Results**: replies, leads booked, revenue recovered.

---

## File Structure

**Phase 1 (this plan, in full detail):**

- Modify `command-center/app/src/lib/deliveryCockpit.ts`: replace the flat `CockpitTab` model with the two-level service-tab + sub-tab model and its resolvers.
- Create `command-center/app/src/lib/deliveryCockpit.test.ts`: Vitest coverage for the new model and resolvers.
- Modify `command-center/app/src/routes/admin/DeliveryCockpit.tsx`: render the service-tab row, the sub-tab row, and route Overview/Config/placeholder content.
- Modify `command-center/app/src/routes/admin/AdminDelivery.tsx`: rename landing kicker/title/tagline to Fulfillment.
- Modify `command-center/app/src/components/admin/DeliveryRoster.tsx`: rename the rail title to Fulfillment.
- Modify `command-center/app/src/routes/admin/AdminLayout.tsx:42`: rename the sidebar nav label to Fulfillment.
- Modify `command-center/app/src/routes/admin/AdminPillarPage.tsx`: rename the two "Open Service Delivery" link labels and the capacity note.

**Phases 2 to 5 (scoped here, detailed in their own plans at build time):**

- Create `command-center/app/src/components/admin/cockpit/paidads/*` (Phase 2)
- Create `command-center/app/src/components/admin/cockpit/webdesign/*` (Phase 3)
- Create `command-center/app/src/components/admin/cockpit/reviews/*` (Phase 4)
- Create `command-center/app/src/components/admin/cockpit/reactivation/*` (Phase 5)
- Backend: new or extended `functions/api/admin/clients/[tenantId]/...` endpoints so admin can read a specific tenant's ads, funnels, reviews, and reactivation data.

We deliberately do NOT keep `AdminAds.tsx` (`/admin/ads`, mock data) as the Paid Ads surface. The new Paid Ads lives inside the cockpit. `/admin/ads` is retired or repointed in Phase 2.

---

## Phase 1: The Fulfillment shell

Deliverable: the area is renamed Fulfillment everywhere, and opening a client shows the six service tabs, each service showing its sub-tab row with honest placeholders. Overview and Config still work. No backend changes.

### Task 1: New two-level tab model in `deliveryCockpit.ts`

**Files:**
- Modify: `command-center/app/src/lib/deliveryCockpit.ts`
- Test: `command-center/app/src/lib/deliveryCockpit.test.ts` (create)

**Interfaces:**
- Produces:
  - `type ServiceTab = "overview" | "paid-ads" | "web-design" | "google-reviews" | "reactivation" | "config"`
  - `interface SubTabDef { id: string; label: string; ready: boolean }`
  - `interface ServiceTabDef { id: ServiceTab; label: string; ready: boolean; subTabs?: SubTabDef[] }`
  - `const SERVICE_TABS: ServiceTabDef[]`
  - `const DEFAULT_SERVICE_TAB: ServiceTab` (= `"overview"`)
  - `function resolveServiceTab(param: string | null | undefined): ServiceTab`
  - `function resolveSubTab(tab: ServiceTab, param: string | null | undefined): string | null`: returns the first sub-tab id when the given one is invalid and the service has sub-tabs; `null` when the service has none.
  - `function subTabsFor(tab: ServiceTab): SubTabDef[]`
  - `function placeholderCopy(label: string): string`

- [ ] **Step 1: Write the failing test**

Create `command-center/app/src/lib/deliveryCockpit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SERVICE_TABS,
  DEFAULT_SERVICE_TAB,
  resolveServiceTab,
  resolveSubTab,
  subTabsFor,
} from "./deliveryCockpit";

describe("fulfillment cockpit tab model", () => {
  it("has the six service tabs in order", () => {
    expect(SERVICE_TABS.map((t) => t.id)).toEqual([
      "overview",
      "paid-ads",
      "web-design",
      "google-reviews",
      "reactivation",
      "config",
    ]);
  });

  it("overview and config are ready and carry no sub-tabs", () => {
    for (const id of ["overview", "config"] as const) {
      const t = SERVICE_TABS.find((x) => x.id === id)!;
      expect(t.ready).toBe(true);
      expect(t.subTabs).toBeUndefined();
    }
  });

  it("each service tab carries its sub-tabs", () => {
    expect(subTabsFor("paid-ads").map((s) => s.id)).toEqual([
      "campaigns",
      "ad-library",
      "funnel",
      "data-leads",
    ]);
    expect(subTabsFor("web-design").map((s) => s.id)).toEqual([
      "site",
      "pages",
      "change-requests",
      "analytics",
    ]);
    expect(subTabsFor("google-reviews").map((s) => s.id)).toEqual([
      "funnel",
      "all-reviews",
      "requests",
      "reputation-report",
    ]);
    expect(subTabsFor("reactivation").map((s) => s.id)).toEqual([
      "campaign",
      "results",
    ]);
    expect(subTabsFor("overview")).toEqual([]);
  });

  it("resolveServiceTab falls back to the default on junk", () => {
    expect(resolveServiceTab("paid-ads")).toBe("paid-ads");
    expect(resolveServiceTab("nope")).toBe(DEFAULT_SERVICE_TAB);
    expect(resolveServiceTab(null)).toBe(DEFAULT_SERVICE_TAB);
    expect(DEFAULT_SERVICE_TAB).toBe("overview");
  });

  it("resolveSubTab returns the first sub-tab on junk, null when none", () => {
    expect(resolveSubTab("paid-ads", "funnel")).toBe("funnel");
    expect(resolveSubTab("paid-ads", "nope")).toBe("campaigns");
    expect(resolveSubTab("paid-ads", null)).toBe("campaigns");
    expect(resolveSubTab("overview", "anything")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- deliveryCockpit`
Expected: FAIL (module exports `CockpitTab` / `COCKPIT_TABS`, not the new names).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `command-center/app/src/lib/deliveryCockpit.ts` with:

```ts
// Pure config + helpers for the per-client Fulfillment cockpit
// (/admin/delivery/:tenantId). Kept out of the component so the two-level tab
// model (service tab + sub-tab) and the query-param resolution stay testable
// without React or the router.
//
// Overview and Config are real, working tabs. Every service tab (Paid Ads,
// Web Design, Google Reviews, Reactivation) ships as an honest placeholder
// shell in Phase 1 and is filled in its own later phase, once its endpoint
// accepts an admin-supplied tenantId.

export type ServiceTab =
  | "overview"
  | "paid-ads"
  | "web-design"
  | "google-reviews"
  | "reactivation"
  | "config";

export interface SubTabDef {
  id: string;
  label: string;
  // false = an honest "coming in the next phase" placeholder.
  ready: boolean;
}

export interface ServiceTabDef {
  id: ServiceTab;
  label: string;
  ready: boolean;
  // Omitted for tabs that have no second level (Overview, Config).
  subTabs?: SubTabDef[];
}

// Phase 1 ships every sub-tab as ready:false. Later phases flip them on.
export const SERVICE_TABS: ServiceTabDef[] = [
  { id: "overview", label: "Overview", ready: true },
  {
    id: "paid-ads",
    label: "Paid Ads",
    ready: false,
    subTabs: [
      { id: "campaigns", label: "Campaigns", ready: false },
      { id: "ad-library", label: "Ad Library", ready: false },
      { id: "funnel", label: "Funnel", ready: false },
      { id: "data-leads", label: "Data & Leads", ready: false },
    ],
  },
  {
    id: "web-design",
    label: "Web Design",
    ready: false,
    subTabs: [
      { id: "site", label: "Site", ready: false },
      { id: "pages", label: "Pages", ready: false },
      { id: "change-requests", label: "Change Requests", ready: false },
      { id: "analytics", label: "Analytics", ready: false },
    ],
  },
  {
    id: "google-reviews",
    label: "Google Reviews",
    ready: false,
    subTabs: [
      { id: "funnel", label: "Funnel", ready: false },
      { id: "all-reviews", label: "All Reviews", ready: false },
      { id: "requests", label: "Requests", ready: false },
      { id: "reputation-report", label: "Reputation Report", ready: false },
    ],
  },
  {
    id: "reactivation",
    label: "Reactivation",
    ready: false,
    subTabs: [
      { id: "campaign", label: "Campaign", ready: false },
      { id: "results", label: "Results", ready: false },
    ],
  },
  { id: "config", label: "Config", ready: true },
];

// Overview is real, so it is the default landing tab.
export const DEFAULT_SERVICE_TAB: ServiceTab = "overview";

const VALID_SERVICE = new Set<string>(SERVICE_TABS.map((t) => t.id));

// Resolve a raw ?tab= value to a known service tab, else the default.
export function resolveServiceTab(param: string | null | undefined): ServiceTab {
  if (param && VALID_SERVICE.has(param)) return param as ServiceTab;
  return DEFAULT_SERVICE_TAB;
}

// The sub-tabs for a service tab, or [] when it has none.
export function subTabsFor(tab: ServiceTab): SubTabDef[] {
  return SERVICE_TABS.find((t) => t.id === tab)?.subTabs ?? [];
}

// Resolve a raw ?sub= value against the active service tab. Returns the first
// sub-tab id when the given one is invalid, or null when the service has none.
export function resolveSubTab(
  tab: ServiceTab,
  param: string | null | undefined,
): string | null {
  const subs = subTabsFor(tab);
  if (subs.length === 0) return null;
  if (param && subs.some((s) => s.id === param)) return param;
  return subs[0].id;
}

// The "coming soon" copy for a not-yet-built surface.
export function placeholderCopy(label: string): string {
  return `${label} is coming in a later phase.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- deliveryCockpit`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/deliveryCockpit.ts command-center/app/src/lib/deliveryCockpit.test.ts
git commit -m "feat(fulfillment): two-level service tab model for the cockpit"
```

### Task 2: Render service tabs + sub-tabs in `DeliveryCockpit.tsx`

**Files:**
- Modify: `command-center/app/src/routes/admin/DeliveryCockpit.tsx`

**Interfaces:**
- Consumes: `SERVICE_TABS`, `resolveServiceTab`, `resolveSubTab`, `subTabsFor`, `placeholderCopy`, `type ServiceTab` from `deliveryCockpit.ts`; the existing `OverviewTab` and `ClientConfigPanel` components.

- [ ] **Step 1: Update the imports**

Replace the `deliveryCockpit` import block (currently importing `COCKPIT_TABS`, `cockpitPlaceholder`, `resolveCockpitTab`, `type CockpitTab`) with:

```tsx
import {
  SERVICE_TABS,
  subTabsFor,
  resolveServiceTab,
  resolveSubTab,
  placeholderCopy,
  type ServiceTab,
} from "../../lib/deliveryCockpit";
```

- [ ] **Step 2: Replace tab state wiring**

Replace the `activeTab` / `setTab` block (the `resolveCockpitTab` call and the `setTab` helper) with service-tab + sub-tab state, both in URL params:

```tsx
const activeService = resolveServiceTab(searchParams.get("tab"));
const activeSub = resolveSubTab(activeService, searchParams.get("sub"));
const subs = subTabsFor(activeService);

const setService = (tab: ServiceTab) => {
  setSearchParams(
    (prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      next.delete("sub"); // let the new service pick its own first sub-tab
      return next;
    },
    { replace: true },
  );
};

const setSub = (sub: string) => {
  setSearchParams(
    (prev) => {
      const next = new URLSearchParams(prev);
      next.set("sub", sub);
      return next;
    },
    { replace: true },
  );
};
```

Update the `goToTeam` helper call site: the "View as owner" action currently calls `goToTeam(activeTab, setTab)`. Change the header prop to `onViewAsOwner={() => setService("config")}` and delete the now-unused `goToTeam` function and its `#cockpit-team` scroll logic (Config no longer has a Team sub-section in this model; the roster/team lives elsewhere). If Jake still wants the scroll-to-team behavior, it moves to Config internally in a later phase.

- [ ] **Step 3: Replace the tab bar + content region**

Replace the `<nav className="pk-tabs">...</nav>` block and the `activeTab === ...` content ternary with a service-tab row, an optional sub-tab row, and the resolved content:

```tsx
<nav className="pk-tabs" aria-label="Fulfillment services">
  {SERVICE_TABS.map((t) => (
    <button
      key={t.id}
      type="button"
      className={`pk-tab${activeService === t.id ? " on" : ""}`}
      onClick={() => setService(t.id)}
    >
      {t.label}
    </button>
  ))}
</nav>

{subs.length > 0 && (
  <nav className="pk-subtabs" aria-label={`${activeService} sections`}>
    {subs.map((s) => (
      <button
        key={s.id}
        type="button"
        className={`pk-subtab${activeSub === s.id ? " on" : ""}`}
        onClick={() => setSub(s.id)}
      >
        {s.label}
      </button>
    ))}
  </nav>
)}

<div className="pk-section">
  {activeService === "overview" ? (
    <OverviewTab
      tenantId={tenantId}
      onGoToConfig={() => setService("config")}
      onEnterLiveApp={enterLiveApp}
      previewBusy={previewBusy}
      previewErr={previewErr}
    />
  ) : activeService === "config" ? (
    <ClientConfigPanel tenantId={tenantId} />
  ) : (
    <div className="pk-empty">
      {placeholderCopy(
        subs.find((s) => s.id === activeSub)?.label ??
          SERVICE_TABS.find((t) => t.id === activeService)!.label,
      )}
    </div>
  )}
</div>
```

- [ ] **Step 4: Rename the back-link label**

Change the `<Link to="/admin/delivery" className="pk-back">` label text from `Service Delivery` to `Fulfillment` (line ~113). Leave the loading and not-found back-links (`Back to roster`) as they are.

- [ ] **Step 5: Add the `pk-subtabs` styles**

The sub-tab row needs a lighter treatment than the primary `pk-tabs`. Find the `.pk-tabs` / `.pk-tab` rules in `command-center/app/src/components/pillars/PillarKit.tsx` and add, directly after them, a `.pk-subtabs` / `.pk-subtab` pair: smaller text, no bottom border on the row, an underline or pill on `.on`. Match the existing token vars (`--brand`, `--border`, `--text-faint`). Keep it visually secondary to the service tabs.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no unused-symbol errors (confirm `goToTeam`, `CockpitTab`, `COCKPIT_TABS` are fully removed).

- [ ] **Step 7: Commit**

```bash
git add command-center/app/src/routes/admin/DeliveryCockpit.tsx command-center/app/src/components/pillars/PillarKit.tsx
git commit -m "feat(fulfillment): render service tabs + sub-tabs in the client cockpit"
```

### Task 3: Rename "Service Delivery" to "Fulfillment" in the landing, roster, nav, and pillar links

**Files:**
- Modify: `command-center/app/src/routes/admin/AdminDelivery.tsx`
- Modify: `command-center/app/src/components/admin/DeliveryRoster.tsx:32`
- Modify: `command-center/app/src/routes/admin/AdminLayout.tsx:42`
- Modify: `command-center/app/src/routes/admin/AdminPillarPage.tsx`

- [ ] **Step 1: Rename the landing header**

In `AdminDelivery.tsx`, change the kicker `Service Delivery` -> `Fulfillment`, the `<h1 className="pk-title">` `Service Delivery` -> `Fulfillment`, and leave the tagline (it still describes the roster + constraint accurately). Optionally soften the tagline copy to "The client roster and the delivery constraint" if the word delivery reads oddly; keep it if Jake prefers.

- [ ] **Step 2: Rename the roster rail title**

In `DeliveryRoster.tsx:32`, change `<h2 className="pk-roster-title">Service Delivery</h2>` to `Fulfillment`.

- [ ] **Step 3: Rename the sidebar nav label**

In `AdminLayout.tsx:42`, change `{ to: "/admin/delivery", label: "Service Delivery", icon: HeartHandshake }` to `label: "Fulfillment"`.

- [ ] **Step 4: Rename the pillar-page links**

In `AdminPillarPage.tsx`, change the capacity note "Manage roster and workload in Service Delivery." -> "...in Fulfillment.", and both `Open Service Delivery` link labels -> `Open Fulfillment`. Leave the route paths (`/admin/delivery`) untouched.

- [ ] **Step 5: Verify no stray user-facing "Service Delivery" remains**

Run: `git grep -n "Service Delivery" command-center/app/src`
Expected: only code comments remain (fine to leave, or update in passing). No JSX/label/nav string should still say "Service Delivery".

- [ ] **Step 6: Typecheck + test**

Run: `npm run typecheck && npm run test -- deliveryCockpit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add command-center/app/src/routes/admin/AdminDelivery.tsx command-center/app/src/components/admin/DeliveryRoster.tsx command-center/app/src/routes/admin/AdminLayout.tsx command-center/app/src/routes/admin/AdminPillarPage.tsx
git commit -m "feat(fulfillment): rename Service Delivery to Fulfillment across admin"
```

### Task 4: Visual verification of the shell

**Files:** none (verification only).

- [ ] **Step 1: Run the app**

Run: `npm run dev` (from `command-center/app`), open the admin, sign in, go to Fulfillment, open a client (e.g. Willis).

- [ ] **Step 2: Confirm the shell**

Check: the sidebar and rail say Fulfillment; the cockpit shows six service tabs; Overview and Config render their real content; each of Paid Ads / Web Design / Google Reviews / Reactivation shows its sub-tab row with the correct sub-tabs and an honest "coming in a later phase" body; switching service resets to that service's first sub-tab; `?tab=`/`?sub=` deep-links restore the right view on refresh.

- [ ] **Step 3: Screenshot for Jake and get sign-off before Phase 2.**

---

## Phase 2: Paid Ads (its own detailed plan)

Scope. Fill the four Paid Ads sub-tabs, reading the client's real Meta ad account (id already on `tenants.meta_ad_account_id`, shared system-user token).

- **Campaigns**: read-only tree of campaign -> ad set -> ad from the Graph API (`.../campaigns`, `adsets`, `ads` with `effective_status`, budgets, targeting summary). Optionally overlay the optimizer's recommended move per campaign (`lib/adsOptimizer.ts` already computes Kill/Watch/Scale/Refresh). No writes.
- **Ad Library**: a store of creatives per client (new table, e.g. `client_ad_creatives`: tenant, media ref, headline, primary text, status draft/approved/live). "Push to Meta" uploads the asset to the client's ad account media library via `POST /act_<id>/adimages` (images) or `/advideos` (video). Build the push in Phase 2 if it proves easy against the real token; if it fights us, ship Ad Library as an internal tracker and move the push to Phase 2b. Log the decision honestly in the UI.
- **Funnel**: view the active lead-capture surface: the GHL lead form by default, or the funnel when the client is on one. Read from the client's GHL sub-account (forms / funnels), same source the client Website page uses.
- **Data & Leads**: one stacked page: per-ad insights (spend, impressions, CPL, leads), then totals, then the incoming leads (Meta insights + the existing `facebook ads`-tag GHL revenue join). Reuse the join already built for the client Paid Ads Overview.

Backend prerequisite: an admin endpoint that accepts a tenantId and returns that tenant's ad data (the client-facing ads endpoint is scoped to the logged-in tenant; admin needs an explicit-tenant variant). Retire or repoint `/admin/ads` (`AdminAds.tsx`, mock) to the cockpit.

Flip `paid-ads` and its sub-tabs to `ready: true` in `deliveryCockpit.ts` as each lands.

## Phase 3: Web Design (its own detailed plan)

- **Site**: live preview (iframe or screenshot) + URL, reusing the client Website page's site source.
- **Pages**: the client's funnels / landing pages (GHL funnels), the same read the client Website "Pages" tab uses.
- **Change Requests**: read-only list of client-submitted change requests. Reuse the existing request-a-change store the client Website page writes to; admin view is read-only (Jake edits in GHL himself).
- **Analytics**: GA4 traffic via the per-tenant `ga4_property_id` + `GA4_SA_JSON` secret already wired for the client Website page.

## Phase 4: Google Reviews (its own detailed plan)

- **Funnel**: request -> click -> review pipeline from the GHL review pipeline (same source as the client Reviews Overview).
- **All Reviews**: every review + live star rating (Google Business Profile API v4; rating stays pending until GBP approval lands, per the Reviews Google integration track).
- **Requests**: read-only log of review requests sent and conversions.
- **Reputation Report**: the shareable summary, reusing the client Reputation Report content.

## Phase 5: Reactivation (its own detailed plan)

- **Campaign**: read-only view of the active reactivation blast: offer, message copy, audience size, send status (source: the GHL reactivation campaign / bulk action for the tenant).
- **Results**: replies, leads booked, revenue recovered, from the same campaign's stats + the GHL revenue join.

---

## Self-Review

**Spec coverage (Phase 1):** rename (Tasks 2.4, 3) ✓; six service tabs (Task 1 model, Task 2 render) ✓; sub-tabs per service (Task 1 model, Task 2 render) ✓; Overview + Config still work (Task 2 content region) ✓; honest placeholders (Task 1 `placeholderCopy`, Task 2 body) ✓; deep-linkable (Task 2 `?tab`/`?sub`) ✓; visual proof (Task 4) ✓. Service data (the actual workbenches) is explicitly deferred to Phases 2 to 5, each a separate plan.

**Placeholder scan:** Phase 1 tasks contain full code. Phases 2 to 5 are intentionally scope-only outlines, not task lists; they are separate future plans, not placeholder tasks inside this plan.

**Type consistency:** `ServiceTab`, `SubTabDef`, `ServiceTabDef`, `SERVICE_TABS`, `resolveServiceTab`, `resolveSubTab`, `subTabsFor`, `placeholderCopy` are defined in Task 1 and consumed with those exact names in Task 2. The old `CockpitTab`/`COCKPIT_TABS`/`cockpitPlaceholder`/`resolveCockpitTab` are fully removed (verified in Task 2 Step 6).

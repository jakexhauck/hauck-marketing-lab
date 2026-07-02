# Client App Simplification: Navigation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the client Command Center from ~40 nav destinations across 3 sections into ~14 rows across 2 sections (Marketing, Company) where nothing is deeper than one page-with-tabs, killing every duplicate surface, without removing any feature or changing the visual design language.

**Architecture:** The change is information-architecture only. We rewrite the single nav source of truth (`lib/nav.ts`), generalize the existing per-channel mobile tab strips into one shared `PageTabs` bar shown on every breakpoint, add that bar to the channels that lack one, fold the Sales section into Company, dedup the three "Leads" surfaces and three calendars into one each, and redirect legacy routes to their canonical homes. No component internals or styling tokens change; every element reuses the existing glass sidebar, `grad-brand` active pill, `PageHeader`, and `ui` primitives.

**Tech Stack:** React 18, react-router-dom v6, TypeScript, Tailwind, Vitest, Vite. App package: `command-center/app` (package name `client-dashboard`).

## Global Constraints

- **Never name GoHighLevel / "GHL" in any client-facing UI.** (Standing policy.)
- **No em dashes (—) anywhere** — chat, UI text, copy, code comments. Use commas, periods, parentheses, colons.
- **Preserve the design system:** glass sidebar, indigo→violet `var(--grad-brand)` active pill, Poppins display / Inter body, existing motion. Do not introduce new colors, fonts, or shadows.
- **One nav source of truth:** `lib/nav.ts` feeds both the desktop `Sidebar` and the phone `BottomNav`. Never hardcode nav in a component.
- **Keep all demo/sample pages visible** (Reviews, Campaigns, Website, Social). This restructure regroups and flattens; it does not hide unwired surfaces.
- **Deep links must keep resolving.** Every old route either still renders or 301-style redirects to its new canonical path; no route 404s.
- App working directory for all commands: `command-center/app`.

---

## Target Navigation (the spec)

Desktop sidebar after this plan:

```
🏠 Home                         (/home)

MARKETING                       (each row = one page with a tab bar inside)
  Paid Ads                      (/marketing/paid-ads)      tabs: Overview · Your Ads · What's working
  Google Reviews                (/marketing/reviews)       tabs: Overview · Ask for Reviews · All Reviews · What's working
  Campaigns                     (/marketing/campaigns)     tabs: Overview · Campaigns · Audiences · Templates · Reactivation · What's working
  Website                       (/marketing/website)       tabs: Overview · Pages · Request a Change · What's working
  Social Media                  (/marketing/social)        tabs: Overview · Ideas · Calendar · My Posts · What's working

COMPANY
  Inbox                         (/conversations)
  Leads                         (/sales/leads)             tabs: New Leads · Pipeline
  Contacts                      (/contacts)
  Jobs                          (/sales/jobs)
  Calendar                      (/calendar)
  Revenue                       (/billing)
  Assets                        (/company/documents)
  Team                          (/team, owner only)

Footer: Settings (/settings)
Top-right (desktop) / bottom tab (phone): Chat (/comms)
```

Phone bottom bar (`bottomNav: true`): Home · Inbox · Leads · Contacts · Chat (5 tabs).

### What each change resolves

| Problem today | Resolution |
|---|---|
| ~40 destinations, Marketing groups 5-deep | 14 sidebar rows; sub-pages become an in-page tab bar |
| "Leads" in 3 places (`/leads`, `/sales/leads`, Paid Ads › Leads) | One **Leads** row = `/sales/leads`, the only place leads live; Paid Ads drops its Leads tab (its lead count links into Leads filtered to ads); `/leads` redirects |
| "What's working" ×5 as sidebar rows | Becomes the last tab inside each channel |
| 3 calendars (`/calendar`, Social calendar, `/sales/jobs`) | One **Calendar** row; Social calendar is a tab in Social; Jobs stays as its own working surface |
| Home vs Sales Overview (two overviews) | One **Home**; the pipeline kanban becomes the **Pipeline** tab inside Leads |
| Two Paid Ads pages (`/paid-ads` live Meta data vs `/marketing/paid-ads` demo) | Live Meta data becomes the Paid Ads **Overview**; `/paid-ads` redirects |
| Reactivation in Sales, Campaigns in Marketing | Reactivation becomes a **tab inside Campaigns** |
| Sales section separate from Company | Sales items fold into Company |

### Out of scope (explicit follow-ups, not this plan)

- Wiring real data into Reviews / Campaigns / Website / Social (they stay demo/sample).
- Merging the Leads and Pipeline *data models* into one component. This plan puts them under one sidebar row + one tab bar; they remain two routes/components.
- Any change to the admin app (`/admin/*`).

---

## File Structure

**Create:**
- `src/components/PageTabs.tsx` — one shared in-page tab bar (pill strip, `grad-brand` active), rendered on all breakpoints. Replaces the two `*MobileTabs` components and is added to channels that never had one.
- `src/lib/pageTabs.ts` — the tab config arrays (one per channel + Leads), so pages and tests share one source of truth.
- `src/lib/nav.test.ts` — structural invariants for the new nav (no duplicate leaf routes, Marketing items are flat, Company holds the folded Sales items).
- `src/lib/contactSegments.ts` — pure lifecycle classifier (All / Leads / Customers / Past) joining contacts to pipeline opportunities. (Task 9, GHL Smart Lists.)

**Modify:**
- `src/lib/nav.ts` — flatten Marketing, fold Sales into Company, dedup, set `bottomNav` on Leads.
- `src/components/BottomNav.tsx` — point the `leads` key at `/sales/leads`.
- `src/App.tsx` — add legacy redirects; add `/marketing/campaigns/reactivation` route; point `/marketing/paid-ads` overview at the live ads page.
- `src/routes/campaigns/CampaignsOverview.tsx` + the 4 other campaigns sub-pages — swap `CampaignsMobileTabs` for `<PageTabs tabs={CAMPAIGNS_TABS} />`.
- `src/routes/social/*` (5 pages) — swap `SocialMobileTabs` for `<PageTabs tabs={SOCIAL_TABS} />`.
- `src/routes/reviews/*` (4 pages) — add `<PageTabs tabs={REVIEWS_TABS} />`.
- `src/routes/website/*` (4 pages) — add `<PageTabs tabs={WEBSITE_TABS} />`.
- `src/routes/paid-ads/*` (4 pages) + `src/routes/PaidAds.tsx` — add `<PageTabs tabs={PAID_ADS_TABS} />`; render the live ads page at the Overview route.
- `src/routes/sales/LeadsHub.tsx` + `src/routes/Leads.tsx` — add `<PageTabs tabs={LEADS_TABS} />`; the interactive board becomes the draggable Pipeline tab.
- `src/routes/sales/Reactivation.tsx` — no logic change; reachable at the new campaigns route.
- `src/components/contacts/ContactsDesktop.tsx` — add the saved-segment pill bar. (Task 9.)

**Delete (after their consumers are migrated):**
- `src/components/campaigns/CampaignsMobileTabs.tsx`
- `src/components/social/SocialMobileTabs.tsx`
- `src/routes/sales/SalesOverview.tsx` + `src/components/sales/PipelineOverviewBoard.tsx` — the read-only kanban, superseded by the draggable Pipeline tab (remove only if `tsc` confirms they are unreferenced).

---

## Task 1: Shared PageTabs component + config

**Files:**
- Create: `src/components/PageTabs.tsx`
- Create: `src/lib/pageTabs.ts`
- Test: `src/components/PageTabs.test.tsx`

**Interfaces:**
- Produces: `PageTab = { to: string; label: string; end?: boolean }`; default export `PageTabs({ tabs }: { tabs: PageTab[] })`. Named tab arrays in `lib/pageTabs.ts`: `PAID_ADS_TABS`, `REVIEWS_TABS`, `CAMPAIGNS_TABS`, `WEBSITE_TABS`, `SOCIAL_TABS`, `LEADS_TABS`.

- [ ] **Step 1: Write the tab config**

Create `src/lib/pageTabs.ts`:

```ts
// One source of truth for every in-page tab bar. Pages render <PageTabs> with
// the matching array; nav.test.ts asserts these routes exist and do not collide
// with sidebar rows. Labels follow the client-facing copy rules (no GHL, no em
// dashes).
export interface PageTab {
  to: string;
  label: string;
  // Exact-match the route so an overview tab (whose path prefixes its siblings)
  // does not stay active on deeper pages.
  end?: boolean;
}

export const PAID_ADS_TABS: PageTab[] = [
  // No "Leads" tab: a marketing channel must not host a lead list (that is the
  // Leads section's job). The Overview's lead count links into Leads?source=ads;
  // ad-attribution analysis lives in "What's working".
  { to: "/marketing/paid-ads", label: "Overview", end: true },
  { to: "/marketing/paid-ads/creatives", label: "Your Ads" },
  { to: "/marketing/paid-ads/insights", label: "What's working" },
];

export const REVIEWS_TABS: PageTab[] = [
  { to: "/marketing/reviews", label: "Overview", end: true },
  { to: "/marketing/reviews/requests", label: "Ask for Reviews" },
  { to: "/marketing/reviews/all", label: "All Reviews" },
  { to: "/marketing/reviews/insights", label: "What's working" },
];

export const CAMPAIGNS_TABS: PageTab[] = [
  { to: "/marketing/campaigns", label: "Overview", end: true },
  { to: "/marketing/campaigns/all", label: "Campaigns" },
  { to: "/marketing/campaigns/audiences", label: "Audiences" },
  { to: "/marketing/campaigns/templates", label: "Templates" },
  { to: "/marketing/campaigns/reactivation", label: "Reactivation" },
  { to: "/marketing/campaigns/insights", label: "What's working" },
];

export const WEBSITE_TABS: PageTab[] = [
  { to: "/marketing/website", label: "Overview", end: true },
  { to: "/marketing/website/pages", label: "Pages" },
  { to: "/marketing/website/request", label: "Request a Change" },
  { to: "/marketing/website/insights", label: "What's working" },
];

export const SOCIAL_TABS: PageTab[] = [
  { to: "/marketing/social", label: "Overview", end: true },
  { to: "/marketing/social/ideas", label: "Ideas" },
  { to: "/marketing/social/calendar", label: "Calendar" },
  { to: "/marketing/social/posts", label: "My Posts" },
  { to: "/marketing/social/insights", label: "What's working" },
];

export const LEADS_TABS: PageTab[] = [
  { to: "/sales/leads", label: "New Leads", end: true },
  // Pipeline is the interactive board (drag stages, mark won/lost). Nested under
  // /sales/leads so the sidebar's single "Leads" row stays highlighted on both.
  { to: "/sales/leads/pipeline", label: "Pipeline" },
];
```

- [ ] **Step 2: Write the failing test**

Create `src/components/PageTabs.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import PageTabs from "./PageTabs";
import { CAMPAIGNS_TABS } from "../lib/pageTabs";

describe("PageTabs", () => {
  it("renders a link per tab and marks the active route current", () => {
    render(
      <MemoryRouter initialEntries={["/marketing/campaigns/audiences"]}>
        <PageTabs tabs={CAMPAIGNS_TABS} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link")).toHaveLength(CAMPAIGNS_TABS.length);
    expect(screen.getByRole("link", { name: "Audiences" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Overview uses end-match, so it is NOT active on a deeper route.
    expect(
      screen.getByRole("link", { name: "Overview" }),
    ).not.toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/PageTabs.test.tsx`
Expected: FAIL — cannot resolve `./PageTabs`.

- [ ] **Step 4: Implement PageTabs**

Create `src/components/PageTabs.tsx` (generalized from `CampaignsMobileTabs`, now shown on all breakpoints):

```tsx
import { NavLink } from "react-router-dom";
import type { PageTab } from "../lib/pageTabs";

// The in-page sub-navigation for a section that has more than one page (every
// Marketing channel, plus Leads). Replaces the old per-channel *MobileTabs and
// the desktop sidebar sub-groups with one horizontal pill strip shown on every
// screen size. Same grad-brand active pill as the sidebar so the two read as
// one system. Horizontally scrollable on narrow screens.
export default function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <nav
      aria-label="Section pages"
      className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1"
      style={{ scrollbarWidth: "none" }}
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            [
              "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "text-white shadow-brand"
                : "border border-border-strong text-muted hover:text-text",
            ].join(" ")
          }
          style={({ isActive }) =>
            isActive ? { backgroundImage: "var(--grad-brand)" } : undefined
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/PageTabs.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/PageTabs.tsx src/components/PageTabs.test.tsx src/lib/pageTabs.ts
git commit -m "feat(client-nav): shared PageTabs bar + per-section tab config"
```

---

## Task 2: Rewrite the nav source of truth

**Files:**
- Modify: `src/lib/nav.ts:90-198` (the `NAV` array)
- Modify: `src/components/BottomNav.tsx:13-19` (`ROUTE_BY_KEY.leads`)
- Test: `src/lib/nav.test.ts`

**Interfaces:**
- Consumes: existing `NavEntry`, `NavItem`, `NavSection`, `flattenNav`, `visibleNav`, `filterNav` (unchanged signatures).
- Produces: a two-section `NAV` (`marketing`, `company`) with Home standalone and Chat sidebar-hidden; Marketing items have no `children`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NAV, flattenNav, isNavSection } from "./nav";

describe("client nav structure", () => {
  it("has exactly two sections: Marketing then Company", () => {
    const sections = NAV.filter(isNavSection);
    expect(sections.map((s) => s.id)).toEqual(["marketing", "company"]);
  });

  it("keeps Marketing flat (no expandable sub-groups in the sidebar)", () => {
    const marketing = NAV.filter(isNavSection).find((s) => s.id === "marketing")!;
    for (const item of marketing.items) {
      expect(item.children).toBeUndefined();
    }
  });

  it("folds the sales surfaces into Company", () => {
    const company = NAV.filter(isNavSection).find((s) => s.id === "company")!;
    const routes = company.items.map((i) => i.to);
    expect(routes).toEqual(
      expect.arrayContaining(["/sales/leads", "/sales/jobs", "/billing"]),
    );
  });

  it("has no duplicate leaf routes", () => {
    const routes = flattenNav(NAV).map((i) => i.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("puts Leads on the phone bottom bar", () => {
    const bottom = flattenNav(NAV).filter((i) => i.bottomNav).map((i) => i.to);
    expect(bottom).toContain("/sales/leads");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL — current nav has a `sales` section, Marketing items still carry `children`, and `/sales/leads` is not `bottomNav`.

- [ ] **Step 3: Replace the NAV array**

In `src/lib/nav.ts`, replace the entire `export const NAV: NavEntry[] = [ ... ];` block (lines ~90-198) with:

```ts
export const NAV: NavEntry[] = [
  { to: "/home", label: "Home", icon: Home, capability: "overview", bottomNav: true },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    // Flat rows. Each opens its own page, which carries a <PageTabs> bar for its
    // sub-pages (see lib/pageTabs.ts). No sidebar sub-groups anymore.
    items: [
      { to: "/marketing/paid-ads", label: "Paid Ads", shortLabel: "Ads", icon: Megaphone },
      { to: "/marketing/reviews", label: "Google Reviews", shortLabel: "Reviews", icon: Star },
      { to: "/marketing/campaigns", label: "Campaigns", icon: Send },
      { to: "/marketing/website", label: "Website", icon: Globe },
      { to: "/marketing/social", label: "Social Media", shortLabel: "Social", icon: Share2 },
    ],
  },
  {
    id: "company",
    label: "Company",
    icon: Building2,
    items: [
      { to: "/conversations", label: "Inbox", shortLabel: "Chats", icon: MessageSquare, capability: "inbox", bottomNav: true },
      // The one Leads surface. Its page hosts a New Leads / Pipeline tab bar, so
      // the old standalone "Sales Overview" is a tab here, not a sidebar row.
      { to: "/sales/leads", label: "Leads", shortLabel: "Leads", icon: Split, bottomNav: true },
      { to: "/contacts", label: "Contacts", icon: Contact, capability: "contacts", bottomNav: true },
      { to: "/sales/jobs", label: "Jobs", shortLabel: "Jobs", icon: CalendarCheck },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, capability: "calendar" },
      { to: "/billing", label: "Revenue", icon: Receipt, capability: "billing" },
      { to: "/company/documents", label: "Assets", icon: FolderOpen },
      { to: "/team", label: "Team", icon: UserCog, ownerOnly: true },
    ],
  },
  // Agency chat: phone bottom-bar tab only. On desktop it lives in the top-right
  // ChatLauncher, so it stays out of the sidebar.
  { to: "/comms", label: "Chat", shortLabel: "Chat", icon: MessagesSquare, bottomNav: true, sidebarHidden: true },
];
```

Then remove now-unused icon imports from the top of `nav.ts`: `MessagesSquare` is still used; delete `Users`, `ScrollText`, `BarChart3`, `Images`, `UserPlus`, `TrendingUp`, `Sparkles`, `LayoutGrid`, `MousePointerClick`, `RotateCcw`, `LayoutDashboard` **only if** no longer referenced. Run `npx tsc --noEmit` after and delete whatever it flags as unused.

- [ ] **Step 4: Point the bottom-bar leads key at the canonical route**

In `src/components/BottomNav.tsx`, change the `leads` entry in `ROUTE_BY_KEY`:

```ts
const ROUTE_BY_KEY: Record<NavKey, string> = {
  home: "/home",
  leads: "/sales/leads",
  conversations: "/conversations",
  contacts: "/contacts",
  comms: "/comms",
};
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/lib/nav.test.ts && npx tsc --noEmit`
Expected: nav tests PASS; tsc reports no errors (fix any unused-import errors from Step 3).

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts src/components/BottomNav.tsx
git commit -m "feat(client-nav): two-section IA (Marketing + Company), Sales folded in, Leads deduped"
```

---

## Task 3: Migrate Campaigns + Social to PageTabs

**Files:**
- Modify: `src/routes/campaigns/CampaignsOverview.tsx`, `CampaignsList.tsx`, `CampaignsAudiences.tsx`, `CampaignsTemplates.tsx`, `CampaignsInsights.tsx`
- Modify: `src/routes/social/SocialOverview.tsx`, `SocialIdeas.tsx`, `SocialCalendar.tsx`, `SocialPosts.tsx`, `SocialInsights.tsx`
- Delete: `src/components/campaigns/CampaignsMobileTabs.tsx`, `src/components/social/SocialMobileTabs.tsx`

**Interfaces:**
- Consumes: `PageTabs`, `CAMPAIGNS_TABS`, `SOCIAL_TABS` from Task 1.

- [ ] **Step 1: Swap the tab component in every campaigns page**

In each of the five `campaigns/*` route files, replace the import
`import CampaignsMobileTabs from "../../components/campaigns/CampaignsMobileTabs";`
with
`import PageTabs from "../../components/PageTabs";`
`import { CAMPAIGNS_TABS } from "../../lib/pageTabs";`
and replace the JSX `<CampaignsMobileTabs />` with `<PageTabs tabs={CAMPAIGNS_TABS} />`.

For pages that never rendered `CampaignsMobileTabs` (the sub-pages other than Overview), add `<PageTabs tabs={CAMPAIGNS_TABS} />` as the first child inside the page's container `div` (the element using `CAMPAIGNS_CONTAINER`), immediately above its `<PageHeader ... />`.

- [ ] **Step 2: Swap the tab component in every social page**

Same operation for the five `social/*` files using `SocialMobileTabs` → `<PageTabs tabs={SOCIAL_TABS} />` and the `SOCIAL_CONTAINER` div.

- [ ] **Step 3: Delete the dead tab components**

```bash
git rm src/components/campaigns/CampaignsMobileTabs.tsx src/components/social/SocialMobileTabs.tsx
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, no remaining references to the deleted components.

- [ ] **Step 5: Visual check**

Run: `npm run dev`, open `/marketing/campaigns` and `/marketing/social` at desktop width. Expected: the pill tab strip renders under/above the title on desktop (it used to be phone-only); clicking a pill navigates and the `grad-brand` pill tracks the active page. Confirm Reactivation appears as a campaigns tab (its page loads in Task 5).

- [ ] **Step 6: Commit**

```bash
git add src/routes/campaigns src/routes/social
git commit -m "refactor(client-nav): campaigns + social use shared desktop-visible PageTabs"
```

---

## Task 4: Add PageTabs to Reviews + Website

**Files:**
- Modify: `src/routes/reviews/ReviewsOverview.tsx`, `ReviewsRequests.tsx`, `ReviewsAll.tsx`, `ReviewsInsights.tsx`
- Modify: `src/routes/website/WebsiteOverview.tsx`, `WebsitePages.tsx`, `WebsiteRequestChange.tsx`, `WebsiteInsights.tsx`

**Interfaces:**
- Consumes: `PageTabs`, `REVIEWS_TABS`, `WEBSITE_TABS` from Task 1.

These channels never had a mobile tab strip (their only sub-nav was the desktop sidebar sub-group we removed in Task 2), so this task also fixes a pre-existing gap: on phones they had no sub-navigation at all.

- [ ] **Step 1: Add the tab bar to each reviews page**

In each `reviews/*` route file, add:
`import PageTabs from "../../components/PageTabs";`
`import { REVIEWS_TABS } from "../../lib/pageTabs";`
and render `<PageTabs tabs={REVIEWS_TABS} />` as the first child inside the page's `REVIEWS_CONTAINER` div, directly above `<PageHeader ... />`.

- [ ] **Step 2: Add the tab bar to each website page**

Same for each `website/*` file with `WEBSITE_TABS` and the `WEBSITE_CONTAINER` div.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Visual check**

Run `npm run dev`, open `/marketing/reviews` and `/marketing/website` at desktop and phone widths. Expected: tab strip present and functional at both widths; active pill tracks the route.

- [ ] **Step 5: Commit**

```bash
git add src/routes/reviews src/routes/website
git commit -m "feat(client-nav): reviews + website get the shared PageTabs bar (fixes phone sub-nav gap)"
```

---

## Task 5: Reactivation as a Campaigns tab

**Files:**
- Modify: `src/App.tsx` (add `/marketing/campaigns/reactivation` route; redirect `/sales/reactivation`)

**Interfaces:**
- Consumes: existing `Reactivation` route component (`./routes/sales/Reactivation`), already imported in `App.tsx:55`.

- [ ] **Step 1: Add the canonical route + redirect**

In `src/App.tsx`, next to the other campaigns routes (near line 386-390), add:

```tsx
<Route path="/marketing/campaigns/reactivation" element={<ProtectedRoute><Reactivation /></ProtectedRoute>} />
```

Then change the existing `/sales/reactivation` route (line ~375) to redirect:

```tsx
<Route path="/sales/reactivation" element={<Navigate to="/marketing/campaigns/reactivation" replace />} />
```

- [ ] **Step 2: Add the PageTabs bar to the Reactivation page**

In `src/routes/sales/Reactivation.tsx`, add `import PageTabs from "../../components/PageTabs";` and `import { CAMPAIGNS_TABS } from "../../lib/pageTabs";`, and render `<PageTabs tabs={CAMPAIGNS_TABS} />` as the first child of its top-level container (matching the other campaigns pages) so it reads as part of the Campaigns hub.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Visual check**

Run `npm run dev`, open `/marketing/campaigns`, click the **Reactivation** tab. Expected: lands on the reactivation page with the Campaigns tab bar, Reactivation pill active. Visiting `/sales/reactivation` redirects there.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/routes/sales/Reactivation.tsx
git commit -m "feat(client-nav): Reactivation lives as a Campaigns tab"
```

---

## Task 6: One Leads surface with a draggable Pipeline tab

**GHL-inspired:** GHL's Opportunities are deals you *move* (drag stages, set value, mark won/lost). The interactive `Board` already exists at `/leads`; we make it the Pipeline tab and retire the read-only `SalesOverview` kanban.

**Files:**
- Modify: `src/App.tsx` (mount the interactive board at `/sales/leads/pipeline`)
- Modify: `src/routes/sales/LeadsHub.tsx` (add `<PageTabs tabs={LEADS_TABS} />`)
- Modify: `src/routes/Leads.tsx` (add `<PageTabs tabs={LEADS_TABS} />`)
- Delete (if unused after redirects): `src/routes/sales/SalesOverview.tsx`, `src/components/sales/PipelineOverviewBoard.tsx`

**Interfaces:**
- Consumes: `PageTabs`, `LEADS_TABS` from Task 1 (New Leads `/sales/leads`, Pipeline `/sales/leads/pipeline`). The interactive board component is `Leads` (`./routes/Leads`, already imported in `App.tsx:11`); it renders `<Board>` off `usePipelineLeadsQuery` with drag + list/board toggle + `PipelineSwitcher`.

- [ ] **Step 1: Mount the interactive board under the nested Pipeline route**

In `src/App.tsx`, add next to the `/sales/leads` route:

```tsx
<Route path="/sales/leads/pipeline" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
```

- [ ] **Step 2: Add the tab bar to the Leads hub**

In `src/routes/sales/LeadsHub.tsx`, add the `PageTabs` + `LEADS_TABS` imports and render `<PageTabs tabs={LEADS_TABS} />` as the first child inside its page container, above the existing header. (Keep the existing in-page source tabs, New Leads / Estimate Forms / Chat Widget, beneath it; they are a different axis and stay.)

- [ ] **Step 3: Add the same tab bar to the interactive board**

In `src/routes/Leads.tsx`, add `import PageTabs from "../components/PageTabs";` and `import { LEADS_TABS } from "../lib/pageTabs";`, and render `<PageTabs tabs={LEADS_TABS} />` at the top of its main content (inside the desktop layout, above the board/list) so a client can flip New Leads ↔ Pipeline from either page. Leave the existing list/board view toggle intact (it is a different control, view mode within the Pipeline).

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Visual check**

Run `npm run dev`, open `/sales/leads`. Expected: a **New Leads / Pipeline** tab bar on top; clicking **Pipeline** lands on the interactive kanban where cards drag between stages and can be marked won/lost; the sidebar's single **Leads** row stays highlighted on both tabs. Confirm dragging a card persists (it uses the existing board mutation).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/routes/sales/LeadsHub.tsx src/routes/Leads.tsx
git commit -m "feat(client-nav): Leads hub + draggable Pipeline tab under one row"
```

---

## Task 7: Live ads data as the Paid Ads Overview + PageTabs

**Files:**
- Modify: `src/App.tsx` (render live `PaidAds` at `/marketing/paid-ads`; redirect `/paid-ads`; redirect the retired `/marketing/paid-ads/leads`)
- Modify: `src/routes/PaidAds.tsx` (add `<PageTabs tabs={PAID_ADS_TABS} />`)
- Modify: `src/routes/paid-ads/AdsCreatives.tsx`, `AdsInsights.tsx` (add `<PageTabs tabs={PAID_ADS_TABS} />`)

**Interfaces:**
- Consumes: `PageTabs`, `PAID_ADS_TABS` from Task 1 (3 tabs: Overview, Your Ads, What's working). Live ads component: `PaidAds` (`./routes/PaidAds`, already imported at `App.tsx:19`). Demo overview `AdsOverview` (`./routes/paid-ads/AdsOverview`) is retired from routing.

The live Meta insights page (`PaidAds.tsx`, uses `useAdsData`) becomes the Paid Ads **Overview** so real spend/CPL/ROAS is front and center; the demo `AdsOverview` is no longer routed.

**No Leads tab (IA rule: a marketing channel never hosts a lead list).** The lead *count* stays as an Overview KPI that links into `/sales/leads?source=ads`; the ad-attribution *analysis* (which ad/adset drives the best leads) belongs in **What's working** (`AdsInsights`). `AdsLeads` (the old lead list) is dropped from the tab bar and its route redirects to the filtered Leads view.

- [ ] **Step 1: Repoint the overview route + redirect the legacy one**

In `src/App.tsx`:

Change the marketing paid-ads overview route (line ~378) from `AdsOverview` to the live page:

```tsx
<Route path="/marketing/paid-ads" element={<ProtectedRoute><PaidAds /></ProtectedRoute>} />
```

Change the legacy `/paid-ads` route (line ~250) to a redirect, and retire the ad-specific Leads list route into the filtered Leads view:

```tsx
<Route path="/paid-ads" element={<Navigate to="/marketing/paid-ads" replace />} />
{/* A marketing channel never hosts a lead list; ad leads live in Leads, filtered. */}
<Route path="/marketing/paid-ads/leads" element={<Navigate to="/sales/leads?source=ads" replace />} />
```

Remove the now-unused `AdsOverview` and `AdsLeads` imports (`App.tsx:49,51`) — run `npx tsc --noEmit` to confirm they are unused before deleting.

- [ ] **Step 2: Add the tab bar to the live overview + the two remaining sub-pages**

In `src/routes/PaidAds.tsx` and each of `paid-ads/AdsCreatives.tsx`, `AdsInsights.tsx`, add `import PageTabs from "../components/PageTabs";` (adjust depth: `../../components/PageTabs` for the `paid-ads/*` files) and `import { PAID_ADS_TABS } from ".../lib/pageTabs";`, then render `<PageTabs tabs={PAID_ADS_TABS} />` as the first child inside each page's container, above its `<PageHeader />`. Do not add it to `AdsLeads` (it is being retired from the tab bar).

In `AdsInsights.tsx` (the "What's working" tab), surface the ad-attribution angle that used to justify a Leads tab: a "best performing ads by cost per lead / by booked jobs" ranking. If that data is not yet available, leave the existing insights content and add a one-line `NotConnectedNotice`-style caption; do not fabricate attribution rows.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; `AdsOverview` and `AdsLeads` no longer imported.

- [ ] **Step 4: Visual check**

Run `npm run dev`, open `/marketing/paid-ads`. Expected: the live metric band (Spend, Leads, Cost/lead, ROAS, Revenue, Customers) renders as the Overview with a **3-tab** bar (Overview · Your Ads · What's working) on top; there is no "Leads" tab; `/paid-ads` and `/marketing/paid-ads/leads` both redirect (the latter into Leads).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/routes/PaidAds.tsx src/routes/paid-ads
git commit -m "feat(client-nav): live Meta data is the Paid Ads overview; legacy /paid-ads redirects"
```

---

## Task 8: Legacy route redirects + final sweep

**Files:**
- Modify: `src/App.tsx` (redirect the deduped/legacy standalone routes)
- Test: `src/lib/nav.test.ts` (already covers no-duplicate-routes)

**Interfaces:**
- Consumes: nothing new. Uses `<Navigate>` (already imported in `App.tsx`).

Redirect the surfaces that the new IA deduped, so no old deep link 404s and no duplicate appears anywhere:

- [ ] **Step 1: Add redirects**

In `src/App.tsx`, change these routes to redirects (keep the imports only if still referenced elsewhere; otherwise remove and let tsc guide you):

```tsx
{/* The old standalone /leads board is now the Pipeline tab of the Leads hub. */}
<Route path="/leads" element={<Navigate to="/sales/leads/pipeline" replace />} />
{/* The read-only Sales Overview kanban is retired in favor of the draggable one. */}
<Route path="/sales/overview" element={<Navigate to="/sales/leads/pipeline" replace />} />
{/* The old per-channel sales lead pages merged into the Leads hub. */}
<Route path="/sales/forms" element={<Navigate to="/sales/leads" replace />} />
<Route path="/sales/chat" element={<Navigate to="/sales/leads" replace />} />
<Route path="/sales/paid-ads" element={<Navigate to="/sales/leads" replace />} />
```

Then remove the now-dead `SalesOverview` import and route. Run `npx tsc --noEmit`; if `SalesOverview` and `PipelineOverviewBoard` are unreferenced, `git rm src/routes/sales/SalesOverview.tsx src/components/sales/PipelineOverviewBoard.tsx`.

Leave `/dashboard`, `/today`, `/activity`, `/notifications`, `/automations`, `/conversations`, `/calendar`, and all `/admin/*` routes untouched — they are either still surfaced or are harmless deep links with no duplicate in the new nav.

- [ ] **Step 2: Run the full test suite + typecheck + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green. If tsc flags now-unused route imports (e.g. `EstimateForms`, `ChatWidget`, `SalesPaidAds`, `Leads`), delete those imports.

- [ ] **Step 3: Full walkthrough**

Run `npm run dev` and click every sidebar row + every tab in each channel, at desktop and phone widths. Confirm: 14 sidebar rows, two section headers (Marketing, Company), no row is deeper than a tab bar, Chat is a phone tab / desktop top-right icon only, and every legacy URL from the redirect list forwards correctly.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "chore(client-nav): redirect deduped legacy routes to canonical homes"
```

---

## Task 9: Contacts saved segments (GHL Smart Lists)

**GHL-inspired:** GHL's power move is saved filtered views ("Smart Lists"). We add quick-segment tabs to Contacts by **lifecycle**: **All · New · Customers · Past customers.** (Deliberately no "Leads" label — that word belongs to the Leads section; Contacts is the address book, not a second lead tool.) `ApiContact` has no lifecycle field, so we derive membership honestly by joining contacts to pipeline opportunities (`ApiLead.contactId` + `ApiLead.status`). No fabricated data: a contact with no opportunity is only ever in "All".

**Data note / known limit:** membership is computed against the currently-selected pipeline's opportunities (`usePipelineLeadsQuery`), not every pipeline. Willis runs a single main pipeline, so this covers the real case; multi-pipeline aggregation is a follow-up. `ApiLead.status` values are GHL's `open | won | lost | abandoned`.

**Files:**
- Create: `src/lib/contactSegments.ts`
- Test: `src/lib/contactSegments.test.ts`
- Modify: `src/components/contacts/ContactsDesktop.tsx`

**Interfaces:**
- Produces: `type ContactSegment = "all" | "new" | "customers" | "past"`; `contactSegment(contact, membership, now): Exclude<ContactSegment,"all"> | null`; `SEGMENT_LABELS: Record<ContactSegment, string>`.
- Consumes: `usePipelineLeadsQuery` (`../../hooks/useApi`), `usePipelines` (`../../context/PipelinesContext`), `useNow` (already imported in ContactsDesktop).

- [ ] **Step 1: Write the failing test**

Create `src/lib/contactSegments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contactSegment } from "./contactSegments";

const NOW = 1_700_000_000_000; // fixed clock; do not use Date.now() in tests
const DAY = 86_400_000;
const membership = { wonIds: new Set(["c1", "c2"]), openIds: new Set(["c3"]) };

describe("contactSegment", () => {
  it("classifies a recent won contact as a customer", () => {
    const c = { id: "c1", lastActivityAt: new Date(NOW - 5 * DAY).toISOString() };
    expect(contactSegment(c, membership, NOW)).toBe("customers");
  });
  it("classifies a stale won contact as a past customer", () => {
    const c = { id: "c2", lastActivityAt: new Date(NOW - 120 * DAY).toISOString() };
    expect(contactSegment(c, membership, NOW)).toBe("past");
  });
  it("classifies an open-opportunity contact as new", () => {
    const c = { id: "c3", lastActivityAt: new Date(NOW).toISOString() };
    expect(contactSegment(c, membership, NOW)).toBe("new");
  });
  it("returns null for a contact with no opportunity", () => {
    const c = { id: "c9", lastActivityAt: new Date(NOW).toISOString() };
    expect(contactSegment(c, membership, NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/contactSegments.test.ts`
Expected: FAIL — cannot resolve `./contactSegments`.

- [ ] **Step 3: Implement the classifier**

Create `src/lib/contactSegments.ts`:

```ts
// Client-side "Smart Lists": derive a contact's lifecycle from the pipeline
// opportunities it belongs to. ApiContact carries no stage, so membership comes
// from ApiLead (contactId + status). Pure + clock-injected so it is unit-testable.
export type ContactSegment = "all" | "new" | "customers" | "past";

export const SEGMENT_LABELS: Record<ContactSegment, string> = {
  all: "All",
  new: "New",
  customers: "Customers",
  past: "Past customers",
};

// A won customer whose last activity is older than this reads as "past".
const PAST_CUSTOMER_DAYS = 90;

export function contactSegment(
  contact: { id: string; lastActivityAt: string },
  membership: { wonIds: Set<string>; openIds: Set<string> },
  now: number,
): Exclude<ContactSegment, "all"> | null {
  if (membership.wonIds.has(contact.id)) {
    const last = Date.parse(contact.lastActivityAt);
    const stale =
      Number.isFinite(last) && now - last > PAST_CUSTOMER_DAYS * 86_400_000;
    return stale ? "past" : "customers";
  }
  // An open opportunity means an active/new lead in lifecycle terms.
  if (membership.openIds.has(contact.id)) return "new";
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/contactSegments.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the segment bar into ContactsDesktop**

In `src/components/contacts/ContactsDesktop.tsx`:

Add imports:

```tsx
import { usePipelines } from "../../context/PipelinesContext";
import { usePipelineLeadsQuery } from "../../hooks/useApi";
import {
  contactSegment,
  SEGMENT_LABELS,
  type ContactSegment,
} from "../../lib/contactSegments";
```

Inside the component, after the existing `contacts` memo, build membership from the selected pipeline and a segment filter (place this above the existing `visible`/search memo, then feed its output into search):

```tsx
const [segment, setSegment] = useState<ContactSegment>("all");
const { selectedId } = usePipelines();
const leadsQuery = usePipelineLeadsQuery(selectedId ?? undefined, useReal);
const membership = useMemo(() => {
  const wonIds = new Set<string>();
  const openIds = new Set<string>();
  for (const l of leadsQuery.data?.leads ?? []) {
    if (l.status === "won") wonIds.add(l.contactId);
    else if (l.status === "open") openIds.add(l.contactId);
  }
  return { wonIds, openIds };
}, [leadsQuery.data]);

// Count each segment once, then filter the list to the active one.
const nowMs = now.getTime();
const bySegment = useMemo(() => {
  const counts: Record<ContactSegment, number> = { all: contacts.length, new: 0, customers: 0, past: 0 };
  for (const c of contacts) {
    const seg = contactSegment(c, membership, nowMs);
    if (seg) counts[seg] += 1;
  }
  return counts;
}, [contacts, membership, nowMs]);

const segmented = useMemo(
  () =>
    segment === "all"
      ? contacts
      : contacts.filter((c) => contactSegment(c, membership, nowMs) === segment),
  [contacts, membership, nowMs, segment],
);
```

Change the existing search memo to filter `segmented` instead of `contacts` (rename its source from `contacts` to `segmented` in the `if (!trimmed) return segmented;` and `.filter` base).

Render a segment pill bar just under the page title (above the search field), reusing the PageTabs pill styling so it reads as one system:

```tsx
<nav aria-label="Contact segments" className="mb-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
  {(Object.keys(SEGMENT_LABELS) as ContactSegment[]).map((key) => {
    const active = segment === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setSegment(key)}
        aria-current={active ? "true" : undefined}
        className={[
          "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
          active ? "text-white shadow-brand" : "border border-border-strong text-muted hover:text-text",
        ].join(" ")}
        style={active ? { backgroundImage: "var(--grad-brand)" } : undefined}
      >
        {SEGMENT_LABELS[key]} <span className="opacity-70">{bySegment[key]}</span>
      </button>
    );
  })}
</nav>
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors. If `usePipelineLeadsQuery`'s signature differs (e.g. it takes an options object), match the existing call site in `src/routes/Leads.tsx` verbatim.

- [ ] **Step 7: Visual check**

Run `npm run dev`, open `/contacts`. Expected: an **All · New · Customers · Past customers** segment bar with live counts; clicking a segment filters the big list; search narrows within the active segment. With no session/opportunities, only "All" has a count and the others show 0 (no fabricated members).

- [ ] **Step 8: Commit**

```bash
git add src/lib/contactSegments.ts src/lib/contactSegments.test.ts src/components/contacts/ContactsDesktop.tsx
git commit -m "feat(contacts): saved segments (All / Leads / Customers / Past) from pipeline join"
```

---

## Roadmap (GHL-inspired, separate build plans after this ships)

Not in this plan; listed so the sequence is captured. Each is its own spec + plan.

1. **Estimates & Invoices + pay-by-text** — turn Revenue from a read-only ledger into a tool: send quotes/invoices, collect via a text pay link (GHL Payments API). Highest revenue leverage for a service business. Likely restructures Revenue into a "Money" hub with tabs at that point.
2. **Review requests, wired** — make the demo Reviews "Ask for Reviews" button send a real SMS/email request and track responses.
3. **Tasks + Home "Today"** — a task primitive on contacts/leads plus a "what to do today" list on Home, reinforcing the command-deck.
4. **Reports / Attribution** — one real report tying lead source to booked revenue; folds the five per-channel "What's working" tabs into a single source of truth (fills the existing `/operations/reports` coming-soon slot).
5. **Inbox quick-replies (snippets)** — saved canned responses in the composer to speed up replies.

---

## Self-Review Notes (author, pre-handoff)

- **Spec coverage:** every row/dedup in the Target Navigation maps to a task — Marketing flatten (T2) + tabs (T3/T4/T5/T7), Company fold + Leads dedup (T2/T6), one Calendar (T2 removes the extra sidebar rows; Social calendar is a T3 tab), Home vs Sales Overview (T6), two Paid Ads pages (T7), Reactivation (T5), redirects (T5/T6/T7/T8). GHL-inspired folds: draggable Pipeline (T6), Contacts segments (T9).
- **Placeholder scan:** all code steps contain real code; verification steps name exact commands + expected output.
- **Type consistency:** `PageTab` / `PageTabs` / the six `*_TABS` names are defined in Task 1 and used verbatim in Tasks 3-7; `ContactSegment` / `contactSegment` / `SEGMENT_LABELS` are defined and used within Task 9. `LEADS_TABS` Pipeline route (`/sales/leads/pipeline`) matches the route mounted in T6 and the redirects in T8.
- **Honesty check:** Contacts segments (T9) never fabricate membership — a contact with no opportunity stays in "All" only; the single-pipeline limit is called out. Reviews/Campaigns/Website/Social stay demo/sample as agreed.
- **Known verify-on-execute item:** exact line numbers in `App.tsx`/`nav.ts` will drift; each task names the route/array by content, not only by line. Run `npx tsc --noEmit` after every task to catch orphaned imports (called out where likely).
```

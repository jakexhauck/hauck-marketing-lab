# Service Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the client app's Marketing section to the four services Hauck actually sells (Paid Ads, Website, Google Reviews, Reactivation) and purge every client-facing reference to the back-burnered services (Social Media, Commercial Outreach, Group Outreach) — without deleting any route or page code.

**Architecture:** `nav.ts` is the single source of truth for the sidebar, phone bottom bar, `/apps` grid, and global search, so removing three rows hides the channels everywhere at once while their routes stay registered in `App.tsx` (no 404s, one-line re-enable). A second pass removes the leftover social artifacts the nav change doesn't reach: the inbox's "Social DM" lead-source, the composer's FB/IG/WhatsApp/GMB channel labels, and the calendar's social + campaign streams (the campaign stream is fed by the back-burnered outreach engine).

**Tech Stack:** React 19 + react-router-dom 7, TypeScript, Vitest, Tailwind v4. Cloudflare Pages Functions for the server mirror. Package manager: pnpm. App lives in `command-center/app`.

## Global Constraints

- All commands run from `command-center/app`.
- Test command: `pnpm test` (Vitest). Single file: `pnpm test src/lib/<file>.test.ts`.
- Typecheck (must stay clean, covers app + functions): `pnpm typecheck`.
- **No em dashes** anywhere (code, comments, copy). Use commas, periods, parentheses, colons.
- **Delete nothing** structural: back-burnered route components, pages, hooks, and libs stay. Only nav rows, the social lead-source, composer channel labels, and the calendar social/campaign streams are removed.
- `src/lib/inboxFilters.ts` and `app/functions/lib/origin.ts` are mirror files with a "keep both in sync" contract. Every union/rule change to one MUST be applied identically to the other.
- Out of scope (do not touch): `src/routes/admin/**`, the internal team Chat (`src/routes/Comms.tsx`, `src/components/comms/**`), and the hidden pages' own `pageTabs.ts` entries.

---

### Task 1: Simplify the Marketing nav to four services

**Files:**
- Modify: `src/lib/nav.ts:83-124` (the `NAV` array; Marketing `items` at lines 89-97)
- Test: `src/lib/nav.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NAV` with a Marketing section of exactly four items whose routes are `/marketing/paid-ads`, `/marketing/website`, `/marketing/reviews`, `/marketing/reactivation`. `flattenNav(NAV)` no longer contains `/marketing/social`, `/marketing/outreach`, `/marketing/groups`.

- [ ] **Step 1: Update the failing test first**

In `src/lib/nav.test.ts`, add this test inside the `describe("client nav structure", ...)` block (after the existing "keeps Marketing flat" test):

```ts
it("shows exactly the four sold services in Marketing, back-burnered ones hidden", () => {
  const marketing = NAV.filter(isNavSection).find((s) => s.id === "marketing")!;
  expect(marketing.items.map((i) => i.to)).toEqual([
    "/marketing/paid-ads",
    "/marketing/website",
    "/marketing/reviews",
    "/marketing/reactivation",
  ]);
  const allRoutes = flattenNav(NAV).map((i) => i.to);
  expect(allRoutes).not.toContain("/marketing/social");
  expect(allRoutes).not.toContain("/marketing/outreach");
  expect(allRoutes).not.toContain("/marketing/groups");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/nav.test.ts`
Expected: FAIL — the new test sees the current 7-item Marketing list (contains `/marketing/outreach`, `/marketing/groups`, `/marketing/social`).

- [ ] **Step 3: Edit the Marketing `items` array in `nav.ts`**

Replace the Marketing section's `items` (current lines 90-96) with exactly these four rows, reordered so Website follows Paid Ads:

```ts
    items: [
      { to: "/marketing/paid-ads", label: "Paid Ads", shortLabel: "Ads", icon: Megaphone },
      { to: "/marketing/website", label: "Website", icon: Globe },
      { to: "/marketing/reviews", label: "Google Reviews", shortLabel: "Reviews", icon: Star },
      { to: "/marketing/reactivation", label: "Reactivation", icon: RotateCcw },
    ],
```

Then add this comment directly above the Marketing section object (above its `id: "marketing"` line):

```ts
  // Marketing shows only the four services we sell. Three channels are
  // back-burnered (hidden here, routes still registered in App.tsx): to
  // re-enable one, add its row back:
  //   { to: "/marketing/social", label: "Social Media", shortLabel: "Social", icon: Share2 },
  //   { to: "/marketing/outreach", label: "Commercial Outreach", shortLabel: "Outreach", icon: Send },
  //   { to: "/marketing/groups", label: "Group Outreach", shortLabel: "Groups", icon: Users },
```

- [ ] **Step 4: Remove now-unused icon imports**

`Send`, `Share2`, and `Users` are no longer referenced by live rows (they appear only in the comment). Remove them from the `lucide-react` import block at the top of `nav.ts` (lines 1-22): delete the `Send,`, `Share2,`, and `Users,` lines. Keep `RotateCcw` and `Globe` (still used).

Note: if `pnpm typecheck` in Step 6 reports any of these three as still used elsewhere in the file, restore that one import. (Expected: all three are only used by the removed rows.)

- [ ] **Step 5: Run the nav test to verify it passes**

Run: `pnpm test src/lib/nav.test.ts`
Expected: PASS (all tests, including the new one and the existing "has no duplicate leaf routes" / bottom-bar tests, which are unaffected).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: clean (no unused-import error for `Send`/`Share2`/`Users`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts
git commit -m "feat(nav): cut client Marketing to the four sold services

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Remove the "Social DM" lead-source from the inbox (both mirrors)

**Files:**
- Modify: `src/lib/inboxFilters.ts` (`OriginKey` 5-12, `ORIGINS` 30-38, `ORIGIN_RULES` 58-68, `countByOrigin` 196-210)
- Modify: `app/functions/lib/origin.ts` (`OriginKey` 4-11, `ORIGIN_RULES` 20-30)
- Test: `src/lib/inboxFilters.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OriginKey` union without `"social"` (both files): `"form" | "chat" | "paid" | "react" | "call" | "other"`. `classifyOrigin("Instagram DM", [])` returns `"other"`. `countByOrigin` returns an object without a `social` key.

- [ ] **Step 1: Update the failing test first**

In `src/lib/inboxFilters.test.ts`, change the `classifyOrigin` "classifies from the source string" test. Replace line 45-46:

```ts
    expect(classifyOrigin("Facebook Ad", [])).toBe("paid"); // an ad beats bare social
    expect(classifyOrigin("Instagram DM", [])).toBe("social");
```

with:

```ts
    expect(classifyOrigin("Facebook Ad", [])).toBe("paid"); // a facebook AD is paid, not social
    expect(classifyOrigin("Instagram DM", [])).toBe("other"); // social source dropped, folds to other
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/inboxFilters.test.ts`
Expected: FAIL — `classifyOrigin("Instagram DM", [])` currently returns `"social"`, not `"other"`.

- [ ] **Step 3: Edit `src/lib/inboxFilters.ts`**

a. `OriginKey` union (lines 5-12): remove the `| "social"` line so it reads:

```ts
export type OriginKey =
  | "form"
  | "chat"
  | "paid"
  | "react"
  | "call"
  | "other";
```

b. `ORIGINS` array (lines 30-38): delete the social entry line:

```ts
  { key: "social", label: "Social DM", icon: "📷", swatch: "#db2777" },
```

c. `ORIGIN_RULES` (lines 58-68): delete the social rule line (keep the `paid` rule, which legitimately matches `facebook ad`/`instagram ad`):

```ts
  { key: "social", test: /instagram|facebook|messenger|\big\b|\bfb\b|social/ },
```

d. `countByOrigin` (lines 196-210): delete the `social: 0,` line from the `out` object literal.

- [ ] **Step 4: Mirror the change in `app/functions/lib/origin.ts`**

a. `OriginKey` union (lines 4-11): remove the `| "social"` line (same six-member union as above).

b. `ORIGIN_RULES` (lines 20-30): delete the social rule line:

```ts
  { key: "social", test: /instagram|facebook|messenger|\big\b|\bfb\b|social/ },
```

- [ ] **Step 5: Run the inbox test to verify it passes**

Run: `pnpm test src/lib/inboxFilters.test.ts`
Expected: PASS. (The "prefers reactivation and call over a form/social source" test still passes: `Facebook Ad` + `Win-back` → `react`; `Website Form` + `Missed Call` → `call`.)

- [ ] **Step 6: Typecheck (proves the mirrors agree and nothing consumed `social`)**

Run: `pnpm typecheck`
Expected: clean. If a consumer references the `social` origin key (e.g. a switch or a `Record<OriginKey, ...>` literal outside these files), fix it to drop the `social` arm — search with `git grep '"social"' src/` scoped to origin usage.

- [ ] **Step 7: Commit**

```bash
git add src/lib/inboxFilters.ts src/lib/inboxFilters.test.ts app/functions/lib/origin.ts
git commit -m "feat(inbox): drop the Social DM lead-source (SMS + email only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Trim the composer to SMS + Email channels

**Files:**
- Modify: `src/components/ChannelComposer.tsx:13-22` (the `CHANNEL_LABEL` map)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CHANNEL_LABEL` mapping only `SMS` and `Email`; `label()` falls back to the raw channel string for anything else (unchanged behavior via `?? channel`).

- [ ] **Step 1: Edit `CHANNEL_LABEL`**

Replace the map (lines 13-22) with:

```ts
// The inbox is SMS + Email only. Any other channel string a contact might carry
// falls through label()'s `?? channel` to render its raw name, but no FB/IG/etc
// chip is ever offered because inbox pages lock the composer to one channel.
const CHANNEL_LABEL: Record<string, string> = {
  SMS: "SMS",
  Email: "Email",
};
```

The `label()` function (lines 24-26) already returns `CHANNEL_LABEL[channel] ?? channel`, so no other change is needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Run the full test suite (no dedicated test for this file; guard against regressions)**

Run: `pnpm test`
Expected: PASS (all suites).

- [ ] **Step 4: Commit**

```bash
git add src/components/ChannelComposer.tsx
git commit -m "feat(inbox): composer offers only SMS and Email channels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Remove the social + campaign calendar streams

**Files:**
- Modify: `src/lib/calendarModel.ts:7` (`CalendarSource`), `:30-58` (`CALENDAR_SOURCE_META`), `:60-65` (`CALENDAR_SOURCE_ORDER`)
- Modify: `src/lib/calendarDemo.ts` (remove `DEMO_SOCIAL` and `DEMO_CAMPAIGNS` exported arrays)
- Modify: `src/hooks/useCalendarItems.ts:11-15` (imports), `:38-84` (the two return objects)
- Modify: `src/index.css:221-224` and `:270-273` (the `--source-social*` / `--source-campaign*` vars)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CalendarSource = "appointment" | "job"`. `CALENDAR_SOURCE_META` and `CALENDAR_SOURCE_ORDER` cover only those two. `useCalendarItems` returns `connected` as `Record<CalendarSource, boolean>` with keys `appointment` and `job` only.

Rationale: in a real (non-demo) session, `useCalendarItems` already never pushes social or campaign items (`connected` is `false` for both), so only demo mode fabricates them. But the legend reads `CALENDAR_SOURCE_ORDER`, which surfaces "Social posts" and "Campaigns" chips to a real client. Both are removed: social is a back-burnered service; campaign is fed by the back-burnered outreach engine.

- [ ] **Step 1: Edit `src/lib/calendarModel.ts`**

a. Line 7 — narrow the union:

```ts
export type CalendarSource = "appointment" | "job";
```

b. Lines 46-51 and 52-57 — delete the `social:` and `campaign:` entries from `CALENDAR_SOURCE_META`, leaving only `appointment` and `job`.

c. Lines 60-65 — reduce `CALENDAR_SOURCE_ORDER` to:

```ts
export const CALENDAR_SOURCE_ORDER: CalendarSource[] = [
  "appointment",
  "job",
];
```

- [ ] **Step 2: Edit `src/lib/calendarDemo.ts`**

Delete the `DEMO_SOCIAL` and `DEMO_CAMPAIGNS` exported arrays in full. Leave `DEMO_APPOINTMENTS` and any appointment/job demo data intact. (Open the file, find `export const DEMO_SOCIAL` and `export const DEMO_CAMPAIGNS`, and remove each `export const ... = [ ... ];` block entirely.)

- [ ] **Step 3: Edit `src/hooks/useCalendarItems.ts`**

a. Imports (lines 11-15) — drop the removed demo arrays:

```ts
import { DEMO_APPOINTMENTS } from "../lib/calendarDemo";
```

b. Demo return (lines 39-53) — remove the two spreads and the two `connected` keys:

```ts
    if (demo) {
      const jobItems = jobs.map(jobToItem);
      return {
        items: [...DEMO_APPOINTMENTS, ...jobItems],
        timezone: null,
        isLoading: false,
        isError: false,
        error: null,
        connected: { appointment: true, job: true },
      };
    }
```

c. Real return (lines 62-76) — drop the `social`/`campaign` keys from `connected`:

```ts
    return {
      items: [...appts, ...jobItems],
      timezone: tz,
      isLoading: apptQuery.isLoading,
      isError: apptQuery.isError,
      error: (apptQuery.error as Error | null) ?? null,
      // Appointments are the only live stream today; jobs flips on when useJobs
      // returns rows.
      connected: {
        appointment: true,
        job: jobItems.length > 0,
      },
    };
```

d. Update the file's top doc comment (lines 28-32) to drop the "all four streams" / "social + campaigns" phrasing. Replace with:

```ts
// The single source of truth for what shows on the Company calendar. In demo mode
// it returns rich sample data for appointments and jobs. In a real session it
// returns only connected feeds: appointments (live via GHL) plus jobs when
// useJobs is wired.
```

- [ ] **Step 4: Edit `src/index.css`**

Delete these four lines (light theme, 221-224):

```css
  --source-social: #7c3aed;
  --source-social-tint: color-mix(in srgb, #7c3aed 12%, transparent);
  --source-campaign: #d97706;
  --source-campaign-tint: color-mix(in srgb, #d97706 14%, transparent);
```

And these four (dark theme, 270-273):

```css
  --source-social: #c4b5fd;
  --source-social-tint: color-mix(in srgb, #7c3aed 26%, transparent);
  --source-campaign: #fbbf24;
  --source-campaign-tint: color-mix(in srgb, #fbbf24 18%, transparent);
```

- [ ] **Step 5: Typecheck (catches any remaining consumer of the removed sources)**

Run: `pnpm typecheck`
Expected: clean. Any `Record<CalendarSource, ...>` literal or a `switch` on `CalendarSource` elsewhere will error if it still lists `social`/`campaign`; remove those arms. Search: `git grep -n "campaign\|social" src/components/calendar src/lib/calendarModel.ts`. Fix any legend/switch that enumerates the old sources.

- [ ] **Step 6: Run the calendar tests**

Run: `pnpm test src/lib/calendarModel.test.ts src/lib/calendarDemo.test.ts`
Expected: PASS. If a test asserts the presence of `social`/`campaign` sources or demo arrays, update it to the two-source model (assert `CALENDAR_SOURCE_ORDER` equals `["appointment", "job"]` and that demo items are only appointments/jobs).

- [ ] **Step 7: Commit**

```bash
git add src/lib/calendarModel.ts src/lib/calendarDemo.ts src/hooks/useCalendarItems.ts src/index.css
git commit -m "feat(calendar): drop social + campaign streams (back-burnered)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Clean the All-features grid + final sweep and verification

**Files:**
- Modify: `src/routes/AllFeatures.tsx:13-39` (the `GROUPS` route list)

**Interfaces:**
- Consumes: nothing new.
- Produces: `GROUPS` "Get customers" routes contain no back-burnered or dead routes.

- [ ] **Step 1: Edit the `GROUPS` "Get customers" routes**

Replace the "Get customers" routes array (lines 16-22) with only the four live marketing routes (drop `/marketing/campaigns` and `/marketing/social`, both stale):

```ts
    routes: [
      "/marketing/paid-ads",
      "/marketing/reviews",
      "/marketing/website",
      "/marketing/reactivation",
    ],
```

(The grid already filters by `byRoute`, derived from `flattenNav(NAV)`, so hidden routes drop out automatically; this removes the dead strings so the source reads honestly and matches the four services.)

- [ ] **Step 2: Final client-facing sweep (verify nothing else surfaces the hidden services)**

Run each grep from `command-center/app`:

```bash
git grep -n -i "social\|instagram\|facebook\|messenger\|group outreach\|commercial outreach" -- src ":!src/routes/admin" ":!src/components/comms" ":!src/routes/social" ":!src/routes/outreach" ":!src/routes/groups" ":!src/lib/pageTabs.ts" ":!*.test.ts"
```

Expected remaining matches are only legitimate kept-service references (e.g. the Paid Ads `facebook ad`/`instagram ad` source detection, ad-preview components that render a client's own FB/IG ad). For any match that is a user-visible label, card, link, or copy implying Hauck offers social/outreach/groups, remove or repoint it. If a match is ambiguous, stop and ask Jake rather than guessing.

- [ ] **Step 3: Full typecheck + test suite**

Run: `pnpm typecheck && pnpm test`
Expected: both clean/green.

- [ ] **Step 4: Verify the running app (per finish-page flow)**

Build and drive the app; confirm with your own eyes:
- Desktop sidebar Marketing shows exactly: Paid Ads, Website, Google Reviews, Reactivation.
- Phone `/apps` grid "Get customers" shows the same four (no Social tile).
- Inbox source filter has no "Social DM"; composer offers only SMS/Email.
- Company calendar legend shows only Appointment + Job (no Social posts / Campaigns).
- Deep-link `/marketing/social` directly: the page still renders (route intact), proving nothing was deleted.

Use the `run` skill (or `pnpm dev`) to launch, and take screenshots of the sidebar, `/apps`, inbox, and calendar as evidence.

- [ ] **Step 5: Commit**

```bash
git add src/routes/AllFeatures.tsx
git commit -m "feat(apps): all-features grid lists only the four sold services

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Nav → four services: Task 1. ✓
- Keep routes registered (no 404, one-line re-enable): Task 1 Step 3 comment + not touching `App.tsx`; verified Task 5 Step 4. ✓
- Inbox SMS + email, drop Social DM, keep paid FB/IG-ad detection: Task 2. ✓
- Server mirror `origin.ts` in sync: Task 2 Step 4. ✓
- Composer no FB/IG/WhatsApp/GMB: Task 3. ✓
- Calendar social stream removed: Task 4 (also campaign, with rationale). ✓
- All-features grid / global search auto-update + dead-string cleanup: Task 5 Step 1. ✓
- Reference sweep across client surfaces: Task 5 Step 2. ✓
- Home/Today/Dashboard + Tour: confirmed clean during planning (no social/outreach/groups refs found), so no task needed; the Task 5 Step 2 grep is the backstop. ✓
- Tests updated + green, typecheck clean: Tasks 1-5. ✓
- Out of scope (admin, internal Chat, hidden pages' pageTabs): honored via Global Constraints + scoped grep. ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact content. ✓

**Type consistency:** `OriginKey` reduced to the same six members in both mirror files (Task 2). `CalendarSource` reduced to `"appointment" | "job"` and every consumer (`CALENDAR_SOURCE_META`, `CALENDAR_SOURCE_ORDER`, `useCalendarItems.connected`) updated to match (Task 4). Nav routes used in tests (Task 1) match the routes written into `nav.ts`. ✓

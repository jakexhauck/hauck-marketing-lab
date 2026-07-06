# Leads Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-tab Leads section (New Leads hub + Pipeline) with three purpose-built pages: Pipeline (default), Organic (estimate-form + chat lists), and Paid Ads (a simple ad-lead list).

**Architecture:** Pure client-side restructure of the command-center React app. The existing `useLeadsHub()` feed already tags each lead with `source` (`ad`/`form`/`chat`) and a `contactId`, so the split is client-side filtering. Two new list-only route pages hand off to surfaces that already exist (the unified Inbox at `/conversations/:contactId`, and the lead detail at `/lead/:id`). The old two-pane `LeadsHub` is deleted.

**Tech Stack:** React 18 + TypeScript, React Router, TanStack Query, Tailwind (CSS-var design tokens), Vitest.

## Global Constraints

- Client-facing copy rules: never name GoHighLevel/GHL in UI. No em dashes anywhere (chat, copy, UI, docs, comments). Use commas/periods/parentheses/colons.
- Tailwind token classes in use: `text-text`, `text-muted`, `text-faint`, `bg-surface`, `bg-surface-2`, `border-border`, `border-divider`, `font-display`. CSS vars: `--brand`, `--warning`, `--positive`, `--faint`.
- Run tests from `command-center/app`: `npm run test`. Typecheck: `npm run typecheck`. Build: `npm run build`.
- Follow existing patterns: pages render inside `<Shell>`, list pages use `PAGE_CONTAINER`, section sub-nav is `<PageTabs tabs={LEADS_TABS} />`.
- Data hook `useLeadsHub()` returns `{ leads: HubLead[]; demo: boolean }` and handles demo vs real internally. Pages must not call the API directly.

---

### Task 1: Source-filter helpers on `leadsHub.ts`

Add two pure, testable helpers that partition the hub feed by source, so the new pages (and their tests) never inline the filter logic.

**Files:**
- Modify: `command-center/app/src/lib/leadsHub.ts` (append after `newCount`, end of file ~line 385)
- Test: `command-center/app/src/lib/leadsHub.test.ts` (create)

**Interfaces:**
- Consumes: existing `HubLead` type and `LeadSource` from the same file.
- Produces:
  - `organicLeads(leads: HubLead[]): HubLead[]` — keeps `source === "form" || source === "chat"`, preserves input order.
  - `paidAdsLeads(leads: HubLead[]): HubLead[]` — keeps `source === "ad"`, preserves input order.

- [ ] **Step 1: Write the failing test**

Create `command-center/app/src/lib/leadsHub.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { organicLeads, paidAdsLeads, type HubLead } from "./leadsHub";

// Minimal HubLead factory: only the fields the filters read.
function lead(id: string, source: HubLead["source"]): HubLead {
  return {
    id,
    name: id,
    source,
    status: "new",
    intent: "",
    preview: "",
    when: "",
    wait: "",
    phone: "",
    location: "",
    zip: "",
    ad: "",
    sms: [],
  };
}

const sample: HubLead[] = [
  lead("a1", "ad"),
  lead("f1", "form"),
  lead("c1", "chat"),
  lead("a2", "ad"),
  lead("f2", "form"),
];

describe("organicLeads", () => {
  it("keeps only form and chat leads, in original order", () => {
    expect(organicLeads(sample).map((l) => l.id)).toEqual(["f1", "c1", "f2"]);
  });
  it("returns empty when there are no organic leads", () => {
    expect(organicLeads([lead("a1", "ad")])).toEqual([]);
  });
});

describe("paidAdsLeads", () => {
  it("keeps only ad leads, in original order", () => {
    expect(paidAdsLeads(sample).map((l) => l.id)).toEqual(["a1", "a2"]);
  });
  it("returns empty when there are no ad leads", () => {
    expect(paidAdsLeads([lead("f1", "form")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npx vitest run src/lib/leadsHub.test.ts`
Expected: FAIL with `organicLeads is not a function` / import error (helpers not defined yet).

- [ ] **Step 3: Write minimal implementation**

Append to `command-center/app/src/lib/leadsHub.ts`:

```ts
// Partition the merged hub feed by channel for the Leads sub-pages. Pure filters
// that preserve input order (the feed is already newest-first).
export function organicLeads(leads: HubLead[]): HubLead[] {
  return leads.filter((l) => l.source === "form" || l.source === "chat");
}

export function paidAdsLeads(leads: HubLead[]): HubLead[] {
  return leads.filter((l) => l.source === "ad");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd command-center/app && npx vitest run src/lib/leadsHub.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/leadsHub.ts command-center/app/src/lib/leadsHub.test.ts
git commit -m "feat(leads): add organicLeads/paidAdsLeads source filters"
```

---

### Task 2: Paid Ads list page

A simple, list-only page of ad leads. Each row opens the full lead detail. No conversation pane, no sequence tracker.

**Files:**
- Create: `command-center/app/src/routes/sales/LeadsPaidAds.tsx`

**Interfaces:**
- Consumes: `useLeadsHub()` from `../../hooks/useLeadsHub`; `paidAdsLeads`, `STATUS_META`, types `HubLead`, `LeadStatus` from `../../lib/leadsHub`; `NotConnectedNotice` from `./shared`; `LEADS_TABS` from `../../lib/pageTabs`.
- Produces: default export `LeadsPaidAds` (a route element). Route wired in Task 5.

- [ ] **Step 1: Write the page**

Create `command-center/app/src/routes/sales/LeadsPaidAds.tsx`:

```tsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, ChevronRight, Zap } from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import Avatar from "../../components/Avatar";
import { cn } from "../../lib/cn";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import {
  paidAdsLeads,
  STATUS_META,
  type LeadStatus,
} from "../../lib/leadsHub";
import { NotConnectedNotice } from "./shared";

// Status pill colour. Booked uses a fixed sky so it reads apart from brand indigo.
const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "var(--brand)",
  working: "var(--warning)",
  booked: "#0284c7",
  won: "var(--positive)",
  cold: "var(--faint)",
};

function StatusPill({ status }: { status: LeadStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {STATUS_META[status].label}
    </span>
  );
}

// Every lead that came through paid ads. A plain roster: click a row to open the
// full lead detail and work it. No inline conversation or follow-up tracker.
export default function LeadsPaidAds() {
  const navigate = useNavigate();
  const { leads } = useLeadsHub();
  const ads = useMemo(() => paidAdsLeads(leads), [leads]);

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageTabs tabs={LEADS_TABS} />
        <header className="mb-4">
          <h1 className="font-display text-[19px] font-semibold text-text">Paid Ads</h1>
          <p className="mt-1 text-[13px] text-muted">
            Every lead that came through your paid ads.
          </p>
        </header>

        {ads.length === 0 ? (
          <>
            <div className="mb-5">
              <NotConnectedNotice message="Leads from your paid ads land here automatically once your ad accounts and phone are connected." />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-faint">
                <Zap size={22} />
              </div>
              <p className="mt-3 font-display text-[15px] text-text">No ad leads yet</p>
              <p className="mt-1 max-w-xs text-[13px] text-muted">
                When someone responds to one of your ads, they show up here ready to work.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-display text-sm font-bold text-text">Leads</span>
              <span className="text-[13px] font-semibold text-faint">{ads.length} leads</span>
            </div>
            <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
              {ads.map((lead, i) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/lead/${lead.id}`)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2",
                      i === ads.length - 1 ? "" : "border-b border-divider",
                    )}
                  >
                    <Avatar name={lead.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14.5px] font-bold text-text">
                        {lead.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-faint">
                        <Megaphone size={12} className="shrink-0" />
                        <span className="truncate">{lead.ad}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-faint">{lead.when}</span>
                    <StatusPill status={lead.status} />
                    <ChevronRight size={16} className="shrink-0 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS (no type errors). The page is not yet routed, so it is unreachable but must compile.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/sales/LeadsPaidAds.tsx
git commit -m "feat(leads): add Paid Ads list page"
```

---

### Task 3: Organic list page (Estimate Forms + Chat sub-tabs)

A list-only page with two internal sub-tabs. Each row opens the unified Inbox at that conversation.

**Files:**
- Create: `command-center/app/src/routes/sales/LeadsOrganic.tsx`

**Interfaces:**
- Consumes: `useLeadsHub()`; `organicLeads`, `isNew`, `SOURCE_META`, type `HubLead` from `../../lib/leadsHub`; `NotConnectedNotice` from `./shared`; `LEADS_TABS`; `cn`; `PAGE_CONTAINER`.
- Produces: default export `LeadsOrganic` (a route element). Route wired in Task 5.
- Handoff: row click navigates to `/conversations/${lead.contactId}` when a `contactId` exists, else `/conversations` (demo rows carry no contactId).

- [ ] **Step 1: Write the page**

Create `command-center/app/src/routes/sales/LeadsOrganic.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, MessagesSquare, ChevronRight, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import Avatar from "../../components/Avatar";
import { cn } from "../../lib/cn";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import { organicLeads, isNew, SOURCE_META, type HubLead } from "../../lib/leadsHub";
import { NotConnectedNotice } from "./shared";

type Sub = "form" | "chat";

const SUB_META: Record<
  Sub,
  { label: string; icon: LucideIcon; accent: string; newLabel: string }
> = {
  form: {
    label: "Estimate Forms",
    icon: Inbox,
    accent: SOURCE_META.form.accent,
    newLabel: "New submissions",
  },
  chat: {
    label: "Chat",
    icon: MessagesSquare,
    accent: SOURCE_META.chat.accent,
    newLabel: "New chats",
  },
};

// Website-owned leads: estimate-form requests and chat-widget conversations, split
// into two sub-tabs. A list only: clicking a lead opens the unified Inbox with that
// conversation selected, where you reply by SMS or email.
export default function LeadsOrganic() {
  const navigate = useNavigate();
  const { leads } = useLeadsHub();
  const organic = useMemo(() => organicLeads(leads), [leads]);
  const [sub, setSub] = useState<Sub>("form");

  const forSub = organic.filter((l) => l.source === sub);
  const fresh = forSub.filter(isNew);
  const rest = forSub.filter((l) => !isNew(l));

  function openInInbox(lead: HubLead) {
    navigate(lead.contactId ? `/conversations/${lead.contactId}` : "/conversations");
  }

  const formNew = organic.filter((l) => l.source === "form" && isNew(l)).length;
  const chatNew = organic.filter((l) => l.source === "chat" && isNew(l)).length;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageTabs tabs={LEADS_TABS} />
        <header className="mb-4">
          <h1 className="font-display text-[19px] font-semibold text-text">Organic</h1>
          <p className="mt-1 text-[13px] text-muted">
            Estimate-form requests and website chats from your own channels.
          </p>
        </header>

        {organic.length === 0 ? (
          <>
            <div className="mb-5">
              <NotConnectedNotice message="Estimate-form and website-chat leads land here automatically once your website forms and phone are connected." />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-faint">
                <Zap size={22} />
              </div>
              <p className="mt-3 font-display text-[15px] text-text">No organic leads yet</p>
              <p className="mt-1 max-w-xs text-[13px] text-muted">
                When someone fills out a form or messages your chat widget, they show up here.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Sub-tabs */}
            <div className="mb-4 inline-flex gap-1 rounded-[13px] bg-surface-2 p-1">
              {(["form", "chat"] as Sub[]).map((s) => {
                const meta = SUB_META[s];
                const Icon = meta.icon;
                const n = s === "form" ? formNew : chatNew;
                const on = sub === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSub(s)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-[9px] px-3.5 py-2 font-display text-[13.5px] font-semibold transition-colors",
                      on ? "bg-surface text-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-text",
                    )}
                  >
                    <span
                      className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md text-white"
                      style={{ background: meta.accent }}
                    >
                      <Icon size={12} />
                    </span>
                    {meta.label}
                    {n > 0 && (
                      <span className="rounded-full bg-brand-tint px-1.5 text-[11px] font-bold tabular-nums text-brand-text">
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* List */}
            <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
              {fresh.length > 0 && (
                <GroupLabel text={`${SUB_META[sub].newLabel} · ${fresh.length}`} />
              )}
              {fresh.map((l) => (
                <OrganicRow key={l.id} lead={l} onClick={() => openInInbox(l)} />
              ))}
              {rest.length > 0 && <GroupLabel text={`Earlier · ${rest.length}`} />}
              {rest.map((l) => (
                <OrganicRow key={l.id} lead={l} onClick={() => openInInbox(l)} />
              ))}
              {forSub.length === 0 && (
                <p className="px-5 py-10 text-center text-[13px] text-faint">
                  All caught up here.
                </p>
              )}
            </ul>

            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-brand/15 bg-brand-tint px-3.5 py-3 text-[12px] text-muted">
              <Zap size={15} className="mt-px shrink-0 text-brand-text" />
              <span>
                Clicking a lead opens your Inbox with that conversation selected, where you reply by SMS or email.
              </span>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function GroupLabel({ text }: { text: string }) {
  return (
    <div className="border-b border-divider bg-surface px-[18px] pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-faint">
      {text}
    </div>
  );
}

function OrganicRow({ lead, onClick }: { lead: HubLead; onClick: () => void }) {
  const preview = lead.source === "chat" ? `“${lead.preview}”` : lead.intent || lead.preview;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 border-b border-divider px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-2"
      >
        <Avatar name={lead.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[14px] font-semibold text-text">
              {lead.name}
            </span>
            {isNew(lead) && (
              <span className="shrink-0 rounded-[5px] bg-brand-tint px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-brand-text">
                New
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">{preview}</p>
          {lead.location && (
            <div className="mt-0.5 text-[11px] text-faint">
              {lead.location}
              {lead.zip ? `, ${lead.zip}` : ""}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[11px] text-faint">{lead.when}</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-text">
            Open in Inbox <ChevronRight size={13} />
          </span>
        </div>
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS. If `LucideIcon` import errors, confirm it is exported from `lucide-react` (it is in this project's version); otherwise type the icon field as `typeof Inbox`.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/sales/LeadsOrganic.tsx
git commit -m "feat(leads): add Organic list page with Estimate Forms and Chat sub-tabs"
```

---

### Task 4: Show the section tab bar on the mobile Pipeline page

The Pipeline page (`Leads.tsx`) renders the tab bar only on desktop (via `LeadsDesktop`). Add it to the mobile layout so all three tabs are reachable on a phone.

**Files:**
- Modify: `command-center/app/src/routes/Leads.tsx` (imports near top; mobile scroll container ~line 189)

**Interfaces:**
- Consumes: `PageTabs` and `LEADS_TABS` (add imports).
- Produces: no new exports; visual/nav change only.

- [ ] **Step 1: Add imports**

In `command-center/app/src/routes/Leads.tsx`, after the existing `import Board from "../components/Board";` line, add:

```tsx
import PageTabs from "../components/PageTabs";
import { LEADS_TABS } from "../lib/pageTabs";
```

- [ ] **Step 2: Render the tabs at the top of the mobile scroll area**

Find this block (~line 189):

```tsx
      <div className="flex-1 overflow-y-auto pb-28">
        {/* List / Board view toggle */}
        <div className="flex justify-end px-5 pt-4">
```

Insert the tab bar as the first child of the scroll container, immediately before the `List / Board view toggle` comment:

```tsx
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="px-5 pt-3">
          <PageTabs tabs={LEADS_TABS} />
        </div>
        {/* List / Board view toggle */}
        <div className="flex justify-end px-5 pt-4">
```

- [ ] **Step 3: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/routes/Leads.tsx
git commit -m "feat(leads): show section tabs on the mobile Pipeline page"
```

---

### Task 5: Rewire routes and tabs; delete the old hub

Point the section root at Pipeline, add the two new routes, update `LEADS_TABS`, fix redirects, and delete `LeadsHub.tsx`.

**Files:**
- Modify: `command-center/app/src/lib/pageTabs.ts:68-73` (LEADS_TABS)
- Modify: `command-center/app/src/App.tsx` (imports ~line 13; routes ~line 269-292; redirect ~line 451)
- Delete: `command-center/app/src/routes/sales/LeadsHub.tsx`

**Interfaces:**
- Consumes: `LeadsOrganic` (Task 3), `LeadsPaidAds` (Task 2), existing `Leads`.
- Produces: routes `/sales/leads` (Pipeline), `/sales/leads/organic`, `/sales/leads/paid-ads`.

- [ ] **Step 1: Update LEADS_TABS**

In `command-center/app/src/lib/pageTabs.ts`, replace the `LEADS_TABS` block (lines 68-73) with:

```ts
export const LEADS_TABS: PageTab[] = [
  // Pipeline is the interactive board (drag stages, mark won/lost) and the section
  // default. Organic = website form + chat leads. Paid Ads = ad leads. All three
  // live under /sales/leads so the single "Leads" sidebar row stays highlighted.
  { to: "/sales/leads", label: "Pipeline", end: true },
  { to: "/sales/leads/organic", label: "Organic" },
  { to: "/sales/leads/paid-ads", label: "Paid Ads" },
];
```

- [ ] **Step 2: Swap the page imports in App.tsx**

In `command-center/app/src/App.tsx`, replace the import line (~line 13):

```tsx
import LeadsHub from "./routes/sales/LeadsHub";
```

with:

```tsx
import LeadsOrganic from "./routes/sales/LeadsOrganic";
import LeadsPaidAds from "./routes/sales/LeadsPaidAds";
```

- [ ] **Step 3: Rewire the route block**

Replace the block at lines 269-292 (from the `/leads` redirect comment through the three `/sales/forms|chat|paid-ads` redirects) with:

```tsx
              {/* The old standalone /leads board now lands on the Pipeline tab. */}
              <Route path="/leads" element={<Navigate to="/sales/leads" replace />} />
              {/* Section root = Pipeline (the interactive board), the default tab. */}
              <Route
                path="/sales/leads"
                element={
                  <ProtectedRoute>
                    <Leads />
                  </ProtectedRoute>
                }
              />
              {/* Organic = website estimate-form + chat leads (list only). */}
              <Route
                path="/sales/leads/organic"
                element={
                  <ProtectedRoute>
                    <LeadsOrganic />
                  </ProtectedRoute>
                }
              />
              {/* Paid Ads = ad leads (simple list). */}
              <Route
                path="/sales/leads/paid-ads"
                element={
                  <ProtectedRoute>
                    <LeadsPaidAds />
                  </ProtectedRoute>
                }
              />
              {/* Old paths fold into the new pages. */}
              <Route path="/sales/leads/pipeline" element={<Navigate to="/sales/leads" replace />} />
              <Route path="/sales/forms" element={<Navigate to="/sales/leads/organic" replace />} />
              <Route path="/sales/chat" element={<Navigate to="/sales/leads/organic" replace />} />
              <Route path="/sales/paid-ads" element={<Navigate to="/sales/leads/paid-ads" replace />} />
```

- [ ] **Step 4: Update the two other redirects to the old pipeline path**

Search `command-center/app/src/App.tsx` for `"/sales/leads/pipeline"`. Two `Navigate` targets remain (the `/sales/overview` retire line and there may be others). Update each to `"/sales/leads"`:

- `<Route path="/sales/overview" element={<Navigate to="/sales/leads/pipeline" replace />} />` becomes `to="/sales/leads"`.

Then find `"/sales/leads?source=ads"` (~line 451):

```tsx
<Route path="/marketing/paid-ads/leads" element={<Navigate to="/sales/leads?source=ads" replace />} />
```

change to:

```tsx
<Route path="/marketing/paid-ads/leads" element={<Navigate to="/sales/leads/paid-ads" replace />} />
```

- [ ] **Step 5: Delete the old hub**

```bash
git rm command-center/app/src/routes/sales/LeadsHub.tsx
```

- [ ] **Step 6: Verify no dangling references**

Run: `cd command-center/app && grep -rn "LeadsHub\|sales/leads/pipeline\|source=ads" src --include=*.ts --include=*.tsx`
Expected: no matches in `App.tsx`, `pageTabs.ts`, or any route file (only `useLeadsHub` hook name and `/api/sales/leads` API strings, which are unrelated, may appear). If a real reference remains, fix it.

- [ ] **Step 7: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS (LeadsHub deletion leaves no broken import; `leadsHub.ts` lib is untouched).

- [ ] **Step 8: Commit**

```bash
git add command-center/app/src/App.tsx command-center/app/src/lib/pageTabs.ts
git commit -m "feat(leads): route Pipeline/Organic/Paid Ads tabs; retire New Leads hub"
```

---

### Task 6: Full verification (build, tests, manual smoke)

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `cd command-center/app && npm run test`
Expected: PASS, including `src/lib/leadsHub.test.ts` and the existing `src/lib/nav.test.ts`.

- [ ] **Step 2: Typecheck + production build**

Run: `cd command-center/app && npm run build`
Expected: `tsc` clean, `vite build` succeeds with no errors.

- [ ] **Step 3: Manual smoke in the dev server (demo mode)**

Run: `cd command-center/app && npm run dev`, then in the browser open the app with `?demo=1` and:
  - Go to Leads. Confirm it lands on **Pipeline** by default and the board renders. On a narrow window confirm the `Pipeline / Organic / Paid Ads` tab bar shows.
  - Click **Organic**. Confirm two sub-tabs (Estimate Forms, Chat), grouped New / Earlier, and each row shows "Open in Inbox". Click a row (demo) and confirm it navigates to `/conversations` without error.
  - Click **Paid Ads**. Confirm the simple list (name, ad, timestamp, status pill). Click a row and confirm it navigates to `/lead/:id`.
  - Visit `/sales/leads/pipeline`, `/sales/forms`, `/sales/chat`, `/sales/paid-ads`, `/marketing/paid-ads/leads` and confirm each redirects to the right new page.

- [ ] **Step 4: Commit any smoke-test fixes**

If the smoke test surfaced a fix, commit it with a `fix(leads): ...` message. Otherwise nothing to commit.

---

## Notes for the implementer

- This is UI-only. Do not touch `/api/sales/leads`, the demo handlers, or `buildLeadsHub`/`mapApiSalesLead`.
- Real leads always carry a `contactId`; demo rows do not. The Organic row-click guards on that (`/conversations/${contactId}` vs `/conversations`).
- The retired hub's booking flow (SlotPickerModal / DateTimeModal) is intentionally dropped from the leads worklist per the approved spec. Those modals stay in the tree for other callers; do not delete them.
- Keep copy free of GHL naming and em dashes.

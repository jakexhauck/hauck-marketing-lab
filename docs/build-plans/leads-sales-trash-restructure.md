# Leads: Sales / Trash / Organic / Paid Ads Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the client app's Leads section into four tabs (Sales, Trash, Organic, Paid Ads) that share one header, bound to the client's real, newly-consolidated GoHighLevel pipelines, and replace the lead detail page with a chat-first page whose one-touch action buttons map to real actions.

**Architecture:** The GHL account was consolidated to a single **Sales** pipeline (all leads, every stage) plus a **Trash** pipeline (dead leads); the old Organic and Paid Ad's pipelines no longer exist. Sales and Trash tabs render the existing `<Board>` against those two pipelines, resolved BY NAME per tenant. Organic and Paid Ads tabs are source-filtered slices of the Sales pipeline, served by repointing the existing `/api/sales/leads` feed to read the one Sales pipeline and tag each opportunity's source. Every Leads page adopts the shared `<PageBar>` header the Marketing sections already use, which removes the header jump between tabs. The lead page becomes a chat-primary layout reusing the already-wired conversation stack.

**Tech Stack:** React 18 + TypeScript, React Router, TanStack Query, Tailwind (CSS-var design tokens), Cloudflare Pages Functions, Vitest.

## Global Constraints

- Never name GoHighLevel / GHL in any client-facing UI copy.
- Never use em dashes anywhere: code, comments, UI copy. Use commas, periods, parentheses, or colons.
- Client app only: `command-center/app` (package `client-dashboard`).
- Do NOT invent new GHL writes beyond the existing move/won/lost/stage endpoints. "Pages before automations" standing rule holds.
- Pipelines resolve BY NAME per tenant (ids differ per cloned account), exact match first then contains, hardcoded id only as last-resort fallback. Mirror `functions/api/sales/leads/index.ts` `resolve()`.
- Live pipeline facts (Willis, location `OznT3yyuwK3dqVXDsCaD`, verified 2026-07-07):
  - **Sales** id `6o9Gx6e0TXRFJdln5d01`; stages: Missed Call - CONTACT, Lead In, Lead Responded, Estimate Scheduled, Estimate Completed, Job Booked, Job Completed, Follow Up, Intro Call Confirmed, No-Close, Abandoned.
  - **Trash** id `TtKcHZeAtljinJik9kK5`; stages: No Anwser (sic), No Close, Opted Out, Lead In No Call Booked, Intro Call No Show.
  - `source` on opportunities is populated (confirmed value: `"Chat Widget"`). Forms carry `"Website Form"`; ads are Meta-stamped (per `docs/connections/leads.md`).
- Commands (run from `command-center/app`): typecheck `npm run typecheck`; test `npm run test`; build `npm run build`.
- Tailwind token classes in use: `text-text`, `text-muted`, `text-faint`, `bg-surface`, `bg-surface-2`, `border-border`, `border-divider`, `font-display`. CSS vars: `--brand-primary`, `--brand`, `--positive`, `--warning`, `--danger`, `--surface`, `--border`, `--text`, `--radius-lg`, `--grad-brand`, `--shadow-sm/md/lg`.

## Definition of done

- Leads section shows tabs `Sales | Trash | Organic | Paid Ads` on every Leads page, on the shared `<PageBar>` header, identical chrome on mobile and desktop. No header jump switching tabs.
- Sales tab = the Sales pipeline board; Trash tab = the Trash pipeline board; both resolve BY NAME with the verified id fallbacks.
- Organic tab = side-by-side Estimate Forms | Chat Widget lists (Variant A), source-filtered from the Sales feed.
- Paid Ads tab = ad-source roster list (Variant A).
- `/lead/:id` renders the chat-primary page (Variant A) on desktop and mobile, replacing the old NavyHero detail; the touch actions Call, Text, Email, Mark Won, Move Stage each perform their real action.
- `/api/sales/leads` reads the single Sales pipeline and tags source ad/form/chat; unit-tested source classifier.
- Old routes redirect; nav + pipeline resolution unit-tested; typecheck, tests, and build pass; verified live in Jake's browser.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Tabs | `Sales / Trash / Organic / Paid Ads`, Sales default, all on `<PageBar>`. |
| Pipelines | One consolidated Sales pipeline + a Trash pipeline; Organic/Paid Ads are source slices of Sales. |
| Pipeline board style | Variant A classic kanban (reuse `<Board>`), same for Sales and Trash. |
| Organic layout | Variant A side-by-side (Forms left, Chat right), distinct row styles. |
| Lead page | Variant A chat-primary + action rail; REPLACES the old `/lead/:id` detail on desktop and mobile. |
| Trash naming | Keep "Trash" (Jake's word) in client UI. |
| Inline chat WIP | Fold in: the existing `LeadChatModal`/`useLeadUnread`/`leadChat.ts` on `Board.tsx` stay; the lead page reuses the same conversation stack. |

---

## File Structure

**Create:**
- `src/lib/leadPipelines.ts` — pure resolver: pick the Sales / Trash pipeline from the tenant's pipeline list BY NAME with id fallbacks. Fully unit-tested.
- `src/lib/leadPipelines.test.ts` — Vitest tests for the resolver.
- `src/hooks/useLeadPipeline.ts` — thin React hook: reads `usePipelinesQuery`, returns the resolved Sales or Trash `ApiPipelineSummary` (or null) for the current tenant.
- `src/routes/sales/LeadsPipelinePage.tsx` — shared board page (Shell + PAGE_CONTAINER + PageBar + `<Board>`), parameterized by pipeline kind ("sales" | "trash"). Serves both the Sales and Trash tabs.
- `src/components/leads/LeadActionRail.tsx` — the one-touch action buttons row (Call / Text / Email / Mark Won / Move Stage), wired to real handlers.
- `src/components/leads/LeadConversationPanel.tsx` — the reusable chat panel (contact header optional + `ConversationThread` + `MessageComposer` in a `ChannelFilterProvider`), extracted so both the lead page and `LeadChatModal` share it.

**Modify:**
- `src/lib/pageTabs.ts` — `LEADS_TABS` becomes the 4-tab set; keep `sectionLabel` returning "Leads".
- `src/App.tsx` — routes: add `/sales/leads/trash`; repoint `/sales/leads` to the new Sales page; keep redirects.
- `functions/api/sales/leads/index.ts` — read the single Sales pipeline, tag source via a shared classifier; drop the two-pipeline merge.
- `functions/api/sales/leads/source.ts` (create) + `.test.ts` — the pure `classifySource` used by the endpoint (extracted so it is unit-testable without a network).
- `src/routes/sales/LeadsOrganic.tsx` — Variant A side-by-side layout on `<PageBar>`.
- `src/routes/sales/LeadsPaidAds.tsx` — put on `<PageBar>` (layout otherwise unchanged).
- `src/routes/LeadDetail.tsx` — replace the phone NavyHero body with the chat-primary Variant A; desktop keeps delegating to `LeadDetailDesktop` (updated similarly).
- `src/components/leads/LeadDetailDesktop.tsx` — chat-primary two-column layout with the action rail.
- `src/components/LeadChatModal.tsx` — reuse the extracted `LeadConversationPanel`.

**Delete (superseded, ship in the same commit as their replacement):**
- `src/routes/Leads.tsx` (the NavyHero mobile + `LeadsDesktop` switcher board) — replaced by `LeadsPipelinePage`.
- `src/components/leads/LeadsDesktop.tsx` — folded into `LeadsPipelinePage`.
- `docs/build-plans/leads-page-redesign.md` and `docs/build-plans/leads-page-redesign-plan.md` — the prior (shipped 2026-07-06) redesign, now superseded by this plan.

---

## Phase 1: Pipeline resolution + 4-tab restructure on PageBar

### Task 1: Pipeline-by-name resolver (`leadPipelines.ts`)

**Files:**
- Create: `command-center/app/src/lib/leadPipelines.ts`
- Test: `command-center/app/src/lib/leadPipelines.test.ts`

**Interfaces:**
- Consumes: `ApiPipelineSummary` from `../lib/api` (`{ id: string; name: string; stages: { id: string; name: string }[] }`).
- Produces:
  - `type LeadPipelineKind = "sales" | "trash"`
  - `resolveLeadPipeline(pipelines: ApiPipelineSummary[], kind: LeadPipelineKind): ApiPipelineSummary | null` — exact name match, then contains, then id fallback (`6o9Gx6e0TXRFJdln5d01` for sales, `TtKcHZeAtljinJik9kK5` for trash).

- [ ] **Step 1: Write the failing test**

```ts
// command-center/app/src/lib/leadPipelines.test.ts
import { describe, it, expect } from "vitest";
import { resolveLeadPipeline } from "./leadPipelines";
import type { ApiPipelineSummary } from "./api";

function pipe(id: string, name: string): ApiPipelineSummary {
  return { id, name, stages: [] };
}

const SALES = pipe("6o9Gx6e0TXRFJdln5d01", "Sales");
const TRASH = pipe("TtKcHZeAtljinJik9kK5", "Trash");
const REVIEWS = pipe("R76ncRGrODiJuDJJTUWR", "Google Reviews");

describe("resolveLeadPipeline", () => {
  it("matches Sales by exact name", () => {
    expect(resolveLeadPipeline([REVIEWS, SALES, TRASH], "sales")?.id).toBe(
      "6o9Gx6e0TXRFJdln5d01",
    );
  });

  it("matches Trash by exact name, case-insensitively", () => {
    expect(
      resolveLeadPipeline([pipe("x", "TRASH"), SALES], "trash")?.id,
    ).toBe("x");
  });

  it("falls back to contains when there is no exact match", () => {
    const p = pipe("y", "Willis Sales Pipeline");
    expect(resolveLeadPipeline([REVIEWS, p], "sales")?.id).toBe("y");
  });

  it("falls back to the known id when name resolution fails", () => {
    const renamed = pipe("6o9Gx6e0TXRFJdln5d01", "Main Board");
    expect(resolveLeadPipeline([REVIEWS, renamed], "sales")?.id).toBe(
      "6o9Gx6e0TXRFJdln5d01",
    );
  });

  it("returns null when nothing matches", () => {
    expect(resolveLeadPipeline([REVIEWS], "trash")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- leadPipelines`
Expected: FAIL ("Cannot find module './leadPipelines'").

- [ ] **Step 3: Write minimal implementation**

```ts
// command-center/app/src/lib/leadPipelines.ts
import type { ApiPipelineSummary } from "./api";

export type LeadPipelineKind = "sales" | "trash";

// Per-kind matchers. Names are matched case-insensitively (exact, then
// contains); the id is the last-resort fallback for the known Willis template
// when a cloned account renames the pipeline.
const MATCH: Record<
  LeadPipelineKind,
  { exact: string; contains: string; fallbackId: string }
> = {
  sales: { exact: "sales", contains: "sales", fallbackId: "6o9Gx6e0TXRFJdln5d01" },
  trash: { exact: "trash", contains: "trash", fallbackId: "TtKcHZeAtljinJik9kK5" },
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Resolve the tenant's Sales or Trash pipeline from its full pipeline list.
export function resolveLeadPipeline(
  pipelines: ApiPipelineSummary[],
  kind: LeadPipelineKind,
): ApiPipelineSummary | null {
  const m = MATCH[kind];
  return (
    pipelines.find((p) => norm(p.name) === m.exact) ??
    pipelines.find((p) => norm(p.name).includes(m.contains)) ??
    pipelines.find((p) => p.id === m.fallbackId) ??
    null
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- leadPipelines`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/leadPipelines.ts command-center/app/src/lib/leadPipelines.test.ts
git commit -m "feat(leads): resolve Sales/Trash pipeline by name with id fallback"
```

---

### Task 2: `useLeadPipeline` hook

**Files:**
- Create: `command-center/app/src/hooks/useLeadPipeline.ts`

**Interfaces:**
- Consumes: `usePipelinesQuery` from `./useApi`, `useAuth` from `../context/AuthContext`, `getMockPipelinesForClient` from `../mock/pipelines`, `useClient` from `../context/ClientContext`, and `resolveLeadPipeline` / `LeadPipelineKind` from `../lib/leadPipelines`.
- Produces: `useLeadPipeline(kind: LeadPipelineKind): { pipeline: ApiPipelineSummary | null; isLoading: boolean; isError: boolean; error: Error | null }`.

**Notes:** No unit test (thin glue over the tested resolver + existing query); verified by typecheck and the board wiring in Task 4. Mirrors how `PipelinesContext` chooses mock vs real by `session`.

- [ ] **Step 1: Write the hook**

```ts
// command-center/app/src/hooks/useLeadPipeline.ts
import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { usePipelinesQuery } from "./useApi";
import { getMockPipelinesForClient } from "../mock/pipelines";
import {
  resolveLeadPipeline,
  type LeadPipelineKind,
} from "../lib/leadPipelines";
import type { ApiPipelineSummary } from "../lib/api";

// The Sales or Trash pipeline for the current tenant, resolved by name. Demo /
// preview sessions use the static mock pipelines so the board renders through
// the same shape as a live session.
export function useLeadPipeline(kind: LeadPipelineKind) {
  const { session } = useAuth();
  const { client } = useClient();
  const useReal = Boolean(session);
  const query = usePipelinesQuery(useReal);

  const pipelines: ApiPipelineSummary[] = useReal
    ? query.data?.pipelines ?? []
    : getMockPipelinesForClient(client.id);

  const pipeline = useMemo(
    () => resolveLeadPipeline(pipelines, kind),
    [pipelines, kind],
  );

  return {
    pipeline,
    isLoading: useReal && query.isLoading,
    isError: useReal && query.isError,
    error: (useReal && (query.error as Error | null)) || null,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `getMockPipelinesForClient` does not return a pipeline named Sales/Trash for a demo client, that is fine (the resolver falls back to the id, and demo Sales still resolves by the fallback id if present); do not change the mock here.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/hooks/useLeadPipeline.ts
git commit -m "feat(leads): useLeadPipeline hook (Sales/Trash by name)"
```

---

### Task 3: 4-tab `LEADS_TABS`

**Files:**
- Modify: `command-center/app/src/lib/pageTabs.ts:68-75`

**Interfaces:**
- Produces: `LEADS_TABS` with four entries; `sectionLabel(LEADS_TABS)` still returns "Leads" (unchanged mapping at `pageTabs.ts:88`).

- [ ] **Step 1: Replace the `LEADS_TABS` array**

Replace the current three-entry array (lines 68-75) with:

```ts
export const LEADS_TABS: PageTab[] = [
  // Sales = the consolidated sales pipeline board (the section default). Trash =
  // the dead-lead pipeline board. Organic = form + chat leads. Paid Ads = ad
  // leads. All four live under /sales/leads so the single "Leads" sidebar row
  // stays highlighted.
  { to: "/sales/leads", label: "Sales", end: true },
  { to: "/sales/leads/trash", label: "Trash" },
  { to: "/sales/leads/organic", label: "Organic" },
  { to: "/sales/leads/paid-ads", label: "Paid Ads" },
];
```

- [ ] **Step 2: Typecheck + existing nav test**

Run: `npm run typecheck && npm run test -- nav`
Expected: PASS. If `nav.test.ts` asserts the old tab labels/paths, update those assertions to the four routes above (the four `to` values must each resolve to a real route after Task 5).

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/lib/pageTabs.ts command-center/app/src/lib/nav.test.ts
git commit -m "feat(leads): Sales/Trash/Organic/Paid Ads tab set"
```

---

### Task 4: Shared board page (`LeadsPipelinePage.tsx`)

**Files:**
- Create: `command-center/app/src/routes/sales/LeadsPipelinePage.tsx`

**Interfaces:**
- Consumes: `Shell`, `PageBar`, `PAGE_CONTAINER` from `../../lib/layout`, `LEADS_TABS` from `../../lib/pageTabs`, `Board` from `../../components/Board`, `useLeadPipeline` (Task 2), `usePipelineLeadsQuery` / `useSummaryQuery` from `../../hooks/useApi`, `NewLeadSheet`, `EmptyState`, `useAuth`, `Button` from `../../components/ui/Button`, `Plus` from `lucide-react`, `formatMoney` from `../../lib/formatMoney`, `ApiLead` from `../../lib/api`.
- Produces: `export default function LeadsPipelinePage({ kind }: { kind: "sales" | "trash" }): JSX.Element`.

**Behavior:** One responsive page (no mobile/desktop split) rendering the section `<PageBar>` (label "Leads", the four tabs, a client-side Search input as a filter, and a "New lead" action) over the `<Board>` for the resolved pipeline. Replaces both the old phone `Leads.tsx` hero/list and `LeadsDesktop`.

- [ ] **Step 1: Write the page**

```tsx
// command-center/app/src/routes/sales/LeadsPipelinePage.tsx
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import Board from "../../components/Board";
import NewLeadSheet from "../../components/NewLeadSheet";
import EmptyState from "../../components/EmptyState";
import { Button } from "../../components/ui/Button";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { formatMoney } from "../../lib/formatMoney";
import { useAuth } from "../../context/AuthContext";
import { useLeadPipeline } from "../../hooks/useLeadPipeline";
import { usePipelineLeadsQuery } from "../../hooks/useApi";
import type { ApiLead } from "../../lib/api";
import type { LeadPipelineKind } from "../../lib/leadPipelines";

const COPY: Record<LeadPipelineKind, string> = {
  sales:
    "Every lead in your sales pipeline. Drag a card to move a stage, or tap a card to open the conversation.",
  trash:
    "Leads that went cold, opted out, or were not a fit. Kept for the record and for reactivation.",
};

export default function LeadsPipelinePage({ kind }: { kind: LeadPipelineKind }) {
  const { session } = useAuth();
  const useReal = Boolean(session);
  const { pipeline, isLoading: pipeLoading } = useLeadPipeline(kind);
  const pipelineId = pipeline?.id ?? null;
  const leadsQuery = usePipelineLeadsQuery(pipelineId, useReal);
  const [search, setSearch] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);

  const stages = pipeline?.stages ?? [];
  const leads: ApiLead[] = useMemo(
    () => leadsQuery.data?.leads ?? [],
    [leadsQuery.data],
  );

  const trimmed = search.trim();
  const visible = useMemo(() => {
    if (!trimmed) return leads;
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D+/g, "");
    return leads.filter((l) => {
      if (l.name.toLowerCase().includes(q)) return true;
      if (l.email.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0 && l.phone.replace(/\D+/g, "").includes(qDigits))
        return true;
      return false;
    });
  }, [leads, trimmed]);

  const openCount = useMemo(
    () => leads.filter((l) => (l.status ?? "open").toLowerCase() === "open").length,
    [leads],
  );
  const openValue = useMemo(
    () =>
      leads.reduce(
        (sum, l) =>
          (l.status ?? "open").toLowerCase() === "open" ? sum + (l.value ?? 0) : sum,
        0,
      ),
    [leads],
  );

  const loading = (useReal && pipeLoading) || leadsQuery.isLoading;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar
          tabs={LEADS_TABS}
          count={kind === "sales" ? `${openCount} open · ${formatMoney(openValue)}` : undefined}
          description={COPY[kind]}
          actions={
            <Button variant="primary" size="sm" onClick={() => setShowNewLead(true)}>
              <Plus size={15} />
              New lead
            </Button>
          }
          filters={
            <label className="relative flex-1 max-w-xs">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or phone"
                aria-label="Search leads"
                className="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
              />
            </label>
          }
        />

        {leadsQuery.isError ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            Could not load this pipeline. {(leadsQuery.error as Error | null)?.message ?? ""}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
          </div>
        ) : !pipeline ? (
          <EmptyState message="This pipeline is not set up yet." />
        ) : stages.length === 0 ? (
          <EmptyState message="This pipeline has no stages yet." />
        ) : (
          <Board leads={visible} stages={stages} pipelineId={pipelineId} />
        )}

        <NewLeadSheet
          open={showNewLead}
          pipeline={pipeline}
          onClose={() => setShowNewLead(false)}
          leadsKey={["leads", "pipeline", pipelineId]}
        />
      </div>
    </Shell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Confirm at edit time: `Button` accepts `size="sm"` (see `AdsCreatives.tsx` usage of the ui Button, or `components/ui/Button.tsx`); `PageBar` accepts `count`, `description`, `actions`, `filters` (see `PageBar.tsx`); `NewLeadSheet` prop names (`open`, `pipeline`, `onClose`, `leadsKey`) match `src/routes/Leads.tsx` current usage. Adjust to the real props, do not add `any`.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/sales/LeadsPipelinePage.tsx
git commit -m "feat(leads): shared Sales/Trash board page on PageBar"
```

---

### Task 5: Wire routes + retire old board files

**Files:**
- Modify: `command-center/app/src/App.tsx` (imports near line 12-14; routes near lines 272-305)
- Delete: `command-center/app/src/routes/Leads.tsx`, `command-center/app/src/components/leads/LeadsDesktop.tsx`

**Interfaces:**
- Consumes: `LeadsPipelinePage` (Task 4).
- Produces: routes `/sales/leads` (Sales), `/sales/leads/trash` (Trash); `/sales/leads/pipeline` still redirects to `/sales/leads`.

- [ ] **Step 1: Swap the import**

Replace `import Leads from "./routes/Leads";` (line 12) with:

```tsx
import LeadsPipelinePage from "./routes/sales/LeadsPipelinePage";
```

- [ ] **Step 2: Repoint the Sales route and add Trash**

Replace the `/sales/leads` route element (lines 275-282) so it renders `<LeadsPipelinePage kind="sales" />`, and add a Trash route directly after it:

```tsx
              {/* Section root = Sales pipeline board (the default tab). */}
              <Route
                path="/sales/leads"
                element={
                  <ProtectedRoute>
                    <LeadsPipelinePage kind="sales" />
                  </ProtectedRoute>
                }
              />
              {/* Trash = the dead-lead pipeline board. */}
              <Route
                path="/sales/leads/trash"
                element={
                  <ProtectedRoute>
                    <LeadsPipelinePage kind="trash" />
                  </ProtectedRoute>
                }
              />
```

Leave the existing `/sales/leads/organic`, `/sales/leads/paid-ads`, `/sales/leads/pipeline` (redirect to `/sales/leads`), `/sales/forms`, `/sales/chat`, `/sales/paid-ads`, and `/sales/overview` routes untouched.

- [ ] **Step 3: Delete the retired files**

```bash
git rm command-center/app/src/routes/Leads.tsx command-center/app/src/components/leads/LeadsDesktop.tsx
```

- [ ] **Step 4: Typecheck + build (catches any dangling import)**

Run: `npm run typecheck && npm run build`
Expected: PASS. If anything still imports `routes/Leads` or `leads/LeadsDesktop`, repoint it to `LeadsPipelinePage`.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/App.tsx
git commit -m "feat(leads): route Sales + Trash board tabs, retire old Leads board"
```

---

## Phase 2: Backend unified feed + source classifier

### Task 6: `classifySource` pure function

**Files:**
- Create: `command-center/app/functions/api/sales/leads/source.ts`
- Test: `command-center/app/functions/api/sales/leads/source.test.ts`

**Interfaces:**
- Produces:
  - `type LeadSource = "ad" | "form" | "chat"`
  - `classifySource(rawSource: string | null | undefined): LeadSource` — "chat" if the source mentions chat; "ad" if it mentions a paid channel (facebook, instagram, meta, paid, fb/ig, "lead ad"); otherwise "form".

- [ ] **Step 1: Write the failing test**

```ts
// command-center/app/functions/api/sales/leads/source.test.ts
import { describe, it, expect } from "vitest";
import { classifySource } from "./source";

describe("classifySource", () => {
  it("classifies chat-widget leads", () => {
    expect(classifySource("Chat Widget")).toBe("chat");
    expect(classifySource("website chat")).toBe("chat");
  });

  it("classifies paid-ad leads", () => {
    expect(classifySource("Facebook")).toBe("ad");
    expect(classifySource("Instagram Lead Ad")).toBe("ad");
    expect(classifySource("paid social")).toBe("ad");
    expect(classifySource("Meta")).toBe("ad");
  });

  it("defaults everything else to a form", () => {
    expect(classifySource("Website Form")).toBe("form");
    expect(classifySource("")).toBe("form");
    expect(classifySource(null)).toBe("form");
    expect(classifySource(undefined)).toBe("form");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- source`
Expected: FAIL ("Cannot find module './source'").

- [ ] **Step 3: Write minimal implementation**

```ts
// command-center/app/functions/api/sales/leads/source.ts

export type LeadSource = "ad" | "form" | "chat";

// Classify a GHL opportunity's `source` string into the client-facing channel.
// Chat wins first (a chat lead could also carry a site name); then paid signals;
// everything else is a form submission. NOTE: the paid-signal list is tuned to
// the known Meta stamps and MUST be re-verified against real ad leads once they
// flow (the test account currently only has Chat Widget leads).
const PAID = ["facebook", "instagram", "meta", "paid", " ad", "lead ad", "fb", "ig"];

export function classifySource(rawSource: string | null | undefined): LeadSource {
  const s = (rawSource ?? "").toLowerCase();
  if (s.includes("chat")) return "chat";
  if (PAID.some((p) => s.includes(p))) return "ad";
  return "form";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- source`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/sales/leads/source.ts command-center/app/functions/api/sales/leads/source.test.ts
git commit -m "feat(leads): source classifier for the unified Sales feed"
```

---

### Task 7: Repoint `/api/sales/leads` to the single Sales pipeline

**Files:**
- Modify: `command-center/app/functions/api/sales/leads/index.ts:13-156`

**Interfaces:**
- Consumes: `classifySource`, `LeadSource` (Task 6); existing `ghlJson`, `fetchAllOpportunities`, `shapeOpportunity`, `GhlOpportunity`, `GhlContext` from `../../../lib/ghl`.
- Produces: same response shape (`{ leads: ApiSalesLead[]; total; configError? }`); `ApiSalesLead` unchanged (`ApiLead & { source; status; stageName }`).

**Behavior:** Resolve the one Sales pipeline BY NAME (exact "sales", then contains "sales", then id `6o9Gx6e0TXRFJdln5d01`), fetch its opportunities, and tag each with `classifySource(o.source)` and the existing `statusForStage`. Remove the Paid + Organic two-pipeline merge. Keep the POST handler as-is.

- [ ] **Step 1: Replace the source constants + `organicSource`**

Delete the `PAID_*` and `ORGANIC_*` constants (lines 22-28) and the `organicSource` function (lines 86-89). Replace the constants block with:

```ts
import { classifySource, type LeadSource } from "./source";

const SALES_NAME = "sales";
const SALES_CONTAINS = "sales";
const SALES_FALLBACK_ID = "6o9Gx6e0TXRFJdln5d01";
```

Remove the now-duplicate local `export type LeadSource` (line 30) in favor of the imported one; keep `export type LeadStatus`.

- [ ] **Step 2: Replace the GET body with a single-pipeline read**

Replace the two `if (paid)` / `if (organic)` blocks and the `paid`/`organic` resolution (lines 116-145) with:

```ts
  const sales = resolve(pipes, SALES_NAME, SALES_CONTAINS, SALES_FALLBACK_ID);

  const leads: ApiSalesLead[] = [];
  if (sales) {
    const opps = await fetchAllOpportunities(gctx, { pipelineId: sales.pipelineId });
    for (const o of opps) {
      const stageName = sales.stageNames.get(o.pipelineStageId ?? "") ?? "";
      leads.push({
        ...shapeOpportunity(o),
        source: classifySource(o.source),
        status: statusForStage(stageName),
        stageName,
      });
    }
  }
```

And update the final return's `configError` guard to `!sales ? "pipeline_not_found" : undefined`.

- [ ] **Step 3: Extend the stage->status map for the consolidated stages**

The Sales pipeline now carries stages the old map did not. Add to `STAGE_STATUS` (near line 65):

```ts
  "missed call - contact": "new",
  "intro call confirmed": "booked",
  "job booked": "booked",
  "job completed": "won",
  "estimate completed": "working",
  "follow up": "working",
  "no-close": "cold",
  "abandoned": "cold",
```

- [ ] **Step 4: Typecheck + run the endpoint's neighbouring tests**

Run: `npm run typecheck && npm run test -- leads`
Expected: PASS. If any test referenced the removed Paid/Organic constants, update it to the single-Sales model.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/sales/leads/index.ts
git commit -m "feat(leads): serve the unified Sales feed, source-tagged per opportunity"
```

---

## Phase 3: Organic side-by-side + Paid Ads on PageBar

### Task 8: Organic side-by-side layout (Variant A) on PageBar

**Files:**
- Modify: `command-center/app/src/routes/sales/LeadsOrganic.tsx`

**Interfaces:**
- Consumes: `Shell`, `PageBar`, `PAGE_CONTAINER`, `LEADS_TABS`, `useLeadsHub`, `organicLeads`, `isNew`, `HubLead`, `SOURCE_META` (existing), `Avatar`, `Inbox`, `MessagesSquare`, `ChevronRight` from `lucide-react`.
- Produces: no new exports; same route default export.

**Behavior:** Replace the standalone `<PageTabs>` + custom `<h1>` header with `<PageBar tabs={LEADS_TABS} description=... />`. Below it, a two-column grid: left column Estimate Forms (form rows), right column Website Chat (chat-bubble rows). Each column is a bordered card with its own header + accent. Clicking a form row opens the Inbox for that contact; clicking a chat row opens the same. On narrow screens the grid collapses to one column (forms then chat).

- [ ] **Step 1: Rewrite the component body**

Replace the whole `LeadsOrganic` return (the `<Shell>...</Shell>` block) with:

```tsx
  const forms = organic.filter((l) => l.source === "form");
  const chats = organic.filter((l) => l.source === "chat");

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar
          tabs={LEADS_TABS}
          description="Estimate-form requests and website chats from your own channels."
        />
        {organic.length === 0 ? (
          <EmptyState message="When someone fills out a form or messages your chat widget, they show up here." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChannelColumn
              title="Estimate Forms"
              subtitle="Structured requests from your site"
              icon={<Inbox size={15} />}
              accent="var(--grad-brand)"
              leads={forms}
              variant="form"
              onOpen={openInInbox}
            />
            <ChannelColumn
              title="Website Chat"
              subtitle="Live conversations from your widget"
              icon={<MessagesSquare size={15} />}
              accent="linear-gradient(135deg,#0d9488,#0284c7)"
              leads={chats}
              variant="chat"
              onOpen={openInInbox}
            />
          </div>
        )}
      </div>
    </Shell>
  );
```

- [ ] **Step 2: Add the `ChannelColumn` + row components at the bottom of the file**

```tsx
function ChannelColumn({
  title,
  subtitle,
  icon,
  accent,
  leads,
  variant,
  onOpen,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  leads: HubLead[];
  variant: "form" | "chat";
  onOpen: (l: HubLead) => void;
}) {
  const fresh = leads.filter(isNew).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: accent }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[14px] font-semibold text-text">{title}</div>
          <div className="text-[11.5px] text-faint">{subtitle}</div>
        </div>
        {fresh > 0 && (
          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand-text">
            {fresh} new
          </span>
        )}
      </header>
      {leads.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-faint">All caught up here.</p>
      ) : (
        <ul>
          {leads.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onOpen(l)}
                className="flex w-full items-start gap-3 border-b border-divider px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
              >
                <Avatar name={l.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-[13.5px] font-semibold text-text">
                      {l.name}
                    </span>
                    {isNew(l) && (
                      <span className="shrink-0 rounded-[5px] bg-brand-tint px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-brand-text">
                        New
                      </span>
                    )}
                  </div>
                  {variant === "chat" ? (
                    <p className="mt-1 inline-block rounded-[4px_12px_12px_12px] bg-surface-2 px-3 py-1.5 text-[12.5px] text-text">
                      {l.preview ? `“${l.preview}”` : "New chat"}
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">
                      {l.intent || l.preview}
                    </p>
                  )}
                  {l.location && (
                    <div className="mt-0.5 text-[11px] text-faint">
                      {l.location}
                      {l.zip ? `, ${l.zip}` : ""}
                    </div>
                  )}
                </div>
                <span className="mt-0.5 shrink-0 text-[11px] text-faint">{l.when}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Update the imports at the top: add `EmptyState` from `../../components/EmptyState`; keep `Inbox`, `MessagesSquare` from lucide-react; drop the now-unused `PageTabs`, `Zap`, `ChevronRight`, `SUB_META`, `cn`, `NotConnectedNotice`, `SOURCE_META`, and the `Sub`/sub-tab state if no longer referenced. Add `import PageBar from "../../components/PageBar";` and `import { LEADS_TABS } from "../../lib/pageTabs";` (keep existing `useLeadsHub`, `organicLeads`, `isNew`, `HubLead`, `Avatar`, `PAGE_CONTAINER`).

Per the "no connected-placeholder chatter" standing rule, the empty state is a single short line (above), not a "your account is connected" notice.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. Remove any import that lint flags as unused.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/routes/sales/LeadsOrganic.tsx
git commit -m "feat(leads): Organic side-by-side Forms | Chat on the shared header"
```

---

### Task 9: Paid Ads list on PageBar

**Files:**
- Modify: `command-center/app/src/routes/sales/LeadsPaidAds.tsx:42-66`

**Interfaces:**
- Consumes: `PageBar`, `LEADS_TABS`; existing `paidAdsLeads`, `useLeadsHub`, `Avatar`, `StatusPill`.
- Produces: no new exports.

**Behavior:** Swap the `<PageTabs>` + custom `<h1>` header for `<PageBar tabs={LEADS_TABS} description=... />`; keep the roster list and the not-connected-free empty state. The list body (lines 68-104) is unchanged.

- [ ] **Step 1: Replace the header block**

Replace the `<PageTabs .../>` line and the `<header className="mb-4">...</header>` block (roughly lines 45-51) with:

```tsx
        <PageBar
          tabs={LEADS_TABS}
          count={ads.length > 0 ? `${ads.length} ${ads.length === 1 ? "lead" : "leads"}` : undefined}
          description="Every lead that came through your paid ads."
        />
```

Swap the empty-state block (lines 53-67) to a single short `EmptyState` line ("When someone responds to one of your ads, they show up here ready to work.") per the no-placeholder-chatter rule, dropping `NotConnectedNotice`. Update imports: add `PageBar`, `LEADS_TABS`, `EmptyState`; drop `PageTabs`, `NotConnectedNotice`, `Zap` if now unused.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/sales/LeadsPaidAds.tsx
git commit -m "feat(leads): Paid Ads roster on the shared header"
```

---

## Phase 4: Lead page redesign (chat-primary + touch actions)

### Task 10: Extract `LeadConversationPanel`

**Files:**
- Create: `command-center/app/src/components/leads/LeadConversationPanel.tsx`
- Modify: `command-center/app/src/components/LeadChatModal.tsx`

**Interfaces:**
- Consumes: `ConversationThread` (`{ leadId, fill? }`), `MessageComposer` (`{ leadId, disabled? }`), `ChannelFilterProvider` from `../../context/ChannelFilterContext`.
- Produces: `export default function LeadConversationPanel({ leadId, hasPhone }: { leadId: string; hasPhone?: boolean }): JSX.Element` — the thread + composer stack in a `ChannelFilterProvider` keyed by leadId, filling its parent height.

- [ ] **Step 1: Write the panel**

```tsx
// command-center/app/src/components/leads/LeadConversationPanel.tsx
import ConversationThread from "../ConversationThread";
import MessageComposer from "../MessageComposer";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";

// The reusable lead conversation stack: thread + channel-aware composer sharing
// one ChannelFilter, keyed by lead id. Used by the lead page and LeadChatModal.
export default function LeadConversationPanel({
  leadId,
  hasPhone = true,
}: {
  leadId: string;
  hasPhone?: boolean;
}) {
  return (
    <ChannelFilterProvider key={leadId}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <ConversationThread leadId={leadId} fill />
        <div className="mt-auto">
          <MessageComposer leadId={leadId} disabled={!hasPhone} />
        </div>
      </div>
    </ChannelFilterProvider>
  );
}
```

- [ ] **Step 2: Use it inside `LeadChatModal`**

In `src/components/LeadChatModal.tsx`, replace the inline `<ChannelFilterProvider>...</ChannelFilterProvider>` block with `<LeadConversationPanel leadId={leadId} hasPhone={hasPhone} />` and drop the now-unused direct imports of `ConversationThread`, `MessageComposer`, `ChannelFilterProvider`. Add `import LeadConversationPanel from "./leads/LeadConversationPanel";`.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. Confirm `ConversationThread` accepts `fill` (it is used with `fill` in `LeadChatModal` today).

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/components/leads/LeadConversationPanel.tsx command-center/app/src/components/LeadChatModal.tsx
git commit -m "refactor(leads): extract LeadConversationPanel shared by modal + page"
```

---

### Task 11: `LeadActionRail` (one-touch actions)

**Files:**
- Create: `command-center/app/src/components/leads/LeadActionRail.tsx`

**Interfaces:**
- Consumes: `Phone`, `MessageSquare`, `Mail`, `CheckCircle2`, `ArrowRightLeft` from `lucide-react`; `e164` from `../../lib/phone`.
- Produces: `export default function LeadActionRail(props: { phone: string; email: string; canWon: boolean; canMove: boolean; onText: () => void; onEmail: () => void; onWon: () => void; onMove: () => void }): JSX.Element` — five touch buttons; Call and Email are `<a href="tel:/mailto:">`, the rest call their handler.

**Behavior:** Call is an `<a href="tel:">` (disabled/omitted when there is no valid phone); Text/Email/Won/Move are buttons. Text sets the composer channel to SMS via `onText`; Email opens `mailto:` AND `onEmail` (to focus the email channel). Won/Move open the existing sheets.

- [ ] **Step 1: Write the rail**

```tsx
// command-center/app/src/components/leads/LeadActionRail.tsx
import { Phone, MessageSquare, Mail, CheckCircle2, ArrowRightLeft } from "lucide-react";
import { e164 } from "../../lib/phone";

interface Props {
  phone: string;
  email: string;
  canWon: boolean;
  canMove: boolean;
  wonLabel: string;
  onText: () => void;
  onEmail: () => void;
  onWon: () => void;
  onMove: () => void;
}

const CELL =
  "flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface px-2 py-3 text-[12px] font-semibold text-text shadow-[var(--shadow-sm)] transition-transform active:scale-[0.97] disabled:opacity-40";

export default function LeadActionRail({
  phone,
  email,
  canWon,
  canMove,
  wonLabel,
  onText,
  onEmail,
  onWon,
  onMove,
}: Props) {
  const tel = e164(phone);
  const hasPhone = tel.replace(/[^0-9]/g, "").length >= 10;
  return (
    <div className="grid grid-cols-5 gap-2">
      <a
        href={hasPhone ? `tel:${tel}` : undefined}
        aria-disabled={!hasPhone}
        className={CELL + (hasPhone ? "" : " pointer-events-none opacity-40")}
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-brand-text">
          <Phone size={18} />
        </span>
        Call
      </a>
      <button type="button" onClick={onText} disabled={!hasPhone} className={CELL}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,#0284c7_12%,transparent)] text-[#0284c7]">
          <MessageSquare size={18} />
        </span>
        Text
      </button>
      <a
        href={email ? `mailto:${email}` : undefined}
        onClick={onEmail}
        aria-disabled={!email}
        className={CELL + (email ? "" : " pointer-events-none opacity-40")}
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,#0d9488_12%,transparent)] text-[#0d9488]">
          <Mail size={18} />
        </span>
        Email
      </a>
      <button type="button" onClick={onWon} disabled={!canWon} className={CELL}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-positive-tint text-positive">
          <CheckCircle2 size={18} />
        </span>
        {wonLabel}
      </button>
      <button type="button" onClick={onMove} disabled={!canMove} className={CELL}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-warning-tint text-warning">
          <ArrowRightLeft size={18} />
        </span>
        Move
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Confirm `e164` exists in `src/lib/phone.ts` (used by `LeadDetail.tsx` today).

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/leads/LeadActionRail.tsx
git commit -m "feat(leads): one-touch action rail (call/text/email/won/move)"
```

---

### Task 12: Chat-primary lead page (phone) in `LeadDetail.tsx`

**Files:**
- Modify: `command-center/app/src/routes/LeadDetail.tsx:281-546`

**Interfaces:**
- Consumes: `LeadActionRail` (Task 11), `LeadConversationPanel` (Task 10); existing `WonSheet`, `MoveStageSheet`, handlers `handleWonSave`, `handleLost`, `handleMove`, `markWon/markLost/moveStage`, `ChannelFilterContext` control for channel.
- Produces: no new exports.

**Behavior:** Replace the phone (`lg:hidden`) body. Top: a compact contact header (avatar, name, stage pill, phone/email links). Then `<LeadActionRail>`. Then the conversation panel fills the rest. The Notes / Tasks / Activity / Attribution sections collapse under a "Details" disclosure below the chat so the page stays chat-first. Text/Email actions set the conversation channel through the existing composer channel control (if a direct setter is not exposed, `onText`/`onEmail` scroll to and focus the composer; wire the real channel setter if `ChannelFilterContext` exposes one).

- [ ] **Step 1: Confirm the channel-setting surface**

Read `src/context/ChannelFilterContext.tsx` and `src/components/MessageComposer.tsx`. If `ChannelFilterProvider` exposes a `setChannel`, thread it into `LeadConversationPanel` so `onText`/`onEmail` can call it. If not, keep `onText`/`onEmail` as focus-the-composer (the composer already has channel chips), and note it. Do not fabricate a setter.

- [ ] **Step 2: Rewrite the phone body**

Replace the `<div className="flex min-h-0 flex-1 flex-col lg:hidden"> ... </div>` block (the NavyHero + sections, lines ~285-546) with a chat-first layout:

```tsx
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        {/* Compact header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <BackButton to="/sales/leads" label="Leads" />
          <Avatar name={lead.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
              {lead.name}
            </div>
            <div className="truncate text-[11.5px] text-[var(--text-muted)]">
              {leadStageLabel(lead, wonLabel)}
              {lead.pipelineName ? ` · ${lead.pipelineName}` : ""}
            </div>
          </div>
        </div>

        {/* One-touch actions */}
        <div className="px-4 pt-3">
          <LeadActionRail
            phone={lead.phone}
            email={lead.email}
            canWon={lead.status !== "won"}
            canMove={Boolean(leadPipeline && leadPipeline.stages.length > 0)}
            wonLabel={wonLabel}
            onText={() => {/* focus composer / set SMS channel (Step 1) */}}
            onEmail={() => {/* focus composer / set Email channel (Step 1) */}}
            onWon={() => setWonOpen(true)}
            onMove={() => setMoveOpen(true)}
          />
        </div>

        {/* Conversation fills the rest */}
        {session ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
            <LeadConversationPanel leadId={lead.id} hasPhone={hasPhone} />
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            Sign in to message this lead.
          </div>
        )}

        {/* Details disclosure (notes, tasks, activity, attribution) */}
        <LeadDetailsDisclosure
          lead={lead}
          activities={activities}
          session={session}
          wonLabel={wonLabel}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          onAddNote={handleAddNote}
          showToast={showToast}
        />
      </div>
```

- [ ] **Step 3: Move the old sections into a `LeadDetailsDisclosure` component**

At the bottom of `LeadDetail.tsx`, add a `LeadDetailsDisclosure` function that wraps the EXISTING Attribution / Notes / Tasks / Activity section JSX (moved verbatim from the old body) inside a `<details className="border-t border-[var(--border)]">` with a `<summary>` reading "Lead details". This keeps every section's behavior (real `NoteList`, `TaskList`, timeline) but tucks them under the chat. Keep the `TimelineEntry` component as-is.

- [ ] **Step 4: Keep the sheets + back target**

Ensure `WonSheet`, `MoveStageSheet` still render at the end (unchanged). Change the not-found and loading `BackButton to="/leads"` to `to="/sales/leads"`.

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. Fix unused imports (the NavyHero, HeroIconButton, ChevronLeft, Phone/Mail/Tag icons may drop out; remove what is no longer referenced).

- [ ] **Step 6: Commit**

```bash
git add command-center/app/src/routes/LeadDetail.tsx
git commit -m "feat(leads): chat-first lead page with one-touch actions (phone)"
```

---

### Task 13: Chat-primary desktop lead page in `LeadDetailDesktop.tsx`

**Files:**
- Modify: `command-center/app/src/components/leads/LeadDetailDesktop.tsx`

**Interfaces:**
- Consumes: `LeadActionRail`, `LeadConversationPanel`, the same lead/query hooks `LeadDetailDesktop` already uses.
- Produces: no new exports.

**Behavior:** Two-column layout matching Variant A: left column = contact card (avatar, name, stage, phone/email, key details) + `LeadActionRail` + the Details sections (Attribution/Notes/Tasks/Activity); right column = `LeadConversationPanel` filling height. Reuse the same handlers the desktop file already has for won/lost/move/note.

- [ ] **Step 1: Read the current desktop file and map its handlers**

Read `src/components/leads/LeadDetailDesktop.tsx` in full. Identify its existing lead resolution and won/lost/move/note handlers (it mirrors `LeadDetail.tsx`). Reuse them; do not duplicate mutation logic.

- [ ] **Step 2: Rewrite the layout to two columns**

Structure the return as:

```tsx
<div className="flex min-h-0 flex-1 gap-5 p-6">
  <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto">
    {/* contact card + LeadActionRail + details sections */}
  </aside>
  <section className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-border bg-surface">
    <LeadConversationPanel leadId={lead.id} hasPhone={hasPhone} />
  </section>
</div>
```

Place `LeadActionRail` at the top of the aside (same props as Task 12). Move the existing contact/attribution/notes/tasks/activity blocks into the aside.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/components/leads/LeadDetailDesktop.tsx
git commit -m "feat(leads): chat-first desktop lead page with action rail"
```

---

## Phase 5: Cleanup + verification

### Task 14: Delete superseded plan docs

**Files:**
- Delete: `docs/build-plans/leads-page-redesign.md`, `docs/build-plans/leads-page-redesign-plan.md`

- [ ] **Step 1: Append any open follow-ups, then remove**

If either doc lists a Jake action item not yet done, append it to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md` first (per the action-items rule). Then:

```bash
git rm "docs/build-plans/leads-page-redesign.md" "docs/build-plans/leads-page-redesign-plan.md"
git commit -m "docs(leads): retire superseded Pipeline/Organic/Paid Ads plan"
```

---

### Task 15: Full verification (real app, Jake's browser)

**Files:** none (verification only). REQUIRED SUB-SKILL: superpowers:verification-before-completion.

- [ ] **Step 1: Green gate**

Run from `command-center/app`: `npm run typecheck && npm run test && npm run build`. All pass.

- [ ] **Step 2: Drive the real app**

Start the client app, sign in to Willis (live), and verify:
- Tabs read `Sales | Trash | Organic | Paid Ads`, identical header, no jump switching between any two.
- Sales tab shows the Sales pipeline's stages and its leads; Trash tab shows the Trash pipeline's stages.
- Organic tab shows two columns (Forms | Chat); the 3 live Chat Widget leads land in the Chat column.
- Paid Ads tab shows the ad roster (likely empty in this account, honest empty state, no "connect your account" filler).
- Opening a lead shows the chat-first page; Call opens the dialer, Text/Email target the composer channel, Mark Won opens the value sheet, Move opens the stage picker, all against real stages.

- [ ] **Step 3: Capture evidence**

Playwright/browser screenshots: the four tabs (same header), the Organic two-column view, and the chat-first lead page on desktop and narrow viewport. Attach to the ship report. Flag the source classifier for re-verification once a real ad lead exists (only Chat Widget leads exist today).

---

## Self-Review

- **Spec coverage:** 4 tabs on PageBar (Tasks 3, 4, 8, 9) + header-jump fix (all pages now PageBar); Sales/Trash bound to real pipelines by name (Tasks 1, 2, 4, 5); unified backend feed + source tag (Tasks 6, 7); Organic side-by-side (Task 8); Paid Ads on PageBar (Task 9); lead page redesign phone + desktop with correlated buttons (Tasks 10-13); cleanup (Task 14); verification (Task 15). Covered.
- **Placeholder scan:** `onText`/`onEmail` bodies in Task 12 are intentionally resolved in Task 12 Step 1 (read the channel context first) rather than guessed; every other step carries real code.
- **Type consistency:** `LeadPipelineKind` used identically in Tasks 1, 2, 4; `resolveLeadPipeline` signature matches across Tasks 1-2; `classifySource`/`LeadSource` match Tasks 6-7; `LeadConversationPanel` and `LeadActionRail` prop shapes match their Task 12/13 call sites.
- **Risks to confirm at build time:** `Button size="sm"`, `PageBar` prop names, `NewLeadSheet` props, `ConversationThread fill`, `e164` export, and whether `ChannelFilterContext` exposes a channel setter (Task 12 Step 1). Each is called out in its task.

# Kit Global Topbar (Desktop Client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Modern Motion kit's global glass topbar (search + bell + avatar menu) into the desktop client by evolving the shared `DesktopPage` chrome.

**Architecture:** `DesktopPage` is rendered by every lg+ page, so one change propagates everywhere. It becomes a merged glass topbar: page title left, then search pill + page actions + notifications bell + avatar menu on the right. New focused components `GlobalSearch` and `AvatarMenu`; the existing `NotificationBell` (surface variant) moves from per-page `actions` into `DesktopPage`.

**Tech Stack:** React 19, react-router-dom v7, Tailwind v4, lucide-react, existing auth/theme/client contexts.

## Global Constraints

- Desktop (lg+) only. Mobile `AppHeader`/`BottomNav` untouched.
- No em dashes anywhere (code, comments, UI). Use commas/periods/parentheses.
- No backend/routing/schema changes. Search = URL param + existing Leads query.
- Brand fill = `var(--grad-brand)`; glass via the existing `.glass` class; tokens only.
- Keep `DesktopPage`'s prop API (`title`, `subtitle`, `actions`, `children`) unchanged.
- Per task: `pnpm run typecheck` and `pnpm run build` must pass; `pnpm run test` stays green. The test cycle for this UI work is typecheck + build + visual (no new unit tests).
- Bell `enabled` flag = `Boolean(session)` (matches every page's `useReal`).

---

## File Structure

- `command-center/app/src/components/desktop/GlobalSearch.tsx` (new) — topbar search pill.
- `command-center/app/src/components/desktop/AvatarMenu.tsx` (new) — avatar + dropdown.
- `command-center/app/src/components/desktop/DesktopPage.tsx` (modify) — merged topbar.
- `command-center/app/src/components/leads/LeadsDesktop.tsx` (modify) — seed search from `?q`; remove its bell from actions.
- Bell removal from `actions` in: `ActivityDesktop.tsx`, `PaidAdsDesktop.tsx`, `BillingDesktop.tsx`, `CalendarDesktop.tsx`, `ContactsDesktop.tsx`, `ConversationsDesktop.tsx`, `ConversationDetailDesktop.tsx`, `DashboardDesktop.tsx`, `HomeDesktop.tsx` (and any other `DesktopPage` consumer passing the bell).

---

## Task 1: GlobalSearch component

**Files:**
- Create: `command-center/app/src/components/desktop/GlobalSearch.tsx`

**Interfaces:**
- Produces: `export default function GlobalSearch()` — self-contained, no props. Navigates to `/leads?q=...`.

- [ ] **Step 1: Create the component.**

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

// The kit topbar's search pill. Routes to the Leads board with the query
// prefilled (the Leads page reads ?q). Hidden below xl so narrow desktops keep
// the title and actions uncrowded. No network: it is a typed jump to Leads.
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    navigate(`/leads?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="hidden h-9 w-[280px] items-center gap-2 rounded-full border border-border bg-surface-2 px-3.5 text-[13px] text-muted transition-colors focus-within:border-brand focus-within:bg-surface xl:flex"
    >
      <Search size={15} className="shrink-0 text-faint" />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQ("");
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Search leads, contacts..."
        aria-label="Search leads"
        className="w-full bg-transparent text-text placeholder:text-faint focus:outline-none"
      />
    </form>
  );
}
```

- [ ] **Step 2: Typecheck + build.**

Run: `pnpm run typecheck && pnpm run build`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add command-center/app/src/components/desktop/GlobalSearch.tsx
git commit -m "feat(topbar): GlobalSearch pill routing to Leads"
```

---

## Task 2: AvatarMenu component

**Files:**
- Create: `command-center/app/src/components/desktop/AvatarMenu.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`staff`, `signOut`), `useClient()` (`client.brand`), `useTheme()` (`resolved`, `toggle`).
- Produces: `export default function AvatarMenu()` — self-contained, no props.

- [ ] **Step 1: Create the component.**

```tsx
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Settings, Sun, Moon, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useClient } from "../../context/ClientContext";
import { useTheme } from "../../context/ThemeContext";

// Topbar avatar (brand gradient) opening a small menu: Settings, theme, sign
// out. The avatar represents the signed-in user; initials come from the staff
// member's name, or the client brand for an owner session.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AvatarMenu() {
  const { staff, signOut } = useAuth();
  const { client } = useClient();
  const { resolved, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const displayName = staff?.name ?? client.brand.appName;
  const initials = staff ? initialsOf(staff.name) : client.brand.initials;

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="shadow-brand flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold text-white transition-transform active:scale-[0.96]"
        style={{ backgroundImage: "var(--grad-brand)" }}
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)]"
        >
          <div className="border-b border-divider px-4 py-3">
            <div className="truncate text-[13px] font-semibold text-text">{displayName}</div>
          </div>
          <NavLink
            to="/settings"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-text transition-colors hover:bg-surface-2"
          >
            <Settings size={15} className="text-muted" /> Settings
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              toggle();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-text transition-colors hover:bg-surface-2"
          >
            {resolved === "light" ? <Moon size={15} className="text-muted" /> : <Sun size={15} className="text-muted" />}
            {resolved === "light" ? "Dark mode" : "Light mode"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 border-t border-divider px-4 py-2.5 text-left text-[13px] text-danger transition-colors hover:bg-danger-tint"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build.**

Run: `pnpm run typecheck && pnpm run build`
Expected: PASS. (If `useClient`/`useAuth` field names differ, adjust to the actual exports: `staff`, `signOut`, `client.brand.appName`, `client.brand.initials`.)

- [ ] **Step 3: Commit.**

```bash
git add command-center/app/src/components/desktop/AvatarMenu.tsx
git commit -m "feat(topbar): AvatarMenu with Settings, theme, sign out"
```

---

## Task 3: DesktopPage merged topbar

**Files:**
- Modify: `command-center/app/src/components/desktop/DesktopPage.tsx`

**Interfaces:**
- Consumes: `GlobalSearch` (Task 1), `AvatarMenu` (Task 2), `NotificationBell` (existing), `useAuth()` (`session`).
- Produces: unchanged `DesktopPage({ title, subtitle, actions, children })` API; now renders the global topbar controls.

- [ ] **Step 1: Replace the file with the merged-topbar version.**

```tsx
import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import NotificationBell from "../NotificationBell";
import GlobalSearch from "./GlobalSearch";
import AvatarMenu from "./AvatarMenu";

// Shared chrome for every client desktop (lg+) surface: the Modern Motion kit's
// merged glass topbar. Page title (and optional subtitle) on the left; the
// global controls (search, page actions, notifications, account menu) on the
// right. The bell is rendered here once, so pages no longer pass it in actions.
export default function DesktopPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { session } = useAuth();
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="glass sticky top-0 z-10 flex items-center gap-4 border-b border-white/50 px-9 py-4 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-bold leading-tight text-text">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        <GlobalSearch />
        {actions && (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        )}
        <NotificationBell enabled={Boolean(session)} variant="surface" />
        <AvatarMenu />
      </header>
      <div className="fx-rise mx-auto w-full max-w-[1220px] px-9 py-7">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build.**

Run: `pnpm run typecheck && pnpm run build`
Expected: PASS. (Pages still passing their own `<NotificationBell>` will now show two bells until Task 4 removes them; that is expected mid-flight.)

- [ ] **Step 3: Commit.**

```bash
git add command-center/app/src/components/desktop/DesktopPage.tsx
git commit -m "feat(topbar): DesktopPage renders global search, bell, avatar menu"
```

---

## Task 4: Remove the per-page bell from all desktop pages

**Files (modify):**
`command-center/app/src/components/activity/ActivityDesktop.tsx`,
`.../ads/PaidAdsDesktop.tsx`, `.../billing/BillingDesktop.tsx`,
`.../calendar/CalendarDesktop.tsx`, `.../contacts/ContactsDesktop.tsx`,
`.../conversations/ConversationsDesktop.tsx`,
`.../conversations/ConversationDetailDesktop.tsx`,
`.../dashboard/DashboardDesktop.tsx`, `.../home/HomeDesktop.tsx`,
`.../leads/LeadsDesktop.tsx`.

**Interfaces:** none new. Removes a now-duplicated element.

- [ ] **Step 1: Enumerate exact sites.**

Run: `cd command-center/app && grep -rn "NotificationBell" src/components --include=*.tsx | grep -v "components/NotificationBell"`
Expected: the import line + the `actions={...}` usage in each page above.

- [ ] **Step 2: For each file, remove the `<NotificationBell ... variant="surface" />` element from its `actions` and delete the now-unused `import NotificationBell from "...";`.**
  - If `actions` contained ONLY the bell (e.g. `actions={<NotificationBell enabled={useReal} variant="surface" />}`), remove the whole `actions=` prop.
  - If `actions` was a fragment with other buttons (e.g. LeadsDesktop has PipelineSwitcher + bell + New lead), delete just the bell line and keep the rest; if the fragment now wraps a single child, the fragment is still valid (leave it).
  - If `useReal` becomes unused after removing the bell in a file that used it only for the bell, remove the now-unused `const useReal` line too; if `useReal` is still used by a query, leave it.

- [ ] **Step 3: Verify no stray bell and no unused imports remain.**

Run: `cd command-center/app && grep -rn "NotificationBell" src/components --include=*.tsx | grep -v "components/NotificationBell"`
Expected: no matches.

- [ ] **Step 4: Typecheck + build (catches any unused-import / unused-var TS errors).**

Run: `pnpm run typecheck && pnpm run build`
Expected: PASS, zero TS errors.

- [ ] **Step 5: Commit.**

```bash
git add command-center/app/src/components
git commit -m "refactor(topbar): drop per-page bell now that DesktopPage renders it globally"
```

---

## Task 5: Leads reads ?q from the topbar search

**Files:**
- Modify: `command-center/app/src/components/leads/LeadsDesktop.tsx`

**Interfaces:**
- Consumes: the `/leads?q=...` route produced by `GlobalSearch` (Task 1).

- [ ] **Step 1: Import the param hook and a ref.** Ensure the React import includes `useRef` and add `useSearchParams`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
```

- [ ] **Step 2: Seed the existing `search` state from `?q`.** Replace `const [search, setSearch] = useState("");` with:

```tsx
const [searchParams] = useSearchParams();
const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
```

- [ ] **Step 3: Stop the pipeline-change effect from clobbering the initial seed.** Replace the existing clear effect:

```tsx
// Clear the search whenever the pipeline changes (after first mount), so a
// ?q seed from the topbar survives the initial render.
const firstRun = useRef(true);
useEffect(() => {
  if (firstRun.current) {
    firstRun.current = false;
    return;
  }
  setSearch("");
}, [selectedId]);
```

- [ ] **Step 4: React to later `?q` changes (searching again while already on Leads).** Add after the effect above:

```tsx
useEffect(() => {
  const q = searchParams.get("q");
  if (q != null) setSearch(q);
}, [searchParams]);
```

- [ ] **Step 5: Typecheck + build.**

Run: `pnpm run typecheck && pnpm run build`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add command-center/app/src/components/leads/LeadsDesktop.tsx
git commit -m "feat(topbar): Leads prefills its search from ?q"
```

---

## Task 6: Verify and visual proof

**Files:** none.

- [ ] **Step 1:** `cd command-center/app && pnpm run typecheck && pnpm run build && pnpm run test`. Expected: all PASS/green.
- [ ] **Step 2:** `pnpm dev`; in the browser open `http://localhost:5173/home?demo=1`. Confirm the merged topbar: title left; search pill; one bell (not two); gradient avatar.
- [ ] **Step 3:** Screenshot Home, Leads, and one more desktop page in light + dark.
- [ ] **Step 4:** Click the search, type a name, Enter; confirm it lands on `/leads?q=...` with the board filtered.
- [ ] **Step 5:** Open the avatar menu; confirm Settings navigates, theme toggles, Sign out works; menu closes on outside-click and Esc.
- [ ] **Step 6:** Confirm the bell shows the unread badge (demo seeds notifications) and routes to `/notifications`.
- [ ] **Step 7:** Report with screenshots. No success claim without evidence.

---

## Self-Review notes

- Spec coverage: merged topbar (T3) ✓, search→Leads (T1+T5) ✓, bell global with badge (T3 reuses NotificationBell) ✓, avatar menu Settings/theme/signout (T2) ✓, per-page bell removal (T4) ✓, mobile untouched / count pills deferred (not built, per spec) ✓, verify both themes (T6) ✓.
- Types/names: `useAuth()` exposes `session`, `staff`, `signOut`; `useClient().client.brand` has `appName`/`initials`; `useTheme()` has `resolved`/`toggle`. `NotificationBell` props `{ enabled: boolean; variant: "hero"|"surface" }`. Consistent across tasks.
- No placeholders; every code step is complete.

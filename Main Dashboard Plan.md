# Main Dashboard Plan

Handoff for the implementation terminal. Build the **Main Dashboard** as the new app landing surface. Do not touch the existing Media Buying surface. This plan is the contract.

---

## 1. The source of truth

The exact pixel target is committed to the repo:

- **HTML** — `mockups/main-dashboard/07-dashboard-v1.html`
- **PNG (1440×900)** — `mockups/main-dashboard/07-dashboard-v1.png`

Open the HTML in a browser and treat it as the spec. The React port must look indistinguishable from the PNG at 1440×900. Tokens, fonts, spacing, copy, and the five-item per-client dropdown (**Overview · Contract · Resources · Campaigns · Invoices**) are locked.

---

## 2. Scope boundary (READ BEFORE WRITING CODE)

Two surfaces will live side by side. The wiring between them is one switch in `App.tsx` — nothing else.

### Build (NEW — Main Dashboard)
- Default landing view when the app boots.
- Top bar reading `HAUCK MARKETING OS` with JARVIS pulse, `⌘K · COMMAND`, settings icon (matches `topbar` in `07-dashboard-v1.html`).
- Left sidebar with three sections (Workspace · Clients · Workflows).
- Greeting card, mini-stats row, Today/Booked + Calendar split.
- Expandable per-client tree where **every client** carries the same five sub-items: `Overview`, `Contract`, `Resources`, `Campaigns`, `Invoices`.
- Sub-routes for those five surfaces may be stubbed (render a placeholder page); the navigation must work but the page contents can be `▸ NOT WIRED` placeholders for v1.

### Do **not** touch (EXISTING — Media Buying)
These files and folders belong to the Media Buying portion of the app and are under active development on a different track. Do not edit, rename, refactor, or delete anything in this list. Read-only references are fine.

```
app/src/App.tsx                     ← ONE small integration hunk only (see §5). Nothing else.
app/src/components/Dashboard.tsx
app/src/components/PreLaunchDashboard.tsx
app/src/components/Hero.tsx
app/src/components/Kpis.tsx
app/src/components/KpiInput.tsx
app/src/components/DiagnosisPanel.tsx
app/src/components/DiagnosisForm.tsx
app/src/components/TrackingPulse.tsx
app/src/components/TrackingAudit.tsx
app/src/components/CreativeRing.tsx
app/src/components/CreativesEditor.tsx
app/src/components/ActivityFeed.tsx
app/src/components/RecentThreads.tsx
app/src/components/AgentRail.tsx
app/src/components/ChatDrawer.tsx
app/src/components/AskDock.tsx
app/src/components/CommandPalette.tsx
app/src/components/KnowledgeBrowser.tsx
app/src/components/LaunchChecklist.tsx
app/src/components/StatusBar.tsx
app/src/components/ClientCredentials.tsx
app/src/components/ClientsPage.tsx
app/src/components/SettingsPage.tsx
app/src/components/FolderPicker.tsx
app/src/lib/                       ← read only; do not edit tauri.ts, types.ts, prompt.ts, skills.ts, cn.ts
app/src/index.css                  ← read only; reuse the :root tokens, do not add new global rules
app/src-tauri/                     ← Rust backend, off limits
media-buying/                      ← content folder, off limits
```

If you think you need to modify one of the above, stop and ask Jake. The default answer is no.

### Allowed touch points (NEW files / one tiny hunk)
- New folder: `app/src/components/MainDashboard/` — all new components live here.
- New CSS: `app/src/components/MainDashboard/main-dashboard.css` — scoped class names prefixed `md-` to prevent collisions with existing global classes in `index.css`.
- New TS lib (optional): `app/src/lib/main-dashboard/` — helpers only used by the Main Dashboard.
- `app/src/App.tsx` — exactly one small change described in §5.

---

## 3. File layout to create

```
app/src/components/MainDashboard/
├── index.tsx               ← <MainDashboard /> — top-level surface
├── TopBar.tsx              ← HAUCK MARKETING OS bar (the one shown in the mockup)
├── Sidebar.tsx             ← left nav with the three sections
├── ClientTree.tsx          ← expandable per-client block (5 sub-items, identical for every client)
├── GreetingCard.tsx        ← JARVIS orb + daily briefing
├── MiniStats.tsx           ← three-cell stat row
├── BookedToday.tsx         ← today's calls list
├── CalendarWidget.tsx      ← month grid + weekly summary line
├── pages/
│   ├── ClientOverview.tsx  ← placeholder "▸ NOT WIRED"
│   ├── ClientContract.tsx  ← placeholder
│   ├── ClientResources.tsx ← placeholder
│   ├── ClientCampaigns.tsx ← placeholder
│   └── ClientInvoices.tsx  ← placeholder
└── main-dashboard.css      ← all styles for the surface, classes prefixed md-
```

No router library. Use local state (`useState`) on `<MainDashboard />` to switch between `dashboard | client/<slug>/<section>` views. Keep it simple.

---

## 4. v1 data — hardcoded, no Tauri calls

v1 ships with static data so this work is fully decoupled from the Rust backend. Do **not** add new Tauri commands for v1. The hardcoded values must match the mockup verbatim:

```ts
// app/src/components/MainDashboard/v1Data.ts
export const V1 = {
  clients: [
    { slug: "willis-windows",  name: "Willis Windows",   status: "live" as const,
      counts: { contract: "2", resources: "14", campaigns: "LIVE", invoicesDue: "1 DUE" } },
    { slug: "placeholder-co",  name: "Placeholder Co.",  status: "hold" as const,
      counts: {} },
  ],
  date: { weekday: "MONDAY", date: "11 MAY 2026", time: "09:42" },
  briefing:
    "Two clients on the books. Willis is holding steady at 3.2× ROAS. " +
    "One discovery call at eleven, a tracking audit after lunch, and three " +
    "outreach follow-ups before close. The Willis invoice is four days overdue — " +
    "gentle nudge recommended.",
  stats: [
    { label: "CLIENTS",         value: "2", sub: "1 live · 1 onboarding" },
    { label: "CALLS TODAY",     value: "1", sub: "Discovery · 11:00" },
    { label: "FOLLOW-UPS DUE",  value: "3", sub: "Pipeline · by EOD" },
  ],
  calls: [
    { time: "08:30", title: "Morning check · Willis Windows",   sub: "ROAS holding · no intervention required",                  state: "done"  },
    { time: "11:00", title: "Discovery call · Placeholder Co.", sub: "30 min · Google Meet · prep doc in client folder",         state: "live"  },
    { time: "13:30", title: "Tracking audit · new client",       sub: "Aurelius awaiting sign-off · ~30 min",                     state: "open"  },
    { time: "16:00", title: "Outreach follow-ups · 3",           sub: "Maria's Salon · Acme Plumbing · Old Town Cafe",            state: "open"  },
  ],
  calendar: {
    monthLabel: "May 2026",
    today: 11,
    eventDays: [6, 8, 11, 12, 14, 20],
    summary: "This week: 4 calls booked, 2 audits scheduled, 1 invoice due Friday.",
  },
};
```

A short comment at the top: `// v1 hardcoded — replace with Tauri reads in v2.`

---

## 5. The one integration hunk in `App.tsx`

Currently `App.tsx` boots into the media-buying world (FolderPicker → Dashboard / PreLaunchDashboard). The change is small and surgical: add a `view` state that defaults to `"main"` and short-circuits before any of the existing logic.

Add a new state near the other `useState` calls at the top of `App()`:

```tsx
const [view, setView] = useState<"main" | "media-buying">("main");
```

Immediately **before** the existing `if (!bootDone) { ... }` block — i.e. the very first render branch — add:

```tsx
if (view === "main") {
  return (
    <MainDashboard
      onOpenMediaBuying={() => setView("media-buying")}
    />
  );
}
```

Add the import at the top of `App.tsx`:

```tsx
import { MainDashboard } from "./components/MainDashboard";
```

Inside `<MainDashboard />`, the sidebar's `Media Buying` workflow item calls `onOpenMediaBuying`. The existing media-buying flow takes over from there, untouched. To get back to the Main Dashboard, the Main Dashboard's top bar exposes a brand-click handler — but for v1 the user can just reload, since the boot path goes to `view === "main"` first. (A "back to dashboard" affordance can land in v2.)

**That is the entire integration.** No other line in `App.tsx` changes. Do not refactor existing branches, do not touch the FolderPicker boot path, do not modify the `loadFolder` callback, do not change the StatusBar or ChatDrawer wiring.

---

## 6. Style fidelity

- Reuse the existing CSS custom properties from `:root` in `app/src/index.css` (`--bg-void`, `--copper`, etc.). Do not redefine them.
- All new styles live in `main-dashboard.css`, imported from `MainDashboard/index.tsx`.
- Prefix every new class with `md-` (e.g. `md-shell`, `md-sidebar`, `md-greeting-card`). This guarantees zero collision with the existing classes (`shell`, `agent-rail`, `greeting-card` etc.) defined in `index.css`.
- Fonts are already loaded via `index.css` and the Tauri shell — do not add a second Google Fonts link.
- **No italic serif headlines.** Newsreader is used upright only. Jake calls italic serif "cursive" and finds it hard to read.
- No emoji anywhere.

---

## 7. Acceptance checklist

Before declaring v1 done, verify each of these against `mockups/main-dashboard/07-dashboard-v1.png`:

- [ ] App boots into the Main Dashboard (not the FolderPicker, not the media-buying Dashboard).
- [ ] Top bar reads `HAUCK MARKETING OS` with a copper brand dot, JARVIS · ONLINE pulse on the right.
- [ ] Sidebar shows three sections: Workspace (Dashboard / Calendar / Tasks) — Clients · 2 (Willis Windows, Placeholder Co., both expanded by default in v1 so the pattern is visible) — Workflows (Media Buying, Pipeline, Finance, Knowledge).
- [ ] **Both** clients expose the same five sub-items in the same order: `Overview`, `Contract`, `Resources`, `Campaigns`, `Invoices`. Badges on Willis match the mockup (2 / 14 / LIVE / 1 DUE).
- [ ] Greeting card uses the JARVIS orb + briefing text verbatim from §4.
- [ ] Mini-stats row shows 2 · 1 · 3 with the sub-captions verbatim.
- [ ] Today/Booked panel lists the four calls verbatim, including the strikethrough on the 08:30 row and the copper "▸ JOIN" on the 11:00 row.
- [ ] Calendar widget shows May 2026 with copper today=11 and event dots on 6, 8, 12, 14, 20.
- [ ] Clicking the `Media Buying` workflow item swaps to the existing media-buying surface and leaves it untouched.
- [ ] No files outside `app/src/components/MainDashboard/` and the single allowed hunk in `App.tsx` were modified. `git diff` confirms.
- [ ] `npm run build` (or the project's existing build command) passes with no new warnings or errors.

---

## 8. Things explicitly out of scope for v1

- Wiring any client sub-page (`Overview`, `Contract`, etc.) to real data — render placeholders only.
- Adding new Tauri commands or Rust code.
- Changing the existing media-buying chrome (StatusBar, AgentRail, ChatDrawer, AskDock, CommandPalette, etc.).
- A "back to Main Dashboard" affordance from inside the media-buying view (v2).
- Persisting the `view` state across reloads (v2).
- Real calendar data, real call data, real client counts (v2).

---

## 9. If you get stuck

- Pixel-level discrepancies → re-render the mockup and diff visually:
  ```
  msedge --headless=new --window-size=1440,900 --virtual-time-budget=4000 --screenshot=out.png file:///.../07-dashboard-v1.html
  ```
- Class-name collisions → the `md-` prefix should prevent these; if one slips through, rename rather than touching `index.css`.
- Anything else that requires editing a file in the §2 do-not-touch list → stop and ask Jake.

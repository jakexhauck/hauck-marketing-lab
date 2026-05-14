# Split View — Design & Implementation Plan

> **Status:** Plan only. Not yet implemented. Authored 2026-05-13 from a planning conversation between Jake and Claude.
> **Location of work when built:** `app/` (the Tauri + React desktop app).

---

## 1. The Goal

Add a feature to Hauck Marketing Lab that lets Jake run **two independent views of the same app at the same time** — either side-by-side inside the current window, or with one view torn off to a second monitor.

The motivating use-case Jake described:

> "I would like to have the onboarding checklist on one side and the form on the other. If I add a recording on the right side of my screen, it would automatically populate into the left side."

Two flavours of the feature, both required:

1. **In-window split** — the existing app window divides in half, with a draggable divider. Each half is a fully independent view of the app.
2. **Second-monitor pop-out** — one of the panes can be detached into its own Tauri window and dragged to a second monitor. The new window is a full app instance.

Both modes must keep data in sync: a change made in one pane/window appears in the other within a moment.

---

## 2. Design Decisions (locked in conversation)

These were chosen explicitly by Jake; each one shaped the plan below.

| # | Question | Decision |
|---|----------|----------|
| 1 | When split, do panes share state or run independently? | **Fully independent.** Each pane has its own active page AND its own active client. Left can be Onboarding Checklist for Client A while right is the Ad Copy form for Client B. |
| 2 | How does the sidebar behave when split? | **Per-pane sidebar.** Each pane looks like a full app — its own sidebar, its own top bar, its own content. No shared chrome. |
| 3 | What controls the split? | **One "Split" button + drag-to-pop-out.** Clicking Split divides the window. Grabbing the right pane's header and dragging it outside the window detaches it into a second Tauri window (browser-tab-tear-off style). |
| 4 | What chrome does the popped-out window show? | **Full app chrome** (top bar + sidebar). The detached window is functionally a second instance of the app, not a stripped-down "detached view." |
| 5 | How does sync work technically? | **File-watcher.** Both panes (and any popped-out windows) watch the vault and ops folders. When a file changes, every pane re-reads from disk and re-renders. ~100-300ms delay. Works uniformly across in-window and cross-window because everything ultimately reads from disk. |
| 6 | Should split state persist across app restarts? | **No.** The app always opens unsplit. Splitting is a per-session choice. No settings-file churn, no surprise layouts after relaunch. |
| 7 | How do we handle narrow pane widths? | **Compact mode per pane.** Each pane measures its own width via `ResizeObserver`. Below a threshold (~800px) components opt into a denser layout: sidebar collapses to an icon-rail, forms switch to single-column, tables hide secondary columns. |

---

## 3. Architecture Overview

### 3.1 The mental model

Today, `App.tsx` renders a single `MainDashboard` with its own view state (which page is showing) and the global `activeClientSlug` passed down as a prop. The whole app is implicitly "one pane."

After this feature lands, the app conceptually renders an **array of panes**. The array is `[single]` by default. Splitting appends a second pane. Popping out removes a pane from the array and creates a separate Tauri window holding it.

Each pane is self-contained:

```
AppPane {
  paneId: "left" | "right" | "popped-<uuid>"
  view: View                      // which page is showing
  activeClientSlug: string | null  // which client is active
  paneWidth: number                // observed via ResizeObserver
  compact: boolean                 // derived from paneWidth
}
```

### 3.2 What state is per-pane vs global

| Lives **per-pane** (each pane owns its own copy) | Lives **global** (shared, read from disk) |
|---|---|
| Active page / view | Clients list |
| Active client slug | Recordings |
| Open modals (chat drawer, form generator, media-buying overlay) | Ops / tasks (`vault/ops/tasks.json`) |
| Sidebar expand/collapse state | Vault notes (Profile, Memory, About) |
| Pane width / compact flag | Calendar connection, settings |
| Scroll position per page | Drive folder index per client |

The split between these is the key refactor. Anything in the left column moves from `App.tsx` props into a per-pane state object. Anything in the right column stays where it is (read from disk via existing Tauri API calls).

### 3.3 Why file-watcher sync is enough

Most of the app already reads from disk on every mount/refresh:

- Clients come from `vault/Clients/*/`
- Tasks come from `vault/ops/tasks.json`
- Recordings come from the recordings folder
- Profile/Memory/About come from `vault/About/` and `vault/Clients/<name>/`

So "the left pane shows what the right pane just saved" reduces to "the left pane re-reads its files when the right pane writes them." A Rust-side file watcher (using the `notify` crate) that emits Tauri events to all webviews is sufficient.

The popped-out window is its own webview, but it's listening to the same Tauri events, so cross-window sync uses the same mechanism — no second code path.

---

## 4. Implementation Phases

The plan is broken into six phases, designed so each phase ships a working app at the end. Phases 1-5 are the core feature. Phase 6 is the optional UX polish for the drag-to-tear-off behaviour.

### Phase 1 — Lift state into a pane container (~1 evening)

**Goal:** Refactor so that everything pane-specific lives in one place, without changing user-visible behaviour.

**Tasks:**

1. Create `app/src/components/AppPane.tsx`. It wraps `MainDashboard` and owns:
   - `view: View` (currently in `MainDashboard` local state)
   - `activeClientSlug: string | null` (currently passed in as a prop from `App.tsx`)
   - `paneId: string` (constant per pane instance)
2. Refactor `App.tsx` to render `panes.map(pane => <AppPane key={pane.id} {...pane} />)`. Today `panes` is hardcoded to a single-element array.
3. Move the `onSwitchClient` callback to operate on the pane's local state instead of the global persisted slug. (Persistence to disk still happens, but only when the **left/primary** pane changes client — that's how we preserve the existing "remember active client across restarts" behaviour without breaking the per-pane independence Jake wants.)
4. Verify the app behaves identically to today in single-pane mode. Click through every page, every client, every form — nothing should look or feel different.

**Files touched:**
- `app/src/App.tsx` (the root component, refactored to render pane array)
- `app/src/components/MainDashboard/index.tsx` (props change — `view` and `activeClientSlug` become required, not optional)
- New: `app/src/components/AppPane.tsx`

**Definition of done:** App still works exactly as it does today. No new UI yet. The refactor is invisible to the user.

---

### Phase 2 — In-window split (~1 evening)

**Goal:** Add the Split button and the second pane. Jake can now have two independent views side-by-side.

**Tasks:**

1. Add a new "Split" icon button to the top bar (next to Sync / Notifications / Settings / Add). Icon: two vertical rectangles side-by-side. Tooltip: "Split view."
2. Clicking Split appends a second `AppPane` to the array in `App.tsx`. The right pane initialises with `{ view: { kind: "dashboard" }, activeClientSlug: null }` (or possibly inherits the left pane's client — see Open Questions §6).
3. Render a draggable divider (`<div>` with `cursor: col-resize` and a mousedown handler) between the two panes. Default position 50/50. Min pane width: 480px. The divider stores its position in `App.tsx` state.
4. The right pane's top bar shows an "✕ Close pane" button on the right side. Clicking it removes that pane from the array and the layout collapses back to a single pane.
5. When split, the left pane's "Split" button changes to disabled or hidden (you can't split an already-split window).
6. Modal scoping audit: walk through every modal/overlay in the app (chat drawer, `ConnectCalendarModal`, `ConfirmDeleteModal`, form generator overlay, media-buying overlay) and verify they render inside their pane's DOM subtree, not as a global portal. Anything that uses a global portal needs to be scoped to the pane that opened it.

**Files touched:**
- `app/src/App.tsx` (renders divider, manages panes array)
- `app/src/components/MainDashboard/index.tsx` (split + close-pane buttons in top bar)
- `app/src/components/icons.tsx` (new IconSplit, IconClose icons if not already present)
- `app/src/components/MainDashboard/main-dashboard.css` (split layout styles, divider styles)
- Various modal components (audit pass for portal scoping)

**Definition of done:** Click Split → window divides in half → each pane independently navigable → close button on right pane unsplits → modals open inside their own pane.

---

### Phase 3 — Compact mode per pane (~1-2 evenings)

**Goal:** Make the app usable at ~600-800px pane widths without breaking the layout.

**Tasks:**

1. Create a `usePaneWidth()` hook that uses `ResizeObserver` to track the width of the pane container. Returns `{ width: number, compact: boolean }` where `compact = width < 800`.
2. Create a `PaneContext` provider at the top of each `AppPane` that exposes the compact flag to all descendants.
3. **Sidebar (`AppSidebar.tsx`)** — when compact, collapse to an icon-rail (~56px wide). Labels appear as tooltips on hover. Already partially supported in the codebase based on the sidebar's existing collapsed state — wire it to `compact`.
4. **Forms (`ClientCredentials.tsx`, `ClientProfileForm.tsx`, form generator overlays)** — when compact, force single-column layout. No side-by-side fields.
5. **Ops trackers (`OpsTrackers.tsx`)** — when compact, hide secondary columns in tables (e.g. keep Name + Status, hide Date/Owner).
6. **Dashboard (`ClientDashboard.tsx`)** — when compact, stack cards vertically instead of in a grid.
7. **Top bar (`MainDashboard/index.tsx`)** — when compact, the action buttons (Sync, Settings, Notifications, Add, Split, Close) become icon-only (no labels). The Add button's dropdown still works.

The audit list above is not exhaustive — Jake should run the app in split mode and call out any pages that pinch.

**Files touched:**
- New: `app/src/lib/usePaneWidth.ts`, `app/src/lib/PaneContext.tsx`
- `app/src/components/MainDashboard/AppSidebar.tsx`
- `app/src/components/ClientCredentials.tsx`
- `app/src/components/ClientProfileForm.tsx`
- `app/src/components/MainDashboard/OpsTrackers.tsx`
- `app/src/components/MainDashboard/ClientDashboard.tsx`
- `app/src/components/MainDashboard/index.tsx` (top bar)
- `app/src/components/MainDashboard/main-dashboard.css` (compact-mode rules)

**Definition of done:** Split the app on a 1920px monitor → both 960px panes are fully usable, no horizontal scrolling, no text truncation, no overlapping buttons.

---

### Phase 4 — File-watcher sync (~1 evening)

**Goal:** When pane A changes a file on disk, pane B re-reads and re-renders within ~300ms.

**Tasks:**

1. **Rust side (`app/src-tauri/src/lib.rs` or a new `watcher.rs`)** — add the `notify` crate to `Cargo.toml`. Spawn a watcher on app startup that monitors:
   - `vault/Clients/**` (client data, profile, memory)
   - `vault/About/**` (about notes)
   - `vault/ops/tasks.json` (tasks/ops state)
   - `vault/Knowledge/**` (knowledge frameworks)
   - The recordings root (wherever recordings get written)
   - Any other path that data layers read from
2. On a filesystem event, emit a Tauri event with a payload like `{ kind: "vault-changed", path: "vault/Clients/Acme/Memory.md" }`. Use Tauri's `app.emit()` to broadcast to **all** webviews (so the popped-out window receives it too).
3. **Frontend side** — in each data-loading hook (`useClients`, `useTasks`, `useRecordings`, etc.), subscribe to the relevant event. On receipt, debounce by ~150ms (to coalesce rapid writes) then refetch.
4. Add a small visual indicator (a fading pulse on the affected card, or a brief "Synced" toast) so it's obvious that a cross-pane update happened. This is for confidence, not correctness — it should not be loud or annoying.

**Files touched:**
- `app/src-tauri/Cargo.toml` (add `notify`)
- `app/src-tauri/src/lib.rs` or new `app/src-tauri/src/watcher.rs`
- `app/src/lib/tauri.ts` (helper to subscribe to vault events)
- Various data hooks throughout `app/src/components/**` and `app/src/lib/**`

**Definition of done:** Split the app. In the right pane, edit a client's Memory note. Within 300ms, the left pane (showing the same client) reflects the new content without manual refresh.

---

### Phase 5 — Pop-out to a second window (~1-2 evenings)

**Goal:** Detach the right pane into its own Tauri window. The new window goes on the second monitor; the main window collapses back to single-pane.

**Tasks:**

1. Add a "Pop out ↗" button to the right pane's top bar (next to the close button). Icon: arrow pointing up-right out of a box. Tooltip: "Open in new window."
2. Clicking Pop Out:
   - Reads the right pane's current state (`view`, `activeClientSlug`).
   - Encodes that state into URL query params: e.g. `index.html?pane=detached&page=client&slug=acme&section=onboarding`.
   - Calls `WebviewWindow.new("pane-<uuid>", { url: ..., title: "Hauck Marketing Lab — <Client>", width: 1200, height: 900 })` from `@tauri-apps/api/window`.
   - Removes the right pane from `App.tsx`'s panes array (main window goes back to single pane).
3. **App initialisation** — at app boot, parse the URL. If `pane=detached`, render a single `AppPane` initialised from the URL params and skip the normal "first run" / "select root folder" flow (the detached window inherits the main window's root via shared settings file).
4. **Cross-window sync** — already free from Phase 4. The popped-out window subscribes to the same vault events and refetches.
5. **Returning a popped-out window** — add a small "↙ Return to main window" button to the popped-out window's top bar. Clicking it sends a Tauri event back to the main window asking it to re-append a pane with this window's state, then closes itself.
6. **Closing the main window** — if the user closes the main window while popped-out windows are still open, they remain. Closing the last window quits the app (already standard Tauri behaviour but worth confirming).

**Files touched:**
- `app/src/components/MainDashboard/index.tsx` (pop-out button)
- `app/src/App.tsx` (parses URL params, decides what to render at boot)
- `app/src-tauri/tauri.conf.json` (may need to relax window config to allow programmatic window creation)
- `app/src-tauri/src/lib.rs` (may need a Rust command to coordinate window creation if frontend permissions are insufficient)
- New: `app/src/lib/popout.ts` (helpers for encoding/decoding pane state to URL params)

**Definition of done:** Split → click Pop Out on the right pane → new Tauri window appears, fully functional, with the right pane's state intact → drag it to the second monitor → edit something there, see it reflect in the main window.

---

### Phase 6 (optional polish) — Drag-to-tear-off (~1-2 evenings)

**Goal:** Replace the Pop Out button with browser-tab-style drag detection. Grab the right pane's header, drag it outside the main window, drop it — it becomes a popped-out window at the drop location.

**Tasks:**

1. Add a `mousedown` handler to the right pane's top bar that calls Tauri's `appWindow.startDragging()` — but conditionally. We don't want to move the whole main window when the user grabs the right pane's header; we want to detect that they're trying to tear off.
2. Track cursor position during the drag. Compare to main window's bounds (via `appWindow.outerPosition()` and `appWindow.innerSize()`).
3. When the cursor exits the window bounds by some threshold (~100px), cancel the window-drag, trigger the pop-out flow from Phase 5, position the new window at the current cursor location.
4. When the cursor stays inside the bounds and the user releases, do nothing special — they were just hovering.
5. Visual feedback during the drag: a ghost/outline of the pane following the cursor, indicating "this is what will pop out."

**Why this is Phase 6 and not Phase 5:** the click-the-button version of pop-out works on day one and covers the actual use-case (get the right pane to my second monitor). The drag UX is a delight, but it has real complexity on Windows + Tauri (the window-drag and the "is the cursor outside?" detection are two slightly fragile native APIs). Ship Phase 5, use it for a week, then decide whether the drag is worth the extra implementation time.

**Files touched:**
- `app/src/components/MainDashboard/index.tsx` (drag handler on top bar)
- New: `app/src/lib/dragToPopout.ts` (the drag-tracking logic)

**Definition of done:** Grab the right pane's top bar → drag the cursor outside the main window → release → a new window appears at the cursor with the right pane's content; main window collapses to single pane.

---

## 5. Known Risks and Complexity to Watch

These are not blockers, but they need eyes during the build:

1. **Modal portals.** Anything that renders into a global portal (e.g. `document.body` directly, or a non-pane-scoped React portal) will break in split mode — the modal will appear over the whole window instead of inside its pane. Phase 2 includes an audit pass; the actual fix per modal might be small (point the portal at the pane's root element) or larger (refactor the modal to render inline).
2. **Two chat drawers open at once.** This is intentional with full independence, but visually it might feel busy. Worth eyeballing in Phase 2 and deciding whether the chat drawer should be modal-style (one at a time, focused) or panel-style (both can be open).
3. **Active-client persistence.** Today the app persists the active client slug to disk so it survives restarts. With per-pane clients, we need to decide which pane "wins" for persistence. Simplest rule: only the left/primary pane writes to the persisted slug. Document this in the code.
4. **Tauri multi-window settings sharing.** All windows need to read from the same settings file (so the popped-out window knows which vault root to use). This already works if settings are file-based, but verify in Phase 5.
5. **Window min-width.** Current min is 1200px. If a user has the main window at 1200px and clicks Split, they're at 600px per pane — Phase 3's compact mode handles this, but the first split on a narrow window might feel jarring. Consider auto-resizing the window to a sensible width (e.g. `max(currentWidth, 1800)`) on first split.
6. **`tauri.conf.json` allowlist.** Programmatic window creation (`WebviewWindow.new`) may require an explicit allowlist entry in newer Tauri versions. Check during Phase 5.
7. **File-watcher noise.** The vault has a lot of files. The `notify` watcher will fire on every save, every git checkout, every Obsidian autosave. Phase 4's frontend debounce (~150ms) handles the immediate burst, but if the watcher itself becomes a CPU drain, narrow the watched paths.
8. **Two media-buying overlays.** The media-buying view is currently full-screen and modal. If both panes open it, the second one would clobber the first. Decide whether media-buying is allowed per-pane or globally-singleton (only one pane can have it open at a time).

---

## 6. Open Questions for Build Time

These weren't decided in the planning conversation and need a call when the work starts:

1. **Initial state of the right pane on first split.** When the user clicks Split for the first time, what does the right pane show?
   - Option A: blank dashboard with no active client.
   - Option B: inherits the left pane's active client and view (so the user immediately sees two identical panes and changes one).
   - Option C: blank dashboard but inherits the active client (so client context carries over but the page resets).
   - **Tentative pick:** Option C — feels least surprising, preserves "I'm working on Client X" context.
2. **Order in which Phase 3 compact-mode audits happen.** The plan lists components in rough order of impact. Confirm by splitting the app once Phase 2 ships and observing which pages pinch first.
3. **Should the popped-out window have its own Split button?** I.e. can a popped-out window itself be split? Probably not (too confusing), but worth a quick sanity check.
4. **What happens to a popped-out window when the main app is updated?** If Tauri's auto-updater restarts the app, does the popped-out window get killed? Need to verify; might be a Phase 5 task to gracefully recover popped-out state on update.

---

## 7. Estimated Effort

| Phase | Estimate | Cumulative |
|---|---|---|
| 1. Lift state into pane container | ~1 evening | 1 |
| 2. In-window split | ~1 evening | 2 |
| 3. Compact mode per pane | ~1-2 evenings | 3-4 |
| 4. File-watcher sync | ~1 evening | 4-5 |
| 5. Pop-out to second window (button) | ~1-2 evenings | 5-7 |
| 6. Drag-to-tear-off (optional polish) | ~1-2 evenings | 6-9 |

**Core feature (phases 1-5):** 5-7 evenings.
**With the drag polish:** 6-9 evenings.

These are estimates assuming focused evening sessions and no major surprises. Modal-portal audits in Phase 2 and file-watcher tuning in Phase 4 are the most likely places to lose time.

---

## 8. Recommended Build Order

When the time comes to build, the recommended sequence is exactly the phase order above. Each phase ships a working app — meaning Jake can pause after any phase and still have a usable product:

- After **Phase 1**: identical to today, but the codebase is ready for splitting.
- After **Phase 2**: in-window split works on one monitor. No cross-window, no compact mode.
- After **Phase 3**: in-window split is genuinely usable on a single monitor.
- After **Phase 4**: changes in one pane propagate to others. This is when the feature feels magical.
- After **Phase 5**: full feature complete. Drag a pane to the second monitor, it Just Works.
- After **Phase 6**: drag-tear-off polish. Optional.

If at any point Jake decides the feature isn't worth more investment, he can stop and the app still works.

---

## 9. Files That Will Change

A consolidated list, for sizing purposes:

**New files (estimated):**
- `app/src/components/AppPane.tsx`
- `app/src/lib/usePaneWidth.ts`
- `app/src/lib/PaneContext.tsx`
- `app/src/lib/popout.ts`
- `app/src/lib/dragToPopout.ts` (Phase 6 only)
- `app/src-tauri/src/watcher.rs` (Phase 4)

**Existing files modified:**
- `app/src/App.tsx` (root component, biggest change)
- `app/src/components/MainDashboard/index.tsx` (top bar, view state)
- `app/src/components/MainDashboard/AppSidebar.tsx` (compact mode)
- `app/src/components/MainDashboard/OpsTrackers.tsx` (compact mode)
- `app/src/components/MainDashboard/ClientDashboard.tsx` (compact mode)
- `app/src/components/MainDashboard/main-dashboard.css` (split layout, compact rules)
- `app/src/components/ClientCredentials.tsx` (compact mode)
- `app/src/components/ClientProfileForm.tsx` (compact mode)
- `app/src/components/icons.tsx` (new split/close/popout icons)
- `app/src/lib/tauri.ts` (vault-event subscription helpers)
- Various modal/overlay components (portal scoping audit)
- `app/src-tauri/Cargo.toml` (add `notify`)
- `app/src-tauri/src/lib.rs` (wire up watcher)
- `app/src-tauri/tauri.conf.json` (possibly — for window allowlist)

---

## 10. Summary

Build a split-view feature in the Hauck Marketing Lab desktop app with two modes — in-window split and second-monitor pop-out — using fully independent per-pane state, per-pane sidebars and chrome, file-watcher sync, no persistence of split state across restarts, and compact-mode rendering for narrow panes. Six phases, 5-9 evenings total. Each phase ships a working app, so the work can stop or resume at any phase boundary.

When ready to build, start with Phase 1.

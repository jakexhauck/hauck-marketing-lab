---
name: command-center-section
description: Use when building a new client-app "section" in the Command Center (command-center/app) — e.g. "build the Social Media section", "add a Paid Ads / Reviews / Website hub", "new tab under Marketing", "nested sidebar section with sub-pages", "section with an Overview + sub-tabs". Encodes the proven pattern: nested sidebar nav, Overview + sub-pages, demo-aware/gated-until-connected UI, dialogs, mobile entry, and the verify-then-ship-to-Cloudflare flow.
---

# Command Center — build a client-app section

How we build a feature "section" (a Marketing/Sales hub with an Overview + sub-pages) in `command-center/app`, the client Lab Console. Proven on Social Media; reused by Paid Ads. Match it for any new section so they all behave the same.

## When to Use This Skill

Use when the user asks to:

- Build/extend a **section** in `command-center/app` (Social Media, Paid Ads, Google Reviews, Website, Email, etc.).
- Add a **nested sidebar group** (a parent item that expands to Overview + sub-pages).
- Add an **Overview dashboard + sub-tabs** to the client app.

Do **not** use it for the standalone client mobile PWA (`Hauck Command Center (Clients)/Mobile App`) or the marketing website — different apps.

## Non-negotiables

- **Mockups before code — always.** Build static HTML mockups first, present them for Jake's approval, and only write app code after he approves. Do not jump straight to in-app demo code. (See Phase 0.)
- **Never show fabricated data to a real client.** Every surface is demo-aware: populated sample content under `demoMode()` (the `?demo=1` preview / "View as a client" path); a real session shows empty/zeroed states + a "not connected" notice, and terminal actions (save/schedule/publish) are **disabled with a "turns on once your accounts are connected" note** until the backend exists.
- **Design kit:** light / indigo / Poppins ("Modern Motion"), source of truth `design-kit.html` at repo root. Build on the app's semantic Tailwind tokens, never hardcode hex (except platform brand colors).
- **Deploy = push to `main`** (Cloudflare Pages "hauck-command-center", live at app.hauckmarketing.com / hauck-dashboard.pages.dev). Verify the deploy by bundle hash + string grep — the app sits behind login so you can't click through prod.

## Phase 0 — Mockups first (get approval before any code)

This is the default workflow: **mockup → Jake approves → build the code right after.** Never go straight to in-app demo code.

1. Reuse the kit: `kit.css` is the `design-kit.html` `<style>` block (light/indigo/Poppins). Mockups link it.
2. Build the screens as **static HTML on `kit.css`**, framed realistically — phone frames for mobile, browser-window chrome for desktop, centered modal / bottom-sheet for dialogs. When the direction is open, show **2-3 options** and let Jake pick.
3. Open for review (`open <file>`, or serve the folder with `python3 -m http.server` and view via the browser tools) and iterate until he approves.
4. Only **after approval**, build the real demo-aware/gated app code (Build procedure below). Build it "right after" approval — don't wait.

Save mockups under the app folder, e.g. `mockups/<section>-v1/`. Reference set: `Hauck Command Center (Clients)/Mobile App/mockups/social-v1/` (`home.html`, `desktop.html`, `create-flows.html`, `kit.css`).

## Build procedure

1. **Nav** (`src/lib/nav.ts`): add the section page under its parent section's `items`. For an Overview + sub-pages, give the `NavItem` a `children: NavItem[]` array (first child = `Overview` at the parent's own route, then the sub-pages). `flattenNav`/`leafItems` already handle children; `Sidebar.tsx` renders the expandable `NavItemGroup`.
2. **Routes** (`src/App.tsx`): parent route at `/<area>/<section>` → Overview; one route per child. Mirror an existing built page for structure.
3. **Pages** (`src/routes/<section>/`): one file per tab. Wrap in `<Shell>`, use `<PageHeader>` and `components/ui` primitives (`Panel`, `PanelHeader`, `Badge`, `Button`, `EmptyState`, `Segmented`). Use semantic tokens: `text-text/muted/faint`, `border-border/divider`, `bg-surface/surface-2`, `text-brand-text`, `bg-brand-tint`, `bg-positive-tint`, `text-positive`, `shadow-brand`, and inline `style={{ backgroundImage: "var(--grad-brand)" }}` for gradient fills.
4. **Shared module** (`src/routes/<section>/shared.tsx`): glyphs/helpers, a `NotConnectedNotice` component, and a `SECTION_CONTAINER` class const.
5. **Demo-aware**: `const demo = demoMode()` (`src/demo/demoMode`). Branch every page: rich sample vs empty + `<NotConnectedNotice/>`.
6. **Dialogs** (create flows): a reusable overlay (`SocialDialog` is the template — centered on desktop, bottom-sheet on mobile, Escape/backdrop close). Interactive locally; terminal actions gated + `useToast` for demo feedback.
7. **Mobile**: the sidebar is desktop-only (`lg`), so add (a) a `*MobileTabs` strip (`lg:hidden`) at the top of each page for sub-page nav, and (b) an entry in the Home "More" list (`src/routes/Home.tsx`) as the phone entry point.
8. **Verify** (see below). 9. **Ship** (see below).

## Verify

- `npx tsc --noEmit` then `npm run build` (both from `command-center/app`).
- Run it: `npm run dev`, open `http://localhost:5173/<route>?demo=1` (the demo sandbox needs no login/network), screenshot the real pages and dialogs. Resize won't reliably force the mobile viewport in the screenshot — confirm mobile by code/build, verify desktop on screen.

## Ship

1. Stage **only your section's files** — never sweep co-workers' in-progress changes. `git diff --cached --name-status` and unstage anything you didn't author (e.g. a staged rename someone else left). On the default branch, that's expected here; deploy is push-to-main.
2. Capture the current live bundle hash: `curl -s https://hauck-dashboard.pages.dev/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'`.
3. Commit (end message with the Co-Authored-By line) and `git push origin main`.
4. Poll until the live bundle hash changes (CF build ~75-120s). Then download the new bundle and `grep` it for a unique string you shipped to prove your code is live (you can't log into prod to check visually).

## Final — Connections backlog (what it needs to be fully functional)

A section ships **demo-complete but not connected**. Before moving on, write down every connection it needs to become real, so the integration work is a known backlog, not a rediscovery later.

Save one file per section at **`command-center/app/docs/connections/<section>.md`** — all sections' connection lists live together in that folder. List each with a status (❌ not wired / ⚠️ partial / ✅ live):

- **Data source(s)** — GoHighLevel resources/endpoints (or other SaaS) the section reads/writes, and what each powers.
- **AI** — any Claude calls (what they generate + suggested model), always server-side via a Pages Function, never client-side.
- **Backend endpoints** — the `/api/<section>/*` Pages Functions to build (the bridge).
- **Auth / identity** — session mode (live/test) and how the right tokens get injected.
- **Secrets / env vars** — every key/ID needed; mark which already exist vs new.
- **Webhooks** — inbound events, if any.
- **Persistence** — any store needed (drafts, settings) beyond the source of truth.
- **Per-action gating** — for each gated action (save / schedule / publish / generate), which connection turns it on.

Keep the file current: flip statuses as connections get wired. Reference: `command-center/app/docs/connections/social.md`.

## Gotchas

- **Solid-color backgrounds need `background`, not `backgroundImage`.** `style={{ backgroundImage: "#1877f2" }}` renders nothing (white-on-white). Use `background: meta.bg` so both solid colors and `linear-gradient(...)` paint. Bit us on platform glyphs and chart bars.
- **Local hash ≠ live hash.** CF builds with pnpm, you build with npm, so the content hashes differ. Don't match your local hash; watch for the live hash to *change* from its pre-push value, then grep the bundle for a shipped string.
- **Commit hygiene under shared WIP.** This repo often has several people's uncommitted/staged changes at once. Stage explicit paths, check `git diff --cached --name-status`, unstage stray staged renames (committing half of someone's rename breaks their build). Leave `App.tsx`/`nav.ts`/`index.css` edits you didn't make alone unless yours depend on them.
- **`demoMode()` is cached per tab** (sessionStorage); it reads `?demo=1` once and sticks. Fine, just know in-app navigation keeps demo on.
- **Type-only imports**: tsconfig uses `isolatedModules`; importing a type alongside values from `./shared` is fine, but don't re-export types ambiguously.
- **Don't build a dead "connect accounts / onboarding" shell** — that screen is the front door of the real backend (GHL/AI) build; ship it with that work, not as a button that can't connect.
- **No `Date.now()`/`Math.random()` in workflow scripts** if you ever script this; plain app code is fine.

## Key files (reference)

- `src/lib/nav.ts` — `NavItem.children`, `leafItems`, `flattenNav`.
- `src/components/Sidebar.tsx` — `NavItemGroup` (expandable nested nav).
- `src/routes/social/` — the reference section (Overview/Ideas/Calendar/Posts/Insights + `shared.tsx`).
- `src/components/social/SocialDialog.tsx` — reusable dialog overlay; `SocialComposerDialog`/`NewIdeaDialog`/`PlanMonthDialog` — create-flow examples; `SocialMobileTabs.tsx` — mobile sub-nav.
- `design-kit.html` (repo root) — canonical tokens/components.

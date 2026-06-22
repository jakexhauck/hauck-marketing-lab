# Client Desktop: Admin Signature Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the client desktop app (lg+) the same visual signature as the redesigned admin: Poppins display font, a dark overview hero band on the Home landing in each client's own brand color, and aligned page width/spacing.

**Architecture:** The client desktop already shares the admin's "Atelier" design system (tokens, `DesktopPage` shell, KPI tiles, tables). This plan closes the three remaining gaps: (1) flip the global display font to Poppins, (2) add a brand-colored `ClientHero` band to `HomeDesktop`, (3) align `DesktopPage`'s container rhythm to the admin's. No data, logic, routing, or phone-layout changes.

**Tech Stack:** React 19 + TypeScript, Tailwind (v4 `@import`), Vite, lucide-react, react-router-dom. CSS custom-property design tokens. Per-client brand color injected at runtime via `applyBrandVars` into `--brand-primary` / `--brand-primary-tint` / `--brand-fg`.

## Global Constraints

- No em dashes anywhere (code, comments, UI copy). Use commas, periods, parentheses, or colons.
- Do not touch phone layouts (`lg:hidden` branches), data fetching, queries, routing, or per-client branding logic.
- Match existing patterns and tokens. Do not invent new conventions or new CSS variables unless a task says so.
- Verify with build + typecheck and Playwright visual proof of the running app. No "should work".
- Hero band must stay legible (white text) for any client brand color, including light brands.

---

### Task 1: Switch display font to Poppins (global)

**Files:**
- Modify: `command-center/app/src/index.css:15`
- Modify: `command-center/app/src/routes/admin/AdminLayout.tsx` (remove `ADMIN_FONT` const lines 23-25 and its `style={ADMIN_FONT}` usage, line ~78)

**Interfaces:**
- Consumes: nothing.
- Produces: global `--font-display` now resolves to Poppins. `.font-display`, `font-display` utilities, and admin subtree all inherit it.

- [ ] **Step 1: Flip the token.** In `src/index.css` line 15, change `--font-display` value from `"Archivo", "Inter", ...` to `"Poppins", "Inter", ui-sans-serif, system-ui, sans-serif`. (Poppins weights 400-700 are already loaded in `index.html`.) Leave `--font-body` (Inter) unchanged.

- [ ] **Step 2: Drop the now-redundant admin font scope.** In `AdminLayout.tsx`, delete the `ADMIN_FONT` constant (the `{ "--font-display": '"Poppins", ... }` object) and remove `style={ADMIN_FONT}` from the root `<div>`. The admin now inherits Poppins from the global token. Remove the now-unused `CSSProperties` import if nothing else uses it.

- [ ] **Step 3: Typecheck + build.**

Run: `cd command-center/app && npm run build`
Expected: PASS, no TS errors, no unused-import errors.

- [ ] **Step 4: Commit.**

```bash
git add command-center/app/src/index.css command-center/app/src/routes/admin/AdminLayout.tsx
git commit -m "feat(command-center): Poppins as global display font (client + admin)"
```

---

### Task 2: Build the ClientHero band

**Files:**
- Create: `command-center/app/src/components/home/ClientHero.tsx`

**Interfaces:**
- Consumes: `lucide-react` `LucideIcon` type; CSS tokens `--brand-primary`, `--radius-xl`, `--shadow-sm`; the existing `admin-hero-orb` animation class in `index.css` (reused for the floating glow; confirm it exists, else inline the keyframe-free static glow).
- Produces:
  ```ts
  export interface ClientHeroKpi {
    icon: LucideIcon;
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
  }
  export default function ClientHero(props: {
    greeting: string;
    subtitle: string;
    kpis: ClientHeroKpi[];
  }): JSX.Element
  ```

- [ ] **Step 1: Write the component.** Mirror `src/routes/admin/AdminHero.tsx` structure (dark band, greeting, subtitle, KPI row), with these differences:
  - Base: a fixed deep slate gradient so white text is legible for ANY brand color: `linear-gradient(160deg, #101a2e 0%, #0a1120 100%)`.
  - Glow: a radial highlight driven by the client brand color via `color-mix`, so it adapts per client:
    `radial-gradient(620px 280px at 88% -30%, color-mix(in srgb, var(--brand-primary) 32%, transparent), transparent 70%)` layered over the base gradient.
  - KPI icons tint with the brand: `style={{ color: "var(--brand-primary)" }}` on each `<k.icon>`.
  - Use `font-display` (now Poppins) for the greeting (`text-[30px] font-semibold tracking-[-0.03em]`) and KPI values (`text-[26px] font-semibold tabular-nums`), matching `AdminHero`.
  - Subtitle and KPI labels use the same muted slate tones as `AdminHero` (`text-[#9fb0c8]`, `text-[#8a9cb6]`).
  - Wrapper: `relative mb-7 overflow-hidden rounded-[var(--radius-xl)] px-8 py-7 text-white shadow-[var(--shadow-sm)]`.
  - Keep the floating orb span (`admin-hero-orb` class) if present in `index.css`; it respects reduced-motion.

- [ ] **Step 2: Typecheck + build.**

Run: `cd command-center/app && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add command-center/app/src/components/home/ClientHero.tsx
git commit -m "feat(command-center): add brand-colored ClientHero band"
```

---

### Task 3: Wire ClientHero into HomeDesktop

**Files:**
- Modify: `command-center/app/src/components/home/HomeDesktop.tsx`

**Interfaces:**
- Consumes: `ClientHero`, `ClientHeroKpi` from `./ClientHero`.
- Produces: Home landing renders the hero band (greeting + the 4 existing KPIs) in place of the flat KPI grid; `DesktopPage` header no longer duplicates the greeting.

- [ ] **Step 1: Move the greeting into the hero.** Change the `DesktopPage` `title` for Home from `greeting(now)` to the client/app context (use the client's `brand.appName` via `useClient`, falling back to "Home"); keep `subtitle={today}` and the existing `actions`. This frees the greeting for the hero so it is not shown twice.

- [ ] **Step 2: Replace the flat KPI `<section>` with `ClientHero`.** Build a `ClientHeroKpi[]` from the same four metrics currently rendered as tiles (New leads today, Unread conversations, Open leads, Appointments today), reusing the exact same values and icons. Render `<ClientHero greeting={greeting(now)} subtitle={...} kpis={kpis} />` as the first child inside `DesktopPage`, before the two-column body. Remove the now-unused local `Kpi` component if nothing else references it.

- [ ] **Step 3: Subtitle copy.** Hero subtitle: a short status line, e.g. `${summary?.newToday ?? 0} new today, ${openLeads} open in pipeline` (no em dashes). Keep it derived from data already loaded.

- [ ] **Step 4: Typecheck + build.**

Run: `cd command-center/app && npm run build`
Expected: PASS, no unused-symbol errors.

- [ ] **Step 5: Commit.**

```bash
git add command-center/app/src/components/home/HomeDesktop.tsx
git commit -m "feat(command-center): client Home desktop overview hero"
```

---

### Task 4: Align DesktopPage container rhythm to the admin

**Files:**
- Modify: `command-center/app/src/components/desktop/DesktopPage.tsx:19,30`

**Interfaces:**
- Consumes: nothing.
- Produces: every client desktop page picks up the admin's cozier width and horizontal padding.

- [ ] **Step 1: Match the admin rhythm.** In `DesktopPage.tsx`: change the header padding from `px-8` to `px-9`, and the content container from `max-w-[1400px] px-8` to `max-w-[1220px] px-9`. Leave vertical padding (`py-4` header, `py-7` content) as-is (matches admin).

- [ ] **Step 2: Typecheck + build.**

Run: `cd command-center/app && npm run build`
Expected: PASS.

- [ ] **Step 3: Visual proof (M9).** Run the app, sign into a client desktop session at lg+, screenshot Home (hero), Dashboard, Leads, Contacts. Confirm: hero band shows in the client brand color, Poppins is active, tables/pages are not cramped at 1220. If a data-dense table feels tight, note it for review before finalizing.

- [ ] **Step 4: Commit.**

```bash
git add command-center/app/src/components/desktop/DesktopPage.tsx
git commit -m "feat(command-center): align client desktop width/padding to admin"
```

---

## Mockups checkpoint (M4)

After Task 3 builds, before finalizing the hero, produce 2-3 hero treatments and screenshot them in the running app for Jake to pick:
- A: KPIs inline in the band (the plan's default, mirrors AdminHero).
- B: Band with greeting only, KPIs as separate tiles directly below.
- C: A variant glow intensity / KPI density.

Jake picks one; keep that, delete the others. Then complete Task 4 visual proof.

## Self-Review

- **Spec coverage:** Font (Task 1), hero band brand-colored (Tasks 2-3), header/spacing alignment (Task 4), Home-only hero (Task 3), admin font-scope cleanup (Task 1). All covered.
- **Placeholder scan:** none.
- **Type consistency:** `ClientHeroKpi` / `ClientHero` signatures defined in Task 2, consumed in Task 3. Consistent.

# Client Command Center "Modern Motion" Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the live client Command Center app from green "Calm Command Deck" to the indigo/violet "Modern Motion" design kit (`design-kit.html`), in both light and a derived dark mode.

**Architecture:** The app is token-driven. `src/index.css` holds CSS-var tokens and an `@theme inline` map that turns them into Tailwind semantic utilities (`bg-surface`, `text-brand`, `border-border`) consumed by ~125 components. We repoint the token VALUES (carries most screens automatically), upgrade ~10 shared primitives for the kit's structural character (glass shell, gradient nav, KPI accent bars, sliding segmented pill, mono numerals), then sweep ~75 green hardcodes.

**Tech Stack:** React 19, Vite, Tailwind CSS v4 (`@theme inline`), TypeScript, CSS custom properties, Google Fonts.

## Global Constraints

- Brand color is indigo to violet: `--brand` `#4f46e5`, `--brand-2` `#7c73f0`, gradient `linear-gradient(135deg,#4f46e5 0%,#7c73f0 100%)`. Client app only; do NOT touch marketing site / internal portal / logo.
- Numerals use **JetBrains Mono** (`--font-mono`). Display = Poppins, body = Inter.
- Keep existing token NAMES as the public API (`--brand-primary`, `--bg`, `--surface`, `--text`, `--text-muted`, `--text-faint`, `--border`, `--brand`, `--brand-text`, `--font-mono`, ...). Repoint values; do not rename tokens that components/`@theme` already consume.
- No em dashes anywhere (code, comments, UI, docs). Use commas/periods/parentheses.
- All motion gated behind `@media (prefers-reduced-motion: reduce)`.
- No backend/data/routing/schema changes. Presentation layer only.
- Per task: `npm run typecheck` and `npm run build` must pass before commit.
- The "test" cycle for this rebrand is typecheck + build + visual check (no unit tests for pure CSS theming).

---

## File Structure

- `command-center/app/index.html` — Google Fonts load (add JetBrains Mono).
- `command-center/app/src/index.css` — token layer (`:root` light, `[data-theme="dark"]`), `@theme inline` additions, `@layer components` kit helpers. The heart of the rebrand.
- `command-center/app/src/components/BrandedButton.tsx` — button primitive.
- `command-center/app/src/components/ui/Segmented.tsx` — segmented tabs.
- `command-center/app/src/components/ui/Panel.tsx` — panel/card.
- `command-center/app/src/components/StatCard.tsx`, `StatsStrip.tsx` — KPI cards.
- `command-center/app/src/components/Avatar.tsx` — gradient avatar.
- `command-center/app/src/components/desktop/DesktopPage.tsx` — desktop shell (sidebar + topbar).
- `command-center/app/src/components/BottomNav.tsx`, `AppHeader.tsx` — mobile shell.
- `command-center/app/src/routes/admin/AdminLayout.tsx` — admin shell.
- `command-center/app/src/components/home/ClientHero.tsx` + `.client-hero-orb`/`.admin-hero-orb` in index.css — hero glows.
- `command-center/app/DESIGN.md` — system doc.

---

## Task 0: Isolated branch

**Files:** none (git only).

- [ ] **Step 1:** From repo root, create an isolated worktree/branch for the rebrand.

Run:
```bash
cd "/c/Users/games/Desktop/hauck-marketing-lab"
git worktree add ../hml-design-kit -b feat/client-modern-motion
```
Expected: new worktree at `../hml-design-kit` on branch `feat/client-modern-motion`. All subsequent paths are relative to `../hml-design-kit/command-center/app`. (If worktrees are unavailable, `git checkout -b feat/client-modern-motion` in place.)

- [ ] **Step 2:** Confirm baseline builds before any change.

Run: `cd ../hml-design-kit/command-center/app && npm install && npm run build`
Expected: build succeeds (baseline green app).

---

## Task 1: Fonts (JetBrains Mono)

**Files:** Modify `command-center/app/index.html` (the Google Fonts `<link>`).

**Interfaces:** Produces the `JetBrains Mono` family used by `--font-mono` in Task 2.

- [ ] **Step 1:** Replace the font `<link href>` to add JetBrains Mono and drop unused Archivo. New href:

```
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap
```

- [ ] **Step 2:** Verify Archivo is unused before dropping it.

Run: `cd command-center/app && grep -rin "archivo" src index.html | grep -v "fonts.googleapis"`
Expected: no matches (safe to drop). If matches exist, keep `Archivo:wght@400;600;700;800;900` in the href.

- [ ] **Step 3:** Commit.

```bash
git add command-center/app/index.html
git commit -m "feat(client-rebrand): load JetBrains Mono, drop unused Archivo"
```

---

## Task 2: Light token layer

**Files:** Modify `command-center/app/src/index.css` (the base `:root` ~lines 5-28 and the bridge `:root` ~lines 136-173).

**Interfaces:** Produces the light values for `--brand-primary`, `--brand`, `--brand-2`, `--brand-soft`, `--grad-brand`, `--brand-text`, `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--text-faint`, `--positive`, `--warning`, `--danger`, `--shadow-sm/md/lg/brand`, `--ease`, `--ease-soft`, `--font-mono`. Consumed by every component and by Tasks 4-12.

- [ ] **Step 1:** In the base `:root`, repoint brand + theme tokens to the kit (light):

```css
--brand-primary: #4f46e5;
--brand-primary-tint: #eceaff;
--brand-primary-dark: #4338ca;
--brand-fg: #ffffff;
--brand-bg: #f6f7fb;
--font-display: "Poppins", "Inter", ui-sans-serif, system-ui, sans-serif;
--font-body: "Inter", ui-sans-serif, system-ui, sans-serif;

--bg: #f6f7fb;
--surface: #ffffff;
--surface-2: #f1f3f9;
--text: #14161f;
--text-muted: #555a6b;
--text-faint: #8a90a3;
--border: #e7e9f1;
--divider: #f1f3f9;
--ring: var(--brand-primary);
```

- [ ] **Step 2:** In the bridge `:root`, repoint cockpit tokens and add kit tokens:

```css
--surface-3: #e9ebf3;
--rail: #fbfcfe;
--border-strong: #d4d8e6;
--bg-grid: #eceef6;
--text-inverse: #ffffff;

--brand: var(--brand-primary);
--brand-2: #7c73f0;
--brand-soft: #eceaff;
--grad-brand: linear-gradient(135deg, #4f46e5 0%, #7c73f0 100%);
--brand-strong: var(--brand-primary-dark);
--brand-tint: color-mix(in srgb, var(--brand) 10%, transparent);
--brand-tint-strong: color-mix(in srgb, var(--brand) 18%, transparent);
--brand-text: #4f46e5;

--ledger: #9a6f1e;
--ledger-tint: color-mix(in srgb, #9a6f1e 12%, transparent);
--positive: #16a34a;
--positive-tint: color-mix(in srgb, #16a34a 12%, transparent);
--warning: #d97706;
--warning-tint: color-mix(in srgb, #d97706 14%, transparent);
--danger: #dc2626;
--danger-tint: color-mix(in srgb, #dc2626 12%, transparent);

--shadow-sm: 0 1px 2px rgba(20,22,31,.04), 0 1px 3px rgba(20,22,31,.05);
--shadow-md: 0 6px 18px rgba(40,42,70,.07), 0 2px 6px rgba(40,42,70,.05);
--shadow-lg: 0 18px 40px rgba(40,42,70,.12), 0 6px 14px rgba(40,42,70,.07);
--shadow-brand: 0 8px 22px rgba(79,70,229,.28);

--ease: cubic-bezier(.22,1,.36,1);
--ease-soft: cubic-bezier(.4,0,.2,1);

--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
--radius-xs: 4px;
--radius-sm: 8px;
--radius: 10px;
--radius-lg: 14px;
--radius-xl: 20px;
```

- [ ] **Step 3:** Update the `body` background to the kit's radial wash. Replace the `body { background: var(--bg); ... }` rule to add:

```css
body {
  font-family: var(--font-body);
  background-color: var(--bg);
  background-image:
    radial-gradient(60rem 40rem at 12% -8%, rgba(124,115,240,.16), transparent 60%),
    radial-gradient(50rem 38rem at 100% 0%, rgba(79,70,229,.12), transparent 55%),
    radial-gradient(46rem 36rem at 50% 120%, rgba(99,102,241,.10), transparent 60%);
  background-attachment: fixed;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  /* keep existing transition/-moz-osx-font-smoothing/text-rendering lines */
}
```

- [ ] **Step 4:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5:** Commit.

```bash
git add command-center/app/src/index.css
git commit -m "feat(client-rebrand): repoint light token layer to Modern Motion (indigo)"
```

---

## Task 3: Dark token layer (derived)

**Files:** Modify `command-center/app/src/index.css` (base `[data-theme="dark"]` ~lines 30-41 and bridge `[data-theme="dark"]` ~lines 175-194).

**Interfaces:** Produces dark values for the same token names as Task 2. The kit is light-only; these are designed to match (dark glass, muted gradients).

- [ ] **Step 1:** Base dark block:

```css
[data-theme="dark"] {
  --brand-bg: #0c0d14;
  --bg: #0c0d14;
  --surface: #15161f;
  --surface-2: #1c1d28;
  --text: #f4f4fb;
  --text-muted: #a8adc0;
  --text-faint: #6b7088;
  --border: #262837;
  --divider: #20222e;
  --ring: var(--brand-primary);
}
```

- [ ] **Step 2:** Bridge dark block (muted indigo, dark glass, lighter brand-text for AA):

```css
[data-theme="dark"] {
  --surface-3: #232536;
  --rail: #0a0b11;
  --border-strong: #34374a;
  --bg-grid: #14151d;
  --text-inverse: #0c0d14;

  --brand-soft: color-mix(in srgb, var(--brand) 22%, #15161f);
  --brand-tint: color-mix(in srgb, var(--brand) 18%, transparent);
  --brand-tint-strong: color-mix(in srgb, var(--brand) 28%, transparent);
  --brand-text: color-mix(in srgb, var(--brand) 70%, white);

  --ledger: #d7ab51;
  --ledger-tint: color-mix(in srgb, #d7ab51 16%, transparent);
  --positive: #4ade80;
  --positive-tint: color-mix(in srgb, #4ade80 16%, transparent);
  --warning: #fbbf24;
  --warning-tint: color-mix(in srgb, #fbbf24 16%, transparent);
  --danger: #f87171;
  --danger-tint: color-mix(in srgb, #f87171 16%, transparent);

  --shadow-sm: 0 1px 2px rgba(0,0,0,.3), 0 1px 3px rgba(0,0,0,.34);
  --shadow-md: 0 6px 18px rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.34);
  --shadow-lg: 0 18px 40px rgba(0,0,0,.5), 0 6px 14px rgba(0,0,0,.4);
  --shadow-brand: 0 8px 22px rgba(79,70,229,.45);
}
```

- [ ] **Step 3:** Add a dark override for the body wash (lower alpha) under the bridge dark block or via a `[data-theme="dark"] body` rule:

```css
[data-theme="dark"] body {
  background-image:
    radial-gradient(60rem 40rem at 12% -8%, rgba(124,115,240,.10), transparent 60%),
    radial-gradient(50rem 38rem at 100% 0%, rgba(79,70,229,.08), transparent 55%),
    radial-gradient(46rem 36rem at 50% 120%, rgba(99,102,241,.07), transparent 60%);
}
```

- [ ] **Step 4:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5:** Commit.

```bash
git add command-center/app/src/index.css
git commit -m "feat(client-rebrand): derive dark Modern Motion palette"
```

---

## Task 4: Kit helper utilities (gradient, glass, motion, segmented)

**Files:** Modify `command-center/app/src/index.css` (`@theme inline` block and `@layer components`).

**Interfaces:** Produces utility classes `.grad-text`, `.glass`, `.glass-dark-ok`, `.reveal`, `.kpi-accent`, `.seg-pill`, `.shadow-brand` and Tailwind colors `bg-brand-2`, `bg-brand-soft`. Consumed by Tasks 5-11.

- [ ] **Step 1:** In `@theme inline`, add brand-family colors so utilities exist:

```css
--color-brand-2: var(--brand-2);
--color-brand-soft: var(--brand-soft);
```

- [ ] **Step 2:** In `@layer components`, add kit helpers:

```css
@layer components {
  .grad-text {
    background: linear-gradient(120deg, var(--text) 0%, var(--brand) 70%, var(--brand-2) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .glass {
    background: color-mix(in srgb, var(--surface) 62%, transparent);
    backdrop-filter: blur(18px) saturate(1.4);
    -webkit-backdrop-filter: blur(18px) saturate(1.4);
  }
  .shadow-brand { box-shadow: var(--shadow-brand); }
  .reveal {
    opacity: 0;
    transform: translateY(14px);
    animation: revealUp .6s var(--ease) forwards;
  }
  @keyframes revealUp { to { opacity: 1; transform: translateY(0); } }
  /* KPI top-accent bar (opacity toggled on hover by the component) */
  .kpi-accent::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 3px;
    background: var(--grad-brand);
    opacity: 0;
    transition: opacity .2s var(--ease);
  }
}
```

- [ ] **Step 3:** Extend the reduced-motion guard to neutralize `.reveal`. Add to the existing `@media (prefers-reduced-motion: reduce)` block (or create one):

```css
@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1; transform: none; animation: none; }
}
```

- [ ] **Step 4:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS. Tailwind emits `bg-brand-2`/`bg-brand-soft` utilities.

- [ ] **Step 5:** Commit.

```bash
git add command-center/app/src/index.css
git commit -m "feat(client-rebrand): add gradient/glass/motion/kpi helper utilities"
```

---

## Task 5: Button primitive

**Files:** Modify `command-center/app/src/components/BrandedButton.tsx`.

**Interfaces:** Consumes `--grad-brand`, `--shadow-brand`, `--border-strong` (Tasks 2/4). Produces the visual button language reused app-wide. Keep the existing `variant: "primary" | "secondary"` API and props unchanged.

- [ ] **Step 1:** Update primary to gradient + brand shadow, secondary to border-strong with brand hover. Replace the `className` clsx and `style`:

```tsx
className={clsx(
  "inline-flex items-center justify-center rounded-xl px-5 py-3 text-[13px] font-semibold uppercase tracking-wider transition-[transform,box-shadow,background,border-color] duration-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50",
  variant === "primary" && "text-white shadow-brand hover:brightness-[1.04]",
  variant === "secondary" &&
    "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)] hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-[var(--shadow-md)]",
  className
)}
style={{
  minHeight: "52px",
  ...(variant === "primary" ? { backgroundImage: "var(--grad-brand)" } : undefined),
}}
```

- [ ] **Step 2:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3:** Commit.

```bash
git add command-center/app/src/components/BrandedButton.tsx
git commit -m "feat(client-rebrand): gradient primary + brand-hover secondary buttons"
```

---

## Task 6: KPI / stat cards

**Files:** Modify `command-center/app/src/components/StatCard.tsx` and `command-center/app/src/components/StatsStrip.tsx`.

**Interfaces:** Consumes `.kpi-accent`, `--shadow-sm/lg`, `--font-mono`, `--ease` (Tasks 2/4). Produces the KPI visual reused on Dashboard/Today/Ads. Preserve each component's existing props.

- [ ] **Step 1:** Read both files first (`Read`), then on the outer card element add `relative overflow-hidden kpi-accent group` plus hover lift, and a `group-hover` reveal of the accent. Card wrapper classes become (merge with existing, do not drop layout/padding classes):

```
relative overflow-hidden kpi-accent group rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]
```

And add to the same element a child rule trigger: append `group-hover:[&_.kpi-accent]:opacity-100` is not valid; instead make the accent visible on hover via this utility on the card: `hover:[&.kpi-accent]:before:opacity-100`. If that arbitrary variant is rejected by the build, add a plain CSS rule in index.css `@layer components`: `.kpi-accent:hover::before { opacity: 1; }`.

- [ ] **Step 2:** Ensure the numeric value uses mono. The stat value element gets `font-data` (existing class, now JetBrains Mono via `--font-mono`). If it already uses `tabular-figs`/`stat-num`, add `font-data` alongside or switch to `font-data`.

- [ ] **Step 3:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4:** Commit.

```bash
git add command-center/app/src/components/StatCard.tsx command-center/app/src/components/StatsStrip.tsx command-center/app/src/index.css
git commit -m "feat(client-rebrand): KPI cards with gradient accent, hover lift, mono value"
```

---

## Task 7: Segmented tabs

**Files:** Modify `command-center/app/src/components/ui/Segmented.tsx`.

**Interfaces:** Consumes `--grad-brand`, `--shadow-brand`, `--surface-2`, `--ease`. Produces the sliding-pill segmented control. Preserve the component's existing props/API.

- [ ] **Step 1:** Read the file. Wrap the options in a pill track `inline-flex bg-[var(--surface-2)] border border-[var(--border)] rounded-full p-1 relative`. Active segment text is white; inactive is `text-[var(--text-muted)]`.

- [ ] **Step 2:** Implement the moving pill. If the component already tracks an active index, render an absolutely-positioned pill `absolute top-1 bottom-1 rounded-full` with `background: var(--grad-brand)`, `box-shadow: var(--shadow-brand)`, and `transition: transform .32s var(--ease), width .32s var(--ease)`, positioned via a ref-measured left/width or via `style={{ width: \`${100/count}%\`, transform: \`translateX(${activeIndex*100}%)\` }}` when segments are equal width. Each segment button: `relative z-10 px-4 py-2 text-[13px] font-medium rounded-full transition-colors`.

- [ ] **Step 3:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4:** Commit.

```bash
git add command-center/app/src/components/ui/Segmented.tsx
git commit -m "feat(client-rebrand): sliding gradient pill segmented tabs"
```

---

## Task 8: Panels, inputs, tables

**Files:** Modify `command-center/app/src/components/ui/Panel.tsx`; add input/table helper classes to `command-center/app/src/index.css` `@layer components`.

**Interfaces:** Consumes radii + shadows + `--border-strong` + `--brand`. Produces `.field-input`, `.data-table` helpers and updated Panel. Many inputs/tables are inline-classed per screen; provide reusable helpers and apply Panel update so most cards inherit.

- [ ] **Step 1:** Update Panel wrapper classes (merge, keep existing padding/layout): `rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]`.

- [ ] **Step 2:** Add input + table helpers to `@layer components`:

```css
.field-input {
  width: 100%;
  font-size: 14px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 11px 14px;
  transition: border-color .2s var(--ease), box-shadow .2s var(--ease);
}
.field-input::placeholder { color: var(--text-faint); }
.field-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 4px var(--brand-tint);
}
.data-th {
  text-align: left;
  font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
  color: var(--text-faint);
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.data-tr { transition: background .18s var(--ease); }
.data-tr:hover { background: var(--surface-2); }
```

- [ ] **Step 3:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4:** Commit.

```bash
git add command-center/app/src/components/ui/Panel.tsx command-center/app/src/index.css
git commit -m "feat(client-rebrand): Panel + input/table kit helpers"
```

---

## Task 9: Desktop shell (glass sidebar + topbar)

**Files:** Modify `command-center/app/src/components/desktop/DesktopPage.tsx` and `command-center/app/src/components/Avatar.tsx`.

**Interfaces:** Consumes `.glass`, `--grad-brand`, `--shadow-brand`. Produces the frosted shell with gradient-active nav. Preserve routing, nav data, and props.

- [ ] **Step 1:** Read `DesktopPage.tsx`. Apply `glass` + border to the sidebar container and the topbar container (replace any solid `bg-[var(--surface)]` on those two chrome elements with `glass border-[color-mix(in_srgb,white_60%,transparent)]`, keeping layout classes).

- [ ] **Step 2:** Active nav item: gradient background + white text + brand shadow. Active item classes: `text-white shadow-brand` with `style={{ backgroundImage: "var(--grad-brand)" }}`; inactive: `text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,white_70%,transparent)] hover:text-[var(--text)] hover:translate-x-0.5 transition`. The brand mark/logo box uses `style={{ backgroundImage: "var(--grad-brand)" }}` + `shadow-brand`.

- [ ] **Step 3:** `Avatar.tsx`: give the fallback/initials avatar `style={{ backgroundImage: "var(--grad-brand)" }}` + `text-white shadow-brand` (replace any solid brand bg).

- [ ] **Step 4:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5:** Commit.

```bash
git add command-center/app/src/components/desktop/DesktopPage.tsx command-center/app/src/components/Avatar.tsx
git commit -m "feat(client-rebrand): glass desktop shell, gradient-active nav, gradient avatar"
```

---

## Task 10: Mobile shell + admin shell

**Files:** Modify `command-center/app/src/components/BottomNav.tsx`, `command-center/app/src/components/AppHeader.tsx`, `command-center/app/src/routes/admin/AdminLayout.tsx`.

**Interfaces:** Consumes `.glass`, `--grad-brand`, `--brand`. Produces consistent shell treatment on phone + admin. Preserve nav data/routes.

- [ ] **Step 1:** Read all three. `BottomNav`: active tab icon/label uses `text-[var(--brand)]` (or a small gradient pill behind the active icon: a `span` with `var(--grad-brand)`); bar container gets `glass` + top border. `AppHeader`: `glass` + bottom border, brand mark gradient.

- [ ] **Step 2:** `AdminLayout`: apply the same sidebar/topbar glass + gradient-active treatment as Task 9 (admin derives from the same tokens; confirm its accents now read indigo, not green).

- [ ] **Step 3:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4:** Commit.

```bash
git add command-center/app/src/components/BottomNav.tsx command-center/app/src/components/AppHeader.tsx command-center/app/src/routes/admin/AdminLayout.tsx
git commit -m "feat(client-rebrand): mobile + admin shells adopt glass and gradient brand"
```

---

## Task 11: Hero glows + gradient headings

**Files:** Modify `command-center/app/src/index.css` (`.admin-hero-orb`) and `command-center/app/src/components/home/ClientHero.tsx`.

**Interfaces:** Consumes `var(--brand)` and `.grad-text`. Produces on-brand hero. `.client-hero-orb` already uses `var(--brand)` (auto-indigo); `.admin-hero-orb` is hardcoded green.

- [ ] **Step 1:** In index.css, change `.admin-hero-orb` background from `rgba(77,187,131,.5)` to `color-mix(in srgb, var(--brand) 50%, transparent)` so it tracks the brand (now indigo).

- [ ] **Step 2:** In `ClientHero.tsx`, apply `.grad-text` to the main hero headline (replace any solid `text-[var(--text)]` heading with `className="grad-text ..."`). Keep size/weight classes.

- [ ] **Step 3:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4:** Commit.

```bash
git add command-center/app/src/index.css command-center/app/src/components/home/ClientHero.tsx
git commit -m "feat(client-rebrand): brand-tracked hero orbs + gradient headline"
```

---

## Task 12: Green hardcode sweep

**Files:** Modify any `*.tsx`/`*.css` under `command-center/app/src` that hardcodes green.

**Interfaces:** Replaces literal greens with tokens. No new interfaces.

- [ ] **Step 1:** Enumerate the offenders.

Run: `cd command-center/app && grep -rIn "4dbb83\|36a06d\|4DBB83\|#4dbb8\|rgb(77, 187, 131)\|77,187,131" src`
Expected: a list (~the 75 from the spec, minus those already fixed in Tasks 2/11).

- [ ] **Step 2:** For each hit, replace the literal with the right token: brand fills to `var(--brand)` / `var(--grad-brand)`; brand text to `var(--brand-text)`; tints to `var(--brand-tint)`. Where a Tailwind utility is in use (`text-[#4dbb83]`), swap to `text-[var(--brand-text)]` / `text-brand`. Do NOT change non-client files outside `command-center/app`.

- [ ] **Step 3:** Re-grep to confirm zero remain.

Run: `grep -rIn "4dbb83\|36a06d\|77,187,131" src`
Expected: no matches.

- [ ] **Step 4:** Typecheck + build.

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5:** Commit.

```bash
git add command-center/app/src
git commit -m "feat(client-rebrand): sweep remaining green hardcodes to brand tokens"
```

---

## Task 13: DESIGN.md

**Files:** Modify `command-center/app/DESIGN.md`.

**Interfaces:** Doc only. Reflects the shipped token values from Tasks 2-4.

- [ ] **Step 1:** Update the frontmatter `colors` (primary `#4f46e5`, primary-deep `#4338ca`, primary-tint `#eceaff`, primary-text `#4f46e5`, brand-2 `#7c73f0`, gradient, surfaces/text per Task 2, dark per Task 3, positive/warning/danger per Task 2) and `typography` (mono = JetBrains Mono). Update prose describing the system to "Modern Motion": glass surfaces, gradient brand accent, mono numerals, soft diffuse shadows, considered motion. No em dashes.

- [ ] **Step 2:** Commit.

```bash
git add command-center/app/DESIGN.md
git commit -m "docs(client-rebrand): update DESIGN.md to Modern Motion system"
```

---

## Task 14: Verify and visual proof

**Files:** none (verification).

- [ ] **Step 1:** Full typecheck + build clean.

Run: `cd command-center/app && npm run typecheck && npm run build`
Expected: PASS, no warnings about missing tokens/utilities.

- [ ] **Step 2:** Run the app locally (use the run skill or `npm run dev`). Capture screenshots in BOTH light and dark of: Login, Home/Dashboard, Today, Leads (table), a Lead detail, Paid Ads, Comms, Settings, and one admin route.

- [ ] **Step 3:** Compare against `design-kit.html`: gradient primary buttons, glass sidebar/topbar, gradient-active nav, segmented sliding pill, KPI accent + hover lift, JetBrains Mono numerals, 4px brand focus ring, indigo (not green) everywhere.

- [ ] **Step 4:** Reduced-motion: set OS/devtools "reduce motion" and confirm reveals/animations collapse.

- [ ] **Step 5:** Final green grep across the app: `grep -rIn "4dbb83\|36a06d\|77,187,131" command-center/app/src` returns nothing.

- [ ] **Step 6:** Report results with screenshots. Do NOT claim done without showing evidence (verification-before-completion).

---

## Self-Review notes

- Spec coverage: token layer (T2/T3) ✓, fonts/mono (T1) ✓, primitives buttons/KPI/segmented/panel/forms/tables (T5-T8) ✓, shells desktop/mobile/admin (T9/T10) ✓, hero + gradient headings (T11) ✓, hardcode sweep (T12) ✓, DESIGN.md (T13) ✓, dark derived (T3) ✓, verification both themes (T14) ✓, isolation branch (T0) ✓.
- Per-tenant brand risk (spec): `--brand` is set from `--brand-primary`; we hardcode indigo at `--brand-primary`, so the `var(--brand)`-tracking components (client-hero-orb, admin-hero-orb after T11) follow automatically. No separate tenant-theming hook found in scope; flagged, no code path blocks the change.
- Tokens used in later tasks (`--grad-brand`, `--shadow-brand`, `--brand-tint`, `.glass`, `.kpi-accent`, `.grad-text`, `.reveal`, `--font-mono`) are all defined in T2/T4. Names consistent across tasks.

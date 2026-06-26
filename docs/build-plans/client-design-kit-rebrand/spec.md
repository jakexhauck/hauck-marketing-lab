# Spec: Client Command Center "Modern Motion" Rebrand

Date: 2026-06-26
Status: Design approved, plan pending
Owner: Jake (decisions) / builder (implementation)

## What and why

Rebrand the live client-facing Command Center app (`command-center/app`, package
`client-dashboard`, live at app.hauckmarketing.com) from the current green "Calm
Command Deck" system to the chosen **"Modern Motion"** design kit
(repo-root `design-kit.html`, issue #5 winner).

Modern Motion is a light, airy direction: glass surfaces, an indigo-to-violet
gradient brand accent, mono numerals, soft diffuse shadows, and considered
micro-motion (hover lifts, sliding segmented pills, staggered reveals).

Definition of done: every client-side route and the admin routes read as the
Modern Motion kit in both light and a derived dark mode; the design kit's
component language (buttons, KPI cards, segmented tabs, glass shell, tables,
forms, badges) is reflected in the app's shared primitives; no green brand
hardcodes remain; the app builds, typechecks, and is visually verified on key
screens before merge.

## Locked decisions

1. **Master kit**: repo-root `design-kit.html` ("Variation 2 / Modern Motion"). The
   `-v1/-v3/-preview` variants are discarded.
2. **Scope**: full rebrand of the live app (Approach A below), not a reference page.
3. **Brand color**: adopt the kit's indigo to violet (`#4f46e5` to `#7c73f0`)
   exactly. The client app intentionally diverges from Hauck logo green and stands
   on its own. (Marketing site, internal portal, and logo stay green; this is
   client-app only.)
4. **Dark mode**: keep the existing light/dark toggle working by deriving a dark
   Modern Motion palette (dark glass, muted gradients).
5. **Numerals**: adopt **JetBrains Mono** for KPI values, metrics, IDs, and
   timestamps (replaces the current IBM Plex Mono / tabular-Inter numeral
   treatment).

## Approach A (chosen): token layer first, then shared primitives, then sweep

The app is already token-driven. Base tokens live in `src/index.css` `:root`
(`--brand-primary`, `--bg`, `--surface`, `--text`, `--border`, ...), a second
`:root` "token bridge" adds cockpit tokens (`--brand`, `--brand-text`, shadows,
`--font-mono`, radii), and an `@theme inline` block maps those vars to Tailwind
semantic utilities (`bg-surface-2`, `text-brand`, `border-border`, ...) that the
~125 components consume. Repointing the token *values* therefore rebrands most of
the app automatically.

Rejected alternatives:
- **B. Per-screen rewrite** of all ~30 routes against kit markup: highest
  fidelity, but slow and risky on a live app.
- **C. CSS theme swap only**: fast, but misses the kit's structural character
  (glass shell, gradient-active nav, KPI accent bars, motion).

## Design

### 1. Token layer (`src/index.css`)

Keep the existing token *names* as the public API; repoint values to the kit and
add the few tokens the kit needs that the app lacks.

Light `:root`:
- `--bg: #f6f7fb`, `--surface: #ffffff`, `--surface-2: #f1f3f9`
- `--border: #e7e9f1`, `--border-strong: #d4d8e6`
- `--text` (primary) `#14161f`, `--text-muted` (secondary) `#555a6b`,
  `--text-faint` (tertiary) `#8a90a3`
- Brand: `--brand-primary: #4f46e5`, `--brand-2: #7c73f0`,
  `--brand-soft: #eceaff`, `--brand-text: #4f46e5` (indigo clears AA on white as
  small text, so brand-text can equal brand)
- `--grad-brand: linear-gradient(135deg, #4f46e5 0%, #7c73f0 100%)`
- Status: `--positive: #16a34a`, `--warning: #d97706`, `--danger: #dc2626`
  (plus existing `-tint` variants recomputed via color-mix)
- Shadows (softer, more diffuse than current):
  `--shadow-sm/md/lg` per kit + new `--shadow-brand: 0 8px 22px rgba(79,70,229,.28)`
- Easing: `--ease: cubic-bezier(.22,1,.36,1)`, `--ease-soft: cubic-bezier(.4,0,.2,1)`
- Radii: confirm `--radius-lg: 14px` (card), add/confirm `--r-btn` 10px, pill 999px
- `--font-mono: "JetBrains Mono", ui-monospace, monospace` (was IBM Plex Mono)
- Body gets the kit's three radial-gradient wash, `background-attachment: fixed`

Dark `[data-theme="dark"]` (derived, not in the kit; design to match):
- Deep indigo-tinted base, e.g. `--bg: #0c0d14`, `--surface: #15161f`,
  `--surface-2: #1c1d28`, glass surfaces use translucent dark instead of white
- Brand stays indigo/violet but gradients and glows muted (lower alpha)
- `--brand-text` lightened for AA on dark (e.g. color-mix brand with white)
- Recompute shadows and the body wash for dark

Fonts: add JetBrains Mono to the existing Google Fonts load (Poppins + Inter
already present). Keep Poppins display / Inter body.

### 2. Shared primitives (where the kit's character lives)

Upgrade these existing components / classes to match the kit. Each already exists
in `src/components` or as utility classes; map kit CSS to the app's
Tailwind/className approach:

- **Buttons** (`BrandedButton.tsx` + button utility classes): gradient primary
  with `--shadow-brand` and scale-on-press; secondary (surface + border-strong,
  brand hover); ghost; danger. Sizes sm/md/lg.
- **Badges / status pills**: brand/positive/warning/danger/neutral with leading dot.
- **KPI / stat cards** (dashboard, today, ads): hover lift + gradient top-accent
  bar; mono value; up/down trend in mono.
- **Segmented tabs**: sliding gradient pill behind the active segment.
- **Sidebar (desktop) + topbar**: frosted glass (`backdrop-filter`), gradient
  brand mark, gradient-active nav item with count pill, circular icon buttons,
  gradient avatar. Mobile bottom nav adopts the same active treatment.
- **Panels / cards**: surface + border + soft shadow, `--radius-lg`.
- **Data tables**: uppercase tertiary head on surface-2, row hover, mono value
  columns, divider borders.
- **Forms / inputs**: border-strong default, brand focus border + 4px soft ring;
  error state with danger ring.
- **Collapsibles / filter panels**: chevron rotate, slide-down reveal.
- **Skeletons**: shimmer using surface-2 gradient.
- **Reveal**: optional staggered fade-up on route content mount; gated behind
  `prefers-reduced-motion`.

All motion respects `@media (prefers-reduced-motion: reduce)` (kit already does).

### 3. Hardcode sweep

Replace the ~75 hardcoded green refs (`#4dbb83`, `#36a06d`, raw `brand-primary`
literals) in `*.tsx` / `*.css` with the semantic tokens / Tailwind utilities so
nothing carries the old green. Admin routes (`src/routes/admin/*`) derive from the
same token layer; verify their hero/accent treatments pick up indigo.

### 4. DESIGN.md

Update `command-center/app/DESIGN.md` frontmatter and prose to the Modern Motion
system (colors, gradient, shadows, JetBrains Mono, motion language) so the doc
stays the source of truth and matches the shipped tokens.

## Components and data flow

No data-flow, routing, API, or schema changes. This is purely the presentation
layer: `index.css` token values + the `@theme inline` map, shared component
className/markup, and the Google Fonts load. React Query, Supabase, functions,
and routes are untouched.

## Testing and verification

- `npm run typecheck` and `npm run build` pass.
- Run the app locally; capture screenshots (Playwright or the run skill) of:
  Login, Home/Dashboard, Today, Leads (table), a Lead detail, Paid Ads (KPIs +
  charts), Comms, Settings, and one admin route, in **both** light and dark.
- Visual check against `design-kit.html`: gradient brand, glass shell,
  segmented pill, KPI accent + hover, mono numerals, focus rings.
- Reduced-motion check: animations collapse.
- No green remains: re-grep for `4dbb83` / `36a06d` returns only intentional
  non-client references (none expected in `command-center/app`).

## Risks and safety

- This is the live app for Willis's team. Build on an isolated branch / worktree,
  complete the full rebrand, verify visually in both themes, then ship in one
  merge (no half-rebranded intermediate deploy).
- Dark mode is derived (not in the kit), so it carries the most design risk;
  verify it explicitly before merge.
- Per-tenant brand: the bridge comment notes brand "tracks the tenant brand." If a
  per-tenant override path exists, confirm hardcoding indigo at `--brand-primary`
  does not break a future tenant theming hook. (Currently single-tenant; flag for
  the plan.)

## Out of scope

- Marketing site, internal portal, blueprint, logo (stay green).
- New screens, features, or copy changes.
- Any backend, data, or routing change.

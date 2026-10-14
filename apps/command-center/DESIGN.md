---
name: Hauck Command Center
description: Modern Motion: a light, airy command deck with glass surfaces, an indigo-to-violet gradient brand accent, mono numerals, and considered micro-motion.
colors:
  primary: "#4f46e5"
  primary-2: "#7c73f0"
  gradient: "linear-gradient(135deg, #4f46e5 0%, #7c73f0 100%)"
  primary-deep: "#4338ca"
  primary-tint: "#eceaff"
  primary-text: "#4f46e5"
  primary-fg: "#ffffff"
  bg: "#f6f7fb"
  surface: "#ffffff"
  surface-2: "#f1f3f9"
  surface-3: "#e9ebf3"
  border-strong: "#d4d8e6"
  ink: "#14161f"
  ink-muted: "#555a6b"
  ink-faint: "#8a90a3"
  border: "#e7e9f1"
  divider: "#f1f3f9"
  dark-bg: "#0c0d14"
  dark-surface: "#15161f"
  dark-surface-2: "#1c1d28"
  dark-surface-3: "#232536"
  dark-ink: "#f4f4fb"
  dark-ink-muted: "#a8adc0"
  dark-border: "#262837"
  positive: "#16a34a"
  warning: "#d97706"
  danger: "#dc2626"
  ledger: "#9a6f1e"
typography:
  display:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.5vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.656rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "6px"
  base: "9px"
  lg: "14px"
  xl: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.base}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.base}"
    padding: "10px 18px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "10px 18px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.base}"
    padding: "10px 18px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.base}"
    padding: "10px 18px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "10px 12px"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Hauck Command Center

## 1. Overview

**Creative North Star: "Modern Motion"**

This is a premium control room for running a business, rendered light and airy. The operator sits down, and the one number that matters is already looking back at them. It fuses Linear's precision (exact spacing, tight type) with a softer, more modern surface language: frosted glass chrome, a confident indigo-to-violet gradient accent, mono numerals, and considered micro-motion (hover lifts, a sliding segmented pill, staggered reveals). It reads expensive and alive, never cold or clinical.

Depth and polish come from precision plus a small, disciplined amount of motion and glass, not from clutter. Hierarchy is built with space, weight, and the gradient accent used sparingly. The product handles clients' leads and their money, so every surface should feel handled and reliable: considered empty states, honest feedback, no dead ends. Every animation respects reduced-motion.

It explicitly rejects the cluttered agency-CRM look (GoHighLevel and its kin), template SaaS (identical card grids, the "AI made this" dashboard), and sterile gray-on-gray enterprise. Premium, never dull. Clear, never crowded.

**Key Characteristics:**
- Light, airy surfaces over a soft radial wash, one obvious focal point per screen
- Indigo-to-violet gradient as a strictly rationed accent (buttons, brand marks, active nav)
- Frosted-glass shell chrome (sidebar, topbar, bottom nav)
- JetBrains Mono numerals for a precise, engineered data feel
- Considered micro-motion, always reduced-motion safe
- One system expressed three ways (client desktop baseline, admin tower, mobile)

## 2. Colors

A light indigo-accented palette: cool neutrals do the work, the indigo-to-violet gradient commands, and semantic colors appear only when they carry meaning. The brand is per-tenant (applied at runtime via `applyBrandVars`); the default tenant brand is indigo.

### Primary
- **Brand Indigo** (#4f46e5): The brand and primary action color. Used for primary-button fills, brand marks, active nav, and key focal accents. Its authority depends on its rarity; it is not a background wash. Text *on* the brand fill is white (`--brand-fg`), chosen automatically by luminance.
- **Brand Violet** (#7c73f0): The second stop of the gradient. Brand fills, marks, and active nav use the gradient `linear-gradient(135deg, #4f46e5, #7c73f0)`, not a flat fill.
- **Brand Ink** (#4f46e5): Brand-colored *text* on light surfaces (active-nav labels, links, kickers). Indigo clears AA as small text on white, so it equals the fill; in dark mode it lightens automatically.
- **Deep Indigo** (#4338ca): The pressed/hover state of a flat brand fill.
- **Indigo Mist** (#eceaff): A soft tint of the brand, for soft brand backgrounds and selected states.

### Neutral (Light)
- **Deck White** (#ffffff): Primary surface for panels, cards, inputs.
- **Mist Canvas** (#f6f7fb): The app background, carrying a soft three-point radial indigo wash.
- **Recess** (#f1f3f9) and **Ledge** (#e9ebf3): Secondary and tertiary surfaces for layering.
- **Ink** (#14161f): Primary text. Carries near all body and heading copy.
- **Ink Muted** (#555a6b): Secondary text, captions, inactive labels. Must still clear 4.5:1.
- **Ink Faint** (#8a90a3): Tertiary hints only; never body text.
- **Hairline** (#e7e9f1) / **Border Strong** (#d4d8e6) / **Divider** (#f1f3f9): Borders and separators.

### Neutral (Dark, derived)
- **Night** (#0c0d14): App background, with a muted version of the radial wash.
- **Night Surface** (#15161f), **Night Surface 2** (#1c1d28), **Night Surface 3** (#232536): Layered surfaces. Glass chrome uses translucent dark instead of translucent white.
- **Moon Ink** (#f4f4fb): Primary text. **Moon Muted** (#a8adc0): secondary. **Night Hairline** (#262837): borders.

### Semantic (use only to carry meaning)
- **Positive** (#16a34a light / #4ade80 dark): Wins, healthy metrics, success.
- **Warning** (#d97706 light / #fbbf24 dark): Attention, at-risk.
- **Danger** (#dc2626 light / #f87171 dark): Destructive actions, failures, lost.
- **Ledger Gold** (#9a6f1e light / #d7ab51 dark): Money only. Revenue, billing, ledger figures. Never decorative.

### Named Rules
**The One Voice Rule.** The brand accent covers at most 10 percent of any screen. One primary action per view in the gradient; everything else is neutral. Its scarcity is what makes it read as premium.

**The Ledger Rule.** Gold means money and nothing else. If a value is not currency, it is never gold.

**The No-Wash Rule.** The gradient is an accent, never a large-area background fill. The only bold brand surfaces are the signature hero band (dark, with a brand glow) and the login brand panel.

**The Glass Rule.** Frosted glass is for shell chrome only (sidebar, topbar, bottom nav, headers), never for content cards. Content stays on solid surfaces so data reads cleanly.

## 3. Typography

**Display Font:** Poppins (with system-ui, sans-serif)
**Body Font:** Inter (with system-ui, sans-serif)
**Label / Data Font:** JetBrains Mono (with ui-monospace, monospace)

**Character:** Poppins brings a confident, premium geometric weight to headings and key figures (medium weight, tight tracking); Inter keeps body copy clean and highly legible at density; JetBrains Mono gives numbers, IDs, and timestamps a tabular, engineered precision and the kit's "data" feel. The pairing reads competent and modern, never decorative.

### Hierarchy
- **Display** (Poppins 600, clamp 1.5 to 2.25rem, line-height 1.1, tracking -0.03em): Page titles and the signature hero only.
- **Headline** (Poppins 600, 1.25rem, line-height 1.2): Section and panel titles.
- **Title** (Poppins 600, 1rem, line-height 1.3): Card titles, list-group headers.
- **Body** (Inter 400, 0.9375rem, line-height 1.55): All reading copy. Cap measure at 65 to 75 characters.
- **Label** (JetBrains Mono 600, 0.656rem, uppercase, tracking 0.08em): Kickers and small structural labels. Used sparingly.
- **Data** (JetBrains Mono 500, 0.875rem, tabular): Numbers, money, IDs, timestamps, KPI values.

### Named Rules
**The Tabular Rule.** Every number that can change (money, counts, times) uses tabular figures so columns never shift.

**The Quiet Label Rule.** Mono uppercase labels are structural seasoning, not decoration. If a label is not earning its place, delete it. Do not put one above every section.

## 4. Elevation

Depth is built primarily through tonal layering (Canvas behind Surface behind Recess), with a restrained three-step shadow vocabulary reserved for genuine elevation. Surfaces are calm and mostly flat at rest; shadow appears as a response to state or to lift truly floating elements (menus, modals, dragged cards). Shadows are tinted to the ink hue, never pure black.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(20,26,35,0.06), 0 1px 1px rgba(20,26,35,0.04)`): Subtle separation for cards on canvas.
- **Raised** (`box-shadow: 0 4px 12px rgba(20,26,35,0.08), 0 2px 4px rgba(20,26,35,0.05)`): Hover lift, popovers, dropdowns.
- **Floating** (`box-shadow: 0 16px 48px rgba(20,26,35,0.16), 0 4px 12px rgba(20,26,35,0.08)`): Modals, sheets, dragged items.

### Named Rules
**The Layer-First Rule.** Reach for a tonal surface step before reaching for a shadow. Shadows are for things that actually float, not for decorating every card.

## 5. Components

### Buttons
- **Shape:** Rounded (10px base radius).
- **Primary:** Indigo-to-violet gradient fill, white text, brand shadow, 10px by 18px padding. One per view. Active scales to 0.96 for a tactile press.
- **Hover / Focus:** Hover brightens the gradient slightly; focus shows a visible 2px ring at AA contrast.
- **Secondary:** White surface, ink text, strong border, brand-colored border + text on hover. **Ghost:** transparent, muted ink, no border until hover. **Danger:** Danger fill, separated spatially from primary actions.

### Badges / Status Pills
- **Style:** Tone-based (neutral, brand, positive, warning, danger) with a small leading dot. Soft tinted background, never a loud fill.
- **Rule:** Status is carried by dot plus label, never color alone (AA, color-blind safe).

### Cards / Panels
- **Corner Style:** 14px (lg) radius.
- **Background:** Deck White on the Mist Canvas wash; in dark, Night Surface on Night. Solid surfaces, never glass.
- **Shadow Strategy:** Soft, diffuse resting shadow by default; raised on interactive hover (lift plus larger shadow). KPI cards reveal a gradient top-accent bar on hover.
- **Border:** Hairline (#e7e9f1). **Internal Padding:** 20px. Never nest a card inside a card.

### Inputs / Fields
- **Style:** White surface, strong border (#d4d8e6), 10px radius, label always above the field.
- **Focus:** Border shifts to brand indigo with a soft 4px brand-tint focus ring; no glow.
- **Error / Disabled:** Error border in Danger with message below the field; disabled drops to ~45 percent opacity with a not-allowed cursor.

### Navigation
- **Style:** Persistent frosted-glass left rail on desktop (lg+), frosted-glass bottom tab bar (max 4 to 5) on mobile.
- **States:** Active item uses the gradient fill with white text (a gradient chip behind the active mobile tab icon) and a subtle slide on hover; inactive is muted ink. Active location is always obvious.
- **Mobile:** Bottom nav for top-level destinations only; never nest sub-navigation inside it.

### Segmented Control
A pill track on Surface 2 with a sliding gradient pill behind the active segment (geometry measured from the active button, 0.32s ease). Active label white, inactive muted.

### Signature Component: The Hero Band
A single dark hero band per screen (`linear-gradient(160deg, #1a1840 0%, #0c0d1e 100%)`) with a brand-colored radial glow, rounded corners, bleeding under the status bar on mobile. It is the one place a bold dark surface fills the view. One per screen, never stacked. The login brand panel is its full-bleed gradient sibling.

## 6. Do's and Don'ts

### Do:
- **Do** give every screen one obvious focal point; when in doubt, remove, group, or add space.
- **Do** keep the brand gradient to roughly 10 percent of a screen and one primary action per view.
- **Do** build depth with tonal surface steps, space, soft shadows, and glass chrome (chrome only).
- **Do** use JetBrains Mono tabular figures for all money, counts, times, IDs, and KPI values.
- **Do** pair every status color with a dot, icon, or label so meaning never rides on color alone.
- **Do** keep body text at AA (4.5:1), placeholder and helper text included, in both light and dark.

### Don't:
- **Don't** make it cluttered or busy. If a screen feels packed, it has failed even if it looks polished. This is the hardest rule.
- **Don't** look like GoHighLevel or a generic agency CRM (every feature crammed in, noisy, cheap).
- **Don't** ship template-SaaS clichés: identical icon-heading-text card grids, the "AI made this" dashboard. The brand gradient is a rationed accent, not a lazy wash on every surface.
- **Don't** fall into sterile gray-on-gray enterprise. Premium, never dull.
- **Don't** wash large areas in the brand gradient, put glass on content cards, or use gold for anything that is not money.
- **Don't** put a mono uppercase label above every section, and never nest a card inside a card.

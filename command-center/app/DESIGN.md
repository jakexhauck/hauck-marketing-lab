---
name: Hauck Command Center
description: A calm, premium command deck for running client pipelines and agency ops.
colors:
  primary: "#4dbb83"
  primary-deep: "#36a06d"
  primary-tint: "#e6f7ee"
  primary-text: "#1f8551"
  primary-fg: "#06140f"
  bg: "#f8fafc"
  surface: "#ffffff"
  surface-2: "#f1f5f9"
  surface-3: "#e3e8ee"
  ink: "#0f172a"
  ink-muted: "#64748b"
  ink-faint: "#94a3b8"
  border: "#e2e8f0"
  divider: "#f1f5f9"
  dark-bg: "#0b1220"
  dark-surface: "#111827"
  dark-surface-2: "#1f2937"
  dark-surface-3: "#232c38"
  dark-ink: "#f8fafc"
  dark-ink-muted: "#94a3b8"
  dark-border: "#1f2937"
  positive: "#1f7a4d"
  warning: "#b5751c"
  danger: "#c0413c"
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
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.656rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
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

**Creative North Star: "The Calm Command Deck"**

This is a premium control room for running a business. The operator sits down, and the one number that matters is already looking back at them. Nothing shouts, nothing crowds, nothing has to be hunted for. It fuses Linear's precision (exact spacing, tight type, considered restraint) with the breathing room of Notion and Height, so it reads as expensive without feeling cold or clinical. The navy brand color carries quiet authority; the surfaces stay calm so the data can speak.

Depth and polish come from precision, not decoration. Hierarchy is built with space, weight, and a single confident accent, never with gradients, glows, or busy ornament. The product handles clients' leads and their money, so every surface should feel handled and reliable: considered empty states, honest feedback, no dead ends.

It explicitly rejects the cluttered agency-CRM look (GoHighLevel and its kin), template SaaS (default purple gradients, identical card grids, the "AI made this" dashboard), and sterile gray-on-gray enterprise. Premium, never dull. Clear, never crowded.

**Key Characteristics:**
- Calm surfaces, one obvious focal point per screen
- Quiet navy authority with a strictly rationed accent
- Effortless reading: text is always easy to find and re-find
- Depth through space and weight, not effects
- One system expressed three ways (client desktop baseline, admin tower, mobile)

## 2. Colors

A restrained slate-and-navy palette: cool neutrals do the work, navy commands, and semantic colors appear only when they carry meaning.

### Primary
- **Hauck Green** (#4dbb83): The brand and primary action color (shared with the internal site). Used for primary-button fills, the brand mark, active-nav accent bars, and key focal accents. Its authority depends on its rarity; it is not a background wash. Because the green is light, text *on* the green fill is near-black `--brand-fg` (#06140f), never white, exactly like the internal site.
- **Brand Ink** (#1f8551): The deeper green used for brand-colored *text* on light surfaces (active-nav labels, links, kickers). The bright fill green fails AA as small text on white; this clears it (~4.6:1). In dark mode it lightens automatically.
- **Deep Green** (#36a06d): The pressed and hover state of a green fill.
- **Green Mist** (#e6f7ee): A soft tint of the brand, used for active-nav backgrounds and selected states. The only place the brand gets soft.

> Note: the phone **Navy Hero** signature header (below) is still a dark navy gradient. Switching it to a dark-green hero to match the internal site is an open decision, tracked separately from this green-accent rollout.

### Neutral (Light)
- **Deck White** (#ffffff): Primary surface for panels, cards, inputs.
- **Slate Canvas** (#f8fafc): The app background behind surfaces.
- **Slate Recess** (#f1f5f9) and **Slate Ledge** (#e3e8ee): Secondary and tertiary surfaces for layering without shadow.
- **Ink** (#0f172a): Primary text. Carries near all body and heading copy.
- **Ink Muted** (#64748b): Secondary text, captions, inactive labels. Must still clear 4.5:1.
- **Ink Faint** (#94a3b8): Tertiary hints only; never body text.
- **Hairline** (#e2e8f0) and **Divider** (#f1f5f9): Borders and separators.

### Neutral (Dark)
- **Night** (#0b1220): App background.
- **Night Surface** (#111827), **Night Surface 2** (#1f2937), **Night Surface 3** (#232c38): Layered surfaces.
- **Moon Ink** (#f8fafc): Primary text. **Moon Muted** (#94a3b8): secondary. **Night Hairline** (#1f2937): borders.

### Semantic (use only to carry meaning)
- **Positive Green** (#1f7a4d light / #4fb585 dark): Wins, healthy metrics, success.
- **Warning Amber** (#b5751c light / #e0a64a dark): Attention, at-risk.
- **Danger Red** (#c0413c light / #e06560 dark): Destructive actions, failures, lost.
- **Ledger Gold** (#9a6f1e light / #d7ab51 dark): Money only. Revenue, billing, ledger figures. Never decorative.

### Named Rules
**The One Voice Rule.** Command Navy covers at most 10 percent of any screen. One primary action per view in navy; everything else is neutral. Its scarcity is what makes it read as premium.

**The Ledger Rule.** Gold means money and nothing else. If a value is not currency, it is never gold.

**The No-Wash Rule.** The brand color is an accent, never a background fill for large areas. No navy panels, no navy headers beyond the single signature hero.

## 3. Typography

**Display Font:** Poppins (with system-ui, sans-serif)
**Body Font:** Inter (with system-ui, sans-serif)
**Label / Data Font:** IBM Plex Mono (with ui-monospace, monospace)

**Character:** Poppins brings a confident, premium geometric weight to headings and key figures (medium weight, tight tracking, in the spirit of the Flyra reference); Inter keeps body copy clean and highly legible at density; IBM Plex Mono gives numbers, IDs, and timestamps a tabular, engineered precision. The pairing reads competent and premium, never decorative. (Adopted in the admin console first; the client desktop surfaces migrate from Archivo to Poppins as they are touched.)

### Hierarchy
- **Display** (Archivo 700, clamp 1.5 to 2.25rem, line-height 1.1, tracking -0.025em): Page titles and the signature hero only.
- **Headline** (Archivo 600, 1.25rem, line-height 1.2): Section and panel titles.
- **Title** (Archivo 600, 1rem, line-height 1.3): Card titles, list-group headers.
- **Body** (Inter 400, 0.9375rem, line-height 1.55): All reading copy. Cap measure at 65 to 75 characters.
- **Label** (IBM Plex Mono 600, 0.656rem, uppercase, tracking 0.08em): Kickers and small structural labels. Used sparingly.
- **Data** (IBM Plex Mono 500, 0.875rem, tabular): Numbers, money, IDs, timestamps.

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
- **Shape:** Gently rounded (9px base radius).
- **Primary:** Command Navy fill, white text, 10px by 18px padding. One per view.
- **Hover / Focus:** Hover deepens to Deep Navy (#133766); focus shows a visible 2px ring at AA contrast. Active nudges down 1px for a tactile press.
- **Secondary:** White surface, ink text, hairline border. **Ghost:** transparent, muted ink, no border until hover. **Danger:** Danger Red fill, separated spatially from primary actions.

### Badges / Status Pills
- **Style:** Tone-based (neutral, brand, positive, warning, danger) with a small leading dot. Soft tinted background, never a loud fill.
- **Rule:** Status is carried by dot plus label, never color alone (AA, color-blind safe).

### Cards / Panels
- **Corner Style:** 14px (lg) radius.
- **Background:** Deck White on Slate Canvas; in dark, Night Surface on Night.
- **Shadow Strategy:** Resting by default; Raised on interactive hover only. Prefer a tonal step over a shadow where possible.
- **Border:** Optional hairline (#e2e8f0). **Internal Padding:** 20px. Never nest a card inside a card.

### Inputs / Fields
- **Style:** White surface, hairline border, 9px radius, label always above the field.
- **Focus:** Border shifts to Command Navy with a soft 2px navy focus ring; no glow.
- **Error / Disabled:** Error border in Danger Red with message below the field; disabled drops to ~45 percent opacity with a not-allowed cursor.

### Navigation
- **Style:** Persistent left rail on desktop (lg+), bottom tab bar (max 4 to 5) on mobile.
- **States:** Active item uses Command Navy text and a Navy Mist background with a left accent bar; inactive is muted ink. Active location is always obvious.
- **Mobile:** Bottom nav for top-level destinations only; never nest sub-navigation inside it.

### Signature Component: The Navy Hero
A single dark navy gradient header per screen (`linear-gradient(165deg, #13294a 0%, #0d1f38 100%)`) with a rounded bottom edge, bleeding under the status bar on mobile. It is the one place navy fills a surface. One per screen, never stacked.

## 6. Do's and Don'ts

### Do:
- **Do** give every screen one obvious focal point; when in doubt, remove, group, or add space.
- **Do** keep Command Navy to roughly 10 percent of a screen and one primary action per view.
- **Do** build depth with tonal surface steps and space first, shadows second.
- **Do** use tabular mono figures for all money, counts, times, and IDs.
- **Do** pair every status color with a dot, icon, or label so meaning never rides on color alone.
- **Do** keep body text at AA (4.5:1), placeholder and helper text included, in both light and dark.

### Don't:
- **Don't** make it cluttered or busy. If a screen feels packed, it has failed even if it looks polished. This is the hardest rule.
- **Don't** look like GoHighLevel or a generic agency CRM (every feature crammed in, noisy, cheap).
- **Don't** ship template-SaaS clichés: default purple gradients, identical icon-heading-text card grids, the "AI made this" dashboard.
- **Don't** fall into sterile gray-on-gray enterprise. Premium, never dull.
- **Don't** wash large areas in the brand navy or use gold for anything that is not money.
- **Don't** put a mono uppercase label above every section, and never nest a card inside a card.

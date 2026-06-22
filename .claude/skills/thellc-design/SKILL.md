---
name: thellc-design
description: Design system skill for thellc. Activate when building UI components, pages, or any visual elements. Provides exact color tokens, typography scale, spacing grid, component patterns, and craft rules. Read references/DESIGN.md before writing any CSS or JSX. Includes ultra-mode visual journey: read references/ANIMATIONS.md, references/LAYOUT.md, references/COMPONENTS.md, and references/INTERACTIONS.md for full motion and layout details.
---

# thellc Design System

You are building UI for **thellc**. Dark-themed, warm palette, monospace typography (Inter), compact density on a 4px grid, expressive motion.

## Visual Reference

**IMPORTANT**: Study ALL screenshots below before writing any UI. Match colors, typography, spacing, layout, and motion exactly as shown.

### Homepage

![thellc Homepage](screenshots/homepage.png)

### Scroll Journey (Cinematic Visual States)

> These screenshots capture the website at different scroll depths. The design changes dramatically as you scroll — each frame shows a different cinematic state. Replicate these exact visual transitions.

#### 0% — Hero / Above the fold

![Scroll 0%](screens/scroll/scroll-000.png)

#### 17% — Mid-page at 17% scroll

![Scroll 17%](screens/scroll/scroll-017.png)

#### 33% — Mid-page at 33% scroll

![Scroll 33%](screens/scroll/scroll-033.png)

#### 50% — Mid-page at 50% scroll

![Scroll 50%](screens/scroll/scroll-050.png)

#### 67% — Mid-page at 67% scroll

![Scroll 67%](screens/scroll/scroll-067.png)

#### 83% — Mid-page at 83% scroll

![Scroll 83%](screens/scroll/scroll-083.png)

#### 100% — Footer / End of page

![Scroll 100%](screens/scroll/scroll-100.png)

> Read `references/DESIGN.md` for full token details. Read `references/ANIMATIONS.md` for motion specs. Read `references/LAYOUT.md` for layout structure. Read `references/COMPONENTS.md` for component patterns.

## Ultra Reference Files

This package includes extended documentation. **Read these files before implementing:**

| File | Contents |
|------|----------|
| `references/DESIGN.md` | Full design system tokens, colors, typography, spacing |
| `references/VISUAL_GUIDE.md` | **START HERE** — Master visual guide with all screenshots embedded |
| `references/ANIMATIONS.md` | CSS keyframes, scroll triggers, motion library stack, video specs |
| `references/LAYOUT.md` | Flex/grid containers, page structure, spacing relationships |
| `references/COMPONENTS.md` | DOM component patterns, HTML structure, class fingerprints |
| `references/INTERACTIONS.md` | Hover/focus states with before/after style diffs |
| `screens/scroll/` | 7 scroll journey screenshots showing cinematic states |

### Animation Stack Detected

- **Web Animations API (1 active)** — animation

## Design Philosophy

- **Layered depth** — use shadow tokens to create a sense of physical layering. Each elevation level has a specific shadow.
- **Gradient accents** — gradients are used thoughtfully for emphasis, not decoration.
- **Single typeface** — Inter carries all text. Hierarchy comes from size, weight, and color — never font mixing.
- **compact density** — 4px base grid. Every dimension is a multiple of 4.
- **warm palette** — the color temperature runs warm, matching the monospace typography.
- **Restrained accent** — `#ff6b00` is the only pop of color. Used exclusively for CTAs, links, focus rings, and active states.
- **Expressive motion** — animations are an integral part of the experience. Use spring physics and layout animations.

## Color System

### Core Palette

| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Background | `--background` | `#000000` | Page/app background |
| Surface | `--surface` | `#0a0a0a` | Cards, panels, modals |
| Text Primary | `--text-primary` | `#ffffff` | Headings, body text |
| Text Muted | `--text-muted` | `#444444` | Captions, placeholders |
| Accent | `--accent` | `#ff6b00` | CTAs, links, focus rings |
| Border | `--border` | `#555555` | Dividers, card borders |

### Status Colors

| Status | Hex | Use |
|--------|-----|-----|
| Danger | `#ff5500` | Errors, destructive actions |

### Extended Palette

- `#ff5050` — Warm accent — hover glow or decorative highlight
- `#ff7a33`
- `#ff8b1a`
- `#666666`
- `#999999`
- `#e8e2dc` — Light surface or highlight color
- `#eeeeee` — Light surface or highlight color
- `#ffa050`

## Typography

### Font Stack

- **Inter** — Heading 1, Heading 2
- **SFMono-Regular** — Body, Caption, Code

### Font Sources

```css
@font-face {
  font-family: "Inter";
  src: url("fonts/Inter-Bold.ttf") format("truetype");
  font-weight: 700;
}
@font-face {
  font-family: "Inter";
  src: url("fonts/Inter-Regular.ttf") format("truetype");
  font-weight: 400;
}
```

### Type Scale

| Role | Family | Size | Weight |
|------|--------|------|--------|
| Heading 1 | Inter | 3.2rem | 700 |
| Heading 2 | Inter | 40px | 700 |
| Body | SFMono-Regular | 22px | 400 |
| Caption | SFMono-Regular | 16px | 400 |
| Code | SFMono-Regular | 14px | 400 |

### Typography Rules

- All text uses **Inter** — never add another font family
- Max 3-4 font sizes per screen
- Headings: weight 600-700, body: weight 400
- Use color and opacity for text hierarchy, not additional font sizes
- Line height: 1.5 for body, 1.2 for headings

## Spacing & Layout

### Base Grid: 4px

Every dimension (margin, padding, gap, width, height) must be a multiple of **4px**.

### Spacing Scale

`4, 8, 12, 16, 24, 32, 40, 48, 56, 78, 80, 96` px

### Spacing as Meaning

| Spacing | Use |
|---------|-----|
| 4-8px | Tight: related items (icon + label, avatar + name) |
| 12-16px | Medium: between groups within a section |
| 24-32px | Wide: between distinct sections |
| 48px+ | Vast: major page section breaks |

### Border Radius

Scale: `3rem, 10px, 12px, 20px, 24px, 32px, 48px`
Default: `20px`

### Container

Max-width: `90rem`, centered with auto margins.

### Breakpoints

| Name | Value |
|------|-------|
| sm | 40rem |
| md | 48rem |
| lg | 64rem |
| xl | 80rem |
| 2xl | 96rem |

Mobile-first: design for small screens, layer on responsive overrides.

## Component Patterns

### Card

```css
.card {
  background: #0a0a0a;
  border: 1px solid #555555;
  border-radius: 20px;
  padding: 16px;
  box-shadow: inset 0 1px 2px #00000059,inset 0 0 0 1px #ffffff0a;
}
```

```html
<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here.</p>
</div>
```

### Button

```css
/* Primary */
.btn-primary {
  background: #ff6b00;
  color: #ffffff;
  border-radius: 20px;
  padding: 8px 16px;
  font-weight: 500;
  transition: opacity 150ms ease;
}
.btn-primary:hover { opacity: 0.9; }

/* Ghost */
.btn-ghost {
  background: transparent;
  border: 1px solid #555555;
  color: #ffffff;
  border-radius: 20px;
  padding: 8px 16px;
}
```

```html
<button class="btn-primary">Get Started</button>
<button class="btn-ghost">Learn More</button>
```

### Input

```css
.input {
  background: #000000;
  border: 1px solid #555555;
  border-radius: 20px;
  padding: 8px 12px;
  color: #ffffff;
  font-size: 14px;
}
.input:focus { border-color: #ff6b00; outline: none; }
```

```html
<input class="input" type="text" placeholder="Search..." />
```

### Badge / Chip

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: #0a0a0a;
  color: #444444;
}
```

```html
<span class="badge">New</span>
<span class="badge">Beta</span>
```

### Modal / Dialog

```css
.modal-backdrop { background: rgba(0, 0, 0, 0.6); }
.modal {
  background: #0a0a0a;
  border: 1px solid #555555;
  border-radius: 48px;
  padding: 24px;
  max-width: 480px;
  width: 90vw;
  box-shadow: inset 0 1.5px .5px #ffe1b48c,inset 0-2px 2px -1px #b4500a80,inset 0-8px 14px -7px #ff962899,inset 0 1px 2.8px #ffffff2e,0 4px 14px #0006,0 0 0 1px #ff8c2829;
}
```

```html
<div class="modal-backdrop">
  <div class="modal">
    <h2>Dialog Title</h2>
    <p>Dialog content.</p>
    <button class="btn-primary">Confirm</button>
    <button class="btn-ghost">Cancel</button>
  </div>
</div>
```

### Table

```css
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 500;
  font-size: 12px;
  color: #444444;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #555555;
}
.table td {
  padding: 12px;
  border-bottom: 1px solid #555555;
}
```

```html
<table class="table">
  <thead><tr><th>Name</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>
    <tr><td>Item One</td><td>Active</td><td>Jan 1</td></tr>
    <tr><td>Item Two</td><td>Pending</td><td>Jan 2</td></tr>
  </tbody>
</table>
```

### Navigation

```css
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #555555;
}
.nav-link {
  color: #444444;
  padding: 8px 12px;
  border-radius: 20px;
  transition: color 150ms;
}
.nav-link:hover { color: #ffffff; }
.nav-link.active { color: #ff6b00; }
```

```html
<nav class="nav">
  <a href="/" class="nav-link active">Home</a>
  <a href="/about" class="nav-link">About</a>
  <a href="/pricing" class="nav-link">Pricing</a>
  <button class="btn-primary" style="margin-left: auto">Get Started</button>
</nav>
```

## Animation & Motion

This project uses **expressive motion**. Animations are part of the design language.

### CSS Animations

- `oa-bloom`
- `oa-float`
- `oa-fade-in`
- `oa-sun-breathe`
- `pulse`

### Motion Tokens

- **Duration scale:** `.2s`, `.3s`, `.5s`, `.7s`, `220ms`
- **Animated properties:** `transform`

### Motion Guidelines

- **Duration:** Use values from the duration scale above. Short (.2s) for micro-interactions, long (220ms) for page transitions
- **Easing:** `ease-out` for enters, `ease-in` for exits
- **Direction:** Elements enter from bottom/right, exit to top/left
- **Reduced motion:** Always respect `prefers-reduced-motion` — disable animations when set

## Depth & Elevation

### Shadow Tokens

- Subtle: `inset 0 1px 2px #00000059,inset 0 0 0 1px #ffffff0a`
- Floating (dropdowns, popovers): `inset 0 1.5px .5px #ffe1b48c,inset 0-2px 2px -1px #b4500a80,inset 0-8px 14px -7px #ff962899,inset 0 1px 2.8px #ffffff2e,0 4px 14px #0006,0 0 0 1px #ff8c2829`
- Overlay (modals, dialogs): `0 10px 40px #ff550059`
- Overlay (modals, dialogs): `0 14px 50px #ff550080`
- Overlay (modals, dialogs): `inset 0 2px 29px #cfcfcf1f`
- Overlay (modals, dialogs): `inset 0 1.5px .5px #ffe9c8,inset 0-2px 2px -1px #b4500a80,inset 0-8px 16px -6px #ffa84d,inset 0 1px 2.8px #ffffff3d,0 6px 22px #00000080,0 0 0 1px #ff8c2847,0 0 26px #ff6e1e73`

### Z-Index Scale

`0, 10, 20, 50, 60, 70, 100`

Use these exact values — never invent z-index values.

## Anti-Patterns (Never Do)

- **No blur effects** — no backdrop-blur, no filter: blur()
- **No zebra striping** — tables and lists use borders for separation
- **No invented colors** — every hex value must come from the palette above
- **No arbitrary spacing** — every dimension is a multiple of 4px
- **No extra fonts** — only Inter and SFMono-Regular are allowed
- **No arbitrary border-radius** — use the scale: 3rem, 10px, 12px, 20px, 24px, 32px, 48px
- **No opacity for disabled states** — use muted colors instead

## Workflow

1. **Read** `references/DESIGN.md` before writing any UI code
2. **Pick colors** from the Color System section — never invent new ones
3. **Set typography** — Inter, SFMono-Regular only, using the type scale
4. **Build layout** on the 4px grid — check every margin, padding, gap
5. **Match components** to patterns above before creating new ones
6. **Apply elevation** — use shadow tokens
7. **Validate** — every value traces back to a design token. No magic numbers.

## Brand Spec

- **Favicon:** `/logo.png`
- **Site URL:** `https://thellc.io/`
- **Brand color:** `#ff6b00`
- **Brand typeface:** Inter

## Quick Reference

```
Background:     #000000
Surface:        #0a0a0a
Text:           #ffffff / #444444
Accent:         #ff6b00
Border:         #555555
Font:           Inter
Spacing:        4px grid
Radius:         20px
Components:     0 detected
```

## When to Trigger

Activate this skill when:
- Creating new components, pages, or visual elements for thellc
- Writing CSS, Tailwind classes, styled-components, or inline styles
- Building page layouts, templates, or responsive designs
- Reviewing UI code for design consistency
- The user mentions "thellc" design, style, UI, or theme
- Generating mockups, wireframes, or visual prototypes

---

# Full Reference Files

> Every output file is embedded below. Claude has full design system context from /skills alone.

## Design System Tokens (DESIGN.md)

# thellc DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 17 · Fonts: 2 · Components: 0
> Icon library: not detected · State: not detected
> Primary theme: dark · Dark mode toggle: no · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![thellc Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **dark-themed** interface with a warm tone. Depth is expressed through layered shadows and subtle surface color variation. Typography uses **Inter** throughout — a technical, developer-focused choice that maintains consistency. Spacing follows a **4px base grid** (compact density), with scale: 4, 8, 12, 16, 24, 32, 40, 48px. The palette is predominantly monochromatic with **#ff6b00** as the single accent color — used sparingly for interactive elements and emphasis. Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| color-black | `#000000` | background | Page background, darkest surface |
| surface | `#0a0a0a` | surface | Card and panel backgrounds |
| tw-ring-offset-color | `#ffffff` | text-primary | Headings and body text |
| text-muted | `#444444` | text-muted | Captions, placeholders, secondary info |
| border | `#555555` | border | Dividers, card borders, outlines |
| accent | `#ff6b00` | accent | CTAs, links, focus rings, active states |
| color-brand-orange | `#ff5500` | danger | Error states, destructive actions |
| unknown | `#ff5050` | unknown | Palette color |
| unknown | `#ff7a33` | unknown | Palette color |
| unknown | `#ff8b1a` | unknown | Palette color |
| unknown | `#666666` | unknown | Palette color |
| unknown | `#999999` | unknown | Palette color |
| unknown | `#e8e2dc` | unknown | Palette color |
| unknown | `#eeeeee` | unknown | Palette color |
| unknown | `#ffa050` | unknown | Palette color |
| unknown | `#ff8a3d` | unknown | Palette color |
| unknown | `#b33b00` | unknown | Palette color |

### CSS Variable Tokens

```css
--tw-border-style: solid;
--tw-border-style: none;
```


---

## 3. Typography Rules

**Font Stack:**
- **Inter** — Heading 1, Heading 2
- **SFMono-Regular** — Body, Caption, Code

**Font Sources:**

```css
@font-face {
  font-family: "Inter";
  src: url("fonts/Inter-Bold.ttf") format("truetype");
  font-weight: 700;
}
@font-face {
  font-family: "Inter";
  src: url("fonts/Inter-Regular.ttf") format("truetype");
  font-weight: 400;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | Inter | 3.2rem | 700 |
| Heading 2 | Inter | 40px | 700 |
| Body | SFMono-Regular | 22px | 400 |
| Caption | SFMono-Regular | 16px | 400 |
| Code | SFMono-Regular | 14px | 400 |

**Typographic Rules:**
- Use **Inter** for all text — do not mix font families
- Maintain consistent hierarchy: no more than 3-4 font sizes per screen
- Headings use bold (600-700), body uses regular (400)
- Line height: 1.5 for body text, 1.2 for headings
- Use color and opacity for secondary hierarchy, not additional font sizes


---

## 4. Component Stylings

No components detected. Scan `src/components/` or `components/` to populate this section.

---

## 5. Layout Principles

- **Base spacing unit:** 4px
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 40, 48, 56, 78, 80, 96
- **Border radius:** 3rem, 10px, 12px, 20px, 24px, 32px, 48px
- **Max content width:** 90rem

**Spacing as Meaning:**
| Spacing | Use |
|---|---|
| 4-8px | Tight: related items within a group |
| 12-16px | Medium: between groups |
| 24-32px | Wide: between sections |
| 48px+ | Vast: major section breaks |


---

## 6. Depth & Elevation

### Flat — subtle depth hints

- `inset 0 1px 2px #00000059,inset 0 0 0 1px #ffffff0a`

### Floating — dropdowns, popovers, modals

- `inset 0 1.5px .5px #ffe1b48c,inset 0-2px 2px -1px #b4500a80,inset 0-8px 14px -7px #ff962899,inset 0 1px 2.8px #ffffff2e,0 4px 14px #0006,0 0 0 1px #ff8c2829`

### Overlay — full-screen overlays, top-level dialogs

- `0 10px 40px #ff550059`
- `0 14px 50px #ff550080`
- `inset 0 2px 29px #cfcfcf1f`

### Z-Index Scale

`0, 10, 20, 50, 60, 70, 100`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes oa-bloom`
- `@keyframes oa-float`
- `@keyframes oa-fade-in`
- `@keyframes oa-sun-breathe`
- `@keyframes pulse`
- `@keyframes scroll`

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#ff6b00` for interactive elements (buttons, links, focus rings)
- Use `#000000` as the primary page background
- Use **Inter** for all UI text
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: 3rem, 10px, 12px, 20px, 24px

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't mix font families — use Inter consistently
- Don't use arbitrary spacing values — stick to multiples of 4px
- Don't create custom box-shadow values outside the system tokens
- Don't use arbitrary border-radius values — pick from the defined scale
- Don't use backdrop-blur or blur effects

### Anti-Patterns (detected from codebase)

- No blur or backdrop-blur effects
- No zebra striping on tables/lists


---

## 9. Responsive Behavior

| Name | Value | Source |
|---|---|---|
| sm | 40rem | css |
| md | 48rem | css |
| lg | 64rem | css |
| xl | 80rem | css |
| 2xl | 96rem | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #0a0a0a
Border: 1px solid #555555
Radius: 20px
Padding: 16px
Font: Inter
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #ff6b00, text white
Ghost: bg transparent, border #555555
Padding: 8px 16px
Radius: 20px
Hover: opacity 0.9 or lighter shade
Focus: ring with #ff6b00
```

### Build a Page Layout

```
Background: #000000
Max-width: 90rem, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #0a0a0a
Label: #444444 (muted, 12px, uppercase)
Value: #ffffff (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #000000
Input border: 1px solid #555555
Focus: border-color #ff6b00
Label: #444444 12px
Spacing: 16px between fields
Radius: 20px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: Inter, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```

## Visual Guide — Screenshots (VISUAL_GUIDE.md)

# thellc — Visual Guide

> Master visual reference. Study every screenshot carefully before implementing any UI.
> Match colors, layout, typography, spacing, and motion states exactly.

**Motion Stack:** **Web Animations API (1 active)**

## Scroll Journey

The page has cinematic scroll animations. Each screenshot below shows the exact visual state at that scroll depth.
**Replicate these transitions precisely** — the design changes dramatically as you scroll.

### Hero — Above the fold

*Scroll position: 0px of 1292px total*

![Hero — Above the fold](../screens/scroll/scroll-000.png)

### 17% scroll depth

*Scroll position: 67px of 1292px total*

![17% scroll depth](../screens/scroll/scroll-017.png)

### 33% scroll depth

*Scroll position: 129px of 1292px total*

![33% scroll depth](../screens/scroll/scroll-033.png)

### 50% scroll depth

*Scroll position: 196px of 1292px total*

![50% scroll depth](../screens/scroll/scroll-050.png)

### 67% scroll depth

*Scroll position: 263px of 1292px total*

![67% scroll depth](../screens/scroll/scroll-067.png)

### 83% scroll depth

*Scroll position: 325px of 1292px total*

![83% scroll depth](../screens/scroll/scroll-083.png)

### Footer — End of page

*Scroll position: 392px of 1292px total*

![Footer — End of page](../screens/scroll/scroll-100.png)

## Full Page Screenshots

### The LLC | Scale Your Business

*URL: `https://thellc.io/`*

![The LLC | Scale Your Business](../screens/pages/home.png)

## Section Screenshots

Clipped sections showing individual components in context.

### Section 1 — `section`

*1440×1101px*

![Section 1](../screens/sections/home-section-1.png)

## Animations & Motion (ANIMATIONS.md)

# Animation Reference

> Cinematic motion design extracted from live DOM. Follow these specs exactly to recreate the experience.

## Motion Technology Stack

| Library | Type | Notes |
|---------|------|-------|
| **Web Animations API (1 active)** | animation |  |

## Scroll Journey

The page is **1,292px** tall. Each frame below shows what the user sees at that scroll depth.

> **Use these screenshots to understand WHAT animates, WHEN it animates, and HOW it moves.**

### 0% — Top / Hero
Scroll position: 0px

![Scroll 0%](../screens/scroll/scroll-000.png)

### 17% — Opening Section
Scroll position: 67px

![Scroll 17%](../screens/scroll/scroll-017.png)

### 33% — First Feature Section
Scroll position: 129px

![Scroll 33%](../screens/scroll/scroll-033.png)

### 50% — Mid-Page
Scroll position: 196px

![Scroll 50%](../screens/scroll/scroll-050.png)

### 67% — Lower Content
Scroll position: 263px

![Scroll 67%](../screens/scroll/scroll-067.png)

### 83% — Near Footer
Scroll position: 325px

![Scroll 83%](../screens/scroll/scroll-083.png)

### 100% — Bottom / Footer
Scroll position: 392px

![Scroll 100%](../screens/scroll/scroll-100.png)

## CSS Keyframes (6 extracted)

### `@keyframes scroll`

Duration: `38s` · Easing: `linear` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.oa-marquee`, `.oa-team-track`

```css
@keyframes scroll {
  0% {
    transform: translate(0px);
  }
  100% {
    transform: translate(-50%);
  }
}
```

> Transform/motion animation

### `@keyframes oa-bloom`

Duration: `6s` · Easing: `ease-in-out` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.oa-glow-word::before`

```css
@keyframes oa-bloom {
  0%, 100% {
    opacity: 0.7;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}
```

> Fade + motion enter animation

### `@keyframes oa-float`

Duration: `9s` · Easing: `ease-in-out` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.oa-float`

```css
@keyframes oa-float {
  0%, 100% {
    transform: translateY(0px) scale(1);
  }
  50% {
    transform: translateY(-24px) scale(1.04);
  }
}
```

> Transform/motion animation

### `@keyframes oa-fade-in`

Duration: `0.4s` · Easing: `ease` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.oa-swap`

```css
@keyframes oa-fade-in {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  100% {
    opacity: 1;
    transform: translateY(0px);
  }
}
```

> Fade + motion enter animation

### `@keyframes oa-sun-breathe`

Duration: `6s` · Easing: `ease-in-out` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.oa-sun`

```css
@keyframes oa-sun-breathe {
  0%, 100% {
    opacity: 0.9;
    transform: translate(-50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translate(-50%) scale(1.04);
  }
}
```

> Fade + motion enter animation

### `@keyframes pulse`

```css
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
```

> Opacity fade

## Motion Tokens (CSS Variables)

### Duration Tokens

```css
--default-transition-duration: .15s;
```

### Easing Tokens

```css
--ease-in-out: cubic-bezier(.4,0,.2,1);
--default-transition-timing-function: cubic-bezier(.4,0,.2,1);
--ease-in: cubic-bezier(.4,0,1,1);
--ease-out: cubic-bezier(0,0,.2,1);
```

## Global Transition Declarations

These `transition` values were extracted from CSS rules across the site:

```css
transition: transform 0.22s;
transition: box-shadow 0.22s;
```

## How to Recreate This Motion Design

### Step 1 — Install Dependencies

```bash
```

### Step 2 — Scroll-Reveal Pattern

Elements that animate into view follow this pattern:

```css
/* Initial hidden state */
.reveal {
  opacity: 0;
  transform: translateY(40px);
  transition: opacity .15s cubic-bezier(.4,0,.2,1),
              transform .15s cubic-bezier(.4,0,.2,1);
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Step 3 — Key Motion Principles

- **Duration scale:** `.15s` · `0.22s` — use these values, never invent new durations
- **Always add** `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`

### Step 4 — Scroll Journey Reference

Match what happens at each scroll position:

- **0%** (`0px`) → `screens/scroll/scroll-000.png`
- **17%** (`67px`) → `screens/scroll/scroll-017.png`
- **33%** (`129px`) → `screens/scroll/scroll-033.png`
- **50%** (`196px`) → `screens/scroll/scroll-050.png`
- **67%** (`263px`) → `screens/scroll/scroll-067.png`
- **83%** (`325px`) → `screens/scroll/scroll-083.png`
- **100%** (`392px`) → `screens/scroll/scroll-100.png`

## Layout & Grid (LAYOUT.md)

# Layout Reference

> Auto-extracted from live DOM. Use this to understand how the site is structured spatially.

## Spacing System

**Base grid:** 4px

**Scale:** `4, 8, 12, 16, 24, 32, 40, 48, 56, 78, 80, 96, 128` px

| Spacing | Semantic Use |
|---------|-------------|
| 4px | Tight — within a component |
| 8px | Medium — between sibling items |
| 16px | Wide — between sections |
| 32px | Vast — major section breaks |

## Flex Layouts

| Element | Direction | Justify | Align | Gap | Children |
|---------|-----------|---------|-------|-----|----------|
| `section.relative.min-h-screen` | row | center | center | — | 1 |
| `div.glass-nav.rounded-full` | row | space-between | center | — | 1 |
| `div.text-left.flex` | column | — | — | 32px | 4 |
| `form.flex.flex-col` | column | — | — | 16px | 3 |
| `div.flex.flex-col` | row | — | — | 16px | 2 |
| `button.w-full.bg-brand-white` | row | center | center | 8px | 1 |

## Grid Layouts

| Element | Template Columns | Gap | Children |
|---------|-----------------|-----|----------|
| `div.w-full.max-w-7xl` | `592px 592px` | 96px | 2 |

## Structural Containers

### `<main>` (`main.min-h-screen.bg-brand-black`)

```
display:          block
children:         4
```

### `<nav>` (`nav.fixed.top-0`)

```
display:          block
padding:          16px 24px
children:         1
```

### `<footer>` 

```
display:          block
padding:          48px 24px
children:         1
```

### `<section>` (`section.relative.min-h-screen`)

```
display:          flex
flex-direction:   row
justify-content:  center
align-items:      center
padding:          128px 24px 80px
children:         1
```

## Layout Rules

- **Container max-width:** `1280px` — always center with `margin: auto`
- Primary layout system: **Flexbox**
- Secondary layout system: **CSS Grid** (used for card grids and multi-column layouts)
- Every spacing value must be a multiple of **4px**
- Never use arbitrary margin/padding values outside the spacing scale

## Component Patterns (COMPONENTS.md)

# Component Reference

> Repeated DOM patterns detected by structural analysis. Each component appeared 3+ times.

No repeated components detected (Playwright required).

## Interactions & States (INTERACTIONS.md)

# Interaction Reference

> Micro-interactions extracted from live DOM. Recreate these exactly for authentic feel.

## Coverage

| Component Type | Count | States Captured |
|----------------|-------|----------------|
| Button | 1 | default, hover, focus |
| Link | 2 | default, hover, focus |
| Input | 2 | default, hover, focus |

## Transition System

These transition declarations were extracted from interactive elements:

```css
transition: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
transition: all;
transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), fill 0.15s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-from 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-via 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1);
```

Apply these to all interactive elements. Never invent new durations or easings.

## Button Interactions

### Button 1 — `Join The Newsletter`

**States:**

- Default: `../screens/states/button-1-default.png`
- Hover: `../screens/states/button-1-hover.png`
- Focus: `../screens/states/button-1-focus.png`

**On focus:**

```css
/* outline: rgb(5, 5, 5) none 3px → */ outline: rgb(16, 16, 16) auto 1px;
/* outline-color: rgb(5, 5, 5) → */ outline-color: rgb(16, 16, 16);
```

**Transition:** `0.15s cubic-bezier(0.4, 0, 0.2, 1)`

## Link Interactions

### Link 1 — `Instagram`

**States:**

- Default: `../screens/states/link-1-default.png`
- Hover: `../screens/states/link-1-hover.png`
- Focus: `../screens/states/link-1-focus.png`

**On focus:**

```css
/* outline: rgba(255, 255, 255, 0.6) none 3px → */ outline: rgb(16, 16, 16) auto 1px;
/* outline-color: rgba(255, 255, 255, 0.6) → */ outline-color: rgb(16, 16, 16);
```

**Transition:** `all`

### Link 2 — `YouTube`

**States:**

- Default: `../screens/states/link-2-default.png`
- Hover: `../screens/states/link-2-hover.png`
- Focus: `../screens/states/link-2-focus.png`

**On focus:**

```css
/* outline: rgba(255, 255, 255, 0.6) none 3px → */ outline: rgb(16, 16, 16) auto 1px;
/* outline-color: rgba(255, 255, 255, 0.6) → */ outline-color: rgb(16, 16, 16);
```

**Transition:** `all`

## Input Interactions

### Input 1 — `First Name`

**States:**

- Default: `../screens/states/input-1-default.png`
- Hover: `../screens/states/input-1-hover.png`
- Focus: `../screens/states/input-1-focus.png`

**On focus:**

```css
/* border-color: oklab(0.999994 0.0000455678 0.0000200868 / 0.1) → */ border-color: oklab(0.675901 0.169501 0.136286 / 0.5);
/* outline: rgb(255, 255, 255) none 3px → */ outline: rgb(16, 16, 16) none 1px;
/* outline-color: rgb(255, 255, 255) → */ outline-color: rgb(16, 16, 16);
```

**Transition:** `color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), fill 0.15s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-from 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-via 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1)`

### Input 2 — `Enter your best email...`

**States:**

- Default: `../screens/states/input-2-default.png`
- Hover: `../screens/states/input-2-hover.png`
- Focus: `../screens/states/input-2-focus.png`

**On focus:**

```css
/* border-color: oklab(0.999994 0.0000455678 0.0000200868 / 0.1) → */ border-color: oklab(0.675901 0.169501 0.136286 / 0.5);
/* outline: rgb(255, 255, 255) none 3px → */ outline: rgb(16, 16, 16) none 1px;
/* outline-color: rgb(255, 255, 255) → */ outline-color: rgb(16, 16, 16);
```

**Transition:** `color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), fill 0.15s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-from 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-via 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1)`

## Interaction Rules

- Accent color `#ff6b00` is used for focus rings, active states, and hover highlights
- Focus states use **outline** (not box-shadow) — always match the extracted focus ring
- Transition durations in use: `0.15s`
- Always respect `prefers-reduced-motion` — set all transitions to `0s` when enabled

## Design Tokens — JSON Files

### tokens/colors.json
```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "core": {
    "text-primary": {
      "value": "#ffffff",
      "role": "text-primary",
      "name": "tw-ring-offset-color"
    },
    "background": {
      "value": "#000000",
      "role": "background",
      "name": "color-black"
    },
    "accent": {
      "value": "#ff6b00",
      "role": "accent"
    },
    "surface": {
      "value": "#0a0a0a",
      "role": "surface"
    },
    "text-muted": {
      "value": "#444444",
      "role": "text-muted"
    },
    "border": {
      "value": "#555555",
      "role": "border"
    }
  },
  "status": {
    "danger": {
      "value": "#ff5500",
      "role": "danger",
      "name": "color-brand-orange"
    }
  },
  "extended": {
    "color-ff5050": {
      "value": "#ff5050",
      "role": "unknown"
    },
    "color-ff7a33": {
      "value": "#ff7a33",
      "role": "unknown"
    },
    "color-ff8b1a": {
      "value": "#ff8b1a",
      "role": "unknown"
    },
    "color-666666": {
      "value": "#666666",
      "role": "unknown"
    },
    "color-999999": {
      "value": "#999999",
      "role": "unknown"
    },
    "color-e8e2dc": {
      "value": "#e8e2dc",
      "role": "unknown"
    },
    "color-eeeeee": {
      "value": "#eeeeee",
      "role": "unknown"
    },
    "color-ffa050": {
      "value": "#ffa050",
      "role": "unknown"
    },
    "color-ff8a3d": {
      "value": "#ff8a3d",
      "role": "unknown"
    },
    "color-b33b00": {
      "value": "#b33b00",
      "role": "unknown"
    }
  },
  "meta": {
    "theme": "dark",
    "extracted": "2026-06-21"
  }
}
```

### tokens/spacing.json
```json
{
  "base": {
    "value": "4px",
    "description": "Grid unit — all spacing must be multiples of this"
  },
  "unit": "px",
  "scale": {
    "xs": {
      "value": "4px",
      "px": 4
    },
    "sm": {
      "value": "8px",
      "px": 8
    },
    "md": {
      "value": "12px",
      "px": 12
    },
    "lg": {
      "value": "16px",
      "px": 16
    },
    "xl": {
      "value": "24px",
      "px": 24
    },
    "2xl": {
      "value": "32px",
      "px": 32
    },
    "3xl": {
      "value": "40px",
      "px": 40
    },
    "4xl": {
      "value": "48px",
      "px": 48
    },
    "5xl": {
      "value": "56px",
      "px": 56
    },
    "6xl": {
      "value": "78px",
      "px": 78
    }
  },
  "multipliers": {
    "1x": {
      "value": "4px",
      "raw": 4
    },
    "2x": {
      "value": "8px",
      "raw": 8
    },
    "3x": {
      "value": "12px",
      "raw": 12
    },
    "4x": {
      "value": "16px",
      "raw": 16
    },
    "5x": {
      "value": "20px",
      "raw": 20
    },
    "6x": {
      "value": "24px",
      "raw": 24
    },
    "7x": {
      "value": "28px",
      "raw": 28
    },
    "8x": {
      "value": "32px",
      "raw": 32
    },
    "9x": {
      "value": "36px",
      "raw": 36
    },
    "10x": {
      "value": "40px",
      "raw": 40
    },
    "11x": {
      "value": "44px",
      "raw": 44
    },
    "12x": {
      "value": "48px",
      "raw": 48
    },
    "13x": {
      "value": "52px",
      "raw": 52
    },
    "14x": {
      "value": "56px",
      "raw": 56
    },
    "15x": {
      "value": "60px",
      "raw": 60
    },
    "16x": {
      "value": "64px",
      "raw": 64
    }
  },
  "meta": {
    "totalValues": 13,
    "min": 4,
    "max": 128
  }
}
```

### tokens/typography.json
```json
{
  "families": [
    "Inter",
    "SFMono-Regular"
  ],
  "scale": {
    "heading-1": {
      "fontFamily": "Inter",
      "fontSize": "3.2rem",
      "fontWeight": "700",
      "lineHeight": null,
      "source": "css"
    },
    "heading-2": {
      "fontFamily": "Inter",
      "fontSize": "40px",
      "fontWeight": "700",
      "lineHeight": null,
      "source": "css"
    },
    "body": {
      "fontFamily": "SFMono-Regular",
      "fontSize": "22px",
      "fontWeight": "400",
      "lineHeight": null,
      "source": "css"
    },
    "caption": {
      "fontFamily": "SFMono-Regular",
      "fontSize": "16px",
      "fontWeight": "400",
      "lineHeight": null,
      "source": "css"
    },
    "code": {
      "fontFamily": "SFMono-Regular",
      "fontSize": "14px",
      "fontWeight": "400",
      "lineHeight": null,
      "source": "css"
    }
  },
  "fontFaces": [],
  "rules": {
    "maxSizesPerScreen": 4,
    "headingWeightRange": "600-700",
    "bodyWeight": 400,
    "lineHeightBody": 1.5,
    "lineHeightHeading": 1.2
  }
}
```

## Bundled Fonts (fonts/)

The following font files are bundled in the `fonts/` directory:

- `fonts/Inter-Black.ttf`
- `fonts/Inter-Bold.ttf`
- `fonts/Inter-ExtraBold.ttf`
- `fonts/Inter-ExtraLight.ttf`
- `fonts/Inter-Light.ttf`
- `fonts/Inter-Medium.ttf`
- `fonts/Inter-Regular.ttf`
- `fonts/Inter-SemiBold.ttf`
- `fonts/Inter-Thin.ttf`

Use these local font files in `@font-face` declarations instead of fetching from Google Fonts.

## Screenshots Inventory (screens/)

> Study all screenshots carefully before implementing any UI. Match every visual detail exactly.

### Scroll Journey (screens/scroll/)

*Cinematic scroll states — page visual at each scroll depth*

![scroll-000.png](screens/scroll/scroll-000.png)

![scroll-017.png](screens/scroll/scroll-017.png)

![scroll-033.png](screens/scroll/scroll-033.png)

![scroll-050.png](screens/scroll/scroll-050.png)

![scroll-067.png](screens/scroll/scroll-067.png)

![scroll-083.png](screens/scroll/scroll-083.png)

![scroll-100.png](screens/scroll/scroll-100.png)

### Full Page Screenshots (screens/pages/)

*Full-page screenshots of each crawled URL*

![home.png](screens/pages/home.png)

### Section Clips (screens/sections/)

*Clipped individual sections and components*

![home-section-1.png](screens/sections/home-section-1.png)

### Interaction States (screens/states/)

*Hover, focus, and active state captures*

![button-1-default.png](screens/states/button-1-default.png)

![button-1-focus.png](screens/states/button-1-focus.png)

![button-1-hover.png](screens/states/button-1-hover.png)

![input-1-default.png](screens/states/input-1-default.png)

![input-1-focus.png](screens/states/input-1-focus.png)

![input-1-hover.png](screens/states/input-1-hover.png)

![input-2-default.png](screens/states/input-2-default.png)

![input-2-focus.png](screens/states/input-2-focus.png)

![input-2-hover.png](screens/states/input-2-hover.png)

![link-1-default.png](screens/states/link-1-default.png)

![link-1-focus.png](screens/states/link-1-focus.png)

![link-1-hover.png](screens/states/link-1-hover.png)

![link-2-default.png](screens/states/link-2-default.png)

![link-2-focus.png](screens/states/link-2-focus.png)

![link-2-hover.png](screens/states/link-2-hover.png)

### Screenshot Index (screens/INDEX.md)

# Screenshot Index

## Scroll Journey

> Shows the cinematic state at each point of the page

| Scroll | Y Position | File |
|--------|-----------|------|
| 0% | 0px | `screens/scroll/scroll-000.png` |
| 17% | 67px | `screens/scroll/scroll-017.png` |
| 33% | 129px | `screens/scroll/scroll-033.png` |
| 50% | 196px | `screens/scroll/scroll-050.png` |
| 67% | 263px | `screens/scroll/scroll-067.png` |
| 83% | 325px | `screens/scroll/scroll-083.png` |
| 100% | 392px | `screens/scroll/scroll-100.png` |

## Pages

| Page | URL | File |
|------|-----|------|
| The LLC | Scale Your Business | `https://thellc.io/` | `screens/pages/home.png` |

## Sections

| Page | Section | File |
|------|---------|------|
| home | #1 (section) | `screens/sections/home-section-1.png` |

## Homepage Screenshots (screenshots/)

![homepage.png](screenshots/homepage.png)


# Bento Bold — shared design system (the backbone)

Every admin mockup uses THIS system. The reference implementation is `cold-calling.html`
in this folder (open it, copy its shell + tokens). Variations change LAYOUT, never the DNA below.

## Build rules (all mockups)
- One self-contained HTML file. Inline `<style>`. The ONLY external resource allowed is the
  Google Fonts `<link>`. No JS libraries, no icon libraries (inline SVG only).
- Fully responsive. The page body NEVER scrolls horizontally; wide tables scroll inside their own
  container. Stat/bento tiles reflow on narrow screens.
- No em dashes anywhere in copy. The `—` glyph is allowed ONLY as an empty-cell placeholder.
- All figures use tabular lining numerals; align decimals in tables.
- Editable data cells are real `<input>`s. Computed cells recompute live and are visually muted.
- Sample data is fine; never imply it is live data (footnote: "Sample data for design review").

## Design tokens
- Base bg `#eef0f4`; cards `#ffffff` radius `22px`; soft shadow `0 2px 16px -8px rgba(20,22,28,.18)`.
- Text: ink `#14161c`, muted `#6b7280`, faint `#9aa1ad`. Lines `#eceef2` / `#e3e6ec`.
- Accent set (tile tint + solid): indigo `#6366f1`/`#eef0ff`, green `#10b981`/`#e7f7f0`,
  sky `#0ea5e9`/`#e6f5fd`, amber `#f59e0b`/`#fdf3e2`, rose `#ef4444` (bad/over).
- Fonts (Google): Poppins 500/600/700 = display headings + big numerals; Inter 400/500/600 = body + tables.

## Fixed shell (identical on every screen)
- **Spine** (74px, dark navy `#0c1020`): brand mark "H" (indigo→violet gradient), nav icons
  Command / Acquisition / Sales / Fulfillment / Operations, then Settings + a green→sky avatar "JH".
  Active icon = indigo→violet gradient pill. The active pillar's icon is lit per screen.
- **Header**: kicker (uppercase indigo, e.g. "Acquisition") + big Poppins title + one-line muted tagline.
- **Tab bar** (per pillar): pill group on `#e5e8ef`; active tab = white card with shadow.

## Component patterns (reuse, don't reinvent)
- **Stat tile**: colored tint background, icon chip (solid accent), small label, big Poppins value,
  faint sub, optional benchmark chip (`ok` green / `bad` rose).
- **Data table**: sticky header `#fafbfc`, uppercase faint column labels, right-aligned tabular nums,
  first column left-aligned. Editable input cells (focus = 2px indigo ring). Computed columns muted.
  Sticky footer with Average + Total rows.
- **Month nav** (for daily trackers): white pill, prev/next chevrons, Poppins month label, "Today" button.
  Auto-generate a row for every day of the month; grey weekends; highlight today with an indigo pill.
- **Record card / form field**: label above, value/input below, grouped inside a white bento panel.

## The 3 variations (general shape — each surface brief refines them)
- **A — Table/Content-first**: minimal tiles, the core table or content dominates the screen.
- **B — Dashboard-first**: prominent bento stat tiles up top, core content below.
- **C — Split/paneled**: content split into distinct bento panels (e.g. form left / results right,
  or grouped sections), more compartmentalized.
All three are unmistakably Bento Bold. They differ only in arrangement and emphasis.

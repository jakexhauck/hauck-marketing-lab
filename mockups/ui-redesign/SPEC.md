# UI redesign mockups — shared spec

Five aesthetic directions for the same screen. Keep the DATA and SCREEN STRUCTURE
identical across all five so the comparison is purely about look and feel. The
only variable is the visual design.

## The screen to design
The app's primary **Leads** screen: a single pipeline's lead list with a light
summary up top. Structure (top to bottom):
1. iOS status bar (provided below)
2. A header: a small wordmark/brand mark + the current pipeline name ("Sales")
3. A compact summary: 2-3 key numbers (do NOT overload it; simple is the goal)
4. A stage selector (All / New / Contacted / Estimate / Won) - style it to fit
5. A list of leads (6 rows)
6. A bottom tab bar: Home / Leads / Chats / Contacts (Leads active)
7. Home indicator (provided below)

You may simplify or merge elements if your direction calls for it (e.g. fold the
summary into the header). The goal Jake asked for: **extremely simple, aesthetic,
professional.** Favor whitespace and restraint over density.

## Hard rules
- Frame: exactly 390 x 844, full-bleed (no device bezel).
- **Sans-serif display type only.** No serif headlines (house rule). Pick a clean
  sans that fits your direction (Inter, Manrope, Plus Jakarta Sans, Archivo,
  Space Grotesk, IBM Plex Sans, Geist - all on Google Fonts).
- No emojis. No em dashes (use commas, periods, colons).
- Self-contained single HTML file with an inline `<style>`. No external CSS file.
- Light or dark is your choice per direction.
- Use real, tasteful sample data below. Make it look like a shipping product.

## Required frame boilerplate
```html
<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=390, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- add your Google Fonts <link> here -->
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 390px; height: 844px; overflow: hidden; }
  /* your styles... wrap everything in .phone (390x844, flex column) */
</style>
</head><body>
  <div class="phone"> ... </div>
</body></html>
```

## Status bar (place at very top of .phone). Recolor text to suit your theme.
```html
<div class="statusbar">
  <span class="sb-time">9:41</span>
  <span class="sb-icons">
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="4.5" width="3" height="7.5" rx="1"/><rect x="9" y="2" width="3" height="10" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
    <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 2.2c2 0 3.9.8 5.3 2.1l1.2-1.3A9.4 9.4 0 0 0 8.5.5 9.4 9.4 0 0 0 2 3l1.2 1.3A7.4 7.4 0 0 1 8.5 2.2Zm0 3.4c1.1 0 2.1.4 2.9 1.2l1.2-1.3a5.9 5.9 0 0 0-8.2 0l1.2 1.3a4 4 0 0 1 2.9-1.2Zm0 3.3L10.2 10a2.4 2.4 0 0 0-3.4 0l1.7 1.8Z"/></svg>
    <svg width="26" height="12" viewBox="0 0 26 12" fill="none"><rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="18" height="8" rx="1.5" fill="currentColor"/><rect x="24" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.5"/></svg>
  </span>
</div>
```
Suggested: `.statusbar{height:50px;display:flex;align-items:center;justify-content:space-between;padding:0 26px 0 30px;font-weight:700;font-size:15px}` then color `.sb-time`/`.sb-icons` to your theme.

## Home indicator (last child of .phone)
```html
<div class="homebar"></div>
```
Suggested: `.homebar{height:24px;display:flex;align-items:center;justify-content:center}` with an inner 134x5 rounded bar.

## Icons (Lucide line style; size to taste). No emojis.
- home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
- leads/list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>`
- chats: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
- contacts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
- search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
- chevron-down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`

## Sample data (use exactly; it is brand-neutral on purpose)
- Wordmark/brand mark: simple text "Leads" or a tasteful monogram of your choice. Keep it understated.
- Current pipeline: **Sales**
- Summary numbers (pick 2-3, label them cleanly): Open **8**, Estimates **3**, Won this month **$24.6k**
- Stage selector: All, New, Contacted, Estimate, Won (Estimate is the active filter)
- Leads (name, status line, value, time):
  1. Marcus Bell, Estimate sent, $6,400, 2h
  2. Dana Whitfield, New lead, (no value), 5h
  3. Priya Nair, Estimate sent, $9,200, 1d
  4. Tom Ruiz, Follow up, $4,800, 2d
  5. Erin Osei, Contacted, $3,950, 2d
  6. Carl Lindholm, Won, $11,200, 3d
- Avatars: use initials in a circle/rounded square, or omit if your aesthetic is cleaner without them. Your call.

## Output
Save ONE self-contained HTML file to this folder with the filename your task gives.
Do not render PNG yourself; the orchestrator renders all five together.

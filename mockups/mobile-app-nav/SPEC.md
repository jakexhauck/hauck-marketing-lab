# Willis Leads — mobile nav mockup spec (shared)

Every mockup in this folder must use this exact data, branding, and these shared
building blocks so the four directions are comparable. Differences should be in
**navigation/layout only**, not styling, fonts, or sample data.

## Hard rules
- No emojis anywhere. No em dashes (use commas/periods/colons).
- Display type: Archivo. Body: Inter. (Loaded via the Google Fonts link below.)
- Brand: deep blue `#1a4d8f`. App name **Willis Leads**. Brand chip initials **WW**.
- Link the shared stylesheet: `<link rel="stylesheet" href="_base.css">` and add a
  small per-file `<style>` only for direction-specific flourishes.
- Each HTML file = ONE phone screen, exactly 390 x 844, full-bleed (no device bezel).
  Wrap everything in `<body><div class="phone"> ... </div></body>`.
- Light theme only.

## Required `<head>`
```html
<meta charset="utf-8">
<meta name="viewport" content="width=390, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="_base.css">
```

## Shared status bar (paste at top of `.phone`, inside it)
```html
<div class="statusbar">
  <span>9:41</span>
  <span class="ios-icons">
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="4.5" width="3" height="7.5" rx="1"/><rect x="9" y="2" width="3" height="10" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
    <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 2.2c2 0 3.9.8 5.3 2.1l1.2-1.3A9.4 9.4 0 0 0 8.5.5 9.4 9.4 0 0 0 2 3l1.2 1.3A7.4 7.4 0 0 1 8.5 2.2Zm0 3.4c1.1 0 2.1.4 2.9 1.2l1.2-1.3a5.9 5.9 0 0 0-8.2 0l1.2 1.3a4 4 0 0 1 2.9-1.2Zm0 3.3L10.2 10a2.4 2.4 0 0 0-3.4 0l1.7 1.8Z"/></svg>
    <svg width="26" height="12" viewBox="0 0 26 12" fill="none"><rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="18" height="8" rx="1.5" fill="currentColor"/><rect x="24" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.5"/></svg>
  </span>
</div>
```
Use `<div class="statusbar on-brand">` (white text) only when it sits on a brand-colored header.

## Home indicator (paste as last child of `.phone`)
```html
<div class="homebar"></div>
```

## Inline icons (Lucide line style, 22px). Use as needed; never emojis.
- Conversations: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`
- Contacts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
- Pipeline/leads: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>`
- Home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
- Search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
- Chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
- Chevron-down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`

## The 5 real pipelines (exact names) + short tab labels + stages
| Pipeline (full) | Tab label | Stages (in order) |
|---|---|---|
| Database Reactivation | DBR | Lead Contacted, Lead Responded, No answer, Not Qualified |
| Google Review Campaign | Google | Asked For Review, Review Link Clicked, Negative Feedback, Positive Review |
| Organic | Organic | Lead In, Lead Responded, No Answer, Not Qualified |
| Paid Ad's | Paid Ads | Lead In, No Appt Booked, Lead Responded, No answer, Not Qualified, Intro Call Waiting, Intro Call No Confirm |
| Sales | Sales | Intro Call Confirmed, Estimate Scheduled, Estimate Completed, Closed, No-Close, Follow Up, Abandoned |

Plus two non-pipeline tabs that always exist: **Conversations**, **Contacts**.

## Avatar colors (cycle through these for lead rows)
`#1a4d8f`, `#0e7490`, `#7c3aed`, `#b45309`, `#15803d`, `#be123c`

## Sample data — Sales pipeline (use when showing Sales)
Stat strip: Open **8** · Estimates **3** · Closed **2** · Won value **$24.6k**
Leads (avatar initials, name, stage, value, time-ago):
1. MB, Marcus Bell, Estimate Scheduled, $6,400, 2h
2. DW, Dana Whitfield, Intro Call Confirmed, (no value yet), 5h
3. PN, Priya Nair, Estimate Completed, $9,200, 1d
4. TR, Tom Ruiz, Follow Up, $4,800, 2d
5. EO, Erin Osei, Estimate Scheduled, $3,950, 2d
6. CL, Carl Lindholm, Closed, $11,200, 3d

## Sample data — Paid Ad's pipeline (use when showing Paid Ads)
Stat strip: New **12** · Booked **5** · Responded **7** · CPL **$38**
Leads:
1. SL, Sarah Lindqvist, Lead In, new, 12m
2. GP, Greg Patterson, Lead Responded, 1h
3. MA, Mia Alvarez, No Appt Booked, 3h
4. RT, Ray Thompson, Lead In, 4h
5. JK, Jordan Kim, Intro Call Waiting, 6h

## Sample data — home/summary counts (use for any overview screen)
- Sales: 8 open, 3 estimates out
- Paid Ads: 12 new leads today
- DBR: 4 responded
- Google: 6 reviews requested
- Organic: 3 new
- Conversations: 5 unread

## Output
Save your HTML file(s) to this folder with the filename your task specifies.
Do not render to PNG yourself; the orchestrator renders all files together.

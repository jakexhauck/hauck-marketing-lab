# Willis Leads — "Dark Split" full app mockups (shared spec)

Every screen is one self-contained HTML file, exactly 390 x 844, full-bleed (no
device bezel). They all link `_base.css` and share the design system below so the
app reads as one cohesive product. Differences are per-screen content only.

## Hard rules
- No emojis. No em dashes (use commas, periods, colons).
- Display type: Archivo (`.font-display` / `.hero-num` etc). Body: Inter.
- Brand blue `#1a4d8f`. Deep navy hero `linear-gradient(165deg,#13294a,#0d1f38)`.
  Light-blue split accent `#5b9be0`. App name **Willis Leads**, brand mark **WW**.
- Light body. Reuse `_base.css` classes; add a tiny inline `<style>` only for
  screen-specific bits.
- Wrap everything in `<body><div class="phone"> ... </div></body>`.

## Required `<head>`
```html
<meta charset="utf-8">
<meta name="viewport" content="width=390, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="_base.css">
```

## Status bar (first child of `.phone`, or first child of `.hero`)
Use `on-dark` when on the navy hero, `on-light` on a white background.
```html
<div class="statusbar on-dark">
  <span>9:41</span>
  <span class="ios-icons">
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="4.5" width="3" height="7.5" rx="1"/><rect x="9" y="2" width="3" height="10" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
    <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 2.2c2 0 3.9.8 5.3 2.1l1.2-1.3A9.4 9.4 0 0 0 8.5.5 9.4 9.4 0 0 0 2 3l1.2 1.3A7.4 7.4 0 0 1 8.5 2.2Zm0 3.4c1.1 0 2.1.4 2.9 1.2l1.2-1.3a5.9 5.9 0 0 0-8.2 0l1.2 1.3a4 4 0 0 1 2.9-1.2Zm0 3.3L10.2 10a2.4 2.4 0 0 0-3.4 0l1.7 1.8Z"/></svg>
    <svg width="26" height="12" viewBox="0 0 26 12" fill="none"><rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="18" height="8" rx="1.5" fill="currentColor"/><rect x="24" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.5"/></svg>
  </span>
</div>
```

## Brand head (inside `.hero`, the row under the status bar)
```html
<div class="brand-head">
  <div class="brand-left">
    <div class="mark">WW</div>
    <div> ... name / pipeline / greeting ... </div>
  </div>
  <button class="icon-btn"> [search svg] </button>
</div>
```

## Split metric block (inside `.hero`, below brand head, margin-top ~26px)
```html
<div class="split">
  <div class="split-primary">
    <div class="cap-light">Won value</div>
    <div class="hero-num" style="font-size:56px;color:#fff;margin-top:6px">$24.6k</div>
  </div>
  <div class="split-div"></div>
  <div class="split-secondary">
    <div class="hero-num" style="font-size:30px">8</div>
    <div class="cap-light" style="margin-top:6px">Open leads</div>
  </div>
</div>
```

## Bottom tab bar (last child of `.phone` before `.homebar`)
Set `active` on the current tab. Order: Home, Leads, Chats, Contacts.
```html
<div class="tabbar">
  <div class="tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><span>Home</span></div>
  <div class="tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg><span>Leads</span></div>
  <div class="tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Chats</span></div>
  <div class="tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Contacts</span></div>
</div>
<div class="homebar"></div>
```

## Inline icons (Lucide line style)
- search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
- chevron-down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
- chevron-left (back): `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
- chevron-right: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
- phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`
- mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>`
- message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
- send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`
- activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`

## Avatars
42x42 rounded square `.av` plus a palette class `.av-1` ... `.av-10`. Use white
initials. Assign colors per person consistently (listed below).

## ===== DATA (use exactly) =====

### Brand / identity
App name **Willis Leads**, mark **WW**. Greeting line example: "Good morning, Mon Jun 9".

### The 5 pipelines (full name | short label | open count)
- Database Reactivation | DBR | 4 responded
- Google Review Campaign | Google | 6 requested
- Organic | Organic | 3 new
- Paid Ad's | Paid Ads | 12 new today
- Sales | Sales | 8 open

Home hero summary: **12 new leads today** (across all pipelines), **5 unread** messages.

### Sales pipeline stages (in order)
Intro Call Confirmed, Estimate Scheduled, Estimate Completed, Closed, No-Close, Follow Up, Abandoned.
On the Leads screen show pills: All, Intro Call Confirmed, Estimate Scheduled (ACTIVE), Estimate Completed, Follow Up, Closed.

### Sales leads (avatar color, initials, name, stage, value, time-ago)
1. av-7, MB, Marcus Bell, Estimate Scheduled, $6,400, 2h
2. av-2, DW, Dana Whitfield, Intro Call Confirmed, (no value), 5h
3. av-3, PN, Priya Nair, Estimate Completed, $9,200, 1d
4. av-5, TR, Tom Ruiz, Follow Up, $4,800, 2d
5. av-6, EO, Erin Osei, Estimate Scheduled, $3,950, 2d
6. av-4, CL, Carl Lindholm, Closed, $11,200, 3d
Leads hero: Won value **$24.6k** (primary), Open leads **8** (accent).

### Lead detail (Marcus Bell)
- Stage chip: Estimate Scheduled. Source line: "Facebook, Window Replacement Q2".
- Phone: (415) 555-0182. Email: marcus.bell@email.com.
- Value $6,400. Created Jun 5, 2026. Last activity 2 hours ago.
- Recent messages (last 2): inbound "Perfect, see you Thursday at 2." ; outbound "Great, we will see you Thursday at 2pm for the estimate."
- Activity timeline (newest first): "Stage: Intro Call Confirmed to Estimate Scheduled" 2h ago; "Note added: Wants the whole front of the house, 6 windows" 1d ago; "Lead created" Jun 5.
- Outcome buttons: Mark Booked, Mark Closed (this is the won/primary action), Mark Lost.

### Conversations / Chats (newest first; 5 unread total)
1. av-7, Marcus Bell, "Perfect, see you Thursday at 2.", 8m, unread 1
2. av-2, Dana Whitfield, "Can you send the brochure over?", 25m, unread 2
3. av-8, Greg Patterson, "Do you do bay windows?", 2h, unread 1
4. av-5, Tom Ruiz, "Following up on our call from earlier", 4h, unread 1
5. av-3, Priya Nair, "The estimate looks great, thank you", 1d, unread 0
6. av-6, Erin Osei, "Sounds good, talk then", 2d, unread 0
Header count: 6 threads.

### Chat thread (Marcus Bell) — bubbles oldest to newest
- in: "Hi, I saw your ad about window replacement." (Yesterday 4:02 PM)
- out: "Hi Marcus, happy to help. Replacing all the windows or just a few?"
- in: "Probably the whole front of the house, about 6 windows."
- out: "Great. We offer a free in-home estimate. Does Thursday at 2pm work?"
- in: "Perfect, see you Thursday at 2." (Today 9:38 AM)
Composer placeholder: "Message". Header shows name + a phone (call) icon button.

### Contacts (avatar, initials, name, phone-or-email subline)
1. av-7, MB, Marcus Bell, (415) 555-0182
2. av-4, CL, Carl Lindholm, (415) 555-0147
3. av-2, DW, Dana Whitfield, dana.whitfield@email.com
4. av-6, EO, Erin Osei, (628) 555-0193
5. av-8, GP, Greg Patterson, (415) 555-0166
6. av-10, MA, Mia Alvarez, (510) 555-0110
7. av-3, PN, Priya Nair, (415) 555-0175
8. av-9, RT, Ray Thompson, ray.thompson@email.com
9. av-1, SL, Sarah Lindqvist, (650) 555-0138
10. av-5, TR, Tom Ruiz, (415) 555-0129
Header count: 10 contacts. Each row has small round call + mail action buttons on the right (outline style, see ContactRow pattern).

## Output
Save your HTML file to this folder with the filename your task specifies. Do not
render PNG yourself; the orchestrator renders all files together.

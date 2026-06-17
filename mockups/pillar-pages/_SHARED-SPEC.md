# Shared spec — Pillar / Command Center mockup pages

All five variants present the SAME content and use the SAME visual style.
Only the LAYOUT / UX structure differs between them.

## Hard rules (every variant)

- Single self-contained `.html` file. All CSS inline in one `<style>` block. Any JS inline in one `<script>`. No external files, no build step. Must open by double-clicking (file://).
- **Visual style is LOCKED to the live site.** Before building, read `Hauck Marketing Website/index.html` and copy its `:root` tokens, font imports (Space Grotesk / Inter / JetBrains Mono), and component classes (`.nav`, `.wrap`, `.mono`, `.btn`, `.pill`, `.sec-eyebrow`, `.reveal`, the blueprint grid `body` background, `.diagram-shell` styling, footer). Reuse them verbatim. Add ONLY the new layout CSS your variant needs. Do NOT invent new colors, fonts, or change the tokens.
  - Tokens: `--bg:#08090C; --surface:#0F1218; --grid:rgba(91,140,255,0.16); --hair:rgba(255,255,255,0.06); --ink:#EAF0FA; --muted:#8A93A6; --accent:#5B8CFF; --cyan:#6FE3FF; --r:8px; --maxw:1180px;`
- Reuse the existing nav (wordmark + links) and footer (contact + legal) exactly so the page feels part of the site. Add a "Back to home" affordance. Nav links can point to `index.html#...`.
- **No em dashes anywhere.** Use commas, periods, parentheses, or colons.
- Quality floor: responsive to mobile, visible keyboard focus, `prefers-reduced-motion` respected, semantic headings.
- Keep the scroll-reveal IntersectionObserver pattern from index.html if you use reveals.

## Positioning guardrails (from the creative brief)

- The product is the **C3 Growth System: Capture -> Convert -> Compound**, delivered to each client as their branded **"[Business] Command Center."**
- Never sell "more leads." Sell the closed loop: every lead **caught, converted, and compounded.**
- The hook: **"We make your growth leakproof: every lead caught, converted, and compounded."**
- **Do NOT call it a CRM.** It is the Command Center, the operating system for the whole business.
- **Weight CONVERT.** Capture and Compound are table stakes; Convert is the wedge. Give it the most space / strongest treatment.
- Reframe the owner's problem as a *leak* problem, not a lead-quantity problem.

## The four content blocks

Use this copy (tighten as needed, keep meaning). Each pillar has: a one-line promise, the leak it plugs, the named deliverables, and a proof stat.

### Pillar 01 — CAPTURE
- **Promise:** Get every opportunity into one place. Nothing comes in that is not caught.
- **The leak:** Missed calls on the ladder, web leads sitting overnight, after-hours demand going to voicemail, leads scattered across five channels.
- **Deliverables:** Voice Reception Agent (answers, qualifies, and books 24/7 when you cannot) · Missed-call text-back on every missed call · Conversation Agent (engages web and Facebook leads in seconds) · Unified inbox (calls, texts, Facebook, Instagram, Google in one place) · Custom website with chat widget and estimate forms · Two Meta ad funnels (a volume lead form and a pre-qualifying quiz that books onto the calendar) · Retargeting so warm traffic is never paid for once and lost.
- **Proof:** Contact a lead within 5 minutes and they are ~21x more likely to qualify. Yet small businesses answer only about 38% of calls, and 85% of callers who do not reach you never call back.

### Pillar 02 — CONVERT  (the wedge: give it the most weight)
- **Promise:** Turn caught leads into booked, sold jobs, and let none slip. This is where competitors leak and we do not.
- **The leak:** One follow-up attempt then forgotten, quotes sent into silence, web chats that die when the tab closes, no-shows, sticky-note pipelines.
- **Deliverables:** The Conversation Agent qualifies and books the right jobs · Multi-stage SMS and email follow-ups mapped to every sales stage · Web-chat-to-SMS continuation so a closed tab does not end the conversation · Automated reminders, confirmations, and reschedule flows to cut no-shows · Native in-app e-signature (no DocuSign) · In-app invoicing (Stripe / Square) · Call recording with AI call summaries written into each customer's notes · Owner notifications across SMS, email, and the app · A dedicated recovery path for the lead who did not book.
- **Proof:** About 78% of customers buy from whoever responds first, and phone leads convert at 10 to 15x the rate of web-form leads.

### Pillar 03 — COMPOUND
- **Promise:** Turn finished jobs into more business. Each job makes the next one cheaper to win.
- **The leak:** Happy customers never asked for a review, a thin review profile losing the click, hundreds of past customers never contacted again.
- **Deliverables:** Google Review Agent (one tap after a job fires the request, with sentiment gating that routes unhappy feedback privately, reminder sequence, and AI-drafted responses to reviews) · Lead Reactivation Agent (works your old customer list over SMS and email to re-book repeat and seasonal work) · Full ROI and reporting dashboard showing exactly what every ad dollar produced.
- **Proof:** Roughly 68% of consumers will only use a business with 4+ stars, and each additional Google review correlates with about 80 more website visits, 63 direction requests, and 16 calls a year. Keeping a customer costs 5 to 25x less than winning a new one.

### The COMMAND CENTER  (the unifier)
- **Promise:** The whole business, running in one place, with your name on it.
- **What it is:** A done-for-you, fully custom business app, branded to the client and synced across mobile and desktop. A single inbox for every channel and a reporting dashboard on top. It is the operating system that runs Capture, Convert, and Compound as one loop. It is not a rented tool and it is not a CRM. It is theirs.
- **Why it matters:** The owner stops being the bottleneck. The machine handles everything between "interested" and "paid," then turns "paid" into the next job.

## CTA
Primary button "Apply now" -> `index.html#apply` (or `mailto:contact.jakehauck@gmail.com?subject=Application`).
Ghost button "Back to home" -> `index.html`.
Footer contact: contact.jakehauck@gmail.com  /  734-301-0570  /  (c) Hauck Marketing.

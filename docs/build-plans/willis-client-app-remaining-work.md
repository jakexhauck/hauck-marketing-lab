# Willis Client App — Remaining Work Plan

**Date:** 2026-07-07
**Source:** live production wiring audit as Willis (22 live / 6 connect / 1 bug) + page-map hole audit.
**Map:** `Desktop\command-center-page-map\index.html`

This is a master roadmap across independent workstreams. Each **BUILD** item gets its own detailed, test-driven plan when we start it. **CONNECT** items are mostly Jake-side (GHL/Google/Meta setup), not code.

Owner key: **[A]** = agent (me, code) · **[J]** = Jake (setup/connection/decision) · **[A+J]** = both.

---

## P0 — Fix what's broken

### 1. Revenue: invoices + payments error out  **[A]**
- **Symptom:** `/api/invoices` and `/api/payments/transactions` both return `internal_error`; Revenue page shows "Failed to load invoices/payments".
- **Why it matters:** the only hard error in the whole app. Page is built, just broken.
- **Approach:** reproduce against Willis's real GHL token; read the two endpoint handlers + `lib/ghl.ts`; find the failing GHL call (likely an invoices/transactions endpoint path, scope, or response-shape mismatch). Root-cause first (systematic-debugging), no guessing.
- **Note:** uses Willis's real GHL token and still fails, so this is a real bug, not a missing connection. Could still turn out to be a GHL scope on invoices, confirm in the repro.
- **Done when:** Revenue loads real invoices + payments (or shows an honest empty state if Willis has none), no error banner, verified live.

---

## P1 — Website Pages: decide the data source  **[A+J]**

### 2. Website → Pages "not connected"
- **Finding (confirmed):** the app reads pages from GHL Funnels (`/funnels/funnel/list`). Willis's token is a **Private Integration Token (`pit-`)**, and that call returns `401 "token is not authorized for this scope"`. GHL PITs generally **cannot** be granted the Funnels/Websites scope (it's OAuth-only).
- **Decision fork:**
  1. **[J]** Confirm the "View Funnels/Websites" scope in Willis's Private Integration, and that the scoped token is the one deployed to the app (Doppler → Cloudflare). Then **[A]** re-test.
  2. If it still 401s → PITs can't do Funnels. Then **[A]** change the Pages data source: either read the live site directly, or drop the auto-list and keep "View live site" + Request-a-change. (williswindows.com is external anyway.)
- **Done when:** Website → Pages either lists real pages, or is intentionally simplified to a working, honest state (no "not connected" dead end).

---

## P2 — Build the UI holes  **[A]**

These are buttons/modals that currently show "Coming soon". Each gets its own TDD plan when picked.

### 3. "Book appointment" shared modal
- **Where:** Contact Cockpit, Leads, Calendar (`ContactDetailDesktop.tsx` Book appointment = `showToast("Coming soon")`).
- **What:** one shared booking modal (type + slot + notes) that writes a GHL appointment. Build once, wire in all three.
- **Why first:** highest leverage, closes the biggest single gap across three surfaces.

### 4. Contact Cockpit actions
- **Where:** `ContactDetailDesktop.tsx` — Add to list, Merge duplicate, Export, Delete contact all `showToast("Coming soon")`.
- **What:** wire each: Delete (confirm + GHL delete), Export (CSV of current view), Add to list (GHL tag/list), Merge (pick keeper, fold the other).
- **Order:** Delete + Export first (simple, self-contained), then Add to list, then Merge (most complex).

### 5. Website "Request a change" modal
- **Where:** Website tab; backend `functions/api/website/requests/index.ts` already exists.
- **What:** verify the endpoint, then wire the client modal (page + what to change + priority) to it. May already be partly built — **verify before building.**

---

## P3 — Connections (mostly Jake-side)

### 6. Google Reviews → link Google Business Profile  **[J]**
- Rating / All Reviews / Reputation Report need GBP linked. Approval was **submitted** (project 691475481242). Lights up on approval, no code needed.
- **[A]** on approval: confirm the review data flows and drop any "not linked" copy.

### 7. Jobs → connect calendar + sales pipeline  **[A+J]**
- Jobs page is built but shows "not connected". Needs the calendar + Sales pipeline wired so booked/completed jobs flow in.
- **[A]** confirm what "connected" checks for; **[J]** any GHL calendar/pipeline setup.

### 8. Reactivation → Overview source  **[A+J]**
- Pipeline/Data/Messages render; Overview needs the dormant-customer source connected to populate.

---

## P4 — Polish + verify

### 9. "No connected-placeholder chatter" sweep  **[A]**
- Standing rule: a connected client never sees "account connected, results show up here" filler. A few pages still show "not connected / coming soon" banners where an honest empty state fits better. Sweep the remaining sections.

### 10. Jake live-eyeball + lock pass  **[J]**
- Several pages are shipped but "not Jake-eyeballed". Walk each page in the live app, mark it **locked** or list fixes. One page at a time; nothing new starts until the current one is locked (the finish loop).

---

## Suggested order

1. **Revenue bug** (P0 — real error, likely quick, clean win).
2. **Book appointment modal** (P2 — biggest UX hole, three surfaces at once).
3. **Website Pages decision** (P1 — needs your GHL check first; ping me when done).
4. **Contact Cockpit actions** (P2).
5. Connections as they clear (GBP approval, Jobs, Reactivation).
6. Placeholder sweep + your lock pass throughout.

## Open decisions for Jake
- **Website Pages:** confirm the GHL scope/token, or greenlight switching the data source (see P1).
- **Which item first?** My vote: Revenue bug, then Book appointment modal.

## Not in scope (parked)
- Automations / GHL↔app wiring (standing rule: finish + lock pages first).
- Social / Commercial Outreach / Group Outreach (hidden, not sold to Willis).

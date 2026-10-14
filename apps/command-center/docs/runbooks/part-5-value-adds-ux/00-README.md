# Part 5: Value-Adds and UX Polish

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

Status: code ☑ done (2026-06-11, all 17 items, uncommitted pending Jake's review) | manual actions ☐ not started

Theme: two halves. First, surface the real GHL data clients actually care about that the app currently throws away (UTM ad attribution, tags, accurate counts). Second, the full list of UX defects from the audit: dead toasts, wrong copy, mock financials on real screens, timezone bugs, and the remaining paper cuts.

## Half 1: value-adds (real data)

| # | Item | Where |
|---|---|---|
| 5.1 | UTM attribution: contacts in the test account already carry `utm_source`, `utm_campaign`, `utm_ad`, adset ids. Read contact custom fields and populate lead source attribution (currently hardcoded to empty strings) | backend contacts/leads endpoints, `src/context/LeadsContext.tsx`, LeadDetail |
| 5.2 | Tags: fetched by the backend, rendered nowhere. Show tags on contact and lead detail; tag chips in lists where space allows | `src/routes/Contacts.tsx`, LeadDetail |
| 5.3 | Accurate counts: summary stats, calendar contact-name map, and payments currently compute from the first 100 records; paginate or label as approximate | `functions/api/summary.ts`, `calendar/events.ts`, `payments/transactions.ts` |
| 5.4 | Mock financials OFF real screens: ClientContext serves a fabricated client ($2,500 spend) to Dashboard/Today/Simulator; per the no-fabricated-numbers rule these screens are gated, rewired to real tenant config, or removed from client-facing nav | `src/context/ClientContext.tsx`, `src/routes/Dashboard.tsx`, `Today.tsx`, `Simulator.tsx`, `src/App.tsx` |
| 5.5 | Branding from one source: the login footer currently hardcodes a client-specific agency string, and APP_BRAND, the manifest name, and BrandedLogo initials are three more independent brand sources; all unify onto a single generic brand config so per-client branding becomes pure configuration | `src/lib/appBrand.ts`, `src/routes/Login.tsx`, `vite.config.ts` |

## Half 2: UX defects

| # | Item | Where |
|---|---|---|
| 5.6 | Lost toasts: marking Won/Booked/Lost shows no confirmation (navigates with state nobody reads) | LeadDetail, Leads |
| 5.7 | Empty states all say "NO LEADS" even on Billing/Calendar/Notifications | `src/components/EmptyState.tsx` + call sites |
| 5.8 | Login button says "Send sign-in link" on a password form | `src/routes/Login.tsx` |
| 5.9 | Em dash in visible UI text (TopBar test banner) | `src/components/TopBar.tsx` |
| 5.10 | Timezone bugs: "new today", invoice overdue, task due dates all use UTC midnight | summary, invoices, tasks endpoints |
| 5.11 | Scroll restoration + scroll-to-top on route change | `src/App.tsx` / Shell |
| 5.12 | Pull-to-refresh on the main list screens (installed PWAs have no other refresh) | Shell or per-route |
| 5.13 | Composer/keyboard: thread container heights so the composer stays pinned; Enter-to-send vs newline on hardware keyboards | ConversationDetail, Shell, composers |
| 5.14 | Stale relative times ("3m ago") and the Home greeting when the app sits open | timeAgo consumers, Home |
| 5.15 | Duplicate components folded: ConversationThread x2, MessageComposer x2, StatusPill x2, day-grouping x2 | `src/components/`, routes |
| 5.16 | Board error state + per-card pending indicator during moves | `src/routes/Leads.tsx`, Board |
| 5.17 | Webhook event coverage: add appointment, invoice, and won/lost status events to the mapper so the notification center covers what clients expect (requires matching GHL workflows, see manual actions) | `functions/api/webhook.ts`, `src/routes/Notifications.tsx` labels |

## Files in this folder

- [01-implementation-spec.md](01-implementation-spec.md)
- [02-manual-actions.md](02-manual-actions.md)

## Done means

A fresh phone walkthrough of every screen shows: real attribution and tags, no fabricated numbers anywhere, confirmations on every action, correct dates in your timezone, and the notification center covering leads, messages, stage moves, wins, appointments, and invoices.

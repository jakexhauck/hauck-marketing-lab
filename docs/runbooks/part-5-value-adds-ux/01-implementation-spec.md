# Part 5 Implementation Spec (Claude executes this)

No manual actions in this file. Numbers map to [00-README.md](00-README.md). This part is large; Claude reports in two waves (5.1 to 5.5, then 5.6 to 5.17) if context demands, but it ships as one deploy.

## 5.1 UTM attribution

- Backend: when fetching a single lead (`leads/[id].ts`), the contact GET already happens; request custom fields with it (`GET /contacts/{id}` returns `customFields` array of `{id, value}`). Resolve field ids to keys once via `GET /locations/{locationId}/customFields` (cacheable 1h), then map `contact.utm_source`, `utm_campaign`, `utm_ad`, `utm_adset` onto the lead response as `attribution: { source, campaign, ad, adset }`.
- For the list endpoint, skip per-lead contact fetches (cost); attribution is detail-screen only.
- Frontend: LeadDetail shows an "Attribution" block when any value exists: Source, Campaign, Ad, Adset. `sourceAd`/`sourceCampaign` hardcoded empties are removed.

## 5.2 Tags

- `functions/api/contacts.ts` already returns tags; ensure the single-lead response includes the contact's tags too.
- Contacts list rows: up to 2 tag chips + "+N". Contact/lead detail: full tag chip row.
- Read-only this round (no add/remove UI); tag writes are a future part if wanted.

## 5.3 Accurate counts

- `summary.ts`: reuse the paginated fetch-all from `leads/index.ts` (extract a shared helper in `lib/ghl.ts`) so newToday/open counts cover all opportunities, not page 1.
- `calendar/events.ts`: paginate the contact-name map (same helper), cap at 1000 with the standard warning.
- `payments/transactions.ts`: follow pagination to the same 10-page cap; if `total` exceeds what was fetched, return `approximate: true` and the UI renders "1,000+".

## 5.4 Mock financials off real screens

- ClientContext: stop serving mock clients in authenticated sessions. Tenant display config (app name, brand color, initials, won/value labels, monthly spend) comes from a new lightweight `GET /api/tenant` endpoint reading the Supabase tenants row for `ctx.data.tenant.slug`; fall back to APP_BRAND constants when Supabase is unconfigured. Mock clients remain only for dev (`import.meta.env.DEV`).
- Dashboard/Today/Simulator: Simulator is removed from client-facing routing (dev-only, same gate as Showroom). Dashboard and Today drop every stat derived from `monthlySpend` unless the tenant row carries a real spend value (null spend = hide CPA/ROAS cards entirely; never fabricate).
- StatsStrip/computeStats: accept missing spend gracefully.

## 5.5 Single brand source

- `appBrand.ts` becomes the one constant consumed by Login footer, BrandedLogo, manifest strings (via vite define), and theme color. The Login footer reads `APP_BRAND.securedBy`; the hardcoded client-specific agency string is removed from JSX. PipelinesContext's localStorage key drops its legacy client-name prefix in favor of a neutral one (migration: read old key once, rewrite to new). After this item, zero client names exist anywhere in `src/`.

## 5.6 Toasts

- A tiny global toast context (or reuse existing Toast component) mounted in Shell; LeadDetail outcome actions fire it directly instead of navigate-with-state. Leads.tsx location.state path removed.

## 5.7 Empty states

- `EmptyState` takes a `title` prop (default stays "No Leads" for the leads screens); every call site passes the right title: "No notifications", "No invoices", "No appointments", "No conversations", "No contacts".

## 5.8 Login copy

- Live-mode submit button: "Sign in". Remove magic-link phrasing.

## 5.9 Em dash

- TopBar banner text becomes: "Test account: staging data, not a live client". Sweep `src/` for any other em dash in JSX string literals.

## 5.10 Timezones

- Add `TENANT_TIMEZONE` env (default `America/Chicago`; confirm with Jake) or read from the GHL location later. Backend "today" computations (`summary.ts` newToday, task default dueDate) and invoice overdue derivation use that zone via `Intl.DateTimeFormat` parts (no date libraries).
- Invoice overdue: an invoice is overdue starting the day AFTER its due date in tenant time.

## 5.11 Scroll behavior

- On route change: `window.scrollTo(0, 0)` except for back-navigation (use React Router's navigation type) so back restores position naturally where the browser provides it.

## 5.12 Pull-to-refresh

- Minimal touch-driven pull-to-refresh on Home, Leads, Conversations, Contacts, Calendar, Billing list screens: overscroll at top beyond 70px triggers `queryClient.invalidateQueries()` for that screen's keys with a small spinner. No library unless one is already present.

## 5.13 Composer/keyboard

- ConversationDetail layout: `h-dvh` flex column with the thread as the scrollable region, composer pinned; remove document-level scrolling on that route. Listen to `visualViewport.resize` to keep the composer above the iOS keyboard.
- Hardware keyboards: Enter sends, Shift+Enter newline (all channels); email channel keeps multiline affordance.

## 5.14 Time refresh

- A 60s interval context ticking a `now` value consumed by timeAgo renderers and the Home greeting; cleaned up on unmount.

## 5.15 Component dedup

- Fold ConversationThreadByContact/ConversationThread into one (props decide data source), same for the composers; extract a shared StatusPill and day-grouping util. No behavior changes.

## 5.16 Board states

- Error state with retry button when the pipeline leads query fails; moving card shows a subtle pending overlay until the mutation settles.

## 5.17 Webhook event coverage

- Mapper additions in `functions/api/webhook.ts`:
  - `OpportunityStatusUpdate` > `status_changed` ("Lead won"/"Lead lost" summary when derivable)
  - `AppointmentCreate` / `AppointmentUpdate` / `AppointmentDelete` > `appointment_*`
  - `InvoiceCreate` / `InvoicePaid` (and `InvoiceSent` if distinct) > `invoice_*`
- Push triggers extend to `status_changed` (won only) and `appointment_create`.
- Frontend `Notifications.tsx` + `Home.tsx` label maps gain the new kinds; unknown kinds render a humanized fallback (replace underscores, capitalize) instead of raw snake_case.
- Note: GHL workflows for these events are Jake's manual action in 02.

## Exit criteria

- `pnpm typecheck`, `pnpm build` pass; no em dash anywhere in rendered UI text; report delivered before Jake runs [02-manual-actions.md](02-manual-actions.md).

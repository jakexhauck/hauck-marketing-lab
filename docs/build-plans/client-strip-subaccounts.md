# Client strip: agency view and per-client sub-accounts

Status: SPEC, awaiting Jake's review. The plan is appended below once the spec is approved.
Mockup: `docs/mockups/client-switcher/index.html` (serve the folder, open in a browser).

## Goal

Replace the admin sidebar's Fulfillment group with a GHL-style split between the agency and each client. A strip of client chips on the far left switches between Agency view and one client. Each client has its own sidebar, and every per-client page (today's Fulfillment pages, and later the setup automations from the SOP review) lives inside it.

## Definition of done

- The Fulfillment caption and its six rows are gone from the owner's sidebar.
- A client strip sits left of the sidebar on desktop, with Agency, one chip per client, and a + chip.
- Clicking a chip swaps the whole sidebar to that client's pages. Clicking Agency swaps it back.
- Every client page has its own address with the client in it (`/admin/client/<tenantId>/...`).
- Every old Fulfillment, Onboarding and Delivery link still lands on the right page.
- Setter and cold caller roles see no change.
- Typecheck, unit tests and build pass, a release note is added, and Jake clicks through it live.

## Decisions already made (Jake, 2026-10-05)

1. Full swap, like GHL. In a client, the sidebar shows only that client's pages.
2. Paid Ads and GHL become captions in the sidebar, and their sub-pages become rows. The tabs on the page go away.
3. Client strip (mockup option C) over a header dropdown or a switcher card.

## The strip

- Desktop only (lg and up), owner role only. 64px wide, full height, left of the existing 244px rail.
- From top to bottom:
  - **Agency chip.** The Hauck mark, which opens the owner home (Tasks).
  - A hairline rule.
  - **One chip per client**, from `useAdminClientsQuery`, ordered by name. The chip shows `brandInitials` on that client's `brandColor` gradient.
  - **+ chip.** Opens the agency's New client page (see Onboarding below).
- The active chip gets the 4px bar on its left edge and the brand shadow. Hover shows the client's name as a tooltip, with no other text.
- The strip scrolls on its own if the client list outgrows the window.
- Collapsing the rail shrinks the rail to icons only, and the strip stays as it is.
- The rail header shows "Hauck Admin" in Agency view and the client's name in a client.

## Agency view (sidebar)

Unchanged apart from removing Fulfillment: Operations (Tasks, Inbox, Clients), Acquisition (Leads, Cold Call, Cold SMS), Sales (Pipeline, Data). The footer (Team, Settings, theme, sign out) is the same in both views.

## Client view (sidebar)

| Row | Address | Today's source |
|---|---|---|
| Onboarding | `/admin/client/:id/onboarding` | OnboardingWizard, one client |
| Software | `/admin/client/:id/software` | SoftwareTab |
| PAID ADS caption | | |
| Dashboard | `/admin/client/:id/paid-ads/dashboard` | PaidAdsTab sub `dashboard` |
| Lead Tracker | `.../paid-ads/leads` | sub `leads` |
| Meta Data | `.../paid-ads/meta-data` | sub `meta-data` |
| Creatives | `.../paid-ads/creatives` | sub `creatives` |
| Ad Builder | `.../paid-ads/ad-builder` | sub `ad-builder` |
| GHL caption | | |
| Conversion Assets | `.../ghl/conversion-assets` | GhlTab sub |
| Calendars | `.../ghl/calendars` | GhlTab sub |
| (hairline rule) | | |
| Setter Suite | `/admin/client/:id/setter` | SetterSuite, locked to this client |
| Management | `/admin/client/:id/management` | ManagementTab |

The connect gates stay, now applied to sidebar rows instead of tabs, using the existing `paidAdsSubTabs` and `ghlSubTabs`:
- No ad account: Paid Ads shows Connect ads, Creatives, Ad Builder.
- No GHL credentials: GHL shows Connect GHL, Conversion Assets.

A typed address to a gated page redirects to that group's first offered row.

"Preview live app" (today on the Fulfillment title row) moves to the client page's top-right, on every client page.

## Switching rules

- **Client to client:** stay on the same page and sub-page if the new client offers it. Otherwise go to the first row of the same group, and failing that, Onboarding.
- **Agency to client:** clients still in setup (`onboardingStatus = "setup"`) open on Onboarding. Live clients open on Paid Ads (Dashboard, or Connect ads if not linked).
- The last client opened is still remembered (`lib/selectedClient.ts`) so old links without a client can resolve one.

## Onboarding

- **Inside a client:** the checklist for that client only, with no client list.
- **Agency side:** the list today also holds signed-up forms that never became a client. These, plus the Add a client button, become the agency New client page at `/admin/onboarding`, reached from the + chip. It is not a sidebar row.

## Setter Suite

- In a client, SetterSuite receives the tenant id and hides its own client picker.
- `/admin/setter` stays exactly as it is for the setter role (their whole sidebar).

## Phone

There's no strip on the phone. The bottom bar's Onboarding tab becomes a **Clients** switcher sheet: Agency, then each client. Picking a client lists that client's rows, grouped like the desktop sidebar. Tasks, Inbox and the Command hub are unchanged.

## What gets removed

- `FULFILLMENT_NAV` and `FULFILLMENT_HOME`, and the Fulfillment group in `AdminLayout.tsx`.
- `routes/admin/FulfillmentPage.tsx` (its gating and preview logic moves into the new client page shell).
- `components/admin/ClientPicker.tsx` (the Fulfillment title-row picker).
- The sub-tab bars inside PaidAdsTab and GhlTab, if they render one of their own (to check during the plan).

## Old links (redirects)

| Old | New |
|---|---|
| `/admin/fulfillment/:page?client=X&sub=Y` | `/admin/client/X/:page/Y` (X falls back to the remembered client, then the first client) |
| `/admin/fulfillment` | remembered client's first page, or Agency home if there are no clients |
| `/admin/onboarding/:id` and `/admin/onboarding/:id/setup` | `/admin/client/:id/onboarding` |
| `/admin/delivery/:id?tab=` | the matching client page via `legacyFulfillmentPage` |
| `/admin/clients/:id` | `/admin/client/:id/management` |

## Out of scope

- The new automation pages (LTN texts, A2P pack, campaign builder, and the rest). They slot into the client sidebar groups in later builds.
- Any change to the client-facing app.
- Any change to what the pages themselves show.

## Testing

- Unit (vitest): the client nav model (rows per gate state), the address builder and parser, the switching rules, and every redirect in the table above.
- Typecheck and `vite build`.
- Live: Jake clicks Agency, each of the three clients, the + chip, a gated client (AAG Paid Ads), an old bookmarked Fulfillment link, and the phone sheet.

## Ship checklist

- `RELEASES` entry in `releaseNotes.ts` (admin-facing change).
- Update `blueprint/index.html` NODES and GAPS.
- Delete the mockup folder and `git rm` this plan in the shipping commit.

---

# Implementation plan

Spec approved by Jake 2026-10-05 ("go ahead and start building"). Executed natively in worktree `../hml-client-strip`, branch `feat/client-strip`.

**Architecture:** one pure module (`lib/clientNav.ts`) owns the client rows, addresses, gates, switching and legacy mapping, fully unit tested. The UI (strip, rail, client page, phone sheet) only reads from it. The existing service bodies (PaidAdsTab, GhlTab, SoftwareTab, ManagementTab, ClientWizard, SetterSuite) are reused untouched apart from two small props.

**Tech:** React 18 + react-router 6, Tailwind, vitest. Run everything from `command-center/app`.

## Global constraints

- No em dashes anywhere. No sub-text under headings. Labels are nouns.
- Never name GoHighLevel in client-facing UI (admin only here, "GHL" is fine).
- Owner role only for the strip and client view. Setter and cold caller rails unchanged.
- Release note in `releaseNotes.ts` in the shipping commit.

## Review focus

1. A client id in the address that no longer exists: lands on Agency home, not a blank page.
2. A gated page typed directly (AAG `/paid-ads/dashboard` with no ad account): redirects to Connect ads.
3. Old `/admin/fulfillment/paid-ads?client=X&sub=leads` bookmarks: land on X's Lead Tracker.
4. Agency view with zero clients: strip shows Agency and + only, nothing breaks.
5. Switching client while on Connect ads to a linked client: lands on Dashboard, not a missing page.

## Task 1: `lib/clientNav.ts` (pure model) + tests

Files: create `src/lib/clientNav.ts`, `src/lib/clientNav.test.ts`.

Produces:
- `type ClientPageId = "onboarding" | "software" | "paid-ads" | "ghl" | "setter" | "management"`
- `interface ClientGateInfo { metaAdAccountId: string | null; ghlConnected: boolean; onboardingStatus?: "setup" | "live" }`
- `interface ClientNavRow { page: ClientPageId; sub: string | null; label: string }`
- `interface ClientNavGroup { caption: string | null; rule?: boolean; rows: ClientNavRow[] }`
- `clientNavGroups(c: ClientGateInfo): ClientNavGroup[]` (Onboarding, Software / PAID ADS gated / GHL gated / rule: Setter Suite, Management)
- `clientPath(tenantId, page, sub?) => "/admin/client/<id>/<page>[/<sub>]"`
- `parseClientPath(pathname) => { tenantId, page, sub } | null`
- `resolveClientPage(c, page, sub) => { page, sub } | null` (null = unknown page; gated or missing sub = first offered sub of that group)
- `switchTarget(from: {page, sub} | null, to: ClientGateInfo & {id}) => string` (same page and sub if offered, else first row of group; from agency: setup -> onboarding, live -> paid-ads)
- `legacyClientPath(page: string | null, sub: string | null, tenantId) => string` (maps old fulfillment page ids and retired tabs)

Tests: rows per gate state (4 combinations), path round-trip, unknown page null, gated sub redirect, switch rules (client to client same page, gated fallback, agency setup/live), legacy mapping (software, paid-ads+sub, billing to management, overview to software, onboarding).

## Task 2: `ClientPage` route body

Files: create `src/routes/admin/ClientPage.tsx`; modify `src/App.tsx` (new route `/admin/client/:tenantId/:page/:sub?`, owner only).

Reads params, loads `useAdminClientsQuery`, finds the client (missing = Navigate to owner home), runs `resolveClientPage` (redirect when canonical differs), writes `writeStoredClient`, renders the body (the old `PageBody` switch plus `onboarding` and `setter`) with an Enter live app button top right. `onSelectSub` navigates to `clientPath`.

## Task 3: Onboarding split

Files: create `src/components/admin/onboarding/ClientOnboarding.tsx` (one client's ClientWizard + Stepper/Scroll toggle + delete); modify `OnboardingWizard.tsx` to list only pending forms; modify `AdminOnboarding.tsx` title to "New client".

## Task 4: Setter Suite locked to a client

Files: modify `src/routes/admin/SetterSuite.tsx`: optional `lockedTenantId` prop; when set, the picker is hidden and `activeTenantId = lockedTenantId`. ClientPage renders it with `key={tenantId}`.

## Task 5: Client strip + rail swap

Files: create `src/components/admin/ClientStrip.tsx`; modify `src/routes/admin/AdminLayout.tsx` (owner: strip left of rail; rail rows from `clientNavGroups` when `parseClientPath` matches, else PILLAR_GROUPS without Fulfillment; header shows client name; client rows active by page+sub).

## Task 6: Redirects and cleanup

Files: modify `src/App.tsx`: `/admin/fulfillment[/:page]`, `/admin/delivery[/:id]`, `/admin/onboarding/:id[/setup]`, `/admin/clients/:id` all redirect via `legacyClientPath` + `resolveSelectedClient`; remove duplicate route blocks. Modify `lib/fulfillmentPages.ts` (drop `FULFILLMENT_NAV`, `FULFILLMENT_HOME`, `fulfillmentPath`) and its test. Delete `FulfillmentPage.tsx`, `components/admin/ClientPicker.tsx`. Fix `AdminClientNew.tsx` links (`/admin/onboarding/${id}` -> `clientPath(id, "onboarding")`, `/admin/delivery` -> Clients).

## Task 7: Phone

Files: create `src/components/admin/ClientSheet.tsx`; modify `AdminLayout.tsx` bottom bar: the Onboarding tab becomes a Clients button opening the sheet (Agency, clients; a picked client shows its grouped rows as links).

## Task 8: Ship

Release note, blueprint NODES/GAPS, typecheck, vitest, build, merge to main, push, watch CF deploy, smoke the live URL, delete mockup folder and `git rm` this doc.

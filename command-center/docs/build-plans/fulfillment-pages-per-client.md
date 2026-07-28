# Fulfillment: service pages, client chosen per page

## What and why

Today Fulfillment is a funnel: **Clients** (roster) → pick one → `/admin/delivery/:tenantId`, a
single cockpit page carrying eight service tabs. The client is the address and the service is a
tab inside it.

Jake wants that inverted. The **service is the page** and the **client is a control on it**. All
eight services become real routes listed in the sidebar under Fulfillment, each with a client
picker on its title row. Pick Willis on Paid Ads and Billing is already on Willis.

### Decisions (confirmed 2026-07-28)

| Question | Answer |
| --- | --- |
| Client selection across pages | **Follows you.** One shared pick, remembered across pages and reloads. |
| The Clients roster page | **Dropped.** The picker replaces it; the roster rail goes with it. |
| Paid Ads / Web Design sub-pages | **Stay as tabs inside the page.** Sidebar stays short. |
| Picker position | **Each page's title row**, right end, beside the page title. |
| "+ New client" | **Moves to Onboarding**, which keeps its place under Fulfillment. |

### The page list, after the trim

The plan below was written for all eight cockpit tabs. On review Jake cut it to what we
actually deliver, and folded the two standing pages into the same list:

| Rail row | What it is |
| --- | --- |
| Onboarding | Standing a client up. Own roster rail, own "+ New client" door. |
| Software | The client app inventory, previewable live. Client picker. |
| Paid Ads | Campaigns / Ad Library / Ad Tracking / Data & Leads. Client picker. |
| Setter Suite | Working a client's leads. Own client list. |
| Management | Billing record + client setup, stacked. Client picker. |

Retired outright: **Overview** (a summary of pages you can just open), **Web Design**,
**Google Reviews** and **Reactivation** (shells for work we are not delivering). A rail row for
something that does not exist is a row that lies. **Billing** and **Config** merged into
**Management**. Their old URLs all redirect (see `legacyFulfillmentPage`).

Onboarding and the Setter Suite sit in the list but still carry their own client lists rather than
reading the page picker. Converting them is open, not done.

### Definition of done

- Sidebar Fulfillment lists the five rows above, in that order.
- Every service page opens directly, on the last client picked, with no roster in between.
- Changing the client on one page changes it on all of them, and survives a reload.
- A deep link carries its client, so a pasted URL opens the same thing for anyone.
- Every old URL (`/admin/delivery`, `/admin/delivery/:tenantId`, `/admin/clients/:id`) still lands
  somewhere correct.
- Nothing fabricates data. A page with no client picked says so rather than rendering an
  empty-looking client.

## Client selection model

One hook owns the pick. Resolution order, highest first:

1. `?client=<tenantId>` on the URL. Makes a link shareable and exact.
2. `localStorage["hml.admin.fulfillmentClient"]`, validated against the live client list.
3. The first client in the list.
4. None: the page renders a "Pick a client" prompt, not a blank client.

Changing the picker writes both the URL (`replace`, so Back does not walk the picks) and
localStorage. A stored id that no longer exists (client removed) falls through to 3.

## Files, in order

### 1. `src/lib/fulfillmentPages.ts` (new)

Replaces `src/lib/deliveryCockpit.ts` as the config, same shape, page ids instead of tab ids.

- `FulfillmentPageId` union, `FULFILLMENT_PAGES` array carrying `{ id, label, ready, subTabs? }`
  copied forward from `SERVICE_TABS` (Google Reviews and Reactivation stay `ready: false`).
- `isFulfillmentPage`, `subTabsFor`, `resolveSubTab`, `placeholderCopy` carried over.
- `fulfillmentPath(page, clientId, sub?)` builds `/admin/fulfillment/<page>?client=…&sub=…`, so
  the sidebar, the redirects and the picker all build links one way.

`deliveryCockpit.ts` is deleted once nothing imports it. Its tests move across.

### 2. `src/lib/selectedClient.ts` (new)

Pure resolution, so it is testable without React:
`resolveSelectedClient({ urlParam, stored, clients })` → `{ tenantId, source }`.

### 3. `src/hooks/useSelectedClient.ts` (new)

Wraps the above with `useSearchParams` + `useAdminClientsQuery(true)` + localStorage. Returns
`{ clients, selected, selectedId, isLoading, setClient(id) }`. `setClient` writes URL and storage.

### 4. `src/components/admin/ClientPicker.tsx` (new)

The title-row control: brand-initials chip, client name, chevron. Opens a panel with a filter box
(the roster's search, reused) and the client rows. Keyboard reachable, closes on Escape and on
outside click. Renders a disabled "No clients yet" state rather than an empty menu.

### 5. `src/routes/admin/FulfillmentPage.tsx` (new)

The shell for `/admin/fulfillment/:page`:

- title row: pillar kicker "Fulfillment", `<h1>` = page label, `<ClientPicker />` at the right end;
- the sub-tab strip (`pk-tabs`) when the page has sub-tabs;
- the body, switched on page id, reusing the existing tab components unchanged:
  `OverviewTab`, `SoftwareTab`, `PaidAdsTab`, `WebDesignTab`, `BillingTab`, `ClientConfigPanel`;
  `ready: false` pages render `placeholderCopy`.
- no client selected → `<PickPrompt>`; loading → the existing loading line.

The per-client actions the cockpit header carried ("Enter live app", "View as owner") move onto
this title row, next to the picker, so nothing is lost with the header.

### 6. `src/App.tsx`

- Add `/admin/fulfillment/:page`, and `/admin/fulfillment` → redirect to `overview`.
- Redirects, all preserving the client: `/admin/delivery` → `/admin/fulfillment/overview`;
  `/admin/delivery/:tenantId` → `/admin/fulfillment/<?tab>?client=:tenantId&sub=<?sub>`;
  `/admin/clients/:id` → `/admin/fulfillment/config?client=:id`.
- Retire the `AdminDelivery` and `DeliveryCockpit` route entries.

### 7. `src/routes/admin/AdminLayout.tsx`

Fulfillment's `children` become the ten rows above, generated from `FULFILLMENT_PAGES` plus the two
standing pages, so adding a service later does not need the rail edited by hand. The rail's active
check matches on pathname (no `?tab=` resolution needed any more).

### 8. `src/routes/admin/AdminOnboarding.tsx`

Gains the "+ New client" button (linking to `/admin/clients/new`), taking over the only door into
the wizard from the deleted roster.

### 9. `src/routes/admin/AdminCommand.tsx`

Its Fulfillment shortcuts repoint at `/admin/fulfillment/overview`.

### 10. Deletions

`AdminDelivery.tsx`, `DeliveryCockpit.tsx`, `DeliveryRoster.tsx`, `AdminClientDetail.tsx`,
`lib/deliveryCockpit.ts`, and the now-unused `pk-delivery-shell` styles.
`OnboardingRoster.tsx` stays: Onboarding is still a per-client list, and it is a different list.

### 11. Tests

`fulfillmentPages.test.ts` (path building, sub-tab resolution) and `selectedClient.test.ts`
(each rung of the resolution ladder, including a stored id that no longer exists).

## Verify

1. `npx tsc --noEmit` and `npm test` clean.
2. On localhost: open each of the ten sidebar rows; change the client on Paid Ads and confirm
   Billing and Config follow; reload and confirm the pick survives; paste a `?client=` link.
3. Hit each retired URL and confirm where it lands.
4. Screenshots of the new sidebar and two pages, light and dark.

Ship is a separate, approved step. Localhost first.

## Open, deferred

Google Reviews and Reactivation stay honest placeholders. This plan moves them, it does not
build them.

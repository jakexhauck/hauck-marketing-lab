# 13: Invoices & Payments

## Objective

Add an Invoices & Payments section: list the client's invoices with status (draft, sent, paid,
overdue), show invoice detail, and surface recent payment transactions. Read-first; sending and
collecting payment is a deliberate later increment.

## Why it matters

For clients who bill through GHL, money is the thing they most want visibility into on their
phone: who owes, who paid, what is overdue. It is also a self-contained domain with no overlap
with leads or messaging, so it can be built and shipped independently without touching the rest
of the app.

## Dependencies

- None hard.
- Worth doing after the lighter features (08 to 12) because the API convention differs (see
  below) and the value summing/status logic deserves care, not a rushed first pass.

## Current state

Nothing. No invoice or payment endpoints, route, or nav entry.

## Target state

GHL endpoints (v2, version `2021-07-28`). Note the **`altId` / `altType` convention**: the
billing APIs do not take `locationId` as a query param like the rest of the app. They take
`altId={locationId}&altType=location`. This is the single most common mistake on these endpoints,
so encode it in a helper.

- `GET /invoices/?altId={locationId}&altType=location&limit=&offset=`     list invoices
- `GET /invoices/{invoiceId}?altId={locationId}&altType=location`         invoice detail
- `GET /payments/transactions?altId={locationId}&altType=location`        recent transactions
- `GET /payments/orders?altId={locationId}&altType=location`              orders (if used)

A read-only **Billing** section: an invoices list grouped or filterable by status, an invoice
detail screen (line items, amounts, due date, paid date), and a recent-payments view. Sending an
invoice or recording a payment is phase two and explicitly out of scope here.

## Step-by-step

### 1. Billing context helper

Add a tiny helper so no route hand-builds the alt params:

```ts
// in or beside functions/lib/ghl.ts
export function altQuery(locationId: string): string {
  return `altId=${encodeURIComponent(locationId)}&altType=location`;
}
```

### 2. Invoices list route

`functions/api/invoices/index.ts`. Page with `limit`/`offset` (these endpoints use offset paging,
not the cursor paging that leads/contacts use, so do not copy the cursor loop). Cap pages the same
way 02 does and log if the cap is hit. Return a shaped list: `{ id, number, contactName, total,
status, dueDate, paidAt }`, with `status` normalized to a small set (draft / sent / paid /
overdue / void). Derive `overdue` from `dueDate < now && status !== paid` if GHL does not give it
directly.

### 3. Invoice detail route

`functions/api/invoices/[invoiceId].ts`: full invoice with line items, amounts, contact, and
dates.

### 4. Payments route

`functions/api/payments/transactions.ts`: recent transactions, newest first, shaped to
`{ id, amount, status, contactName, createdAt, method }`.

### 5. Client API + hooks + UI

`api.ts`: `getInvoices(status?)`, `getInvoice(id)`, `getTransactions()`. Hooks following the
existing pattern. A `Billing.tsx` route: a status filter (reuse `ViewTabs`/`StageFilter`
patterns), invoice rows with a status pill and amount, a tap-through to detail, and a "recent
payments" section. A summary strip (outstanding total, paid this month) using the existing
`StatCard`/`StatsStrip` components. Do not fabricate trend percentages; show real sums only,
consistent with the no-fabricated-growth rule used elsewhere in the app.

### 6. Nav placement

Billing is unlikely to earn a permanent bottom-nav slot. Surface it as a card on Home and/or an
entry in a "More" menu, deep-linking to the full `Billing.tsx` screen.

## Testing

1. `GET /api/invoices` returns the test location's invoices with correct `altId/altType`.
2. Statuses map correctly; an invoice past due with no payment shows as overdue.
3. Invoice detail shows line items and totals matching GHL.
4. `GET /api/payments/transactions` returns recent payments newest-first.
5. Outstanding/paid summary sums match a manual tally in GHL. No invented percentages.

## Acceptance criteria

- [ ] Invoices list with normalized status and amount, filterable by status.
- [ ] Invoice detail with line items and dates matching GHL.
- [ ] Recent payments list, newest first.
- [ ] All billing routes use the `altId/altType=location` convention via the shared helper.
- [ ] Offset paging is used (not the cursor loop) and any cap is logged, not silent.
- [ ] Summary shows real sums only; no fabricated growth or trend figures.
- [ ] Sending/collecting is explicitly out of scope and noted.

## Rollback

Delete `functions/api/invoices/`, `functions/api/payments/`, the `altQuery` helper, `Billing.tsx`,
its route and nav entry, and the `api.ts` additions. Read-only and self-contained.

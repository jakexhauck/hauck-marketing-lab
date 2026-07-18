# 06 — Client Billing (Fulfillment cockpit tab)

Read `_architecture.md` and `00-foundation.md` (the 9-section PLAN TEMPLATE) alongside this. This surface follows the **cockpit tab recipe**, not the pillar-page framework. Phase 1 = manual entry, app DB is the source of truth.

---

## 1. Goal / DoD

A new **Billing** tab inside the per-client Fulfillment cockpit (`/admin/delivery/:tenantId?tab=billing`) that shows and edits one client's commercial record: how the deal came in, cash collected vs outstanding, billing/renewal dates, and account standing. Manual entry only.

Done when:
- The cockpit shows a **Billing** service tab between Reactivation and Config.
- The tab renders four grouped bento cards (Deal · Cash · Dates & Renewal · Status) ported from the approved mockup, wired to real per-tenant data.
- Editing any field and pressing **Save** PATCHes the tenant's billing row (upsert 1:1 by `tenant_id`); reload shows the saved values.
- An **Open Ad Tracking** link jumps to this same client's Paid Ads → Ad Tracking sub-tab.
- A first load with no row shows empty fields (an auto-created default record), never fabricated numbers.
- `npm run typecheck`, `npm run build`, `npm test` green; `npm run db:migrate` applies clean.

Not in scope: pulling any of these values automatically from GHL/Stripe/Meta (Phase 2, section 9).

---

## 2. Chosen layout

Reference mockup (implement this): `command-center/docs/mockups/admin-redesign/client-billing-B.html` (Layout B — grouped bento cards).

Structure to port:
- A **toolbar** row above the cards: left = title "Billing Record" + subtitle; right = an **Open Ad Tracking** ghost link and a **Save** primary button.
- A responsive **2-column bento grid** (`.cards`, collapses to 1 column under 980px) of four `.bento` cards, each with a colored icon chip + title + note:
  1. **Deal** (indigo) — Source (`select`), Date Closed, Service, Payment Arrangement.
  2. **Cash** (green) — Upfront Cash, Remaining to Collect, Total Cash Collected (money inputs with `$` prefix + thousands formatting on blur).
  3. **Dates & Renewal** (sky) — Billing Date, Renewal Date, Last Touchpoint, Churn Date. The mockup adds an "IN N DAYS" amber highlight on a near billing date — that is a **computed presentation detail** (section 6), not a stored field.
  4. **Status** (amber) — a pill `select` (Active green / Churned rose) + Notes textarea.

The mockup's spine, cockpit header, and `.ctabs` tab bar are **already provided by `DeliveryCockpit.tsx`** — do not re-implement them. Only the `.body-scroll` contents (toolbar + cards) become `BillingTab.tsx`. Port the mockup's card/field CSS into the component under the existing `.pk-kit` admin theme; keep the mockup's class names where practical or translate to the admin theme's tokens. No em dashes in any UI copy.

Dates are stored as plain text (Phase 1) exactly as the mockup shows ("Jul 22, 2026") — free-text inputs, not date pickers — so Jake can type whatever the deal notes say. The "IN N DAYS" hint only renders when a value parses as a real date; otherwise it is omitted.

---

## 3. Data model

New migration `command-center/app/supabase/migrations/0027_client_billing.sql` (use the next free 4-digit number in build order — 0027 as of writing; if an earlier surface plan already claimed 0027, take the next free one).

**Decision: a new `client_billing` table 1:1 with the tenant, NOT new columns on `tenants`.** Justification:
- These are ~13 commercial/CRM fields (cash, arrangement, notes) with a single owner (the admin Billing tab). Piling them onto `tenants` bloats a hot, widely-selected row that `getTenantById`'s `TENANT_COLUMNS` and every tenant-resolve path read on each request. A separate table keeps the billing blob off that path — it is loaded only by this one endpoint.
- A dedicated table gives Ad Tracking and future per-client surfaces a clean precedent (their own tables, `tenant_id` FK), matching `website_change_requests`.
- 1:1 is enforced with `tenant_id ... unique`, so the endpoint can `upsert(..., { onConflict: "tenant_id" })` and always target exactly one row.

Table (per `_architecture.md` style: `create table if not exists`, UUID PK, `text` + CHECK for the enum, `timestamptz not null default now()`, `on delete cascade`; service-role reached, RLS on with no policies like `admin_tasks`/`website_change_requests`):

```sql
-- 0027: per-client billing record (admin Fulfillment cockpit > Billing tab).
--
-- One row per tenant (1:1, tenant_id unique). Phase 1 is manual entry: the admin
-- types the deal + cash + dates + status here and this table is the source of
-- truth. Kept OFF the tenants row (which is read on every request) because these
-- are admin-only CRM fields with a single writer. Dates are stored as free text
-- in Phase 1 (typed exactly as the deal notes read); cash amounts are integers
-- (whole dollars). Reached only via the service-role client in Functions.
--
-- Run AFTER 0001..0026. Idempotent: safe to re-run.

create table if not exists public.client_billing (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null unique references public.tenants (id) on delete cascade,
  source                text not null default '',        -- Cold Call / Referral / Inbound Form / Facebook Ad / SMS / ...
  date_closed           text not null default '',        -- free text, e.g. "Jun 12, 2026"
  service               text not null default '',
  payment_arrangement   text not null default '',
  upfront_cash          integer not null default 0,      -- whole dollars
  remaining_cash        integer not null default 0,
  total_cash_collected  integer not null default 0,
  billing_date          text not null default '',        -- free text
  renewal_date          text not null default '',
  last_touchpoint       text not null default '',
  churn_date            text not null default '',
  status                text not null default 'active' check (status in ('active','churned')),
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.client_billing enable row level security;
```

`tenant_id` is already unique, so no extra index is needed. Enum = `status ('active'|'churned')`. `source` stays free text with a suggested option list in the UI (not a DB CHECK) so Jake can add channels without a migration.

---

## 4. API

New endpoint `command-center/app/functions/api/admin/clients/[tenantId]/billing.ts` — copy the shape of `functions/api/admin/clients/[tenantId].ts` (503 guard → `getTenantById` 404 → whitelist → `logAdminAction`). Admin-gated by `_middleware.ts` already (`/api/admin/*`).

**GET** `/api/admin/clients/:tenantId/billing`
- `const client = getServiceClient(ctx.env); if (!client) return 503`.
- `getTenantById` → 404 if missing.
- Select the `client_billing` row for `tenant_id` (`.maybeSingle()`). If absent, return a zero/empty default DTO (do not insert on read — the row is created on first PATCH). Return camelCase:
```jsonc
{ "billing": {
  "source": "", "dateClosed": "", "service": "", "paymentArrangement": "",
  "upfrontCash": 0, "remainingCash": 0, "totalCashCollected": 0,
  "billingDate": "", "renewalDate": "", "lastTouchpoint": "", "churnDate": "",
  "status": "active", "notes": "",
  "updatedAt": null
} }
```

**PATCH** `/api/admin/clients/:tenantId/billing`
- Same 503/404 guards. Parse JSON body (400 on bad body).
- Build a **snake_case whitelist** — only supplied fields change (mirror the `str()` helper pattern in `[tenantId].ts`):
  - text fields (`source, date_closed, service, payment_arrangement, billing_date, renewal_date, last_touchpoint, churn_date, notes`): `if (typeof body.X === "string") update.x = body.X.trim()` (empty string is allowed — it clears the field).
  - integers (`upfront_cash, remaining_cash, total_cash_collected`): coerce `Number(...)`, reject non-finite / negative with 400, `Math.round` to whole dollars.
  - `status`: must be in `['active','churned']` else 400.
- If nothing valid supplied → 400 `no fields to update`.
- Always set `update.updated_at = new Date().toISOString()` and `update.tenant_id = tenantId`, then **upsert** on `tenant_id`:
  `await client.from("client_billing").upsert(update, { onConflict: "tenant_id" })` — creates the row on first save, updates thereafter.
- `logAdminAction(client, ctx.data.admin!.id, "client.billing.update", tenantId, update)` (no secrets here, log the update as-is). Return `{ ok: true }`.

Validation notes: cash amounts are whole non-negative dollars; the UI sends already-parsed integers but the server re-validates. `status` is the only enum. Everything else is free text by design.

---

## 5. Client

**DTOs — `src/lib/api.ts`** (add near `AdminClientDetailResponse`):
```ts
export interface AdminClientBilling {
  source: string;
  dateClosed: string;
  service: string;
  paymentArrangement: string;
  upfrontCash: number;
  remainingCash: number;
  totalCashCollected: number;
  billingDate: string;
  renewalDate: string;
  lastTouchpoint: string;
  churnDate: string;
  status: "active" | "churned";
  notes: string;
  updatedAt: string | null;
}
export interface AdminClientBillingResponse { billing: AdminClientBilling; }
```

**Hooks — `src/hooks/useApi.ts`** (mirror `useAdminClientDetailQuery`, admin key array):
```ts
export function useAdminClientBillingQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "billing"],
    enabled: enabled && !!tenantId,
    staleTime: 30_000,
    queryFn: () => api<AdminClientBillingResponse>(`/api/admin/clients/${tenantId}/billing`),
  });
}

export function useAdminClientBillingSave(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AdminClientBilling>) =>
      api(`/api/admin/clients/${tenantId}/billing`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "clients", tenantId, "billing"] }),
  });
}
```
(`useMutation`/`useQueryClient` are already imported in `useApi.ts`; add if not.)

**Cockpit wiring — `src/lib/deliveryCockpit.ts`:**
- Add `"billing"` to the `ServiceTab` union.
- Add `{ id: "billing", label: "Billing", ready: true }` to `SERVICE_TABS`, positioned **before** the `config` entry (matches the mockup tab order: Overview · Paid Ads · Web Design · Google Reviews · Reactivation · Billing · Config). No sub-tabs.

**Cockpit switch — `src/routes/admin/DeliveryCockpit.tsx`:**
- Import `BillingTab`.
- Add a branch before the placeholder fallback: `) : activeService === "billing" ? (<BillingTab tenantId={tenantId} />` .

**Component — `src/components/admin/cockpit/BillingTab.tsx`** (new):
- `useAdminClientBillingQuery(tenantId)` for load; loading → `.pk-empty` "Loading billing..."; error → honest error line.
- Local form state seeded from the loaded `billing` (a single flat object, like `ClientConfigPanel`'s per-card `useState`). One **Save** button PATCHes the whole form via `useAdminClientBillingSave` (this surface is one logical record, so a single save is cleaner than the per-card saves `ClientConfigPanel` uses). Show Saving.../Saved feedback (reuse the `SaveButton` idea inline) and any error.
- Render the toolbar + four bento cards from the mockup. Money inputs: strip non-digits, store integers in state, format with `toLocaleString` for display, `$` prefix. Status pill: the `<select>` drives an `active`/`churned` class toggle (port the mockup's tiny script as React state).
- **Open Ad Tracking link** (toolbar right): a `<Link>` to `/admin/delivery/${tenantId}?tab=paid-ads&sub=ad-tracking` — the Ad Tracking sub-tab this client's Paid Ads will carry (that sub-tab id is added by the Ad Tracking surface plan; if it lands under a different id, update this one string). Same-cockpit navigation, so `useSearchParams`/`<Link>` is enough — no full reload.
- **"IN N DAYS" hint** (section 6): compute from `billingDate` if it parses; render the amber `.datehint` badge only when the parsed date is within a small window (e.g. 0–7 days ahead). Never render for unparseable text.

Mount point: cockpit tab only (not a pillar tab). No new route in `App.tsx` — the cockpit route already owns `/admin/delivery/:tenantId`.

---

## 6. Tests

Extract the pure presentation/validation logic into a testable lib so the component stays thin. New `src/lib/billing.ts` + `src/lib/billing.test.ts` (Vitest, Node env, co-located):
- `parseMoneyInput("2,000") === 2000`, `parseMoneyInput("$1.5k")`→ digits-only rule, empty → 0, negatives rejected/clamped.
- `formatMoney(2000) === "2,000"`.
- `billingDateHint(text, now)`: returns `null` for unparseable/blank; returns `{ days, label }` (e.g. "IN 5 DAYS") only inside the 0–7 day window; returns `null` for far-future/past. Deterministic via injected `now`.
- `sanitizeBillingPatch(form)`: maps the flat form to the camelCase PATCH body, coercing cash to integers and defaulting `status`.

Server-side: a small pure whitelist helper (`buildBillingUpdate(body)`) extracted from the endpoint into `functions/lib/` or inline-tested — assert enum rejection, negative-cash rejection, empty-string-clears, and that unknown keys are dropped. (Follow the foundation's "extract pure logic and unit-test it" rule.)

No network/integration tests required for Phase 1.

---

## 7. File-by-file change list (ordered)

1. `command-center/app/supabase/migrations/0027_client_billing.sql` — new table (section 3).
2. `command-center/app/functions/api/admin/clients/[tenantId]/billing.ts` — new GET + PATCH endpoint (section 4).
3. `command-center/app/src/lib/api.ts` — add `AdminClientBilling` + `AdminClientBillingResponse` DTOs.
4. `command-center/app/src/hooks/useApi.ts` — add `useAdminClientBillingQuery` + `useAdminClientBillingSave`.
5. `command-center/app/src/lib/deliveryCockpit.ts` — add `"billing"` to `ServiceTab` + `SERVICE_TABS` entry (before `config`).
6. `command-center/app/src/lib/billing.ts` — pure helpers (parse/format money, date hint, sanitize patch).
7. `command-center/app/src/lib/billing.test.ts` — unit tests for #6.
8. `command-center/app/src/components/admin/cockpit/BillingTab.tsx` — new tab component (section 5).
9. `command-center/app/src/routes/admin/DeliveryCockpit.tsx` — import + switch branch for `billing`.
10. (If not present) test for the server whitelist helper.

---

## 8. Verify

- `npm run db:migrate` — 0027 applies clean; re-run is idempotent (no-op).
- `npm run typecheck` — app + functions tsconfigs pass.
- `npm test` — `billing.test.ts` + whitelist test green; whole suite green.
- `npm run build` — clean.
- Manual, real running app (admin logged in): open `/admin/delivery/:tenantId`, click **Billing**. Confirm the four cards render with this tenant's data (empty on first load, no fabricated numbers). Edit Source, cash amounts, Status → Churned, and Notes; press **Save**; reload the tab and confirm values persisted. Switch to a second tenant and confirm its Billing is independent (1:1 scoping). Click **Open Ad Tracking** and confirm it lands on this client's Paid Ads → Ad Tracking sub-tab. Verify the "IN N DAYS" hint appears for a near billing date and is absent for free-text/far dates.

---

## 9. Out of scope / Phase 2

- **Auto-fill from source systems**: pull `total_cash_collected` from Stripe/GHL invoices+payments, `date_closed`/`source` from the GHL opportunity that won, `last_touchpoint` from the latest conversation message. These become read-through values with a manual override, replacing typed text.
- **Real date types + pickers**: migrate the free-text date columns to `date`/`timestamptz` once auto-fill lands and a canonical format is guaranteed.
- **Renewal/billing reminders**: surface upcoming billing/renewal/churn dates on the Business Health command page and as admin tasks (the "IN N DAYS" hint is the manual precursor).
- **Derived cash checks**: warn when `upfront_cash + remaining_cash` disagrees with the arrangement, or when `total_cash_collected` drifts from expected MTD.

# Staff Accounts and Permissions: Design Spec

How business owners add their own employees to the CRM, mapped to GoHighLevel (GHL) users, with per-surface view/edit permissions that can never exceed what the business itself has.

Last updated: 2026-06-15

---

## Decisions locked

1. **Map to GHL users by creating them.** When an owner adds a staff member (name, email, role), the app creates a brand-new GHL user via the GHL API with a conservative baseline GHL permission set. Real access inside the CRM is controlled by our own permission layer, not GHL's.
2. **Per-business feature set (entitlements).** Each business has its own set of enabled CRM capabilities. The owner can only grant staff what the business has. The business can only have what the CRM offers.
3. **View vs. edit per surface.** Each capability has separate view and edit rights per staff member.

---

## The three-layer permission model

```
Layer 1  CRM CAPABILITY REGISTRY   (code-defined: everything the app can ever offer)
              |  bounds
Layer 2  TENANT ENTITLEMENTS        (per business: which capabilities are turned on)
              |  bounds            (the OWNER automatically has all of these)
Layer 3  STAFF PERMISSIONS          (per staff member: view/edit on a subset)
```

**The two hard rules, enforced top-down:**
- A staff member can be granted a capability **only if the business has it** (Layer 2).
- A business can have a capability **only if the CRM offers it** (Layer 1).

So if the CRM has not built "Automations," nobody can have it. If the CRM has Automations but this business is not on a plan that includes it, the owner cannot grant it to staff. This is exactly the automations example: no automations for the business means no automations toggle for the employee.

---

## Layer 1: CRM capability registry

A code-defined list (a constant in shared core) of every surface the app can offer, and which actions each supports. Some surfaces are view-only by nature today; the registry says so, and the UI hides an "edit" toggle that has no meaning.

| Capability key | Surface | View means | Edit means | Edit exists today? |
|---|---|---|---|---|
| `overview` | Overview | See the dashboard | (none) | View-only |
| `paid_ads` | Paid Ads | See ad metrics | (none yet) | View-only |
| `pipeline` | Pipeline / Leads | See leads + stages | Move stage, update status/value, notes, tasks | Yes |
| `inbox` | Inbox | Read threads | Send messages | Yes |
| `contacts` | Contacts | See directory | Edit contact, notes, tasks | Edit is future |
| `calendar` | Calendar | See appointments | Book / reschedule / cancel | Edit is future |
| `billing` | Billing | See invoices + payments | Create / send invoices, text-to-pay | Edit is future |
| `activity` | Activity | See the log | Mark read | Minor |

As we ship Tier 1 / Tier 2 features from the roadmap (booking, reviews, automations, campaigns), each one adds a row here with its own view/edit semantics. The whole model grows with the product automatically.

---

## Layer 2: Tenant entitlements

Per-business record of which capabilities are enabled. Proposed storage: a `tenant_entitlements` table.

```sql
create table if not exists public.tenant_entitlements (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  capability  text not null,          -- matches a Layer 1 capability key
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, capability)
);
```

- The **owner always has view + edit on every enabled capability**. The owner role is full access and is not editable.
- This table is what makes the grantable list differ per client. Set a row to `enabled = false` and that capability disappears from both the business and any staff grant screen.

---

## Layer 3: Staff accounts and permissions

### `staff_accounts`
```sql
create table if not exists public.staff_accounts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  ghl_user_id   text,                   -- the GHL user we created for them
  email         text not null,
  password_hash text not null,          -- bcrypt / argon2, never plaintext
  name          text not null,
  role          text not null check (role in ('owner','manager','rep')),
  status        text not null default 'active' check (status in ('active','disabled')),
  created_by    uuid references public.staff_accounts(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, email)
);
```

### `staff_permissions`
```sql
create table if not exists public.staff_permissions (
  staff_account_id uuid not null references public.staff_accounts(id) on delete cascade,
  capability       text not null,       -- matches a Layer 1 capability key
  can_view         boolean not null default false,
  can_edit         boolean not null default false,
  primary key (staff_account_id, capability)
);
```

- A grant is only valid if the tenant has the capability enabled (Layer 2). The "add/edit staff" endpoint rejects any grant outside the tenant's set.
- `can_edit = true` implies `can_view = true` (enforced server-side).
- Roles (`manager`, `rep`) act as **presets** that pre-fill the toggles when adding someone, but every toggle stays individually editable. Owner is the exception: always full, not editable.

---

## GHL user creation flow

When the owner adds a staff member:

1. Owner enters name, email, role, and flips the view/edit toggles (pre-filled by role).
2. App calls GHL `POST /users/` to create the user under this location with a **conservative baseline GHL role** (a non-admin "user," scoped to this location only).
3. App stores the returned `ghl_user_id` on the `staff_accounts` row.
4. App writes the `staff_permissions` rows (validated against tenant entitlements).
5. App hashes the password and stores it.

Why a baseline GHL role and not mirror our toggles into GHL: GHL's native permission system is coarser and lives in a different UI. We deliberately keep GHL access minimal (enough that the user exists, can be assigned leads, and shows up on the team), and let **our** app layer be the source of truth for what they actually see and do in the CRM.

---

## Enforcement: server-side first

Permissions must be enforced on the backend on **every** request, not just hidden in the UI. Hiding a button is convenience; the API check is the real lock.

- **Server:** each API endpoint declares the capability + action it needs (e.g. billing endpoints need `billing.view` or `billing.edit`). A middleware reads the staff member's permissions from their session/identity and rejects anything not granted. Owner bypasses (full access). All grants are also re-checked against tenant entitlements so a disabled capability is denied even if a stale grant row exists.
- **Client:** at login the app fetches the staff member's effective permissions and uses them to hide/disable surfaces and edit controls. This is purely cosmetic; the server is authoritative.

---

## Assumptions I will proceed with (say the word to change any)

- **Owner role** = full view + edit on all enabled capabilities, not editable.
- **Roles as presets:** `manager` pre-fills most view + some edit; `rep` pre-fills a narrow set (e.g. pipeline view/edit, inbox view/edit, contacts view). Owner can adjust any toggle after.
- **Baseline GHL role** for created users = non-admin "user," scoped to this location only.
- **Disabling a staff member** sets `status = 'disabled'` (keeps history) rather than hard-deleting, and optionally deactivates the GHL user.
- **Password reset** is out of scope for v1 (needs an email sender); owner can set/reset a staff password manually until then.

---

## Build phases

1. **Foundation (low risk):** capability registry constant + `tenant_entitlements`, `staff_accounts`, `staff_permissions` migrations. Seed every existing business with all current surfaces enabled.
2. **Auth:** staff login (email + password, bcrypt), session carries staff identity + tenant, per-email rate limiting.
3. **GHL provisioning:** create-GHL-user call wired into "add staff," store `ghl_user_id`.
4. **Enforcement middleware:** capability/action checks on every backend endpoint.
5. **Owner UI:** "Team" screen to add/edit staff and flip view/edit toggles, bounded by tenant entitlements.
6. **Client gating:** hide/disable surfaces and edit controls from the fetched permission set.

---

## What shipped (built 2026-06-15)

All of the design above is now implemented and typechecks/builds clean.

Backend (`client-dashboard/functions/`):
- `supabase/migrations/0007_staff_accounts.sql` — `tenant_entitlements`, `staff_accounts`, `staff_permissions`; seeds current surfaces for existing tenants; adds an `identifier` column to `login_attempts`.
- `lib/password.ts` — PBKDF2 hashing (native WebCrypto, no dependency).
- `lib/permissions.ts` — capability registry, route→capability guard, effective-permission loader, grant sanitizer.
- `lib/session.ts` — session token now carries a signed staff id (owner tokens unchanged).
- `lib/staff.ts` — staff record helpers + best-effort GHL user provisioning.
- `lib/identity.ts` — resolves a session into owner vs staff + effective grants.
- `api/auth/staff-login.ts`, `api/staff/index.ts` (list/create), `api/staff/[staffId].ts` (update/disable), `api/entitlements.ts`, updated `api/auth/me.ts`.
- `api/_middleware.ts` — central, server-side permission enforcement on every authenticated request. Owners bypass; staff are gated.

Frontend (`crm-web/` + `packages/core/`):
- `packages/core` — capability registry mirror + staff/permission types.
- `AuthContext` — `isOwner`, `staff`, `can(capability, action)`, `signInStaff`.
- `Login` — Owner / Staff tabs.
- Nav, sidebar, and command palette filter by permission; `App.tsx` gates each route.
- `routes/Team.tsx` — owner-only screen to add/edit staff with a view/edit permission matrix bounded by the tenant's entitlements.

Security notes: identity is bound into the signed session (never trusted from a header), enforcement is server-side in the middleware (UI gating is cosmetic), passwords are PBKDF2-hashed, and login is rate-limited per IP and per email.

## Your checklist (operator steps)

Nothing below is code: these are the environment/deploy steps only you can do.

1. **Apply migration `0007`** to Supabase (live and, if used, test). It is idempotent.
2. **Confirm the live tenant row exists** in the `tenants` table with the slug your `TENANT_SLUG` env points at (the test-account row already exists). Staff are scoped to this row: without it, staff login returns "tenant not found". Migration 0007 only seeds entitlements for tenant rows that already exist, so if you add the live tenant later, re-run 0007.
3. **Set `SESSION_SECRET`** (if not already) on the backend Pages project. It signs sessions; a dedicated secret is safer than the `APP_PASSWORD` fallback.
4. **(Optional) Enable GHL user creation:** set `GHL_COMPANY_ID` and use a GHL token with `users.write` scope. Without it, staff accounts still work fully; they just are not linked to a GHL user (shown as an unlinked icon on the Team screen).
5. **Deploy both Pages projects:** the backend (`client-dashboard`) and the web CRM (`crm-web`).
6. **No "first owner" setup needed:** the existing shared-password login is treated as the owner. Sign in with the owner password, open **Team**, and add staff.
7. **Smoke test:** add a staff member with a couple of surfaces, sign out, sign in via the **Staff** tab with their email + password, and confirm they only see/can-edit what you granted.

## One dependency to confirm (provisioning only, not a blocker)

Creating GHL users via the API (`POST /users/`) typically needs a token with `users.write` scope, and is often a **company/agency-level** operation rather than a single location token. The location OAuth token the backend holds today may not be allowed to create users.

I need to verify the current token can create users. If it cannot, the options are: use an agency-level token for the create-user call only, or fall back to "link an existing GHL user" for provisioning while keeping everything else identical. This does not change the permission model at all; it only affects step 2 of the provisioning flow.

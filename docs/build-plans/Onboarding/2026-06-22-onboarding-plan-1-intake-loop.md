# In-App Onboarding — Plan 1: The Intake Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin creates a bare client and gets a magic link; the client opens it, is shown only a themed 6-step onboarding form, fills it out (autosave + file uploads), submits, and the submission appears in a new admin Onboarding tab. (The 6-phase / 27-task ops checklist is Plan 2.)

**Architecture:** New Supabase tables (`onboarding_submissions`, `client_invites`) + a private `onboarding-uploads` storage bucket. Cloudflare Pages Functions under `functions/api/` for invite/redeem/save/upload/submit and admin list/detail, gated by the existing `_middleware.ts` session model. React screens in `command-center/app/src` reusing the existing `ui/` components and design tokens. An onboarding gate in the client shell locks the portal until submission.

**Tech Stack:** React 19 + Vite 7 + React Router 7 + Tailwind v4, Cloudflare Pages Functions (TypeScript), Supabase (service-role client + Management-API migrations), Vitest (pure-logic unit tests only).

## Global Constraints

- Spec: `docs/build-plans/Onboarding/2026-06-22-in-app-onboarding-design.md`.
- Work in `command-center/app/` only. NOT the old Tauri `app/`.
- Never use an em dash (—) anywhere: code, comments, UI copy, commits. Use commas/periods/parentheses/colons.
- Migrations are sequential SQL files in `command-center/app/supabase/migrations/`, named `NNNN_name.sql`, applied via `npm run db:migrate`. Must be idempotent (`if not exists`, `drop policy if exists`). The next free number is the highest existing prefix + 1; check `ls supabase/migrations` before naming.
- Service-role functions get the Supabase client via `getServiceClient(ctx.env)` from `functions/lib/supabase.ts`; it returns `null` when unconfigured (return 503).
- Sessions: `functions/lib/session.ts`. Admin routes (`/api/admin/*`) require `ctx.data.admin` (set by `_middleware.ts`). Client sessions are minted with `mintSessionCookie(env, "live", { tenantId, staffId })`.
- Client API calls go through `api<T>(path, init)` in `src/lib/api.ts` (sends cookies, throws `ApiError`, dispatches `hml:unauthorized` on 401).
- Tokens stored hashed only. Never log or persist a raw magic-link token.
- Cookie name is `hml_session`.
- Design tokens (from `DESIGN.md` / `src/index.css`): brand `#4dbb83`, bg `#f8fafc`, surface `#ffffff`, ink `#0f172a`, Poppins display (600) + Inter body, tabular figures for numbers, green never a large wash, light/dark via `data-theme`.
- Required form fields (must match the existing HTML intake): `full_name`, `legal_business`, `ein`, `phone`, `email`, `past_customers`, `facebook`, `cities`, `services`, `timezone`. Everything else optional.

---

## File Structure

**Create:**
- `supabase/migrations/NNNN_onboarding_intake.sql` — tables + bucket + RLS.
- `src/lib/onboardingFields.ts` — field/step definitions + `validateOnboarding()` (shared by form + submit endpoint). Pure, tested.
- `src/lib/onboardingFields.test.ts` — unit tests for `validateOnboarding()`.
- `functions/lib/onboardingInvite.ts` — token mint/hash helpers + invite-row creation. Pure parts tested.
- `functions/lib/onboardingInvite.test.ts` — unit tests for token hashing/format.
- `functions/api/admin/onboarding/index.ts` — `GET` list, `POST` invite (create bare client + invite).
- `functions/api/admin/onboarding/[tenantId].ts` — `GET` one submission (answers + file URLs).
- `functions/api/onboarding/redeem.ts` — `POST` redeem token, mint client session.
- `functions/api/onboarding/status.ts` — `GET` current client's onboarding status + draft.
- `functions/api/onboarding/save.ts` — `POST` autosave answers.
- `functions/api/onboarding/upload.ts` — `POST` upload a file to storage.
- `functions/api/onboarding/submit.ts` — `POST` finalize.
- `src/routes/onboarding/OnboardingForm.tsx` — the 6-step client wizard.
- `src/routes/admin/AdminOnboarding.tsx` — admin list + "New onboarding".
- `src/routes/admin/AdminOnboardingDetail.tsx` — admin submission review.

**Modify:**
- `src/lib/api.ts` — add onboarding types + client functions.
- `src/App.tsx` — register `/onboarding`, `/admin/onboarding`, `/admin/onboarding/:tenantId`; add the onboarding gate.
- `src/routes/admin/AdminLayout.tsx` — add `Onboarding` to `ADMIN_NAV`.
- `functions/api/auth/me.ts` — include `onboardingStatus` for the signed-in client (for the gate).

---

### Task 1: Database migration (tables + storage bucket + RLS)

**Files:**
- Create: `command-center/app/supabase/migrations/NNNN_onboarding_intake.sql` (replace NNNN with next number)

**Interfaces:**
- Produces: tables `public.onboarding_submissions`, `public.client_invites`; storage bucket `onboarding-uploads`. Columns referenced by every later task.

- [ ] **Step 1: Confirm the next migration number**

Run: `ls command-center/app/supabase/migrations`
Take the highest `NNNN_` prefix, add 1, zero-pad to 4 digits. Use that for the filename below.

- [ ] **Step 2: Write the migration**

```sql
-- In-app onboarding: intake submissions + magic-link invites + uploads bucket.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- =========================
-- onboarding_submissions  (one per tenant)
-- =========================
create table if not exists public.onboarding_submissions (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  status        text not null default 'invited'
                  check (status in ('invited','in_progress','submitted')),
  answers       jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =========================
-- client_invites  (magic-link tokens; hashed)
-- =========================
create table if not exists public.client_invites (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  token_hash   text not null,
  owner_email  text not null,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists client_invites_token_idx on public.client_invites(token_hash);
create index if not exists client_invites_tenant_idx on public.client_invites(tenant_id);

-- =========================
-- RLS: service-role only (functions bypass RLS; deny everything else).
-- =========================
alter table public.onboarding_submissions enable row level security;
alter table public.client_invites         enable row level security;
-- No policies created on purpose: only the service-role key (used by Functions)
-- can read/write. The browser never touches these tables directly.

-- =========================
-- Storage bucket for onboarding uploads (private).
-- =========================
insert into storage.buckets (id, name, public)
values ('onboarding-uploads', 'onboarding-uploads', false)
on conflict (id) do nothing;
```

- [ ] **Step 3: Apply the migration**

Run: `cd command-center/app && npm run db:migrate`
Expected: output lists the new file as applied, no errors. Re-running applies nothing (ledger skip).

- [ ] **Step 4: Commit**

```bash
git add command-center/app/supabase/migrations/
git commit -m "feat(onboarding): intake tables, invites, uploads bucket"
```

---

### Task 2: Shared field schema + validation (pure logic, TDD)

**Files:**
- Create: `command-center/app/src/lib/onboardingFields.ts`
- Test: `command-center/app/src/lib/onboardingFields.test.ts`

**Interfaces:**
- Produces:
  - `type OnboardingAnswers = Record<string, string | FileRef | null>`
  - `interface FileRef { filename: string; size: number; storagePath: string }`
  - `const ONBOARDING_STEPS: OnboardingStep[]` (6 steps; each `{ id, title, blurb, fields }`)
  - `interface OnboardingField { name: string; label: string; type: "text"|"email"|"tel"|"url"|"textarea"|"select"|"radio"|"file"; required?: boolean; help?: string; hint?: string; options?: string[]; accept?: string }`
  - `const REQUIRED_FIELDS: string[]`
  - `function validateOnboarding(answers: OnboardingAnswers): { ok: boolean; missing: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { validateOnboarding, REQUIRED_FIELDS } from "./onboardingFields";

describe("validateOnboarding", () => {
  it("lists every required field as missing for an empty object", () => {
    const { ok, missing } = validateOnboarding({});
    expect(ok).toBe(false);
    expect(missing.sort()).toEqual([...REQUIRED_FIELDS].sort());
  });

  it("treats whitespace-only strings as missing", () => {
    const { missing } = validateOnboarding({ full_name: "   " });
    expect(missing).toContain("full_name");
  });

  it("accepts a file ref for a required file field", () => {
    const { missing } = validateOnboarding({
      past_customers: { filename: "x.csv", size: 10, storagePath: "t/past/x.csv" },
    });
    expect(missing).not.toContain("past_customers");
  });

  it("returns ok when every required field has a value", () => {
    const full: Record<string, unknown> = {};
    for (const f of REQUIRED_FIELDS) full[f] = "value";
    full.past_customers = { filename: "x.csv", size: 1, storagePath: "p" };
    const { ok, missing } = validateOnboarding(full as never);
    expect(missing).toEqual([]);
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npx vitest run src/lib/onboardingFields.test.ts`
Expected: FAIL ("validateOnboarding is not a function" / module not found).

- [ ] **Step 3: Implement `onboardingFields.ts`**

```typescript
export interface FileRef {
  filename: string;
  size: number;
  storagePath: string;
}

export type OnboardingValue = string | FileRef | null;
export type OnboardingAnswers = Record<string, OnboardingValue>;

export interface OnboardingField {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "url" | "textarea" | "select" | "radio" | "file";
  required?: boolean;
  help?: string;
  hint?: string;
  options?: string[];
  accept?: string;
  half?: boolean; // render two-up on a row
}

export interface OnboardingStep {
  id: number;
  title: string;
  blurb: string;
  fields: OnboardingField[];
}

const FILE_ACCEPT = ".csv,.xls,.xlsx,.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: "Business identity",
    blurb:
      "These details must match your IRS records exactly. They are used for SMS messaging and Facebook ad verification. Inaccuracy here gets your accounts flagged.",
    fields: [
      { name: "full_name", label: "Full name", type: "text", required: true },
      { name: "legal_business", label: "Legal business name", type: "text", required: true },
      {
        name: "ein",
        label: "Business EIN",
        type: "text",
        required: true,
        help: "Required for SMS messaging compliance and Facebook ad account verification.",
      },
    ],
  },
  {
    id: 2,
    title: "Where can we reach you?",
    blurb: "Address must match IRS records. Phone and email are how we send onboarding next steps.",
    fields: [
      { name: "street", label: "Street address", type: "text" },
      { name: "city", label: "City", type: "text", half: true },
      { name: "state", label: "State", type: "text", half: true },
      {
        name: "country",
        label: "Country",
        type: "select",
        half: true,
        options: ["United States", "Canada", "United Kingdom", "Australia"],
      },
      { name: "postal", label: "Postal code", type: "text", half: true },
      { name: "phone", label: "Phone", type: "tel", required: true, half: true },
      { name: "email", label: "Email", type: "email", required: true, half: true },
    ],
  },
  {
    id: 3,
    title: "Your customer lists",
    blurb:
      "Two campaigns we run early need these. If you only have one list, upload it where it fits and skip the other.",
    fields: [
      {
        name: "past_customers",
        label: "Past customers",
        type: "file",
        required: true,
        accept: FILE_ACCEPT,
        help: "Used for the reactivation campaign, bringing previous customers back.",
      },
      {
        name: "current_customers",
        label: "Current customers",
        type: "file",
        hint: "Optional",
        accept: FILE_ACCEPT,
        help: "Used for the review-generation campaign.",
      },
    ],
  },
  {
    id: 4,
    title: "Web presence & assets",
    blurb: "We use these to build creatives, write copy, and set up your funnel.",
    fields: [
      {
        name: "assets_url",
        label: "Google Drive link of business assets",
        type: "url",
        hint: "Photos, logos, videos",
        help: "Set the link to anyone-with-the-link access. We cannot pull from private folders.",
      },
      { name: "facebook", label: "Facebook page link", type: "url", required: true },
      { name: "website", label: "Current website", type: "url" },
    ],
  },
  {
    id: 5,
    title: "What you do, and for whom",
    blurb: "Specific cities and specific services convert noticeably better than vague catch-alls.",
    fields: [
      { name: "cities", label: "Cities you service", type: "textarea", required: true },
      { name: "services", label: "Main services to promote", type: "textarea", required: true },
      {
        name: "notify",
        label: "How should we notify you of new leads?",
        type: "radio",
        options: ["sms", "email", "both"],
      },
    ],
  },
  {
    id: 6,
    title: "A few last things",
    blurb: "Optional details that let us pre-handle objections and craft offers that convert.",
    fields: [
      { name: "faqs", label: "Common FAQs from customers", type: "textarea" },
      {
        name: "timezone",
        label: "Your time zone",
        type: "select",
        required: true,
        options: ["Eastern (ET)", "Central (CT)", "Mountain (MT)", "Pacific (PT)", "Alaska (AKT)", "Hawaii (HT)"],
      },
      { name: "offers", label: "Offers or promotions you have run", type: "textarea" },
      { name: "notes", label: "Additional notes", type: "textarea" },
    ],
  },
];

export const REQUIRED_FIELDS: string[] = ONBOARDING_STEPS.flatMap((s) =>
  s.fields.filter((f) => f.required).map((f) => f.name),
);

function hasValue(v: OnboardingValue | undefined): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return typeof v.storagePath === "string" && v.storagePath.length > 0;
}

export function validateOnboarding(answers: OnboardingAnswers): {
  ok: boolean;
  missing: string[];
} {
  const missing = REQUIRED_FIELDS.filter((name) => !hasValue(answers[name]));
  return { ok: missing.length === 0, missing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd command-center/app && npx vitest run src/lib/onboardingFields.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/onboardingFields.ts command-center/app/src/lib/onboardingFields.test.ts
git commit -m "feat(onboarding): field schema and validation"
```

---

### Task 3: Invite token helpers (pure logic, TDD)

**Files:**
- Create: `command-center/app/functions/lib/onboardingInvite.ts`
- Test: `command-center/app/functions/lib/onboardingInvite.test.ts`

**Interfaces:**
- Produces:
  - `function generateInviteToken(): string` (URL-safe, >= 32 chars, from `crypto.getRandomValues`)
  - `async function hashInviteToken(token: string): Promise<string>` (SHA-256 hex via WebCrypto)
  - `function inviteExpiry(now: number, days?: number): string` (ISO string, default 7 days)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { generateInviteToken, hashInviteToken, inviteExpiry } from "./onboardingInvite";

describe("invite tokens", () => {
  it("generates a long URL-safe token", () => {
    const t = generateInviteToken();
    expect(t.length).toBeGreaterThanOrEqual(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates distinct tokens", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });

  it("hashes deterministically and not to the raw token", async () => {
    const t = "abc123";
    const h = await hashInviteToken(t);
    expect(h).toBe(await hashInviteToken(t));
    expect(h).not.toBe(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computes an expiry in the future", () => {
    const now = 1_700_000_000_000;
    const iso = inviteExpiry(now, 7);
    expect(Date.parse(iso)).toBe(now + 7 * 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npx vitest run functions/lib/onboardingInvite.test.ts`
Expected: FAIL (module not found).

Note: vitest config currently includes only `src/**/*.test.ts`. Before running, add `functions/**/*.test.ts` to `include` in `vitest.config.ts`:
```typescript
test: { environment: "node", include: ["src/**/*.test.ts", "functions/**/*.test.ts"] },
```

- [ ] **Step 3: Implement `onboardingInvite.ts`**

```typescript
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function generateInviteToken(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function hashInviteToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function inviteExpiry(now: number, days = 7): string {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd command-center/app && npx vitest run functions/lib/onboardingInvite.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/lib/onboardingInvite.ts command-center/app/functions/lib/onboardingInvite.test.ts command-center/app/vitest.config.ts
git commit -m "feat(onboarding): invite token helpers"
```

---

### Task 4: Admin invite + list endpoints

**Files:**
- Create: `command-center/app/functions/api/admin/onboarding/index.ts`

**Interfaces:**
- Consumes: `getServiceClient` (`functions/lib/supabase.ts`), `hashPassword` is NOT used (no password here), `generateInviteToken`/`hashInviteToken`/`inviteExpiry` (Task 3), `slugify`/`uniqueSlug` from the existing clients endpoint (copy or import — see step 2), `ctx.data.admin` (set by middleware).
- Produces: `POST /api/admin/onboarding/invite` returns `{ ok, tenantId, slug, magicLink }`. `GET /api/admin/onboarding` returns `{ rows: OnboardingListRow[] }` where `OnboardingListRow = { tenantId, name, slug, status, ownerEmail, createdAt, submittedAt }`.

- [ ] **Step 1: Inspect the existing clients endpoint for reusable helpers**

Run: `sed -n '1,115p' command-center/app/functions/api/admin/clients/index.ts`
Confirm where `slugify`, `uniqueSlug`, and `CAPABILITIES` live. If they are module-local (not exported), export `slugify` and `uniqueSlug` from that file so this endpoint can import them (add `export` to their declarations). Commit that small change as part of this task.

- [ ] **Step 2: Implement the endpoint**

```typescript
import type { Env } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { slugify, uniqueSlug } from "../clients/index";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
} from "../../../lib/onboardingInvite";

interface InviteBody {
  name?: string;
  ownerEmail?: string;
  niche?: string;
}

function originOf(req: Request): string {
  return new URL(req.url).origin;
}

// GET /api/admin/onboarding  (admin-only) — list clients in onboarding.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("onboarding_submissions")
    .select("tenant_id, status, submitted_at, created_at, tenants(name, slug), client_invites(owner_email)")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const tenant = (r.tenants ?? {}) as { name?: string; slug?: string };
    const invites = (r.client_invites ?? []) as { owner_email?: string }[];
    return {
      tenantId: r.tenant_id as string,
      name: tenant.name ?? "",
      slug: tenant.slug ?? "",
      status: r.status as string,
      ownerEmail: invites[0]?.owner_email ?? "",
      createdAt: r.created_at as string,
      submittedAt: (r.submitted_at as string | null) ?? null,
    };
  });
  return Response.json({ rows });
};

// POST /api/admin/onboarding/invite  (admin-only) — bare client + magic link.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: InviteBody = {};
  try {
    body = (await ctx.request.json()) as InviteBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const ownerEmail = (body.ownerEmail ?? "").trim().toLowerCase();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  if (!ownerEmail) return Response.json({ error: "owner email is required" }, { status: 400 });

  const niche = (body.niche ?? "general").trim() || "general";
  const slug = await uniqueSlug(client, slugify(name));

  // Bare tenant. GHL fields default to "pending"; brand defaults applied.
  const { data: inserted, error: insErr } = await client
    .from("tenants")
    .insert({
      slug,
      name,
      niche,
      brand_color: "#4dbb83",
      brand_initials: name.slice(0, 2).toUpperCase(),
      app_name: name,
      won_label: "Won",
      value_label: "Job Value",
      ghl_location_id: "pending",
      ghl_token: "pending",
      monthly_spend: 0,
    })
    .select("id, slug")
    .single();
  if (insErr || !inserted) {
    return Response.json({ error: insErr?.message ?? "could not create client" }, { status: 500 });
  }
  const tenantId = (inserted as { id: string }).id;

  // Owner staff account (no password; magic link is the only way in for now).
  await client.from("staff_accounts").insert({
    tenant_id: tenantId,
    ghl_user_id: null,
    email: ownerEmail,
    name: `${name} (Owner)`,
    role: "owner",
    status: "active",
    password_hash: null,
  });

  // Seed submission row.
  await client.from("onboarding_submissions").insert({ tenant_id: tenantId, status: "invited" });

  // Mint + store invite token (hash only).
  const token = generateInviteToken();
  const tokenHash = await hashInviteToken(token);
  const now = Date.parse(ctx.request.headers.get("date") ?? "") || Date.now();
  await client.from("client_invites").insert({
    tenant_id: tenantId,
    token_hash: tokenHash,
    owner_email: ownerEmail,
    expires_at: inviteExpiry(now),
  });

  const magicLink = `${originOf(ctx.request)}/onboarding?token=${token}`;
  return Response.json({ ok: true, tenantId, slug, magicLink }, { status: 201 });
};
```

- [ ] **Step 3: Verify locally**

Run the dev server (`npm run dev` in `command-center/app`, which serves Functions via Wrangler/Pages — confirm the project's dev command in `package.json`). With an admin session cookie, POST to `/api/admin/onboarding/invite` with `{ "name": "Test Co", "ownerEmail": "owner@test.com" }` and confirm a 201 with a `magicLink`. Then GET `/api/admin/onboarding` and confirm the row appears with status `invited`.

Manual evidence to capture: the JSON responses from both calls.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/functions/api/admin/onboarding/index.ts command-center/app/functions/api/admin/clients/index.ts
git commit -m "feat(onboarding): admin invite + list endpoints"
```

---

### Task 5: Redeem + status endpoints (client session)

**Files:**
- Create: `command-center/app/functions/api/onboarding/redeem.ts`
- Create: `command-center/app/functions/api/onboarding/status.ts`

**Interfaces:**
- Consumes: `getServiceClient`, `hashInviteToken` (Task 3), `mintSessionCookie` (`functions/lib/session.ts`), `verifySession` (`functions/lib/session.ts`).
- Produces:
  - `POST /api/onboarding/redeem` body `{ token }` → sets `hml_session` cookie for `{ tenantId, staffId }`, returns `{ ok, status, answers }`. 401 on bad/expired/consumed token.
  - `GET /api/onboarding/status` → `{ status, answers }` for the current client session, or 401 if unauthenticated.

- [ ] **Step 1: Confirm `verifySession`/`mintSessionCookie` signatures**

Run: `sed -n '1,80p' command-center/app/functions/lib/session.ts`
Confirm `verifySession(req, env)` returns `{ mode, tenantId?, staffId?, adminId? } | null` and `mintSessionCookie(env, mode, { tenantId, staffId })` returns a Set-Cookie string (per the patterns gathered). Adjust the calls below if the real signature differs.

- [ ] **Step 2: Implement `redeem.ts`**

```typescript
import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { hashInviteToken } from "../../lib/onboardingInvite";
import { mintSessionCookie } from "../../lib/session";

interface Body {
  token?: string;
}

// POST /api/onboarding/redeem  (public) — magic-link sign-in for onboarding.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });

  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) return Response.json({ error: "invalid link" }, { status: 401 });

  const tokenHash = await hashInviteToken(token);
  const { data: invite } = await client
    .from("client_invites")
    .select("id, tenant_id, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const inv = invite as
    | { id: string; tenant_id: string; expires_at: string; consumed_at: string | null }
    | null;
  if (!inv) return Response.json({ error: "invalid link" }, { status: 401 });
  if (inv.consumed_at) return Response.json({ error: "link already used" }, { status: 401 });
  if (Date.parse(inv.expires_at) < Date.now()) {
    return Response.json({ error: "link expired" }, { status: 401 });
  }

  // Resolve the owner staff id for this tenant.
  const { data: owner } = await client
    .from("staff_accounts")
    .select("id")
    .eq("tenant_id", inv.tenant_id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  const staffId = (owner as { id: string } | null)?.id;
  if (!staffId) return Response.json({ error: "owner not provisioned" }, { status: 500 });

  await client.from("client_invites").update({ consumed_at: new Date().toISOString() }).eq("id", inv.id);

  const { data: sub } = await client
    .from("onboarding_submissions")
    .select("status, answers")
    .eq("tenant_id", inv.tenant_id)
    .maybeSingle();
  const subRow = (sub as { status?: string; answers?: unknown } | null) ?? {};

  const cookie = await mintSessionCookie(ctx.env, "live", {
    tenantId: inv.tenant_id,
    staffId,
  });
  return new Response(
    JSON.stringify({ ok: true, status: subRow.status ?? "invited", answers: subRow.answers ?? {} }),
    { status: 200, headers: { "content-type": "application/json", "set-cookie": cookie } },
  );
};
```

- [ ] **Step 3: Implement `status.ts`**

```typescript
import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { verifySession } from "../../lib/session";

// GET /api/onboarding/status  (client session) — current onboarding state.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  if (!session?.tenantId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });

  const { data } = await client
    .from("onboarding_submissions")
    .select("status, answers")
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  const row = (data as { status?: string; answers?: unknown } | null) ?? null;
  return Response.json({
    status: row?.status ?? null,
    answers: row?.answers ?? {},
  });
};
```

- [ ] **Step 4: Verify**

With the `magicLink` token from Task 4, POST `/api/onboarding/redeem` with `{ "token": "<token>" }`. Confirm 200, a `set-cookie: hml_session=...`, and `status: "invited"`. POST the same token again: confirm 401 "link already used". With the cookie set, GET `/api/onboarding/status`: confirm `{ status: "invited", answers: {} }`.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/onboarding/redeem.ts command-center/app/functions/api/onboarding/status.ts
git commit -m "feat(onboarding): redeem + status endpoints"
```

---

### Task 6: Save, upload, submit endpoints

**Files:**
- Create: `command-center/app/functions/api/onboarding/save.ts`
- Create: `command-center/app/functions/api/onboarding/upload.ts`
- Create: `command-center/app/functions/api/onboarding/submit.ts`

**Interfaces:**
- Consumes: `verifySession`, `getServiceClient`, `validateOnboarding` (Task 2 — import from `../../../src/lib/onboardingFields` is cross-boundary; instead duplicate `REQUIRED_FIELDS`/validation into `functions/lib/onboardingFields.ts` OR re-export. See step 1).
- Produces:
  - `POST /api/onboarding/save` body `{ answers }` → upserts answers, sets status `in_progress`, returns `{ ok }`.
  - `POST /api/onboarding/upload` multipart (field `file`, field `field`) → stores to `onboarding-uploads/<tenantId>/<field>/<filename>`, returns `{ ok, ref: FileRef }`.
  - `POST /api/onboarding/submit` body `{ answers }` → validates required, sets status `submitted` + `submitted_at`; 422 `{ error, missing }` if invalid.

- [ ] **Step 1: Make validation usable inside Functions**

Functions and `src/` are separate TS roots. Create `command-center/app/functions/lib/onboardingFields.ts` exporting just the validation contract used server-side:

```typescript
// Server-side mirror of the required-field contract. Keep in sync with
// src/lib/onboardingFields.ts (REQUIRED_FIELDS). Tested in src; this is the
// minimal copy the Functions runtime needs.
export const REQUIRED_FIELDS = [
  "full_name", "legal_business", "ein", "phone", "email",
  "past_customers", "facebook", "cities", "services", "timezone",
];

type Value = string | { storagePath?: string } | null | undefined;

function hasValue(v: Value): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return typeof v.storagePath === "string" && v.storagePath.length > 0;
}

export function validateOnboarding(answers: Record<string, Value>): {
  ok: boolean;
  missing: string[];
} {
  const missing = REQUIRED_FIELDS.filter((n) => !hasValue(answers[n]));
  return { ok: missing.length === 0, missing };
}
```

Add a test `command-center/app/functions/lib/onboardingFields.test.ts` mirroring the empty-object and all-present cases from Task 2 (same assertions, importing from this file). Run `npx vitest run functions/lib/onboardingFields.test.ts` and confirm PASS before continuing.

- [ ] **Step 2: Implement `save.ts`**

```typescript
import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { verifySession } from "../../lib/session";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  if (!session?.tenantId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });

  let body: { answers?: Record<string, unknown> } = {};
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const answers = body.answers ?? {};

  const { error } = await client
    .from("onboarding_submissions")
    .update({ answers, status: "in_progress", updated_at: new Date().toISOString() })
    .eq("tenant_id", session.tenantId)
    .neq("status", "submitted"); // never downgrade a submitted record
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
```

- [ ] **Step 3: Implement `upload.ts`**

```typescript
import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { verifySession } from "../../lib/session";

const MAX_BYTES = 25 * 1024 * 1024;
const SAFE = /[^A-Za-z0-9._-]/g;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  if (!session?.tenantId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });

  const form = await ctx.request.formData();
  const file = form.get("file");
  const field = String(form.get("field") ?? "file").replace(SAFE, "");
  if (!(file instanceof File)) return Response.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "file too large (25MB max)" }, { status: 413 });

  const cleanName = file.name.replace(SAFE, "_");
  const storagePath = `${session.tenantId}/${field}/${cleanName}`;
  const { error } = await client.storage
    .from("onboarding-uploads")
    .upload(storagePath, file, { upsert: true, contentType: file.type || "application/octet-stream" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    ok: true,
    ref: { filename: cleanName, size: file.size, storagePath },
  });
};
```

- [ ] **Step 4: Implement `submit.ts`**

```typescript
import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { verifySession } from "../../lib/session";
import { validateOnboarding } from "../../lib/onboardingFields";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  if (!session?.tenantId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });

  let body: { answers?: Record<string, unknown> } = {};
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const answers = body.answers ?? {};
  const { ok, missing } = validateOnboarding(answers as never);
  if (!ok) return Response.json({ error: "missing required fields", missing }, { status: 422 });

  const now = new Date().toISOString();
  const { error } = await client
    .from("onboarding_submissions")
    .update({ answers, status: "submitted", submitted_at: now, updated_at: now })
    .eq("tenant_id", session.tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Pluggable hook point for future auto-notify / email-Jake. Intentionally empty now.
  return Response.json({ ok: true });
};
```

- [ ] **Step 5: Verify**

With the client cookie from Task 5: POST `/api/onboarding/save` with partial answers, confirm `{ ok: true }` and status flips to `in_progress` (re-GET status). POST `/api/onboarding/upload` with a small file (multipart, `field=past_customers`), confirm `{ ok, ref }` and the object exists in the Supabase Storage `onboarding-uploads` bucket. POST `/api/onboarding/submit` with incomplete answers, confirm 422 + `missing`. POST with all required present, confirm `{ ok: true }` and status `submitted` with `submitted_at`.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/functions/api/onboarding/ command-center/app/functions/lib/onboardingFields.ts command-center/app/functions/lib/onboardingFields.test.ts
git commit -m "feat(onboarding): save, upload, submit endpoints"
```

---

### Task 7: Client API layer + types

**Files:**
- Modify: `command-center/app/src/lib/api.ts`

**Interfaces:**
- Produces (added to `api.ts`):
  - `interface OnboardingListRow { tenantId: string; name: string; slug: string; status: "invited"|"in_progress"|"submitted"; ownerEmail: string; createdAt: string; submittedAt: string | null }`
  - `interface OnboardingDetail { row: OnboardingListRow; answers: Record<string, unknown>; files: { field: string; filename: string; url: string }[] }`
  - `adminListOnboarding(): Promise<OnboardingListRow[]>`
  - `adminCreateInvite(name, ownerEmail): Promise<{ tenantId: string; slug: string; magicLink: string }>`
  - `adminGetOnboarding(tenantId): Promise<OnboardingDetail>`
  - `redeemOnboarding(token): Promise<{ status: string; answers: Record<string, unknown> }>`
  - `getOnboardingStatus(): Promise<{ status: string | null; answers: Record<string, unknown> }>`
  - `saveOnboarding(answers): Promise<void>`
  - `uploadOnboardingFile(field, file): Promise<FileRef>`
  - `submitOnboarding(answers): Promise<void>` (throws `ApiError` with `body.missing` on 422)

- [ ] **Step 1: Add the code (append to `api.ts`)**

```typescript
import type { FileRef } from "./onboardingFields";

export type OnboardingStatus = "invited" | "in_progress" | "submitted";

export interface OnboardingListRow {
  tenantId: string;
  name: string;
  slug: string;
  status: OnboardingStatus;
  ownerEmail: string;
  createdAt: string;
  submittedAt: string | null;
}

export interface OnboardingFileLink {
  field: string;
  filename: string;
  url: string;
}

export interface OnboardingDetail {
  row: OnboardingListRow;
  answers: Record<string, unknown>;
  files: OnboardingFileLink[];
}

export function adminListOnboarding(): Promise<OnboardingListRow[]> {
  return api<{ rows: OnboardingListRow[] }>("/api/admin/onboarding").then((r) => r.rows ?? []);
}

export function adminCreateInvite(
  name: string,
  ownerEmail: string,
): Promise<{ tenantId: string; slug: string; magicLink: string }> {
  return api("/api/admin/onboarding/invite", {
    method: "POST",
    body: JSON.stringify({ name, ownerEmail }),
  });
}

export function adminGetOnboarding(tenantId: string): Promise<OnboardingDetail> {
  return api<OnboardingDetail>(`/api/admin/onboarding/${tenantId}`);
}

export function redeemOnboarding(
  token: string,
): Promise<{ status: string; answers: Record<string, unknown> }> {
  return api("/api/onboarding/redeem", { method: "POST", body: JSON.stringify({ token }) });
}

export function getOnboardingStatus(): Promise<{
  status: string | null;
  answers: Record<string, unknown>;
}> {
  return api("/api/onboarding/status");
}

export function saveOnboarding(answers: Record<string, unknown>): Promise<void> {
  return api<{ ok: true }>("/api/onboarding/save", {
    method: "POST",
    body: JSON.stringify({ answers }),
  }).then(() => undefined);
}

export async function uploadOnboardingFile(field: string, file: File): Promise<FileRef> {
  const fd = new FormData();
  fd.append("field", field);
  fd.append("file", file);
  const res = await api<{ ok: true; ref: FileRef }>("/api/onboarding/upload", {
    method: "POST",
    body: fd,
  });
  return res.ref;
}

export function submitOnboarding(answers: Record<string, unknown>): Promise<void> {
  return api<{ ok: true }>("/api/onboarding/submit", {
    method: "POST",
    body: JSON.stringify({ answers }),
  }).then(() => undefined);
}
```

Note: `api()` sets `content-type: application/json` only when the body is truthy and the header is unset; for `FormData` it must NOT set JSON content-type. Confirm `api()` leaves `FormData` bodies alone (the browser sets the multipart boundary). If `api()` force-sets JSON, branch the upload to use raw `fetch` with `credentials: "include"` instead.

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no new errors from `api.ts`.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/lib/api.ts
git commit -m "feat(onboarding): client API functions"
```

---

### Task 8: Admin detail endpoint (signed file URLs)

**Files:**
- Create: `command-center/app/functions/api/admin/onboarding/[tenantId].ts`

**Interfaces:**
- Consumes: `getServiceClient`, `ctx.params.tenantId`.
- Produces: `GET /api/admin/onboarding/:tenantId` → `OnboardingDetail` (row + answers + files with signed URLs).

- [ ] **Step 1: Implement**

```typescript
import type { Env } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

interface FileRef {
  filename?: string;
  size?: number;
  storagePath?: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = String(ctx.params.tenantId ?? "");
  if (!tenantId) return Response.json({ error: "missing tenant" }, { status: 400 });

  const { data, error } = await client
    .from("onboarding_submissions")
    .select("tenant_id, status, answers, submitted_at, created_at, tenants(name, slug), client_invites(owner_email)")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });

  const rec = data as Record<string, unknown>;
  const tenant = (rec.tenants ?? {}) as { name?: string; slug?: string };
  const invites = (rec.client_invites ?? []) as { owner_email?: string }[];
  const answers = (rec.answers ?? {}) as Record<string, unknown>;

  // Sign URLs for any FileRef-shaped answers.
  const files: { field: string; filename: string; url: string }[] = [];
  for (const [field, val] of Object.entries(answers)) {
    const ref = val as FileRef;
    if (ref && typeof ref === "object" && typeof ref.storagePath === "string") {
      const { data: signed } = await client.storage
        .from("onboarding-uploads")
        .createSignedUrl(ref.storagePath, 60 * 30);
      if (signed?.signedUrl) {
        files.push({ field, filename: ref.filename ?? field, url: signed.signedUrl });
      }
    }
  }

  return Response.json({
    row: {
      tenantId,
      name: tenant.name ?? "",
      slug: tenant.slug ?? "",
      status: rec.status,
      ownerEmail: invites[0]?.owner_email ?? "",
      createdAt: rec.created_at,
      submittedAt: rec.submitted_at ?? null,
    },
    answers,
    files,
  });
};
```

- [ ] **Step 2: Verify**

With an admin session, GET `/api/admin/onboarding/<tenantId>` for the tenant created in Task 4 (after the Task 6 upload). Confirm `answers` reflects the saved data and `files` contains a signed URL that downloads the uploaded file in a browser.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/functions/api/admin/onboarding/
git commit -m "feat(onboarding): admin detail endpoint with signed file URLs"
```

---

### Task 9: Client onboarding form (the 6-step wizard)

**Files:**
- Create: `command-center/app/src/routes/onboarding/OnboardingForm.tsx`

**Interfaces:**
- Consumes: `ONBOARDING_STEPS`, `validateOnboarding`, `OnboardingAnswers`, `FileRef` (Task 2); `saveOnboarding`, `submitOnboarding`, `uploadOnboardingFile`, `getOnboardingStatus` (Task 7); `Button` (`ui/Button`), `Feedback` (`ui/Feedback`).
- Produces: default-exported `OnboardingForm` component. Self-contained; reads its own draft on mount via `getOnboardingStatus`.

- [ ] **Step 1: Build the component**

Behavior:
- On mount, call `getOnboardingStatus()` to hydrate `answers` and `current` step. If `status === "submitted"`, render the success state directly.
- Render the current step from `ONBOARDING_STEPS`: title, blurb, a 6-segment progress bar, and the step's fields using the field `type` (text/email/tel/url/textarea/select/radio/file).
- Text/select/radio update local `answers`. File fields call `uploadOnboardingFile(field, file)` and store the returned `FileRef` in `answers`, showing filename + size when present.
- "Continue" advances; "Back" retreats; on each advance call `saveOnboarding(answers)` (fire-and-forget with error toast on failure). On step 6 the primary button reads "Submit intake" and calls `submitOnboarding(answers)`.
- On submit success, show the calm success state: a check icon, "Submission received.", and "We have it. Your strategist will reach out with next steps." NO calendar redirect.
- On submit 422, surface `err.body.missing` mapped to field labels via `ONBOARDING_STEPS`, and jump to the earliest step containing a missing field.

Styling: use the app tokens. Container `max-w-[640px] mx-auto px-6 py-12`. Inputs use the AdminClientDetail input pattern: `mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25`. Labels use `label-cap`. Progress segments: active/filled use `bg-brand`, empty use `bg-surface-3`. Primary button `<Button variant="primary">`, back `<Button variant="ghost">`. Headline uses `font-display`. Two-up rows (`field.half`) use a `grid grid-cols-1 sm:grid-cols-2 gap-4` wrapper.

Provide the full component implementation (no placeholders). Key skeleton:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  ONBOARDING_STEPS,
  validateOnboarding,
  type OnboardingAnswers,
  type OnboardingField,
  type FileRef,
} from "../../lib/onboardingFields";
import {
  getOnboardingStatus,
  saveOnboarding,
  submitOnboarding,
  uploadOnboardingFile,
} from "../../lib/api";

export default function OnboardingForm() {
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [current, setCurrent] = useState(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOnboardingStatus()
      .then((r) => {
        if (cancelled) return;
        if (r.status === "submitted") setDone(true);
        setAnswers((r.answers ?? {}) as OnboardingAnswers);
      })
      .catch(() => {})
      .finally(() => !cancelled && setHydrated(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const step = ONBOARDING_STEPS.find((s) => s.id === current)!;
  const total = ONBOARDING_STEPS.length;

  const setField = (name: string, value: OnboardingAnswers[string]) =>
    setAnswers((a) => ({ ...a, [name]: value }));

  async function onFile(field: OnboardingField, file: File | null) {
    if (!file) return;
    try {
      setBusy(true);
      const ref: FileRef = await uploadOnboardingFile(field.name, file);
      setField(field.name, ref);
    } catch {
      setError("Upload failed. Try a smaller file (25MB max).");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    setError(null);
    if (current < total) {
      void saveOnboarding(answers as Record<string, unknown>);
      setCurrent((c) => c + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // final step: submit
    const local = validateOnboarding(answers);
    if (!local.ok) {
      setError("Please complete the required fields highlighted.");
      const firstMissing = local.missing[0];
      const stepWithMissing = ONBOARDING_STEPS.find((s) =>
        s.fields.some((f) => f.name === firstMissing),
      );
      if (stepWithMissing) setCurrent(stepWithMissing.id);
      return;
    }
    try {
      setBusy(true);
      await submitOnboarding(answers as Record<string, unknown>);
      setDone(true);
    } catch (e) {
      const missing = (e as { body?: { missing?: string[] } }).body?.missing;
      setError(missing?.length ? "Some required fields are still missing." : "Could not submit. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) return null;
  if (done) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-20 text-center">
        <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint text-brand-text">
          <Check size={30} />
        </div>
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.02em] text-text">
          Submission received.
        </h1>
        <p className="mx-auto mt-4 max-w-[460px] text-[15px] leading-relaxed text-muted">
          We have everything we need to get started. Your strategist will reach out with next steps.
        </p>
      </div>
    );
  }

  // ...render header (brand + "Step N / 6"), progress segments, the fields
  //    by type, and the Back / Continue|Submit nav. Full field rendering and
  //    markup go here, styled per the tokens above.
  return null; // replace with full JSX described above
}
```

The implementer MUST replace the trailing `return null` with the full step/field JSX per the styling spec above. Render each field by `type`; for `radio`, label options `sms` -> "SMS only, fastest response", `email` -> "Email only", `both` -> "Both, recommended" (default `both`). Show inline error via the `error` state above the nav.

- [ ] **Step 2: Typecheck + lint**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/onboarding/OnboardingForm.tsx
git commit -m "feat(onboarding): client 6-step form"
```

---

### Task 10: Route registration + onboarding gate

**Files:**
- Modify: `command-center/app/src/App.tsx`
- Modify: `command-center/app/functions/api/auth/me.ts`

**Interfaces:**
- Consumes: `OnboardingForm` (Task 9), `getOnboardingStatus` (Task 7), existing `ProtectedRoute`.
- Produces: a `/onboarding` route (redeems token from `?token=`, then shows the form gated by client session) and a gate that forces unfinished clients to `/onboarding`.

- [ ] **Step 1: Add `onboardingStatus` to `/api/auth/me`**

In `functions/api/auth/me.ts`, for a client session (has `tenantId`), look up `onboarding_submissions.status` and include `onboardingStatus: status | null` in the JSON. (Use `getServiceClient` + a single `select("status").eq("tenant_id", tenantId).maybeSingle()`.) A missing row yields `null`.

- [ ] **Step 2: Add the route + gate in `App.tsx`**

Add a public `/onboarding` route that:
1. Reads `?token=` from the URL. If present, calls `redeemOnboarding(token)` once, then strips the token from the URL (`history.replaceState`).
2. After redeem (or if already has a client session), renders `<OnboardingForm />`.

```tsx
// near other route imports
import OnboardingForm from "./routes/onboarding/OnboardingForm";
import { redeemOnboarding } from "./lib/api";

function OnboardingEntry() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (token) {
      redeemOnboarding(token)
        .catch(() => {})
        .finally(() => {
          url.searchParams.delete("token");
          window.history.replaceState({}, "", url.pathname);
          setReady(true);
        });
    } else {
      setReady(true);
    }
  }, []);
  if (!ready) return null;
  return <OnboardingForm />;
}
```

Register it OUTSIDE `ProtectedRoute` (the magic link redeems its own session):
```tsx
<Route path="/onboarding" element={<OnboardingEntry />} />
```

- [ ] **Step 3: Add the gate inside `ProtectedRoute`**

Extend `ProtectedRoute` so a signed-in client whose `onboardingStatus` is set and not `submitted` is redirected to `/onboarding`. Add `onboardingStatus` to `AuthContext` from the `/api/auth/me` probe (Task 10.1). Gate logic:

```tsx
// inside ProtectedRoute, after the existing checks:
const { onboardingStatus } = useAuth();
if (onboardingStatus && onboardingStatus !== "submitted") {
  return <Navigate to="/onboarding" replace />;
}
```

Critically: a `null`/absent `onboardingStatus` means "not in onboarding" and grants full portal access (protects existing clients like Willis). Only an explicit non-`submitted` status gates.

- [ ] **Step 4: Verify (Playwright, real running app)**

Run the app. As admin, create an invite (Task 11 UI, or via API) and copy the magic link. Open the link in a fresh browser context: confirm it lands on the themed form, not the login page. Fill all 6 steps, upload a file, submit. Confirm the success state. Navigate to `/home`: confirm the gate no longer redirects (status submitted). Take screenshots of: step 1, a file uploaded, the success state.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/App.tsx command-center/app/src/context/AuthContext.tsx command-center/app/functions/api/auth/me.ts
git commit -m "feat(onboarding): route + portal gate"
```

---

### Task 11: Admin Onboarding list screen + nav

**Files:**
- Create: `command-center/app/src/routes/admin/AdminOnboarding.tsx`
- Modify: `command-center/app/src/routes/admin/AdminLayout.tsx`
- Modify: `command-center/app/src/App.tsx`

**Interfaces:**
- Consumes: `adminListOnboarding`, `adminCreateInvite` (Task 7); `Button`, `Badge`/`StatusPill`, `LoadingState`/`EmptyState`/`ErrorState` (`ui/`).
- Produces: `/admin/onboarding` route + nav item.

- [ ] **Step 1: Add nav item**

In `AdminLayout.tsx`, import `ClipboardList` from `lucide-react` and add to `ADMIN_NAV` after Clients:
```typescript
{ to: "/admin/onboarding", label: "Onboarding", icon: ClipboardList },
```

- [ ] **Step 2: Build `AdminOnboarding.tsx`**

Mirror the `AdminClients.tsx` structure (header breadcrumb, `useEffect` fetch with cancel flag, loading/error/empty states, `max-w-[1220px]` container). Render a table of `OnboardingListRow`: Name, Owner email, Status pill (Invited = neutral, In progress = warning, Submitted = positive), Created date. Row click navigates to `/admin/onboarding/<tenantId>`.

Add a "New onboarding" `<Button variant="primary">` in the header that opens a small inline form (name + owner email). On submit, call `adminCreateInvite(name, ownerEmail)`, then show the returned `magicLink` in a read-only field with a "Copy link" button (`navigator.clipboard.writeText`). After creating, refetch the list.

Provide the full component (no placeholders). Status pill mapping:
```tsx
const STATUS: Record<OnboardingStatus, { label: string; tone: "neutral" | "warning" | "positive" }> = {
  invited: { label: "Invited", tone: "neutral" },
  in_progress: { label: "In progress", tone: "warning" },
  submitted: { label: "Submitted", tone: "positive" },
};
```

- [ ] **Step 3: Register the route**

In `App.tsx`, add inside the admin block:
```tsx
<Route path="/admin/onboarding" element={<AdminRoute><AdminOnboarding /></AdminRoute>} />
```

- [ ] **Step 4: Verify (Playwright)**

As admin, open `/admin/onboarding`. Create a new onboarding (name + email), confirm a magic link appears and "Copy link" works. Confirm the new row shows with status Invited. Screenshot the list + the create flow.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/routes/admin/AdminOnboarding.tsx command-center/app/src/routes/admin/AdminLayout.tsx command-center/app/src/App.tsx
git commit -m "feat(onboarding): admin onboarding list + nav"
```

---

### Task 12: Admin Onboarding detail (submission review)

**Files:**
- Create: `command-center/app/src/routes/admin/AdminOnboardingDetail.tsx`
- Modify: `command-center/app/src/App.tsx`

**Interfaces:**
- Consumes: `adminGetOnboarding` (Task 7); `ONBOARDING_STEPS` (Task 2, for labels/order); `Panel`/`PanelHeader`, `Badge`, `Button`, `LoadingState`/`ErrorState`.
- Produces: `/admin/onboarding/:tenantId` route.

- [ ] **Step 1: Build the detail screen**

Fetch `adminGetOnboarding(tenantId)` on mount. Render:
- Header: client name + status pill + created/submitted dates.
- A "Submission" `Panel`: iterate `ONBOARDING_STEPS`, for each field render label + the answer value. For file fields (answer is a `FileRef`), render a download `<a href={signedUrl}>` from the `files` array. Empty answers render a faint "Not provided".

Mirror `AdminClients.tsx` for fetch/loading/error patterns and styling. Provide the full component (no placeholders).

- [ ] **Step 2: Register the route**

```tsx
<Route path="/admin/onboarding/:tenantId" element={<AdminRoute><AdminOnboardingDetail /></AdminRoute>} />
```
Use `useParams()` to read `tenantId`.

- [ ] **Step 3: Verify (Playwright)**

Open a submitted client's detail page. Confirm all answers render with correct labels, the uploaded file downloads via the signed link, and the status pill reads Submitted. Screenshot the detail view.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/routes/admin/AdminOnboardingDetail.tsx command-center/app/src/App.tsx
git commit -m "feat(onboarding): admin submission detail view"
```

---

### Task 13: Stage 1 end-to-end verification + cleanup

**Files:** none (verification only)

- [ ] **Step 1: Full loop test (Playwright, real app)**

1. Admin: `/admin/onboarding` -> New onboarding -> create -> copy magic link.
2. Fresh browser context: open link -> form loads (not login).
3. Fill all 6 steps, upload a file, submit -> success state.
4. Admin: list shows Submitted; detail shows all answers + downloadable file.
5. Existing client (no onboarding row): confirm `/home` still loads, NOT gated.
Capture screenshots for steps 2, 3 (success), and 4 (detail).

- [ ] **Step 2: Typecheck + tests + build**

Run: `cd command-center/app && npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors, all tests pass, build succeeds.

- [ ] **Step 3: Remove the superseded mockups (workspace hygiene)**

The standalone HTML mockups are now superseded by the in-app form. Per the workspace-hygiene rule, remove them:
```bash
git rm mockups/forms/client-intake/variant-a-stepped-wizard.html
```
Leave the apps-script / calendar mockups in place (the calendar is still a deferred separate job). If unsure, ask before deleting.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(onboarding): stage 1 verification, remove superseded intake mockup"
```

---

## Self-Review Notes (author)

- Spec coverage: invite/magic-link (T4/T5/T10), themed 6-step form (T2/T9), autosave (T6 save + T9), uploads to storage + Drive field (T6 upload + T2 fields), admin tab + list + detail (T11/T12), gate that protects existing clients (T10.3), copy/send link (T11), pluggable notify hook (T6 submit). Ops checklist is Plan 2.
- Cross-root validation is duplicated (src + functions) by design; both are tested. Keep `REQUIRED_FIELDS` in sync (noted in code).
- Open verification points flagged inline (real `session.ts` signatures in T5.1, `api()` FormData handling in T7.1, dev-server command in T4.3). These are confirm-then-adjust, not unknowns that block the design.

### Task 2: The setter_dials table

**Files:**
- Create: `command-center/app/supabase/migrations/0027_setter_dials.sql`

- [ ] **Step 1: Re-check the migration number**

Run: `ls command-center/app/supabase/migrations/ | sort | tail -3`
If the max is no longer `0026`, rename accordingly. This numbering has collided before.

- [ ] **Step 2: Read 0026 for conventions**

Read `command-center/app/supabase/migrations/0026_tenant_ga4_property.sql` and match its RLS and grant style exactly. Do not invent a different convention.

- [ ] **Step 3: Write the migration**

```sql
-- Setter Suite: one row per dial. Every per-lead field and every roll-up rate
-- derives from this table. Append-only by design so history is never lost.
create table if not exists public.setter_dials (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  contact_id     text not null,
  opportunity_id text,
  pipeline_name  text,
  stage_name     text,
  dialed_at      timestamptz not null default now(),
  spoke          boolean not null default false,
  outcome        text not null check (outcome in
                   ('booked','not_interested','no_answer','reschedule','bad_lead')),
  note           text,
  tags_applied   jsonb not null default '[]'::jsonb,
  created_by     uuid references public.admin_accounts(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- The board and cockpit both query by tenant then contact.
create index if not exists setter_dials_tenant_contact_idx
  on public.setter_dials (tenant_id, contact_id, dialed_at desc);

-- The metrics roll-up scans a tenant over a date range.
create index if not exists setter_dials_tenant_dialed_idx
  on public.setter_dials (tenant_id, dialed_at desc);

alter table public.setter_dials enable row level security;
-- No policies: every read and write goes through the service client inside
-- Pages Functions, behind the admin session gate. Anon and authenticated
-- roles get nothing.
```

- [ ] **Step 4: Apply it**

Run: `cd command-center/app && npm run db:migrate`
Expected: `0027_setter_dials.sql` reported applied, and it appears in `public._hml_migrations`.

- [ ] **Step 5: Prove it is idempotent**

Run: `npm run db:migrate` again.
Expected: skipped, no error.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/supabase/migrations/0027_setter_dials.sql
git commit -m "feat(setter): add setter_dials, the per-dial event table"
```

---


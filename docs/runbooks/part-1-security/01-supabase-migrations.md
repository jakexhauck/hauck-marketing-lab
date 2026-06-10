# Step 1: Apply the Supabase migrations

Goal: bring the database schema up to migration 0006 so the fixed code (identity model, team sync, login rate limiting) has the tables and columns it expects.

Time: about 10 minutes.

## Manual actions checklist (do these, in this order)

- [ ] 1. Open `https://supabase.com/dashboard` in the browser and sign in
- [ ] 2. Click the client-dashboard project
- [ ] 3. Left sidebar: click **SQL Editor**, then **+ New query**
- [ ] 4. Copy the diagnostic query from section 1.2 below, paste, click **Run**
- [ ] 5. Write down which columns came back **false**
- [ ] 6. If `has_0003` was false: in Claude Code run `! cat client-dashboard/supabase/migrations/0003_admins.sql | pbcopy`, then in the SQL editor clear the box, Cmd+V, **Run**, confirm "Success. No rows returned"
- [ ] 7. If `has_0004` was false: same routine with `0004_ghl_identity_and_test_tenant.sql`
- [ ] 8. If `has_0005` was false: same routine with `0005_activity_read_state.sql`
- [ ] 9. Always: same routine with `0006_security_fixes.sql`
- [ ] 10. Paste and run `select count(*) from public.login_attempts;` and confirm the result is `0`
- [ ] 11. Re-run the diagnostic from action 4 and confirm every column is now **true**
- [ ] 12. Tick the Step 1 box in [00-README.md](00-README.md)

Note: the migrations folder contains 0001, 0003, 0004, 0005, 0006. There is intentionally no 0002 (the old per-client seed became `supabase/templates/client-seed-template.sql`, used only at future client onboarding; never run it now). Details and troubleshooting for every action are below; click paths are in the [Software Guide](../SOFTWARE-GUIDE.md), Recipe A.

## 1.1 Open the SQL Editor

1. Browser: go to `https://supabase.com/dashboard` and sign in.
2. Click the project used by the client dashboard (if there is only one project, that is it).
3. In the left sidebar of icons, hover until you find **SQL Editor** (terminal-prompt icon). Click it.
4. Click **+ New query**. You now have a blank box that runs whatever SQL you paste.

## 1.2 Run the diagnostic first

Paste this into the box and click **Run** (or Cmd+Enter):

```sql
select
  exists (select 1 from information_schema.tables
          where table_schema = 'public' and table_name = 'admins') as has_0003,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'tenant_users'
            and column_name = 'ghl_user_id') as has_0004,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'activity_log'
            and column_name = 'read_at') as has_0005,
  exists (select 1 from information_schema.tables
          where table_schema = 'public' and table_name = 'login_attempts') as has_0006,
  exists (select 1 from public.tenants where slug = 'test-account') as has_test_tenant;
```

You get one row of true/false. Each false tells you which migration below still needs to run. If everything is already true, skip to 1.5.

## 1.3 Copy each migration with pbcopy, never from chat

In the Claude Code session (or any terminal at the repo root `~/Desktop/hauck-marketing-lab`), run the matching command, which puts the file on your clipboard byte-for-byte:

```bash
# only if has_0003 was false:
cat client-dashboard/supabase/migrations/0003_admins.sql | pbcopy

# only if has_0004 was false:
cat client-dashboard/supabase/migrations/0004_ghl_identity_and_test_tenant.sql | pbcopy

# only if has_0005 was false:
cat client-dashboard/supabase/migrations/0005_activity_read_state.sql | pbcopy

# always (this is the new one):
cat client-dashboard/supabase/migrations/0006_security_fixes.sql | pbcopy
```

In Claude Code, prefix with `!` to run them from the prompt, one at a time:
`! cat client-dashboard/supabase/migrations/0006_security_fixes.sql | pbcopy`

## 1.4 Run them in this exact order

For each one: clear the SQL editor box (select all, delete), **Cmd+V**, **Run**, confirm the result says **"Success. No rows returned"**, then move to the next.

1. `0003_admins.sql` (only if has_0003 was false)
2. `0004_ghl_identity_and_test_tenant.sql` (only if has_0004 was false). This also creates the `test-account` tenant row.
3. `0005_activity_read_state.sql` (only if has_0005 was false)
4. `0006_security_fixes.sql` (always; it failed on the first attempt because 0004 was missing)

There is no 0002 to run: the old per-client seed now lives at `supabase/templates/client-seed-template.sql` and is used only at future client onboarding (each client gets a copy with their own values). Nothing in the test phase touches it.

## 1.5 Confirm

Paste and run:

```sql
select count(*) from public.login_attempts;
```

Expected: a result table with one row, `count = 0`. Then re-run the 1.2 diagnostic: every column should now be true.

Optional deeper check:

```sql
select indexname from pg_indexes where tablename = 'tenant_users';
```

Expected to include both `tenant_users_pkey` and `tenant_users_tenant_ghl_uid`.

## Troubleshooting (errors already seen on this database)

| Error | Cause | Fix |
|---|---|---|
| `42703: column "ghl_user_id" does not exist` running 0006 | 0004 was never applied | Run 0004 first, then re-run 0006 |
| `42P16: column "user_id" is in a primary key` running 0004 | Ordering bug in the original 0004 (tried to drop NOT NULL before dropping the PK) | Already fixed in the repo file on 2026-06-10; re-copy with pbcopy and re-run |
| `42601: syntax error at or near "test"` | SQL was copied from a chat/terminal window and a long comment line wrapped, losing its `--` prefix | Always copy with the pbcopy commands in 1.3 |
| Anything else | Unknown | Stop. Paste the exact error to Claude before touching anything |

When 1.5 passes, check the Step 1 box in [00-README.md](00-README.md) and continue to [02-cloudflare-env.md](02-cloudflare-env.md).

-- 0051: agency logins sign in with a username, not an email address.
--
-- admin_accounts (0008) used email as the login handle. For a hired cold caller
-- that is friction with no purpose: he has no agency mailbox, the address is
-- long, and it is one more thing to get wrong on a phone screen at 8am. He gets
-- a name and a password.
--
-- email stays on the table but becomes OPTIONAL and stops being the handle. It
-- is now just a contact detail, so an account can exist without one.
--
-- Backfill derives a username from the first word of the name ("Jake Hauck" ->
-- "jake"), stripped to letters and digits. Collisions get a numeric suffix, so
-- two Jakes become jake and jake2 rather than a failed migration.
--
-- Run AFTER 0001..0050. Idempotent: safe to re-run.

alter table public.admin_accounts
  add column if not exists username text;

-- Email is no longer required. The old unique index on lower(email) stays, and
-- Postgres treats NULLs as distinct, so any number of accounts may have none.
alter table public.admin_accounts
  alter column email drop not null;

-- Backfill only rows that have no username yet, so a re-run cannot rename
-- anyone who has since chosen one.
with candidates as (
  select
    id,
    coalesce(
      nullif(regexp_replace(lower(split_part(name, ' ', 1)), '[^a-z0-9]', '', 'g'), ''),
      -- A name with nothing usable in it falls back to the email's local part,
      -- then to "user", so every row ends up with something to type.
      nullif(regexp_replace(lower(split_part(coalesce(email, ''), '@', 1)), '[^a-z0-9]', '', 'g'), ''),
      'user'
    ) as base,
    row_number() over (
      partition by coalesce(
        nullif(regexp_replace(lower(split_part(name, ' ', 1)), '[^a-z0-9]', '', 'g'), ''),
        nullif(regexp_replace(lower(split_part(coalesce(email, ''), '@', 1)), '[^a-z0-9]', '', 'g'), ''),
        'user'
      )
      order by created_at
    ) as n
  from public.admin_accounts
  where username is null
)
update public.admin_accounts a
set username = case when c.n = 1 then c.base else c.base || c.n::text end
from candidates c
where a.id = c.id;

-- The handle, matched case-insensitively: "Marcus" and "marcus" are one login,
-- not two.
create unique index if not exists admin_accounts_username
  on public.admin_accounts (lower(username));

comment on column public.admin_accounts.username is
  'The login handle. Case-insensitive and unique. Replaced email as the thing typed into the sign-in box (0051); email is now an optional contact detail.';

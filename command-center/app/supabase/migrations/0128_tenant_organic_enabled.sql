-- Organic (the website-leads page) is off for new clients (Jake, 2026-09-22).
--
-- The page used to appear for any client whose GHL sub-account had a pipeline
-- named "Organic". New sub-accounts can carry that pipeline from the snapshot,
-- so the pipeline alone no longer decides it: the client also needs this flag.
--
-- Default false, so every client created from now on goes without. Every client
-- that exists today keeps what it had, except the Hauck Marketing test client,
-- which was created today to walk the new-client path.
--
-- Idempotent: safe to re-run. The backfill only runs when the column is new, so
-- a re-run never flips a client somebody has since switched off.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenants'
      and column_name = 'organic_enabled'
  ) then
    alter table public.tenants
      add column organic_enabled boolean not null default false;
    update public.tenants set organic_enabled = true where slug <> 'hauck-marketing';
  end if;
end $$;

comment on column public.tenants.organic_enabled is
  'Shows the Organic (website leads) page, when the client also has an Organic GHL pipeline. Default false: new clients do not get it.';

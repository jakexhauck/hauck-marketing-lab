-- 0058: the cold caller's shelf, and which script a dial was made from.
--
-- Two problems, one table.
--
-- The first: there was exactly one dialing script (0048, cold_call_script,
-- pinned to a single row). Jake runs four variations of the same pitch against
-- each other, and one row cannot hold four scripts, let alone say which of them
-- booked anything. So scripts become rows, and `cold_call_dials.script_id` says
-- which one was on screen when the outcome was pressed. The booking rate per
-- variation is then DERIVED from recorded dials, exactly as the tracker's counts
-- are, and there is no cell anywhere for anyone to type a favourite script's
-- numbers into.
--
-- The second: a caller mid-call needs more than the pitch. Objection handling,
-- voicemail wording, whatever Jake decides next month. Those are the same thing
-- as a script (a named piece of sanitized HTML somebody reads while on the
-- phone) minus the one job a script has, which is being the unit of the test.
-- So they share the table and `kind` tells them apart. `category` is the heading
-- Jake types himself, so adding "Voicemail" is his job and not a migration.
--
-- The sanitizer boundary is inherited from 0044/0048 unchanged: `html` may only
-- ever be written through functions/lib/setterScript.ts, and the panel renders
-- it verbatim on that guarantee.
--
-- Retiring a variation is `archived_at`, never a delete. The dials that tested
-- it are the whole point of having run it, and `on delete set null` would quietly
-- detach them from the thing being measured.
--
-- Run AFTER 0001..0057. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated in
-- _middleware.ts, role gated in functions/lib/adminRoles.ts).

create table if not exists public.cold_call_assets (
  id          uuid primary key default gen_random_uuid(),

  -- 'script' is a dialing variation and can be attached to a dial.
  -- 'asset'  is anything else the caller reads, filed under `category`.
  kind        text not null check (kind in ('script', 'asset')),

  -- Owner-named heading, for assets only. Always '' for a script: a variation
  -- belongs to the test, not to a folder.
  category    text not null default '',

  name        text not null,
  html        text not null default '',

  -- Jake's order, not the database's. Ties break on created_at.
  sort_order  integer not null default 0,

  -- Retired: hidden from the caller's picker, still counted in its own history.
  archived_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.admin_accounts(id) on delete set null
);

alter table public.cold_call_assets enable row level security;
-- No policies: service-role only, same as cold_call_script and cold_call_dials.

-- Every read is "the live ones, in Jake's order", for one kind or both.
create index if not exists cold_call_assets_kind_idx
  on public.cold_call_assets (kind, sort_order, created_at)
  where archived_at is null;

-- The assets page groups by the heading Jake typed.
create index if not exists cold_call_assets_category_idx
  on public.cold_call_assets (category, sort_order)
  where kind = 'asset' and archived_at is null;

comment on table public.cold_call_assets is
  'Everything a cold caller reads: dialing script variations (kind=script, the unit of the A/B test) and reference documents under owner-named categories (kind=asset). html is sanitized in functions/lib/setterScript.ts before every write.';

comment on column public.cold_call_assets.archived_at is
  'Retired rather than deleted. The dials that tested a variation are why it was run; deleting it would detach them from the thing being measured.';

-- Which variation was on screen when the outcome was pressed.
--
-- Nullable, and it must stay nullable: every dial recorded before today has no
-- answer, and inventing one would put words in a caller's mouth on the one table
-- whose entire purpose is that its numbers cannot be fabricated.
--
-- `on delete set null` is the safety net for a hard delete that should not
-- happen (archiving is the supported route); the dial itself survives, because a
-- call was still made.
alter table public.cold_call_dials
  add column if not exists script_id uuid
    references public.cold_call_assets(id) on delete set null;

comment on column public.cold_call_dials.script_id is
  'The dialing variation on screen when this outcome was pressed. Null for dials made before variations existed, or with no script selected. Never asserted by the browser without the server checking it names a live script.';

-- "How did each variation do", which is the report this column exists for.
create index if not exists cold_call_dials_script_idx
  on public.cold_call_dials (script_id, outcome)
  where script_id is not null;

-- Carry the single 0048 script forward as the first variation, so a script Jake
-- has already written is not silently replaced by an empty list. Guarded three
-- ways: only if that table exists, only if it holds something, and only once.
do $$
begin
  if to_regclass('public.cold_call_script') is not null
     and not exists (select 1 from public.cold_call_assets where kind = 'script')
  then
    insert into public.cold_call_assets (kind, name, html, sort_order)
    select 'script', 'Original', s.html, 0
      from public.cold_call_script s
     where s.id = 'agency'
       and coalesce(btrim(s.html), '') <> '';
  end if;
end $$;

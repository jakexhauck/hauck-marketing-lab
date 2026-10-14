-- 0075: headings inside the sales playbook's three columns.
--
-- 0074 gave each column a flat list of prompts. A real discovery section is not
-- flat: it is "the situation", then "the money", then "who decides". Jake asked
-- to be able to say so.
--
-- A category is a ROW, not a string typed onto each prompt the way the cold
-- call shelf files its assets (0058, cold_call_assets.category). The difference
-- is the point: a heading you can rename once and move as a block is what was
-- asked for, and a free-typed string is neither. A typo silently splits one
-- category into two, and there is nothing to reorder.
--
-- Scoped to a section. Discovery's headings and Objections' headings do not
-- overlap in practice ("the money" belongs to one, "price" to the other), and a
-- shared list would offer every column's headings in every column's picker.
--
-- category_id is ON DELETE SET NULL, matching admin_task_categories (0063).
-- Deleting a heading must never take the questions under it off the call: they
-- fall loose to the bottom of their column, visibly, where they can be refiled.
--
-- Run AFTER 0001..0074. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated in
-- _middleware.ts, owner gated in the handler).

create table if not exists public.sales_playbook_categories (
  id          uuid primary key default gen_random_uuid(),

  -- Which column the heading belongs to. Same three as the prompts, checked
  -- the same way.
  section     text not null check (section in ('discovery', 'pitch', 'objections')),

  name        text not null,

  -- Jake's order within its section. Ties break on id.
  sort_order  integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.admin_accounts(id) on delete set null
);

create index if not exists sales_playbook_categories_section_idx
  on public.sales_playbook_categories (section, sort_order, created_at);

alter table public.sales_playbook_categories enable row level security;
-- No policies: service-role only, same as sales_playbook_items.

-- The link. Null is the honest default and stays the default: every prompt
-- seeded by 0074 is unfiled until Jake files it, and a column with no
-- categories yet reads exactly as it did before this migration.
alter table public.sales_playbook_items
  add column if not exists category_id uuid
    references public.sales_playbook_categories(id) on delete set null;

create index if not exists sales_playbook_items_category_idx
  on public.sales_playbook_items (category_id);

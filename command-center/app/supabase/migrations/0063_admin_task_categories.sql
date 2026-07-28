-- 0063: categories for the admin Tasks checklist.
--
-- The checklist was one flat list, which is fine at ten rows and useless at
-- sixty. Categories are the axis that was missing: client work vs sales vs
-- admin, filterable, so the page can show one kind of work at a time.
--
-- A table rather than an enum or a hardcoded list because the whole point is
-- that the operator adds and renames these themselves. An enum would need a
-- migration per category, which is the opposite of that.
--
-- `color` is a token name (indigo, sky, ...), not a hex value. The console maps
-- it to the theme's own tints so a category reads correctly in light AND dark;
-- a stored hex would be right in one of them and wrong in the other. The check
-- constraint keeps the stored value inside the set the UI can actually render,
-- so an unknown token can never reach the page and paint an unstyled pill.
--
-- `admin_tasks.category_id` is nullable with ON DELETE SET NULL: uncategorised
-- is a real, expected state, and deleting a category must never delete the work
-- filed under it. The tasks survive and fall back to Uncategorised.
--
-- Nothing is seeded. An empty list is correct here: these are the operator's
-- own categories, and inventing five would just be five rows to delete.
--
-- Run AFTER 0001..0062. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

create table if not exists public.admin_task_categories (
  id         uuid primary key default gen_random_uuid(),

  name       text not null,

  -- A palette token, resolved to theme tints in src/lib/taskCategories.ts.
  color      text not null default 'indigo'
             check (color in ('indigo','sky','green','amber','rose','violet','teal','slate')),

  -- Manual order in the filter chip strip and the row dropdown. New categories
  -- are appended (max + 1) by the POST endpoint.
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_task_categories enable row level security;
-- No policies: service-role only, same as every other admin-owned table here.

-- The chip strip reads the whole list in display order on every page load.
create index if not exists admin_task_categories_sort_idx
  on public.admin_task_categories (sort_order, created_at);

-- Two categories with the same name are indistinguishable in the dropdown, so
-- the name is unique case-insensitively. An expression index rather than a
-- plain unique constraint because "Sales" and "sales" are the same category to
-- the person reading the page.
create unique index if not exists admin_task_categories_name_key
  on public.admin_task_categories (lower(name));

alter table public.admin_tasks
  add column if not exists category_id uuid
  references public.admin_task_categories(id) on delete set null;

-- Filtering the checklist to one category.
create index if not exists admin_tasks_category_idx
  on public.admin_tasks (category_id);

comment on table public.admin_task_categories is
  'Operator-managed categories for the admin Tasks checklist. Added, renamed, recoloured and deleted from the console (Manage categories); nothing here is seeded or hardcoded. Deleting one leaves its tasks in place as uncategorised.';

comment on column public.admin_task_categories.color is
  'Palette token, not a hex value: the console resolves it to theme tints so the pill reads correctly in light and dark.';

comment on column public.admin_tasks.category_id is
  'Nullable on purpose: uncategorised is a real state, and ON DELETE SET NULL means removing a category never removes the work filed under it.';

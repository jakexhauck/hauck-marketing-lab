-- 0082: answers that travel forward through a sales call.
--
-- 0074 gave the playbook prompts and 0075 gave it headings. Both assumed every
-- row was a question and that what Jake typed under one was scratch, read once
-- and thrown away.
--
-- A real discovery does not work like that. He asks how many jobs they ran last
-- month, and forty minutes later has to say "so for you, hitting THIRTY installs
-- a month consistently, and adding FIFTY-NINE THOUSAND a month in profit" with
-- both numbers already in his head. Until now he held them there.
--
-- So a row gains four things:
--
--   kind        question | script | calc. A question is asked, a script line is
--               read out (and keeps its line breaks), a calc is a number worked
--               out from other answers. One table rather than three, because
--               they interleave in one column and "move this above that" would
--               otherwise be a cross-table sort.
--
--   answer_key  what the answer is filed under, so {installs} in a later
--               prompt draws what was typed here. Lowercase, letters, digits
--               and underscores, which is exactly what the formula parser can
--               read. Unique among LIVE rows: two rows filing under one key
--               would make {goal} mean whichever the query returned first.
--
--   formula     calc rows only. Arithmetic over other keys, evaluated in the
--               browser by functions/lib/callFormula.ts, which can express
--               four operators and brackets and nothing else. There is no eval
--               anywhere near it.
--
--   format      how a calc's number is drawn: money or number.
--
-- Everything defaults to what a 0074 row already was, so every existing prompt
-- stays a question with no key and no sum, unchanged on the call.
--
-- prompt stays PLAIN TEXT and is still rendered as text everywhere. Script rows
-- keep newlines, which is the only thing that changes about the trust boundary,
-- and a newline is not markup. cleanScript caps them at 1200 characters and
-- flattens every other control character exactly as cleanPrompt does.
--
-- Run AFTER 0001..0081. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated in
-- _middleware.ts, owner gated in the handler).

alter table public.sales_playbook_items
  add column if not exists kind text not null default 'question';

-- Added separately from the column so a re-run does not trip over its own
-- constraint, and named so it can be found again.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_playbook_items_kind_check'
  ) then
    alter table public.sales_playbook_items
      add constraint sales_playbook_items_kind_check
      check (kind in ('question', 'script', 'calc'));
  end if;
end $$;

-- Null, not '', for a row that files nothing. The partial unique index below
-- depends on it: in Postgres many nulls coexist happily in a unique index and
-- many empty strings do not, so '' would let exactly one unkeyed row exist.
alter table public.sales_playbook_items
  add column if not exists answer_key text;

alter table public.sales_playbook_items
  add column if not exists formula text not null default '';

alter table public.sales_playbook_items
  add column if not exists format text not null default 'number';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_playbook_items_format_check'
  ) then
    alter table public.sales_playbook_items
      add constraint sales_playbook_items_format_check
      check (format in ('money', 'number'));
  end if;
end $$;

-- The shape of a key, enforced at the bottom as well as in cleanAnswerKey.
-- A key that got in by way of a hand-written PATCH would be a key no formula
-- could ever name, which is a row that silently does nothing.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_playbook_items_answer_key_check'
  ) then
    alter table public.sales_playbook_items
      add constraint sales_playbook_items_answer_key_check
      check (answer_key is null or answer_key ~ '^[a-z][a-z0-9_]{0,23}$');
  end if;
end $$;

-- One live row per key. Retired rows are excluded on purpose: a question pulled
-- in March should not stop its replacement from taking the same key in June,
-- and nothing reads a retired row's key anyway.
create unique index if not exists sales_playbook_items_answer_key_idx
  on public.sales_playbook_items (answer_key)
  where answer_key is not null and archived_at is null;

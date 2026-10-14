-- 0085: the Objection handling column goes.
--
-- It shipped in 0074 with seven placeholder objections written to give the page
-- something to draw. Nobody ever rewrote them, because the objections Jake
-- actually gets are not the ones a migration guessed at. Two columns of his own
-- script and one column of invented lines is a column you read past on every
-- call, which is worse than not having it.
--
-- The COLUMN is removed in code (functions/lib/salesPlaybook.ts), which is what
-- makes it stop being drawn and stop being a section a row can be posted under.
-- This migration only clears the rows that were left pointing at it, so they
-- are not sitting in the table as data nothing can reach.
--
-- The check constraints on both tables still ALLOW 'objections'. Deliberate:
-- tightening them would make putting the column back a migration instead of one
-- line in an array, and there is nothing dangerous about a value no code can
-- produce. isPlaybookSection is the gate, and it now refuses it.
--
-- Anything Jake had edited in that column would be lost, so this refuses to run
-- if he ever touched one of those seven rows. He never did, but a migration
-- that deletes work is one that should have to prove it is not.
--
-- Run AFTER 0084. Idempotent: safe to re-run, and does nothing on the second.

do $mig$
begin
  if exists (
    select 1 from public.sales_playbook_items
     where section = 'objections' and updated_by is not null
  ) then
    raise notice '0085 skipped: an objections prompt has been edited, so it is not a placeholder';
    return;
  end if;

  delete from public.sales_playbook_items where section = 'objections';
  delete from public.sales_playbook_categories where section = 'objections';
end $mig$;

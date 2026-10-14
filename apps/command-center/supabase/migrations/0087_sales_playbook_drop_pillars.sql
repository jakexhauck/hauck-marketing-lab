-- 0087: the four pillar blocks come out of the Pitch column.
--
-- 0084 loaded the pitch as Jake had written it, four pillars included: custom
-- branded video ads, pre-qualification, the VSL, and self-booked estimates.
-- Eighteen lines across four headings, and he does not want to read them off a
-- screen. The pitch he actually gives runs backstory, check in, investment,
-- price drop.
--
-- RETIRED, not deleted. archived_at takes them off both pages immediately and
-- leaves them under "Show retired lines", one click from being put back. This
-- is eighteen paragraphs of Jake's own writing; the app's own rule is to retire
-- a line rather than delete it, and there is no reason to make an exception for
-- the eighteen most expensive ones on the page.
--
-- The four HEADINGS are deleted, because an empty heading draws on both pages
-- and there is nothing under it to explain why. category_id is ON DELETE SET
-- NULL, so a pillar line put back later returns unfiled at the bottom of Pitch
-- rather than vanishing, and can be refiled from there.
--
-- Guarded on the headings still existing, so a re-run does nothing.
--
-- Run AFTER 0086. Idempotent.
-- Reached only via the service-role client in Functions.

do $mig$
declare
  pillar_ids uuid[];
begin
  select array_agg(id) into pillar_ids
    from public.sales_playbook_categories
   where section = 'pitch'
     and name in (
       'Pillar 1: custom branded video ads',
       'Pillar 2: pre-qualification',
       'Pillar 3: VSL',
       'Pillar 4: self-booked estimates'
     );

  if pillar_ids is null then
    return;
  end if;

  update public.sales_playbook_items
     set archived_at = now(),
         updated_at = now()
   where category_id = any(pillar_ids)
     and archived_at is null;

  delete from public.sales_playbook_categories where id = any(pillar_ids);
end $mig$;

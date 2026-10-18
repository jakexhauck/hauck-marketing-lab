-- 0171: the GHL map follows docs/ghl-client-setup-checklist.md (Jake, 2026-10-18).
--
-- Two new boxes on the GHL graph need their Director tasks: "Calendars" (node
-- cal) goes right after Phone system, "Publish + test" (node test, Jake's) goes
-- right after Jake review. Each lands in the stage its neighbour sits in today,
-- so a stage Jake renamed or reordered on the Director still gets it in the
-- right place. The CAPI box was renamed, so its task follows, but only if Jake
-- has not renamed it himself. Idempotent.

do $$
declare
  anchor record;
begin
  if not exists (select 1 from public.agent_sop_tasks where agent = 'ghl' and node_id = 'cal') then
    select stage_id, position into anchor from public.agent_sop_tasks where agent = 'ghl' and node_id = 'phone';
    if found then
      update public.agent_sop_tasks set position = position + 1
        where stage_id = anchor.stage_id and position > anchor.position;
      insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id)
        values ('ghl', anchor.stage_id, anchor.position + 1, 'Calendars', 'agent', 'cal');
    end if;
  end if;

  if not exists (select 1 from public.agent_sop_tasks where agent = 'ghl' and node_id = 'test') then
    select stage_id, position into anchor from public.agent_sop_tasks where agent = 'ghl' and node_id = 'review';
    if found then
      update public.agent_sop_tasks set position = position + 1
        where stage_id = anchor.stage_id and position > anchor.position;
      insert into public.agent_sop_tasks (agent, stage_id, position, name, owner, node_id)
        values ('ghl', anchor.stage_id, anchor.position + 1, 'Publish + test', 'jake', 'test');
    end if;
  end if;

  update public.agent_sop_tasks set name = 'CAPI + Meta', updated_at = now()
    where agent = 'ghl' and node_id = 'capi' and name = 'CAPI workflows';
end $$;

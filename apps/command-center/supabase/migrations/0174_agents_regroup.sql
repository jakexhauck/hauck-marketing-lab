-- 0174: the agents regroup (Jake, 2026-10-20; docs/build-plans/four-agents-and-handoffs.md).
--
-- Inside a client the agents are now the Customer Success Manager ('csm'),
-- Market Research, Ads and GHL. The Manager ('manager') is agency only.
-- Creative and Landing Page folded into Ads; Reporting and the per-client
-- Manager into the CSM. Nothing is deleted except Brief rows whose text is
-- first appended to the section that took them over.
--
-- scripts/agents-regroup-counts.mjs runs before and after: every table's total
-- stays the same (client_briefs drops by the merged rows only).

begin;

-- 1. The old checks go first, so the rows can move.
alter table public.agent_chats drop constraint if exists agent_chats_agent_check;
alter table public.agent_items drop constraint if exists agent_items_agent_check;
alter table public.agent_items drop constraint if exists agent_items_from_agent_check;
alter table public.client_briefs drop constraint if exists client_briefs_section_check;
alter table public.client_briefs drop constraint if exists client_briefs_updated_by_check;
alter table public.client_tasks drop constraint if exists client_tasks_owner_check;

-- 2. Chats, cards and lessons. A client's Manager becomes its CSM; the
-- agency's Manager (tenant null) stays.
update public.agent_chats set agent = 'ads' where agent in ('creative', 'landing');
update public.agent_chats set agent = 'csm' where agent = 'reporting' or (agent = 'manager' and tenant_id is not null);

update public.agent_items set agent = 'ads' where agent in ('creative', 'landing');
update public.agent_items set agent = 'csm' where agent = 'reporting' or (agent = 'manager' and tenant_id is not null);
update public.agent_items set from_agent = 'ads' where from_agent in ('creative', 'landing');
update public.agent_items set from_agent = 'csm' where from_agent = 'reporting' or (from_agent = 'manager' and tenant_id is not null);

update public.agent_lessons set agent = 'ads' where agent in ('creative', 'landing');
update public.agent_lessons set agent = 'csm' where agent = 'reporting' or (agent = 'manager' and tenant_id is not null);

-- Four Mega Brain lessons were about one client each, or the CSM's craft;
-- they moved in the vault with this migration, and their mirror rows follow.
update public.agent_lessons set scope = 'client', agent = 'csm',
       tenant_id = (select id from public.tenants where slug = 'willis-windows')
 where id = 'l-defe1e1e' and exists (select 1 from public.tenants where slug = 'willis-windows');
update public.agent_lessons set scope = 'client', agent = 'csm',
       tenant_id = (select id from public.tenants where slug = 'comfort-wizards-llc')
 where id in ('l-376bd552', 'l-202cb56a') and exists (select 1 from public.tenants where slug = 'comfort-wizards-llc');
update public.agent_lessons set scope = 'agent', agent = 'csm', tenant_id = null where id = 'l-3fb7005d';

-- Request messages name the agent that asked.
update public.agent_messages m
   set meta = jsonb_set(m.meta, '{fromAgent}', to_jsonb(
         case when m.meta->>'fromAgent' in ('creative', 'landing') then 'ads' else 'csm' end))
  from public.agent_chats c
 where c.id = m.chat_id
   and (m.meta->>'fromAgent' in ('creative', 'landing', 'reporting')
        or (m.meta->>'fromAgent' = 'manager' and c.tenant_id is not null));

-- 3. Director tasks.
update public.client_tasks set owner = 'ads' where owner in ('creative', 'landing');
update public.client_tasks set owner = 'csm' where owner in ('reporting', 'manager');
update public.client_tasks set done_by = 'agent:ads' where done_by in ('agent:creative', 'agent:landing');
update public.client_tasks set done_by = 'agent:csm' where done_by in ('agent:reporting', 'agent:manager');
update public.client_tasks set name = 'Monthly client report cycle starts'
 where name = 'Reporting Agent starts the monthly cycle';
update public.client_tasks set state = 'cut', reason = 'Conversion assets retired', done_by = null, done_at = null
 where key like '%conversion-assets-created%' and state <> 'done';

-- 4. The Brief. Creative and Landing Page text goes under the Ads section,
-- Reporting under Status (the Manager's section, renamed csm). A merged row is
-- deleted only after its text is in the section that took it over.
insert into public.client_briefs (tenant_id, section, body, version, updated_by)
select distinct b.tenant_id, 'ads', '', 1, 'jake'
  from public.client_briefs b
 where b.section in ('creative', 'landing') and btrim(b.body) <> ''
   and not exists (select 1 from public.client_briefs a where a.tenant_id = b.tenant_id and a.section = 'ads');

insert into public.client_briefs (tenant_id, section, body, version, updated_by)
select distinct b.tenant_id, 'manager', '', 1, 'jake'
  from public.client_briefs b
 where b.section = 'reporting' and btrim(b.body) <> ''
   and not exists (select 1 from public.client_briefs a where a.tenant_id = b.tenant_id and a.section = 'manager');

update public.client_briefs a
   set body = btrim(a.body || coalesce((
         select string_agg(
                  E'\n\n## ' || case o.section when 'creative' then 'Creative' else 'Landing pages' end || E'\n' || btrim(o.body),
                  '' order by o.section)
           from public.client_briefs o
          where o.tenant_id = a.tenant_id and o.section in ('creative', 'landing') and btrim(o.body) <> ''), '')),
       version = a.version + 1
 where a.section = 'ads'
   and exists (select 1 from public.client_briefs o where o.tenant_id = a.tenant_id and o.section in ('creative', 'landing') and btrim(o.body) <> '');

update public.client_briefs a
   set body = btrim(a.body || E'\n\n## Reporting\n' || btrim(o.body)),
       version = a.version + 1
  from public.client_briefs o
 where a.section = 'manager' and o.tenant_id = a.tenant_id and o.section = 'reporting' and btrim(o.body) <> '';

delete from public.client_briefs where section in ('creative', 'landing', 'reporting');
update public.client_briefs set section = 'csm' where section = 'manager';
update public.client_briefs set updated_by = 'ads' where updated_by in ('creative', 'landing');
update public.client_briefs set updated_by = 'csm' where updated_by in ('reporting', 'manager');

-- 5. The new checks.
alter table public.agent_chats add constraint agent_chats_agent_check
  check (agent in ('manager','csm','research','ads','ghl'));
alter table public.agent_chats add constraint agent_chats_manager_agency_check
  check (agent <> 'manager' or tenant_id is null);
alter table public.agent_items add constraint agent_items_agent_check
  check (agent in ('manager','csm','research','ads','ghl'));
alter table public.agent_items add constraint agent_items_manager_agency_check
  check (agent <> 'manager' or tenant_id is null);
alter table public.agent_items add constraint agent_items_from_agent_check
  check (from_agent in ('csm','research','ads','ghl'));
alter table public.client_briefs add constraint client_briefs_section_check
  check (section in ('client','csm','onboarding-call','launch-call','research','ads','ghl'));
alter table public.client_briefs add constraint client_briefs_updated_by_check
  check (updated_by in ('jake','csm','research','ads','ghl'));
alter table public.client_tasks add constraint client_tasks_owner_check
  check (owner in ('client','jake','csm','research','ads','ghl'));

commit;

-- 0157: every client reports through the Marketplace app (Jake, 2026-10-12).
-- The workflow webhooks in the snapshot posted to dash.hauckmarketing.com,
-- which no longer serves, so a client left on 'workflow' had its app events
-- dropped and nothing arriving in their place. New clients start on 'app'.
-- The agency's own sub-account (hauck-marketing) is not a client and keeps
-- 'workflow', so its cold SMS traffic is not processed as client activity.
alter table public.tenants alter column ghl_event_source set default 'app';

update public.tenants
   set ghl_event_source = 'app'
 where ghl_event_source <> 'app'
   and slug <> 'hauck-marketing';

-- 0178: the Mission Control brief's structured pages (Jake, 2026-10-22).
-- docs/build-plans/mission-control-brief.md.
--
-- Market Research and Ads are typed JSON, one row per (client, page), written
-- whole by the owning agent through POST /api/agent-runner/brief-page, which
-- takes the page from the agent's chat on the server. version is the lock, as
-- in 0168: a save names the version it read and bumps it by one; an older one
-- is refused (409) with the current row. Service role only.

create table if not exists public.client_brief_pages (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  page        text not null check (page in ('research', 'ads')),
  data        jsonb not null default '{}'::jsonb,
  version     integer not null default 1 check (version >= 1),
  updated_by  text not null check (updated_by in ('jake', 'research', 'ads')),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, page)
);

alter table public.client_brief_pages enable row level security;

-- The touch function is 0166's.
drop trigger if exists client_brief_pages_touch on public.client_brief_pages;
create trigger client_brief_pages_touch before update on public.client_brief_pages
  for each row execute function public.touch_agent_row();

-- The Market Research tasks joined the Client Fulfillment map (agentSops.ts,
-- "ads + creatives" box). A client seeded before then gets them here, once,
-- after its existing ads tasks. New clients get them from the seed.
insert into public.client_tasks (tenant_id, key, phase, owner, name, position, source_node, state, created_by)
select t.tenant_id, v.key, 'adsbuild', v.owner, v.name, v.position, 'adsbuild', 'todo', 'seed'
from (select distinct tenant_id from public.client_tasks) t
cross join (values
  ('adsbuild:market-size-and-zip-population', 'research', 'Market Size And ZIP Population', 4),
  ('adsbuild:competitors-on-meta', 'research', 'Competitors On Meta', 5),
  ('adsbuild:client-and-competitor-websites', 'research', 'Client And Competitor Websites', 6),
  ('adsbuild:google-reviews-pulled', 'research', 'Google Reviews Pulled', 7),
  ('adsbuild:pain-points-extracted', 'research', 'Pain Points Extracted', 8),
  ('adsbuild:research-approved', 'jake', 'Research Approved', 9)
) as v (key, owner, name, position)
on conflict (tenant_id, key) do nothing;

-- Market Research v2 (Jake, 2026-10-22; docs/build-plans/market-research-v2.md).
-- The page is built on competitor Google reviews now, so the research tasks
-- 0178 seeded follow its parts. agentSops.ts holds the same list for new
-- clients. A task keeps its state: renamed in place, keys and anything waiting
-- on them moved with it. Competitors On Meta has no part any more: cut, unless
-- it was already done.

with renames (old_key, new_key, new_name, pos) as (values
  ('adsbuild:market-size-and-zip-population', 'adsbuild:competitors-and-offers', 'Competitors And Offers', 4),
  ('adsbuild:google-reviews-pulled', 'adsbuild:google-reviews-pulled', 'Google Reviews Pulled', 5),
  ('adsbuild:pain-points-extracted', 'adsbuild:pain-points-goals-and-benefits', 'Pain Points, Goals And Benefits', 6),
  ('adsbuild:client-and-competitor-websites', 'adsbuild:angles-offers-and-funnel', 'Angles, Offers And Funnel', 7),
  ('adsbuild:research-approved', 'adsbuild:research-approved', 'Research Approved', 8)
)
update public.client_tasks t
set key = r.new_key, name = r.new_name, position = r.pos
from renames r
where t.key = r.old_key
  and not exists (select 1 from public.client_tasks x where x.tenant_id = t.tenant_id and x.key = r.new_key and r.new_key <> r.old_key);

update public.client_tasks set waits_on = array_replace(waits_on, 'adsbuild:market-size-and-zip-population', 'adsbuild:competitors-and-offers') where 'adsbuild:market-size-and-zip-population' = any(waits_on);
update public.client_tasks set waits_on = array_replace(waits_on, 'adsbuild:pain-points-extracted', 'adsbuild:pain-points-goals-and-benefits') where 'adsbuild:pain-points-extracted' = any(waits_on);
update public.client_tasks set waits_on = array_replace(waits_on, 'adsbuild:client-and-competitor-websites', 'adsbuild:angles-offers-and-funnel') where 'adsbuild:client-and-competitor-websites' = any(waits_on);

update public.client_tasks set state = 'cut' where key = 'adsbuild:competitors-on-meta' and state <> 'done';

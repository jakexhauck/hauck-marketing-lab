-- 0181 renamed Client And Competitor Websites to Angles, Offers And Funnel in
-- place, so a client that had ticked the old one showed the new one done
-- (one client, 2026-10-22). That work was the v1 website notes, not angles:
-- back to todo.
update public.client_tasks
set state = 'todo', done_by = null, done_at = null
where key = 'adsbuild:angles-offers-and-funnel' and state = 'done' and done_at < '2026-10-23';

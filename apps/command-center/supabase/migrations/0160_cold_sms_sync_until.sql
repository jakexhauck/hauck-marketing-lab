-- 0160: first-text sync reads forward from an instant, not a day (0159).
--
-- Re-reading the whole of today on every board load cost five export pages and
-- ten seconds once a day held two thousand texts. synced_until is the instant
-- the last complete read ran up to; each load reads only what came after it.
-- Seeded from 0159's day watermark (the start of the day after it).

alter table public.cold_sms_sync_state add column if not exists synced_until timestamptz;

update public.cold_sms_sync_state
   set synced_until = (synced_through + 1)::timestamp at time zone 'UTC'
 where synced_until is null
   and synced_through is not null;

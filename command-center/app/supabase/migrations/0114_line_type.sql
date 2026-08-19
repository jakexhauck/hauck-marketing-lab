-- Mobile or landline, per scraped lead.
--
-- Derived at scrape time from NANPA's free public NPA-NXX block data (see
-- lead-scraper/linetype.py), so it costs nothing per lookup. Stored rather than
-- computed at read time because the block map lives with the scraper, not in the
-- database, and both send paths need to read the answer cheaply.
--
-- Values: 'wireless' | 'landline' | 'unknown'. Existing rows are backfilled by
-- lead-scraper/backfill_line_type.py; anything still NULL is treated as not-mobile
-- by the send paths, so a missed backfill can never leak a landline onto a list.

alter table public.cold_sms_outreach_numbers
  add column if not exists line_type text;

-- The send paths ask for one thing: the mobiles that are still pending. A partial
-- index on exactly that keeps the list query off a full scan as the book grows.
create index if not exists cold_sms_outreach_numbers_wireless_pending_idx
  on public.cold_sms_outreach_numbers (icp_score desc, id)
  where line_type = 'wireless' and send_status = 'pending';

comment on column public.cold_sms_outreach_numbers.line_type is
  'wireless | landline | unknown, from the NANPA NPA-NXX block map. Block level and blind to number portability, so roughly 70-80% accurate.';

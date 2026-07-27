-- 0059: who the prospect actually is.
--
-- The lead book was built for a person: first name, last name, phone, email.
-- Hauck Marketing does not cold call people, it cold calls BUSINESSES, and the
-- five columns below are the ones a caller needs and the table has never had.
--
-- Two of them were being smuggled in through columns that meant something else,
-- which is the specific damage this repairs:
--
--   * The CSV importer mapped `company` / `business` / `businessname` headers
--     into `notes`. The company name, the single most useful fact on the row,
--     was arriving as free text inside a paragraph. Nothing could filter on it,
--     nothing could show it, and `sales_calls.business_name` (0057) sat empty
--     because the lead it copies from had no such field.
--   * It mapped `industry` / `niche` into `source`. But `source` answers "which
--     list did this row come from", and niche answers "what sort of business is
--     it". Those are different questions and one of them was losing.
--
-- Everything here is text defaulting to '', matching the existing text columns,
-- so a row that predates this reads as blank rather than null and no read path
-- has to learn a new kind of nothing.
--
-- Deliberately NOT added: employee count, revenue, owner name. Each is a field
-- somebody would have to keep true, and a stale number on a call card is worse
-- than no number. They can be added when there is a list that actually carries
-- them.
--
-- Run AFTER 0001..0058. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions.

alter table public.leads
  add column if not exists business_name text not null default '',
  add column if not exists niche         text not null default '',
  add column if not exists website       text not null default '',
  add column if not exists city          text not null default '',
  add column if not exists state         text not null default '';

comment on column public.leads.business_name is
  'The company being called. Copied onto sales_calls at booking time, and sent to GoHighLevel as the contact''s company name.';

comment on column public.leads.niche is
  'What sort of business it is (roofing, HVAC). Distinct from source, which is which list the row arrived on: one list can hold several niches and one niche spans many lists.';

comment on column public.leads.state is
  'Kept as free text rather than a two-letter check. Bought lists spell it every way there is, and refusing a row over "Michigan" would lose a prospect to punctuation.';

-- "Show me the roofers", which is the filter this column exists for. Partial,
-- because a book that has not been categorised yet is mostly empty strings and
-- there is no point indexing those.
create index if not exists leads_niche_idx
  on public.leads (niche)
  where niche <> '';

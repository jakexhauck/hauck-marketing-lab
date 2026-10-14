-- 0149: Operations > Clients, the Client Tracker Google Sheet as a page.
--
-- client_billing already carries every column of that sheet except the
-- owner's name and the link to the client's ad tracking sheet. Same row, same
-- single writer (the billing PATCH), so the page and Management's Billing
-- cards read and save one record.
--
-- Idempotent.

alter table public.client_billing
  add column if not exists first_name        text not null default '',
  add column if not exists last_name         text not null default '',
  add column if not exists ad_tracking_sheet text not null default '';

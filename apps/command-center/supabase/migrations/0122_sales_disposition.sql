-- 0122: the four columns the GHL disposition form fills.
--
-- The end-of-call recorder is now Jake's GoHighLevel form, not the in-app
-- panel (docs/build-plans/sales-disposition-form.md). Two workflows post to
-- /api/webhook: one stamps the prefilled form URL onto a meeting when it
-- confirms, the other stamps the form's answers onto that contact's most
-- recent unrecorded meeting. These columns are what they write; every other
-- column the answers touch (outcome, cash_collected, scratchpad,
-- appointment_status, qualified) already existed.
--
-- post_call_form_url  -- the widget URL, sent by the workflow, never typed by
--                        hand. Allowlisted to link.hauckmarketing.com/widget/form/.
-- payment_platform    -- "Payment Platform" on the form. Feeds Payment Type.
-- recording_link      -- "Call Recording" on the form. Feeds Recording.
-- revenue_generated   -- "How Much Revenue Generated" on the form, as a flat
--                        figure. The sheet prefers it over contractValue(deal),
--                        which stays for rows the old panel recorded with a
--                        monthly x months deal. Null until a form says otherwise.
--
-- Empty string rather than null for the three texts: sales_calls already uses
-- '' as "nothing recorded" for its text columns (0057), so these follow suit.
--
-- Idempotent: safe to re-run.

alter table public.sales_calls
  add column if not exists post_call_form_url text not null default '',
  add column if not exists payment_platform text not null default '',
  add column if not exists recording_link text not null default '',
  add column if not exists revenue_generated numeric;

comment on column public.sales_calls.post_call_form_url is
  'Prefilled disposition-form URL for this meeting, posted by the GHL
  appointment-confirmed workflow. Never typed by hand.';
comment on column public.sales_calls.payment_platform is
  'Payment Platform answer from the GHL disposition form.';
comment on column public.sales_calls.recording_link is
  'Call Recording answer from the GHL disposition form.';
comment on column public.sales_calls.revenue_generated is
  'Flat total revenue from the GHL disposition form. Preferred by the Sales
  Data sheet over deal jsonb arithmetic on a close.';

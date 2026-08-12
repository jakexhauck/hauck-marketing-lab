-- 0104: let a client see every lead their ads produced, in their Inbox.
-- Run AFTER 0001..0103. Idempotent: safe to re-run.
--
-- 0103 widened the Inbox by TAG, and the tag turned out to be the weak signal:
-- measured 2026-08-12 across Willis's 199 contacts, only 5 carry 'facebook ads'.
-- The tag is written by a GHL workflow that was never finished, so most ad
-- leads never got one, and a client who rings their own leads still could not
-- see the people their ads sent them.
--
-- The strong signal was already on the wire. GoHighLevel returns an
-- attributions[] array on the bulk contacts list, carrying the Meta ad id for
-- any contact who arrived through a paid click. Nobody has to remember to apply
-- it and no workflow has to be built for it to work. It is the same array
-- adAttribution.ts reads for the Paid Ads tracker, where it was measured
-- present on 99 of 100 live Willis contacts.
--
-- So this is the rule: any contact whose first touch carries an ad id is
-- visible. Additive on top of 0103's tag and the original hand-off pipeline
-- rule; it can only ever widen.
alter table public.tenants
  add column if not exists inbox_show_ad_leads boolean not null default false;

comment on column public.tenants.inbox_show_ad_leads is
  'true: contacts whose GHL attributions carry a paid-ad id are always visible in the client Inbox. Additive on top of inbox_visible_tag (0103) and the hand-off pipeline gate (0097). false (default) leaves the Inbox exactly as it was.';

-- 0103: a tag that lets a contact into the client's Inbox.
-- Run AFTER 0001..0102. Idempotent: safe to re-run.
--
-- The Inbox gate (0097, functions/lib/handoffScope.ts) shows a client the
-- conversations for leads we handed them: the contact must hold an opportunity
-- in the hand-off pipeline. That is right when WE work the leads and hand over
-- the ones worth their time.
--
-- It is wrong for a client who works their own. Willis ring every lead
-- themselves, so nothing is ever handed off, and the Inbox they are supposed to
-- reply from shows almost nothing while their leads text them.
--
-- This is the widening: any contact carrying this tag is visible, whatever
-- pipeline they are in and even with no opportunity at all. Additive. The
-- hand-off rule still admits everyone it admitted before.
--
-- A column rather than code because the tag is the client's, not ours: Willis
-- tag their ad leads 'facebook ads' (the same tag adsRevenue.ts joins on), and
-- the next client may tag theirs something else or want no widening at all.
alter table public.tenants
  add column if not exists inbox_visible_tag text;

comment on column public.tenants.inbox_visible_tag is
  'Contacts carrying this tag are always visible in the client Inbox, on top of the hand-off pipeline rule. Matched case-insensitively, by contains. NULL (default) leaves the Inbox gated exactly as it was.';

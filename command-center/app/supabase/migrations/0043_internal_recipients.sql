-- 0043: per-tenant list of internal notification recipients.
--
-- GHL workflows fire "internal notification" actions that text or email the
-- business owner and Hauck staff. GHL logs each send against a contact, so the
-- alert surfaces in the CLIENT's Inbox looking like a lead. A live audit of
-- Willis on 2026-07-21 found 3 of 15 conversations were these sinks: the
-- owner's mobile, the owner's email, and Jake's own contact.
--
-- Two signals identify a sink. This column backs the second one.
--
--   1. contact.source = 'NOTIFICATION'. GHL stamps this itself on contacts it
--      auto-creates for a notification action. Needs no configuration, and so
--      needs no column.
--   2. The contact's phone or email is a known internal recipient. Staff
--      contacts are source 'WEB_USER', which signal 1 cannot see, so without
--      this list the client keeps seeing agency staff in their inbox.
--
-- Free text rather than a child table on purpose: this is a handful of entries
-- per client, edited about never, and a table would add a join to the hot
-- middleware path for no benefit. Comma or newline separated; an entry with an
-- '@' is read as an email, anything else as a phone. Phones compare on their
-- last 10 digits so formatting never matters. Parsing lives in
-- functions/lib/internalRecipients.ts and fails open: a malformed entry is
-- dropped rather than allowed to hide a real lead.
--
-- NULL means "no configured recipients". Signal 1 still applies, so a tenant
-- that never sets this is still protected from the auto-created sinks.

alter table public.tenants
  add column if not exists internal_recipients text;

comment on column public.tenants.internal_recipients is
  'Comma or newline separated phones/emails that receive internal GHL notifications. Their conversations, threads, and lead rows are hidden from every surface in the app. See functions/lib/internalRecipients.ts.';

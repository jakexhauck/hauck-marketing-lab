-- 0021: per-tenant notification channel switches + per-staff SMS opt-in.
--
-- Builds on 0011 (notify_audience). The owner now decides, per client, which
-- CHANNELS fire for internal notifications (new lead / message / win):
--   notify_push_enabled   -> in-app / web push (ours; fan-out in webhook.ts).
--   notify_email_enabled  -> the internal email sent by the GHL snapshot.
--   notify_sms_enabled     -> the internal SMS sent by the GHL snapshot.
--   notify_email_to        -> the single destination address the owner picks.
--   notify_sms_to          -> the single destination phone the owner picks.
--                             (both null until set.)
--
-- Email/SMS are sent by GHL workflows, not by our code. GHL's internal_notification
-- action targets ONE recipient custom value per channel (to_custom_email /
-- to_custom_number), and If/Else cannot branch on a custom value, so a channel is
-- toggled by SETTING vs BLANKING that recipient. These columns are the app-side
-- source of truth; functions/lib/ghlNotifyPrefs.ts mirrors them into the GHL
-- custom values. Defaults preserve today's behaviour: push on, email on, sms off.
--
-- Run AFTER 0001-0020. Idempotent: safe to re-run.

alter table public.tenants
  add column if not exists notify_push_enabled  boolean not null default true,
  add column if not exists notify_email_enabled boolean not null default true,
  add column if not exists notify_sms_enabled   boolean not null default false,
  add column if not exists notify_email_to       text,
  add column if not exists notify_sms_to         text;

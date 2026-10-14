-- 0106: the agency Meta System User token lives in the database, not in Doppler.
--
-- The Paid Ads wizard offers a box to paste the token into, and that box could
-- not work. Cloudflare binds environment variables at DEPLOY time, so saving to
-- Doppler changes nothing about the running app until a redeploy, and this
-- deployment carries neither DOPPLER_WRITE_TOKEN nor CF_DEPLOY_TOKEN, so it
-- could neither write the value nor restart itself. The honest message it
-- showed ("this console cannot save secrets") was the truth about a feature
-- that therefore did not exist.
--
-- One row, read on every request, live the moment it saves. Exactly the trade
-- drive_connection (the agency Google grant) already makes, and the same reason
-- per-client credentials live on the tenant row rather than in Doppler.
--
-- The env var still wins when it is set, so nothing that is working today
-- changes, and a token bound at deploy is never silently overridden by one
-- pasted into a browser.

create table if not exists public.agency_meta (
  -- Singleton. The check constraint is what makes "one row, forever" a database
  -- rule rather than a convention someone has to remember.
  id boolean primary key default true check (id),
  system_user_token text not null,
  -- Who pasted it and when, so a token that stops working can be traced to a
  -- person and a date rather than guessed at.
  updated_by uuid references public.admin_accounts (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Service role only. No policies are added, so with RLS on, nothing but the
-- service key can read it: the app's Pages Functions, and nothing in a browser.
alter table public.agency_meta enable row level security;

comment on table public.agency_meta is
  'Singleton: the agency Meta System User token. env.META_SYSTEM_USER_TOKEN wins when set.';

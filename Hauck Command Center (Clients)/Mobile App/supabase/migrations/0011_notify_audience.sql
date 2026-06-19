-- 0011: per-tenant push notification audience rule.
--
-- The owner decides who is woken by a new lead / message / win:
--   'everyone'  -> every subscribed device for the tenant (default, current behaviour).
--   'assigned'  -> only the device whose chosen GHL identity matches the lead's
--                  assignedTo. Falls back to everyone when the event carries no
--                  assignee or no subscribed device matches, so a lead is never
--                  silently dropped.
--
-- Routing reuses push_subscriptions.ghl_user_id (already added in 0004): the
-- mobile app stores each device's chosen GHL identity there at subscribe time,
-- and GHL puts that same id in opportunity.assignedTo.
--
-- Run AFTER 0001-0010. Idempotent: safe to re-run.

alter table public.tenants
  add column if not exists notify_audience text not null default 'everyone';

-- Guarded constraint add (Postgres has no "add constraint if not exists").
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_notify_audience_check'
  ) then
    alter table public.tenants
      add constraint tenants_notify_audience_check
      check (notify_audience in ('everyone', 'assigned'));
  end if;
end $$;

-- Speeds the assigned-rep lookup the webhook fan-out does on every push event.
create index if not exists push_subscriptions_tenant_ghl_uid
  on public.push_subscriptions (tenant_id, ghl_user_id)
  where ghl_user_id is not null;

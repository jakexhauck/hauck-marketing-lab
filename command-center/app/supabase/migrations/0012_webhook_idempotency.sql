-- 0012: webhook idempotency.
-- Run AFTER 0001..0011. Idempotent: safe to re-run.
--
-- GHL retries any webhook it does not get a fast 2xx for (timeouts, 5xx), which
-- created DUPLICATE activity_log rows and, worse, DUPLICATE pushes (the client's
-- phone buzzing 2-3x for one lead). Dedupe on the GHL event id per tenant: the
-- webhook now upserts with ON CONFLICT DO NOTHING against this index and only
-- fires a push when a new row was actually inserted.
--
-- ghl_event_id is nullable: events that carry no id (some workflow webhooks)
-- still insert, just without dedup. A FULL unique index (not partial) so
-- PostgREST's onConflict can infer it (the lesson from 0006). NULLs never
-- collide in a unique index, so id-less events are unaffected by the constraint.

alter table public.activity_log
  add column if not exists ghl_event_id text;

create unique index if not exists activity_log_tenant_event_idx
  on public.activity_log (tenant_id, ghl_event_id);

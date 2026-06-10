-- =========================
-- 0005: activity_log read state (notification center)
-- =========================
-- The notification center (build plan 14) reads the same activity_log rows the
-- webhook writes, but needs per-row read state to drive the unread badge. One
-- nullable timestamp is enough: null means unread, a timestamp means read.

alter table public.activity_log
  add column if not exists read_at timestamptz;

-- Unread lookups are the hot path (the bell polls the unread count). A partial
-- index over only the unread rows keeps that count cheap as the log grows.
create index if not exists activity_log_unread_idx
  on public.activity_log(tenant_id, created_at desc)
  where read_at is null;

-- 0138: drop cold_sms_budget.subscriptions (0137).
--
-- The budget moved inline onto the Cold SMS page and was simplified the same
-- day (Jake, 2026-10-05): the subscriptions list became one "Other / month"
-- cell inside `inputs`. No row ever used the column.
--
-- Idempotent: safe to re-run.

alter table public.cold_sms_budget drop column if exists subscriptions;

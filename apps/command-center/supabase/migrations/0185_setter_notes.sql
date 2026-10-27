-- The client's notes (Jake, 2026-10-27: a Notes tab in Client Setting's
-- Settings, shown next to the script while dialling).
--
-- A second document in the script's row, holding sanitized HTML under the same
-- trust boundary as 0044: functions/lib/setterScript.ts sanitizes every write.
alter table public.setter_scripts add column if not exists notes_html text not null default '';

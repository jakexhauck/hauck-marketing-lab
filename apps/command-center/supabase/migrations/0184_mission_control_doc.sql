-- The client's Mission Control doc, chosen on the Brief (Jake, 2026-10-27: the
-- CSM adds the right doc when a client is new, and picks it in a wizard).
--
-- Until now nothing was stored: the doc was found by name in the client's Drive
-- folder. A chosen doc wins over that; null still falls back to the name match.
alter table public.tenants add column if not exists mission_control_doc_id text;

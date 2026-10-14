-- 0147: tenants.brand_logo_url, the client's picture (Jake, 2026-10-06).
--
-- Set from the admin client page (Business & branding). Shown wherever the
-- client's initials badge shows: the admin client strip and phone sheet, the
-- admin header, and the client's own app. Null means the initials stay.
--
-- The file lives in the public `followup-assets` bucket (0095) under
-- <tenant>/picture/, uploaded by /api/admin/clients/:tenantId/picture.
--
-- Idempotent: safe to re-run.

alter table public.tenants add column if not exists brand_logo_url text;

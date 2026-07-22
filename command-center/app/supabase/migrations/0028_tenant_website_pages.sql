-- 0028: Website page list — per-tenant manual page list for Website > Pages.
--
-- The Website > Pages tab (client app) and Web Design > Pages panel (admin
-- cockpit) used to list pages by reading the client's GoHighLevel Sites (a
-- funnel with type === "website"). That depended on a per-client GHL token
-- carrying the Funnels/Sites scope and silently failed to a not-connected state
-- whenever the deployed token lacked it.
--
--   tenants.website_pages  an ordered list the admin edits in-app, each row
--                          { "name": "Home", "path": "/home" }. Array order is
--                          the display order. Empty [] => the Pages tab shows its
--                          "add your pages" state. The app only ever DISPLAYS
--                          these (each path is joined onto tenants.website_url to
--                          preview / open); nothing here is a credential.
--
-- Run AFTER 0001..0027. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS already on the
-- tenants table), matching website_url (0024).

alter table public.tenants
  add column if not exists website_pages jsonb not null default '[]'::jsonb;

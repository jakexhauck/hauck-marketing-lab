-- 0081_intake_password_visible.sql — keep the password a client typed, readable.
--
-- Jake needs to read back the password a client chose on the intake form, to
-- get them into the app on the phone without a reset. The hash in
-- `password_hash` cannot answer that (that is the point of a hash), so the
-- plaintext is kept alongside it.
--
-- THIS IS A DELIBERATE TRADE, NOT AN OVERSIGHT. What limits it:
--
--   - `intake_submissions` has RLS on with NO policies, so this column is
--     unreachable except through the service role. No anon key, no client
--     session, no browser can select it.
--   - Only ONE endpoint returns it: GET /api/admin/intake/:id, which is
--     admin-gated in _middleware.ts. The list endpoint does not, and
--     resumeView() (what the public funnel gets back) does not.
--   - `password_hash` is still what authentication uses. This column is never
--     read to sign anyone in, so a tampered value cannot become a login.
--
-- What it costs: anyone who reaches this table with the service role reads live
-- client credentials, and people reuse passwords across services. If that trade
-- stops looking worth it, drop the column; nothing authenticates against it.
--
-- Existing rows stay null. The passwords already submitted were hashed on
-- arrival and are not recoverable.

alter table public.intake_submissions
  add column if not exists password_plain text;

comment on column public.intake_submissions.password_plain is
  'The password the client typed, kept readable so an admin can tell them what it is. Never used to authenticate; password_hash does that. Service-role only.';

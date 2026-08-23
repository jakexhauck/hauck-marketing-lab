-- Owner sessions become revocable.
--
-- Staff and admin sessions were always revocable: identity is re-read from the
-- database on every request, so disabling the account kills the session on its
-- next call. Owner shared-password sessions had no server-side record at all,
-- so the only way to evict one was rotating SESSION_SECRET, which signs out
-- every human on every device at once.
--
-- tenants.session_version is that record. Login stamps the current version
-- into the signed token's v claim; the middleware compares the claim against
-- the tenant row it ALREADY loads on every owner request (no extra query).
-- A mismatch means the version was bumped under the token: 401, sign out.
-- Incrementing the column (a one-line SQL statement) signs out every owner
-- session for that client and nobody else.
--
-- Legacy tokens without a v claim keep working: they were minted before
-- versions existed and expire within 30 days on their own. Bumping the version
-- does not evict them; rotate SESSION_SECRET if legacy eviction matters.
--
-- Test-mode ("shared password") sessions have no tenant row and are unchanged;
-- they are evicted by rotating TEST_APP_PASSWORD plus SESSION_SECRET.
--
-- Additive and idempotent.

alter table public.tenants
  add column if not exists session_version int not null default 0;

comment on column public.tenants.session_version is
  'Bumped to evict every live owner shared-password session for this client. Compared against the v claim in each token.';

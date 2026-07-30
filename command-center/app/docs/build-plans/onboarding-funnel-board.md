# Onboarding: the funnel feeds the board

**Status:** in progress, 2026-07-30
**Supersedes:** `onboarding-wizard-wiring.md` (same day, half a morning old). That
plan finished the admin wizard on the assumption Jake types the client's answers.
He does not: the client answers them in a funnel.

**Source spec:** `docs/build-plans/client-onboarding-full.md` on the
`feat/client-onboarding` branch, filed 2026-07-26. That spec is sound and most of
it is built and tested on that branch. This plan is the port onto main plus the
decisions taken today, not a redesign.

## Where the two halves are

The work was done twice, on two branches, and never met.

| Half | Where it lives | State |
|---|---|---|
| The funnel (3 GHL pages), intake API, submissions board, `createTenantWithOwner` | `feat/client-onboarding` | Built, tested, paused 2026-07-29 |
| The per-client setup record: checklist, live GHL readiness, provisioning | `main` | Shipped, working |
| The New client wizard's Create button, Drive folder, value seeding | `main`, uncommitted | Built today |

Main has moved a long way since the branch paused (health cron, admin roles,
migrations 0056-0068), so this is a file-by-file port, not a merge.

## Decisions taken today

1. **The funnel is not in GHL yet.** Jake still has to paste the three pages in,
   so nothing has been submitted and there is no data to migrate. The allowed
   origins list gets an env var (`FUNNEL_ORIGIN`) so adding the published GHL
   domain later is a config change, not a code change and a deploy.
2. **`/admin/onboarding` becomes the board**, and approving opens the client's
   setup record. Two screens, one flow.
3. **The New client wizard stays**, cut to steps 1-3, as the way to stand up a
   client with no submission. Its Create wiring and Drive folder, built this
   morning, carry over: approve uses the same path.
4. **The login gate is in.** The client chooses a password at funnel step 3, so
   they can sign in the moment they are approved; without the gate they land in
   an empty app.
5. **Checklist is 13 items, not the spec's 16.** No Google Business Profile, no
   GA4 property, no website item: Jake does not want onboarding to carry work
   he does not do.
6. **No alerts.** The board is the signal. No push, no email.

## The checklist, as it will read

**GHL setup** — Sub-account created and snapshot applied · Custom values written
`AUTO` · Token valid and connected `AUTO` · Calendars exist in the sub-account
`AUTO`

**Connections** — Phone number registered, A2P approved · Sending email domain
verified · Google Calendar two-way sync connected · Meta ad account linked

**Client app** — Branding applied · Owner login verified · Team logins added

**Go live** — Workflows published and triggers active · Test lead run end to end

A2P needs an EIN and the funnel deliberately does not ask a new client for legal
details, so that item is where collecting it out of band gets caught.

## Order of work

1. **Shared logic + migration.** `src/lib/intake.ts`, `functions/lib/intake.ts`,
   `functions/lib/ratelimit.ts` and their tests, ported as-is. The branch's
   `0056_client_intake.sql` renumbers to **0069** (main's head is 0068).
2. **Public API.** `POST /api/intake`, `GET /api/intake/:token`. The middleware
   changes are hand-merged onto main's current file, which has since grown gates
   the branch never saw.
3. **Approve and reject.** `createTenantWithOwner()` extracted behind the
   existing endpoint's tests, then the admin intake endpoints on top. Approve
   creates the tenant, the owner login, the onboarding row seeded from the
   funnel answers, and the Drive folder.
4. **The board.** `OnboardingBoard.tsx` at `/admin/onboarding`.
5. **The record.** Intake card renders the funnel's schema read-only; checklist
   grows to 13; Go Live arms when nothing is outstanding.
6. **The login gate.** `tenants.onboarding_status`, 423 in the tenant path with
   admin and preview bypasses, `/api/auth/me`, holding screen.
7. **The wizard**, cut to steps 1-3.
8. **The funnel pages** onto main, then end to end on localhost.

## What today's wizard work becomes

Not wasted, but reduced. `onboardingSeed.ts` now seeds from the funnel's answer
keys rather than the wizard's. `clientDriveFolder.ts` is untouched and gains a
second caller. The wizard's own steps 4-6 are deleted, which is what the source
spec always said would happen to them.

## Risks

- **Two field schemas.** `onboarding.intake` currently holds wizard keys
  (`headshot`, `taxId`); the funnel writes its own (`headshotUrl`, `logoUrl`, no
  tax id). Nothing has ever written the old shape in production, so the record
  simply switches to reading the funnel's. Verified by the record rendering a
  real approved submission, not by a migration.
- **Route ordering.** `/admin/onboarding` must be declared before
  `/admin/onboarding/:tenantId`.
- **`onboarding_status` default.** It defaults to `live`, so every existing
  client keeps working the moment the migration runs. Only approve writes
  `setup`.
- **The 423 catching the wrong session.** Admin and preview bypasses, with a
  test for both.

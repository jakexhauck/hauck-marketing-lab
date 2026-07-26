# Client Onboarding, End to End

Spec + implementation plan. One doc. Filed 2026-07-26.

Supersedes `client-onboarding-wizard.md`, which shipped the admin wizard shell.
That file is removed when this build ships, not now, so the old spec stays
readable while this one is still under review.

## Why

Signing a client currently means a Google Form, a Google Doc of questions, about
twenty minutes of clicking in GoHighLevel, and a client record typed in by hand.
Nothing connects. The app has no way to create a client at all.

Underneath, two halves of this were already built and never met:

| Half | State today |
|---|---|
| `/admin/clients/new`, six-step wizard | Fully interactive, validated, draft-saves to localStorage. Create button disabled. Saves nothing. |
| `POST /api/admin/clients` | Creates tenant, seeds every entitlement, creates the owner login. Zero callers. |
| `/api/admin/onboarding/*` (fields, checklist, provision, readiness) | Built, tested, writes GHL custom values and runs live readiness checks. No UI at all. |
| `onboarding`, `onboarding_checklist` tables (migration 0018) | Exist. Empty. |
| Five Onboarding pillar lanes linking to `/admin/onboarding` | That route does not exist. Dead links. |

This build joins them and adds the one genuinely new surface: a public funnel the
client fills in themselves.

## Scope

**In**

1. A public client funnel at `/onboarding`, no login, save and resume.
2. A submissions queue in admin: read, approve, reject.
3. A per-client setup cockpit at `/admin/onboarding/:tenantId`: checklist, live
   readiness checks, GHL provisioning, Go Live.
4. A login gate: an approved client who signs in before Go Live sees a holding
   screen, enforced server-side.

**Out, deliberately**

- File uploads. Assets are collected as links in v1 (Drive, Dropbox, iCloud).
  A public unauthenticated upload endpoint is a storage-bombing target and the
  app has no storage bucket. Real uploads are a follow-up, done inside the app
  once the client is logged in and rate-limited.
- Automatic GHL sub-account creation. The existing `ghl-auto-provisioning.md`
  plan covers that separately. This build uses the provision endpoint that
  already exists (custom values) and leaves sub-account creation on the manual
  checklist.
- Emailing the client anything. No transactional email exists in this app. Jake
  sends the funnel link and the "you are live" note himself, as he does today.
- The old admin wizard's steps 4-6. Those questions move to the funnel, where the
  client answers them.

**Definition of done**

Jake can send a stranger a link, watch a partial submission appear in his queue
with a completeness bar, approve it, see a tenant and owner login created, log in
as that client and hit the holding screen, work the checklist until the auto
checks go green, press Go Live, and have the client's app open normally.

## Lifecycle

```
in_progress --(client submits)--> submitted --(Jake approves)--> setup --(Jake presses Go Live)--> live
                                      |
                                      +--(Jake rejects)--> rejected
```

- `in_progress` and `submitted` live on `intake_submissions`. No tenant exists.
- `setup` and `live` live on `tenants.onboarding_status`. The submission row keeps
  a `tenant_id` back-reference so the cockpit can show the original answers.
- Every existing tenant is backfilled to `live`, so nothing currently in
  production changes behaviour.

## Data model

One migration. **Pick the number at push time**, not now: migration numbering is a
race and the current head is 0046.

```sql
create table if not exists public.intake_submissions (
  id             uuid primary key default gen_random_uuid(),
  resume_token   text not null unique,
  answers        jsonb not null default '{}'::jsonb,
  furthest_step  int not null default 1,
  status         text not null default 'in_progress',   -- in_progress | submitted | approved | rejected
  login_email    text,
  password_hash  text,
  tenant_id      uuid references public.tenants(id) on delete set null,
  submitted_at   timestamptz,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.intake_submissions enable row level security;
-- No policies: service-role only, same as onboarding / admin_tasks / admin_sop_flags.

create index if not exists intake_submissions_status_idx
  on public.intake_submissions (status, created_at desc);

alter table public.tenants
  add column if not exists onboarding_status text not null default 'live';
```

`onboarding_status` defaults to `live` on purpose. Any tenant that exists before
this migration keeps working exactly as it does now. Only the approve path ever
writes `setup`.

The password the client chooses is hashed with the existing `hashPassword` the
moment step 3 is saved. Plaintext is never written. `login_email` is stored
alongside so the queue can show it and so a duplicate can be caught before
approval rather than after.

The `answers` blob holds ordinary business details rather than anything legally
sensitive: Tax ID / EIN was cut from the funnel at Jake's request. The table is
still RLS-on with no policies, reachable by the service role only, which is the
same protection the `onboarding` table already relies on.

**Consequence of that cut:** A2P phone registration requires an EIN, so it now
has to be collected out of band (email or the kickoff call) before texting can go
live for a client. The setup checklist item "Phone number registered, A2P
approved" is where that gets caught.

`onboarding` and `onboarding_checklist` from migration 0018 are unchanged and get
their first real use.

## Surface 1: the public funnel

**Mockups first.** Three visual directions, static, no backend, opened on
localhost. Jake picks one. Only then is the real funnel built. This is the only
surface a paying client sees before they can log in, so it does not get assembled
out of admin components.

Route: `/onboarding` on the app origin, outside the authenticated shell and
outside `AdminRoute`. `hauckmarketing.com/onboarding` redirects to it, so the
link Jake hands out reads the way he wants. The marketing site is a separate
Vercel project and cannot create accounts.

### Steps

| Step | Fields | Source |
|---|---|---|
| 1. Business | `name`*, `niche`*, `websiteUrl` | New |
| 2. Contact details | `contactName`*, `contactEmail`*, `contactPhone`*, `timezone`*, `businessAddress`* | Google Doc Q1-Q5 |
| 3. Your login | `loginEmail`*, `password`*, `passwordConfirm`* | New |
| 4. Targeting and ops | `targetAreas`*, `areaCallout`*, `notifyPreference`, `calendarAvailability`, `leadConnectorInstalled` | Q7-Q11 |
| 5. Story | `usp`, `whySignedUp`, `notes` | Q12, Q15, Q16 |
| 6. Assets | `logoUrl`, `headshotUrl`, `pastWorkUrl` | Q13, Q14 plus logo |
| 7. Review | Everything back, jump-to-edit, submit | New |

`loginEmail` prefills from `contactEmail`. Step 3 is usually two keystrokes and a
password.

Never on the funnel, because they are Jake's and the client could not answer
them: `subdomain`, `appName`, `brandColor`, `brandInitials`, `wonLabel`,
`valueLabel`, `ghlLocationId`, `ghlToken`, `metaAdAccountId`, `ga4PropertyId`,
`googlePlaceId`.

Two deltas from the source Google Doc, both deliberate and both already made in
the current repo: `notifyPreference` keeps its third option ("Both"), and Q15's
"Noah & his program" stays rewritten to Hauck Marketing.

Q11 is not a question, it is a task: a checkbox with the iPhone and Android
LeadConnector store links rendered beside it. That component already exists in
`AdminClientNew.tsx` and moves across.

### Save and resume

On every step advance the funnel POSTs the whole answer set. First save mints a
`resume_token` and the URL becomes `/onboarding?r=<token>` via `history.replaceState`,
so a refresh, a closed tab or a different device three days later all resume.

The step 3 password is the one exception. It is hashed server-side on save and
never returned, so a resumed session shows the password boxes empty with a note
saying why. Same reasoning as the admin wizard's `stripSensitive`.

`furthest_step` is stored so the queue can show a real completeness bar and Jake
can see exactly where someone stalled.

### Abuse control

The funnel is open by design, so the write endpoint carries the guards:

- Rate limit by IP using the existing `functions/lib/ratelimit.ts` pattern.
- Answers are size-capped server-side; every field has a max length.
- A resume token is 32 bytes of `crypto.getRandomValues`, unguessable, and grants
  access to exactly one submission.
- A submitted submission is read-only. Resuming it shows a thank-you, not the form.
- Nothing is created in `tenants` or `staff_accounts` until Jake approves. Junk
  costs one row.

## Surface 2: the submissions queue

Admin, at `/admin/onboarding`. This is the route the five Onboarding pillar lanes
have been pointing at all along.

A list of every submission, newest first, filtered by status. Each row: business
name, contact, when it arrived, completeness bar, status pill.

Opening one shows every answer grouped by step, plus:

- **Approve.** Creates the tenant and the owner login, sets
  `onboarding_status = 'setup'`, seeds the checklist rows, writes the answers into
  `onboarding.fields`, links `tenant_id` back onto the submission, and drops Jake
  straight into the setup cockpit.
- **Reject.** Marks it `rejected`. No tenant, no login, row kept for the record.

Approve does not reimplement tenant creation, but it cannot call
`POST /api/admin/clients` as it stands either: that endpoint takes a plaintext
password and hashes it, and by approve time only the hash exists. Hashing was
done days earlier, at funnel step 3, on purpose.

So the tenant-creation body moves into `functions/lib/clientCreate.ts` as
`createTenantWithOwner()`, taking an already-hashed password. Both callers use
it: `POST /api/admin/clients` hashes its plaintext and calls in, approve passes
its stored hash straight through. One code path seeds the tenant, the
entitlements and the owner row; neither caller duplicates it. This is a
refactor of working code, so it goes in behind the existing endpoint's tests
before approve is built on top.

The submission's answers supply `name`, `niche`, `ownerEmail`, `ownerName`;
`subdomain` derives from the business name; the remaining technical fields stay
at their defaults for Jake to fill in the cockpit.

**Approve is not idempotent by nature, so it is made so:** the endpoint refuses if
the submission already has a `tenant_id`, and it checks the chosen login email
against `staff_accounts` before creating anything. A duplicate email is reported
as a fixable error on the review screen, not a half-created client.

## Surface 3: the setup cockpit

Admin, at `/admin/onboarding/:tenantId`.

Four blocks:

1. **The client's answers**, read-only, grouped by step, so Jake can work from
   them without leaving the page.
2. **The technical fields** Jake owns: subdomain, app name, brand colour and
   initials, won and value labels, GHL location and token, Meta ad account, GA4
   property, Google Place ID. Saved through the existing client PATCH endpoint.
3. **The checklist**, sixteen items in four groups. Manual items are click to
   tick. Auto items are driven by `GET /api/admin/onboarding/:tenantId/readiness`,
   which is already built and already runs live checks against GHL.
4. **Go Live**, which arms only when nothing is outstanding, and flips
   `onboarding_status` to `live`.

### Checklist contents

Declared as data in `src/lib/onboarding.ts`, extending the nine tasks already
there. `AUTO` items are ticked by the readiness endpoint without a click.

**GHL setup**
- Sub-account created, snapshot applied
- Custom values written `AUTO`
- Token valid and connected `AUTO`
- Calendars exist in the sub-account `AUTO`

**Connections**
- Phone number registered, A2P approved
- Sending email domain verified
- Google Calendar two-way sync connected
- Google Business Profile connected
- Meta ad account linked
- GA4 property set

**Client app**
- Branding applied: logo, colour, labels
- Owner login verified, they can actually sign in
- Team logins added

**Go live**
- Workflows published, triggers active
- Test lead run end to end
- First campaign live

A "Provision custom values" button calls the existing provision endpoint, showing
what it will write before it writes it.

## Surface 4: the login gate

An approved client whose tenant is still `setup` can authenticate successfully
but cannot use the app.

**Enforced server-side, in `functions/api/_middleware.ts`.** That file is already
the single gate for the whole API: it short-circuits `/api/admin/*` for admin
sessions before any tenant resolution happens, then pins everything else to a
tenant. The new check sits in that second path and returns `423 Locked` when
`onboarding_status != 'live'`.

Because admin routes short-circuit above it, Jake is unaffected by construction.
Preview sessions do flow through the tenant path, so they need an explicit
bypass: previewing a client mid-setup is exactly when Jake most wants to look.

`/api/intake/*` is added to `PUBLIC_PATHS` in the same file, since the funnel has
no session at all.

`/api/auth/me` reports `onboardingStatus` so the frontend renders the holding
screen rather than an error.

The frontend shows a holding screen: the client's business name, "we are still
setting up your account", and Jake's contact. No sidebar, no empty dashboards.

## Error handling

| Failure | Behaviour |
|---|---|
| Funnel save fails mid-step | Answers stay in React state, an inline retry bar appears, no navigation is lost |
| Resume token not found | Clean "this link has expired or is not valid" page with a line telling them to ask their account manager |
| Approve hits a duplicate login email | Nothing created, the review screen names the clash and offers a different email |
| Approve creates the tenant but the owner insert fails | `POST /api/admin/clients` already returns `ownerWarning`; the cockpit surfaces it as an unticked "Owner login verified" item rather than silently succeeding |
| Readiness cannot reach GHL | The item renders as not-yet-checked, never as failed. It is a checklist, not an error page. That is the existing endpoint's behaviour already |
| Client logs in during `setup` | Holding screen, not a 500, not an empty app |

## Testing

Pure logic is test-first, as always in this repo. Surfaces are verified by running
them.

- `src/lib/intake.ts` — funnel step schema, per-step validation, password
  confirmation, completeness percentage, which fields are client-answerable.
  Unit tested.
- `src/lib/onboarding.ts` — extended checklist, group ordering, `allComplete`
  gate for the Go Live button. Extends the existing test file.
- `functions/lib/intake.ts` — token minting, answer size caps, submitted-is-read-only,
  approve idempotency. Unit tested.
- Middleware gate: a test that a `setup` tenant gets 423 and an admin session
  does not.
- End to end, by hand on localhost: submit as a fake client, resume mid-way,
  submit, approve, log in as them and see the gate, work the checklist, Go Live,
  log in again and see the app.

## Files

**New (backend)**
- `functions/lib/intake.ts` — token minting, validation, size caps, shared types.
- `functions/lib/clientCreate.ts` — `createTenantWithOwner()`, extracted from the
  existing POST handler so approve and the admin endpoint share one code path.
- `functions/api/intake/index.ts` — `POST` create or update a submission (public).
- `functions/api/intake/[token].ts` — `GET` resume a submission (public).
- `functions/api/admin/intake/index.ts` — `GET` the queue.
- `functions/api/admin/intake/[id].ts` — `GET` one, `POST` approve, `POST` reject.

**New (frontend)**
- `src/lib/intake.ts` — funnel field schema and validation, pure.
- `src/routes/onboarding/OnboardingFunnel.tsx` — the public funnel shell.
- `src/routes/onboarding/FunnelStep.tsx` — one step.
- `src/routes/onboarding/FunnelReview.tsx` — the review screen.
- `src/routes/admin/AdminOnboarding.tsx` — the submissions queue.
- `src/routes/admin/OnboardingCockpit.tsx` — the per-client setup cockpit.
- `src/components/client/SetupHoldingScreen.tsx` — the login gate screen.

**Changed**
- `functions/api/_middleware.ts` — the 423 gate in the tenant path, with a preview
  bypass, plus `/api/intake/*` added to `PUBLIC_PATHS`.
- `functions/api/admin/clients/index.ts` — POST body moves into
  `createTenantWithOwner()`; the handler keeps its validation and hashing.
- `functions/api/auth/me.ts` — report `onboardingStatus`.
- `src/App.tsx` — `/onboarding` outside the shell; `/admin/onboarding` and
  `/admin/onboarding/:tenantId` inside `AdminRoute`, parent route declared first.
- `src/lib/onboarding.ts` — the extended checklist.
- `src/routes/admin/AdminClientNew.tsx` — reduced to steps 1-3, the technical
  shell, for the case where Jake stands a client up by hand without a funnel
  submission. Its Create button finally gets wired to `POST /api/admin/clients`.
- `src/lib/clientOnboarding.ts` — steps 4-6 move out to `src/lib/intake.ts`.
- `Hauck Marketing Website/vercel.json` — `/onboarding` redirect to the app.

**Removed, on ship**
- `docs/build-plans/client-onboarding-wizard.md`, superseded by this doc.

## Build order

Everything in steps 1-4 is built and iterated on Jake's localhost.

1. **Migration and shared logic.** The table, the column, `src/lib/intake.ts` and
   `functions/lib/intake.ts`, test-first. Nothing renders yet.
2. **Extract `createTenantWithOwner()`**, behind the existing endpoint's tests.
   No behaviour change. Then the **submissions queue plus approve**: seed a
   submission row by hand, get the queue reading it, get Approve creating a real
   tenant and login.
3. **Setup cockpit.** Checklist, readiness wired to the existing endpoint,
   technical fields, provision button, Go Live.
4. **Login gate.** Middleware 423, `/api/auth/me`, holding screen. Verified by
   logging in as the client Jake just approved.
5. **Funnel mockups.** Three directions, static, on localhost. Jake picks one.
6. **The real funnel.** Wired to the endpoints from step 1.
7. **End to end**, by hand, then ship.

Steps 2 through 4 come first on purpose: they are the half that is already mostly
built underneath, and the funnel is then built against a spine that demonstrably
works rather than against an idea of one.

## Risks

- **Route ordering.** `/admin/onboarding` must be declared before
  `/admin/onboarding/:tenantId`, and `/onboarding` must sit outside the
  authenticated shell or it will bounce a logged-out client to the login page.
  Caught by walking the routes, not by tests.
- **The 423 gate catching the wrong session.** An over-broad gate locks Jake out
  of his own admin views or breaks preview-as-client. Mitigated by an explicit
  admin and preview bypass, and a test for both.
- **`onboarding_status` defaulting wrong.** A default of anything but `live`
  would lock every existing client out of production the moment the migration
  runs. The default is `live` and the migration adds no backfill because it needs
  none.
- **A duplicate login email discovered at approve time.** The client chose it days
  earlier and it is in their notes. Mitigated by checking uniqueness at funnel
  step 3, not only at approve, so they are told immediately.
- **That uniqueness check is an account-enumeration oracle.** A public endpoint
  that answers "is this email already registered" can be walked to discover who
  banks with Hauck Marketing. Accepted, with mitigation: the check is rate limited
  by IP on the same limiter as the rest of the funnel, and it only ever runs on a
  submission that is already being filled in. The alternative, silently accepting
  a duplicate and failing at approve, moves the pain onto Jake and the client
  days later. Worth revisiting if the app ever gets a public signup surface.
- **Assets as links rot.** A Drive link can be unshared or deleted. Mitigated by
  the checklist item that asks Jake to pull the assets down during setup, while
  the link is still fresh.

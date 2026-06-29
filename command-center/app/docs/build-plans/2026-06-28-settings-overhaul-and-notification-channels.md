# Settings Overhaul + Notification Channel Preferences

Date: 2026-06-28
App: `command-center/app` (the live, tracked client Command Center; serves both
phone `lg:hidden` and desktop `lg:flex` from a single React app).

## Frame

**What.** Turn the thin client Settings screen into a real control panel, and add
a per-channel notification preference (App push / Email / SMS) that is actually
enforced, not cosmetic.

**Why.** Today Settings is: read-only Account card, Team link, one owner-only
"audience" toggle, Take the tour, Sign out. Push is fully built but only
reachable from a one-time banner (no recovery if dismissed/denied). The theme
toggle exists but is hidden in desktop chrome. Clients can't manage how they're
reached, and email/SMS notifications (sent by the GHL snapshot) can't be turned
off per client.

**Definition of done.**
1. A client can enable/disable notifications on *this device* from Settings, with
   live status, and re-enable after a denial.
2. A light/dark/system control lives in Settings (phone + desktop).
3. Account card is useful: app version, "contact your account manager".
4. Owner can change their password/PIN in-app.
5. Three channel switches (Push / Email / SMS). Owner sets the email destination
   once. Owner picks which employees receive SMS. Turning Email off in the app
   actually stops the GHL email from firing.
6. All of the above verified in the running app with screenshots, and the GHL
   change baked into the snapshot so new clients inherit it.

## Decisions locked with Jake (2026-06-28)

- **Email** = a single destination address the owner picks (at onboarding, also
  editable in Settings). One on/off switch.
- **SMS** = owner chooses *which employees* receive it. Per-employee on/off,
  owner-managed. Each enabled employee gets SMS to their GHL phone.
- **Push** = per-device (each user enables on their own phone). Keeps the
  existing everyone/assigned audience rule.
- **Granularity** = one switch per channel (not per event type).

## The two halves (important)

- **App push** is entirely ours: `src/lib/push.ts`, `push_subscriptions`,
  `tenants.notify_audience`, fan-out in `functions/api/webhook.ts`. We control it
  directly.
- **Email + SMS** are NOT in our code. `webhook.ts` sends no email/SMS; they fire
  from GHL snapshot workflows. So we cannot "not send" them from our backend.
  Instead: our app writes the client's choice into GHL (custom values + per-user
  state), and the workflows check that switch before firing. App flips the
  switch; GHL obeys it.

---

## Phase 0 — GHL discovery (M7, blocks Phase 3)

Use the `gohighlevel-cli` skill against the **test sub-account** (per the
"clone to '<name> CLI', edit the clone" convention in memory).

- Find every snapshot workflow that sends an internal Email or SMS notification
  (new lead / new message / win). List action-by-action.
- Decide the switch mechanism. Preferred order:
  1. **Location Custom Values** `notif_email_enabled`, `notif_sms_enabled`,
     `notif_email_to` — if GHL If/Else can branch on them in this account.
  2. Fallback: a dedicated **settings contact** carrying custom fields, with
     notifications routed through a workflow that reads it.
- Decide router vs inline gating:
  - **Router (preferred):** one "Internal Notification Router" workflow reads the
    switches and fans out to enabled channels. Other workflows call it. One place
    to maintain in the snapshot.
  - **Inline:** wrap each existing Email/SMS action in an If/Else. Simpler now,
    N places to maintain later.
- Output: a short addendum to this doc with the chosen mechanism + exact workflow
  edits, before we touch the snapshot.

> Phase 0 informs Phases 1-3. Build the app side (1, 2, 4) in parallel; it works
> standalone and degrades gracefully if GHL mirroring is not yet live.

## Phase 1 — Schema (migration `0021_notification_channels.sql`)

Template: `supabase/migrations/0011_notify_audience.sql` (idempotent, guarded
constraint adds).

- `tenants`:
  - `notify_push_enabled boolean not null default true`
  - `notify_email_enabled boolean not null default true`
  - `notify_sms_enabled boolean not null default false`
  - `notify_email_to text` (the owner-picked destination address; null until set)
- `staff_accounts`:
  - `sms_enabled boolean not null default false` (owner picks who gets SMS)

No data backfill needed; defaults preserve current behaviour (email on, sms off).

## Phase 2 — Backend (M8)

1. **`functions/api/settings/notifications.ts`** — expand beyond `audience`.
   - GET returns `{ audience, push, email, sms, emailTo }` to any member.
   - PATCH (owner-only, unchanged guard) accepts any subset; validate
     `emailTo` as an email when `email` is enabled. Reuse the existing
     `resolveTenantId` + `tenants` update pattern.
2. **`functions/api/settings/sms-recipients.ts`** (new) — owner-only.
   - GET: list staff with `{ id, name, role, sms_enabled }`.
   - PATCH: set `sms_enabled` for a staff id. Scope to tenant.
3. **`functions/api/settings/password.ts`** (new) — change owner password/PIN.
   - Verify current password, write new `owner_password_hash` (PBKDF2, same
     format as `0009`/`staff_accounts`). For staff: `staff_accounts.password_hash`.
   - Rate-limit / require current password. Security-review this file.
4. **`functions/lib/ghlNotifyPrefs.ts`** (new) — mirror tenant prefs +
   per-staff SMS flags into GHL (custom values / settings-contact fields, per
   Phase 0). Best-effort, non-blocking (same pattern as `tryCreateGhlUser`):
   the app save always succeeds; GHL sync logs on failure. Called from the
   PATCH handlers above.

## Phase 3 — GHL snapshot (M7, after Phase 0)

- Implement the chosen mechanism in the test sub-account first; verify a real
  lead with Email off → no email, SMS on for one employee → that phone only.
- Bake into the master snapshot so new clients inherit the gated workflows.
- Document in `docs/runbooks/` how the switches map app -> GHL.

## Phase 4 — Frontend Settings (M3: `frontend-design` skill)

Restructure both layouts. Phone = `src/routes/Settings.tsx` (the `lg:hidden`
block). Desktop = `src/components/settings/SettingsDesktop.tsx`. Keep the shared
state pattern (export the channel hook from the route like `NotifyAudienceCard`
is today, reuse in desktop). New groups, top to bottom:

1. **Account** — keep name + signed-in user; add app version/build and a
   "Contact your account manager" row (mailto / link). Source version from build
   env, not hard-coded.
2. **Appearance** (new, all users) — light / dark / system, via existing
   `ThemeContext` + `ThemeToggle`. Surface the toggle here instead of only TopBar.
3. **Notifications**
   - **This device** (all users): push status (On / Off / Not supported / Needs
     install) + Enable button, using `push.ts` (`enablePush`,
     `hasPushSubscription`, `isInstalledPwa`, `pushAlreadyGranted`). This is the
     recovery path the one-time banner lacks.
   - **Channels** (owner): Push / Email / SMS switches -> PATCH
     `/api/settings/notifications`.
   - **Email destination** (owner): address field shown when Email is on.
   - **SMS recipients** (owner): staff list with per-person toggles ->
     `/api/settings/sms-recipients`.
   - **Audience** (owner): existing everyone/assigned, folded under push.
4. **Manage** (owner) — Team (unchanged).
5. **Security** (new): Change password/PIN -> `/api/settings/password`.
6. **Help** — Take the tour (unchanged).
7. **Session** — Sign out (unchanged).

Match the existing token system (`var(--surface)`, `sec-kicker`, `Group`,
`bg-brand-tint`, danger tints). No new visual language; this is additive.

## Phase 5 — Verify + Ship

- **Verify (M9):** run the app (`/run`), Playwright/manual screenshots of phone +
  desktop Settings; toggle each control and confirm persistence on reload;
  enable push on a real installed PWA; confirm Email-off kills the GHL email in
  the test sub-account.
- **Security-review** the password + prefs endpoints.
- **Ship:** migration applied, commit, push, watch CF Pages deploy, smoke-test
  the live Settings page. Snapshot change recorded.

## Phase 0 FINDINGS (test sub-account `r0WfsA12qpBv7M185V3v`, read-only)

- Every internal staff email/SMS is a GHL `internal_notification` action whose
  recipient is a **location custom value**, not a hard-coded address:
  - SMS  -> `to_custom_number` (id on test: `EMCkexScISPzIFpmJanm`)
  - Email -> `to_custom_email` (id on test: `ZwKPWeFTGGao8C3fHeo0`)
  - plus `internal_notification_from_email` / `_from_name`.
  14 workflows fire these (bookings, reminders, missed-call, lead forms, review
  surveys, chat widget). All custom values are blank by default; populated per
  client at promotion.
- **GHL If/Else cannot branch on a custom value.** Conditions are contact-scoped
  (tags, fields, reply body, link clicks). So a `notif_email_enabled` flag the
  workflow reads is NOT possible. (Original Phase 3 plan invalidated.)
- **Working toggle = set vs blank the recipient custom value.** An
  internal_notification with an empty recipient does not send. So:
  email off -> blank `to_custom_email`; email on -> set it to the owner address.
  Same for SMS via `to_custom_number`. **No workflow edits needed** — this is
  done entirely from our app by writing the custom values.
  (One thing still to verify on a live send: GHL no-ops cleanly on an empty
  recipient rather than erroring. Expected, but confirm with a real test lead.)
- New-lead / win / "customer replied" / show-report events do NOT use GHL
  email/SMS — they `webhook` POST to `dash.hauckmarketing.com/api/webhook`, i.e.
  our push. So push = leads/wins; GHL email/SMS = bookings/reminders/forms/etc.
- IDs differ per cloned account, so `ghlNotifyPrefs.ts` matches custom values by
  fieldKey/name, never by the test ids above.

### SMS-recipient constraint (needs a Jake decision)

The snapshot's SMS recipient is a SINGLE custom value (`to_custom_number`), one
number. "Owner picks which employees get SMS" (multiple people) does not map to
it without one of:
  - (A) **Single SMS number** the owner sets (mirrors email exactly; works today
    with zero workflow changes). Simplest. The per-employee picker becomes a
    later enhancement.
  - (B) **Multiple numbers**: verify GHL `internal_notification` SMS accepts a
    comma-separated `to_custom_number`; if yes, store each employee's phone and
    write the joined list of enabled employees. Needs employee phones captured
    (not in `staff_accounts` today) + the multi-number verification.
  - (C) Duplicate the SMS step per employee in the snapshot. Heavy; rejected.

**RESOLVED (Jake, 2026-06-29): Option A — single SMS number.** SMS now mirrors
email exactly: tenant column `notify_sms_to`, an owner-set number field shown
when the SMS channel is on, and `ghlNotifyPrefs` sets `to_custom_number` to it
when on / blanks it when off. The per-employee picker and
`staff_accounts.sms_enabled` were dropped (migration 0021 no longer adds that
column; `sms-recipients.ts` endpoint removed). Per-employee SMS remains a
possible future enhancement (option B) if ever needed.

Current build state: Email AND SMS on/off + destinations are fully wired
end-to-end (set / blank `to_custom_email` / `to_custom_number`). Typecheck +
production build pass. Remaining: apply migration 0021, run the app for
screenshots, and confirm on a live test lead that GHL no-ops on a blanked
recipient.

## Open items to confirm during Phase 0

- Does GHL If/Else read location custom values directly in this account, or do we
  need the settings-contact fallback?
- Where do enabled employees' phone numbers live (GHL user phone vs contact) for
  the SMS action recipient?
- Onboarding: which existing step (`migration 0018_onboarding` /
  `AdminOnboarding`) captures the notification email, or do we add it there.

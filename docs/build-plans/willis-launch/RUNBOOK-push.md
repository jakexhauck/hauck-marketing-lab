# Runbook: push notifications + offline (Plan 06)

Code is complete and typechecks. What remains is configuration in Cloudflare and
GoHighLevel, plus a live phone test. Steps below.

## What the code does now

- New lead, inbound message, new appointment, and "Lead won" trigger a push to
  the client's subscribed phones (`functions/lib/push.ts`, fired from
  `functions/api/webhook.ts`). Inert until VAPID keys are set.
- The owner picks the audience in the app: **Settings → Notifications**.
  - **Everyone** (default): every signed-in device gets the buzz.
  - **Assigned rep only**: only the rep a lead is assigned to. Unassigned leads
    (and inbound messages, which carry no assignee) still go to everyone, so a
    lead is never silently dropped.
  - Stored on `tenants.notify_audience` (migration `0011_notify_audience.sql`);
    routed by matching the lead's `assignedTo` against each device's chosen GHL
    identity (`push_subscriptions.ghl_user_id`).
- Foreground: only the in-app bell updates (no OS banner). Background: OS banner;
  tapping it deep-links to the lead or conversation without a full reload.
- Logout unsubscribes the device; offline shows cached lists/details.

## Jake's setup checklist

1. **Apply the migration.** In Supabase → SQL Editor, run
   `Mobile App/supabase/migrations/0011_notify_audience.sql`. Idempotent.
2. **Set the VAPID keys in Cloudflare.** Pages project `hauck-command-center` →
   Settings → Environment variables (Production). Add:
   - `VAPID_PUBLIC_KEY` = (the public key I gave you in chat)
   - `VAPID_PRIVATE_KEY` = (the private key I gave you in chat) — keep secret,
     never commit it.
   Redeploy so the Functions pick them up.
3. **Confirm `WEBHOOK_SECRET` is set** in the same env (used to authenticate the
   GHL webhook). If not, set a long random value.
4. **Register the GHL webhook.** In Willis's GHL sub-account, add a workflow (or
   marketplace) webhook to:
   `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>`
   The workflow payload MUST include `type`, `locationId`, and (for leads)
   `contactId`/`opportunityId`/`assignedTo`. Trigger it on: opportunity created,
   opportunity status changed, appointment created, inbound message.
5. **Install the PWA on a phone** (see iOS note) and sign in.
6. **In the app, tap Enable** on the notification prompt, then set
   **Settings → Notifications** to the rule you want.
7. **Live test:** create a test lead in Willis's GHL; the phone should buzz
   within seconds and the banner should open the right lead.

## iOS note (forward this to Willis's team)

> On iPhone, notifications only work after you install the app to your Home
> Screen. In Safari, open the app, tap the Share icon, then "Add to Home
> Screen". Open it from that new icon, sign in, and tap "Enable" when asked.
> Android works the same way once installed, and also in a normal browser tab.

## Definition of done

- [ ] `0011` applied in Supabase.
- [ ] VAPID public + private keys set in Cloudflare; redeployed.
- [ ] GHL webhook registered with the secret and emitting `locationId`.
- [ ] A new lead produces a push on an installed phone within seconds, to the
      correct person per the chosen rule, deep-linking correctly.
- [ ] Logout stops pushes; offline shows cached data.

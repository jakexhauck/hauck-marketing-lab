# Plan 06 — Push notifications + offline polish (AFTER everything)

**You are one of several Claude instances. Read `00-INDEX.md` first.** Address Jake as
**"Sir"**. **No em dashes.** **Ask clarifying questions** about alert behavior.

**Do this LAST**, after launch (01-03) and the merge (04-05) are done and stable. Jake
explicitly wants push added after everything else works.

## Goal
Phone push notifications: when a new lead or message arrives in a client's GHL account, the
right people get an instant push on their installed PWA. Plus verify offline behavior.

## Background (already built, needs keys + testing)
- Service worker push handling: `command-center/app/src/sw.ts` (push event + notification click).
- Client push helpers: `command-center/app/src/lib/push.ts` (`enablePush`, `disablePush`, etc.).
- Endpoints: `GET /api/push/key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`.
- The trigger is the GHL **webhook** (`/api/webhook`) writing activity, which should fan out
  pushes to subscribed devices for that tenant.
- **VAPID keys are empty** (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`). They must be generated
  and set in Cloudflare.

## Work
1. **Generate VAPID keys.** Run a one-off generator (web-push, or a small WebCrypto script)
   and have Jake paste both keys into Cloudflare env. **Never commit the private key.** Ask
   Jake before generating so they go straight into the dashboard, not a file.
2. **Wire the webhook fan-out.** Confirm `/api/webhook` (secured by `WEBHOOK_SECRET`) resolves
   the tenant, then sends a web-push to that tenant's subscribed devices for the relevant
   people. Verify it respects who should be notified (e.g. assigned rep vs owner). Ask Jake
   for the rule.
3. **Register the GHL webhook** in Willis's GHL sub-account pointing at
   `https://app.hauckmarketing.com/api/webhook` with the shared secret.
4. **Test push end-to-end** on an installed phone PWA: in-app bell updates when foregrounded;
   OS banner when backgrounded; tapping the banner deep-links to the right screen; unsubscribe
   on logout stops pushes.
5. **Verify offline:** with the app installed, go offline and confirm cached lists/details
   load (StaleWhileRevalidate / NetworkFirst per `sw.ts`); confirm a sensible offline state.

## START HERE: ask Jake
- "Who should get a push for a new lead: the assigned rep only, the owner, or everyone?"
- "Push for new messages too, or leads only, at first?"
- "iOS note: push only works once the app is **installed** (Add to Home Screen). OK to
  document that for Willis's team?"

## Definition of done
- VAPID keys set in Cloudflare (private key never in git).
- A new lead in Willis's GHL produces a push on a subscribed phone within seconds, to the
  correct person, deep-linking correctly.
- Logout unsubscribes; offline mode shows cached data.

## MANUAL ACTIONS — JAKE MUST DO
1. Paste the generated `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` into Cloudflare env.
2. In GoHighLevel: register the webhook to `/api/webhook` with the `WEBHOOK_SECRET`.
3. Install the PWA on a phone and help test a live push.
4. Decide the notification-target rule (questions above).

## Manual actions ALREADY DONE FOR YOU
- SW push handlers, client push helpers, and the subscribe/unsubscribe/key endpoints already
  exist; this plan supplies keys, wires the trigger, and tests.

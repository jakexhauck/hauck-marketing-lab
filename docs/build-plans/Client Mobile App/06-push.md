# Section 06: Push notifications

## Goal

Buzz Jake's iPhone within ~10s of a new lead landing in Willis' GHL. Tap the notification → app opens straight to that lead. Works on installed-PWA iOS 16.4+ (Jake is on iOS 26.5, so fine).

Estimated time: ~2 hours.

## Depends on

Section 03 (Pages Functions + webhook receiver skeleton in place). Section 02 (`push_subscriptions` table + RLS).

## Files created / modified

```
client-dashboard/
  functions/api/push/subscribe.ts             (new: POST stores subscription against user_id + tenant_id)
  functions/api/push/unsubscribe.ts           (new: POST deletes subscription)
  functions/api/webhooks/ghl.ts               (modified: on ContactCreate/OpportunityCreate, fan out web push)
  functions/lib/webpush.ts                    (new: VAPID signing + push send via Web Push API directly, no Node libs)
  src/
    lib/
      push.ts                                 (new: subscribe(), unsubscribe(), permission helpers)
    components/
      EnablePushPrompt.tsx                    (new: one-time banner on dashboard if not subscribed)
    sw.ts                                     (modified: add push + notificationclick handlers — Workbox-injected service worker)
  vite.config.ts                              (modified: ensure VAPID_PUBLIC_KEY is in import.meta.env for the SW)
```

## Steps

1. **Generate VAPID keys (5 min)**
   - Run `npx web-push generate-vapid-keys` locally. Two keys: public (safe in browser bundle), private (server-only).
   - Add `VAPID_PUBLIC_KEY` to Cloudflare Pages env vars (both Production and Preview).
   - Add `VAPID_PRIVATE_KEY` to Pages env vars (Production only, server-side).
   - Add `VITE_VAPID_PUBLIC_KEY` (same value as the public key) so it gets into the browser bundle.

2. **webpush lib (25 min)**
   - `functions/lib/webpush.ts`: implement Web Push protocol using only Web Crypto (no `web-push` npm — it pulls Node deps that don't run on Workers).
   - Functions: `sendPush(subscription, payload, { vapidPublicKey, vapidPrivateKey, subject })`.
   - Builds the JWT (ES256 over `{ aud, exp, sub }`), encrypts the payload (aes128gcm with the subscription's `p256dh` + `auth`), POSTs to `subscription.endpoint` with the right headers.
   - Reference: RFC 8030 (Web Push) + RFC 8291 (Message Encryption). Existing reference impl: github.com/web-push-libs/webpush-webcrypto.
   - Test with one hardcoded subscription before integrating.

3. **Subscribe endpoint (10 min)**
   - `functions/api/push/subscribe.ts` `POST`:
     - Verifies JWT → gets `user_id` + `tenant_id`.
     - Body: `{ endpoint, keys: { p256dh, auth } }`.
     - Upsert into `push_subscriptions` keyed by `(user_id, endpoint)`.
     - Returns `{ ok: true }`.

4. **Unsubscribe endpoint (5 min)**
   - `functions/api/push/unsubscribe.ts` `POST`:
     - Body: `{ endpoint }`.
     - Delete the row.

5. **Service worker push handler (15 min)**
   - The current `sw.ts` is Workbox + precache. Add two listeners:
     - `self.addEventListener('push', (e) => { ... showNotification with payload.title, body, data })`.
     - `self.addEventListener('notificationclick', (e) => { e.notification.close(); clients.openWindow('/leads/' + e.notification.data.leadId) })`.
   - Payload shape from server: `{ title, body, leadId }`. Keep small (< 4KB total encrypted).
   - Make sure the SW is registered with `updateViaCache: 'none'` so the new handlers actually deploy.

6. **Browser-side push lib (15 min)**
   - `src/lib/push.ts`:
     - `getPermissionState()` → `'default' | 'granted' | 'denied'`.
     - `subscribe()` → ensure SW registered, request permission, call `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) })`, POST result to `/api/push/subscribe`.
     - `unsubscribe()` → `registration.pushManager.getSubscription()` then `.unsubscribe()`, POST to `/api/push/unsubscribe`.
     - All paths handle the iOS-PWA-only constraint gracefully (detect `window.navigator.standalone` or `display-mode: standalone`).

7. **EnablePushPrompt (10 min)**
   - Dashboard shows a one-time banner: "Get notified when new leads come in. [Enable]".
   - Hide when permission is `granted` or the user dismissed it (localStorage flag).
   - On iOS Safari but NOT installed: show "Add to Home Screen first, then re-open the app to enable notifications." (no enable button).

8. **Webhook → push fanout (25 min)**
   - In `functions/api/webhooks/ghl.ts`, handle the GHL event types `ContactCreate` and `OpportunityCreate` (the ones that mean "new lead landed").
   - For each event: look up the tenant by `locationId`, find all `push_subscriptions` for users in that tenant, fan out via `sendPush` in parallel (`Promise.allSettled`).
   - Payload: `{ title: 'New lead — ' + contact.name, body: contact.source || 'Willis Windows', leadId: contact.id }`.
   - On a `410 Gone` or `404` response from the push service, delete that subscription row (the device unsubscribed externally).
   - Always return 200 to GHL fast — fanout runs after the response via `ctx.waitUntil()` so GHL doesn't retry on slow fanouts.

9. **Register the webhook in GHL (5 min)**
   - In Willis sub-account: Settings → Webhooks → Add. URL: `https://dash.hauckmarketing.com/api/webhooks/ghl`. Events: `ContactCreate`, `OpportunityCreate`, `OpportunityStatusUpdate`. Secret: paste the `WEBHOOK_SECRET` env value (verify on the server side via `x-hub-signature` or whatever GHL uses — confirm against current GHL docs at integration time).

10. **End-to-end test on real iPhone (15 min)**
    - Deploy. On iPhone, open `dash.hauckmarketing.com` in Safari → Share → Add to Home Screen → open from home screen.
    - Sign in via magic link. On dashboard, tap "Enable notifications", accept permission prompt.
    - From laptop, manually create a contact in Willis GHL.
    - Phone should buzz within ~10s with the lead's name. Tap → app opens at `/leads/<id>`.

## Acceptance criteria

- Subscribe flow works on installed-PWA iOS 16.4+.
- Subscribe is a no-op (with helpful UI message) on non-installed iOS Safari.
- New GHL contact triggers a push within 10s.
- Tap deep-links to the correct lead.
- Unsubscribe removes the row and stops further pushes.
- Stale subscriptions (410 from push service) are cleaned up server-side.

## Stop condition

Commit when Jake's phone buzzes from a real GHL contact create.

**Commit message:** `client-dashboard: web push via GHL webhook (section 06)`

## Notes

- Don't pull in the `web-push` npm package. It depends on Node crypto and won't run on Workers. The custom Web Crypto impl in `functions/lib/webpush.ts` is the right call here.
- Apple's Web Push has a few quirks: the icon defaults to the home-screen icon (already configured in `manifest.webmanifest`), notification grouping uses `tag`, and there's a daily quota per origin (high enough that Willis won't hit it).
- If we ever support multiple users per tenant (e.g. Willis hires a second tech), the fanout already handles it — `push_subscriptions` is per-user, the webhook fans to all users in the tenant.
- The `WEBHOOK_SECRET` verification step is critical. Without it, anyone could POST to `/api/webhooks/ghl` and trigger pushes to clients' phones. Verify the signature on every webhook request before doing any work.

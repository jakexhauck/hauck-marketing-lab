# 06: Push Notifications

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

## Objective

Deliver Web Push notifications to installed devices when a new lead arrives or an inbound
message lands, so the app behaves like a real notifying app instead of a page you have to open.

## Why it matters

This is the single biggest "why is this an app and not a bookmark" feature. A rep should feel
their phone buzz the moment a lead texts back, not discover it on the next poll. The VAPID env
vars and the `push_subscriptions` table already exist; this doc connects the wires.

## Dependencies

- 03 (Supabase, `push_subscriptions` table, `getServiceClient`).
- 05 (the webhook is what triggers a send; `sendPushForActivity` is called from there).
- 01 (push requires a live HTTPS origin and an installed PWA; it does not work on localhost or
  in a non-installed Safari tab on iOS).

## iOS reality check (read first)

- iOS supports Web Push **only for PWAs added to the home screen**, iOS 16.4+. A Safari tab will
  not receive push. The user must "Add to Home Screen" first (doc 01 covers install).
- Permission must be requested from a **user gesture** (a tap), not on page load. iOS is strict.
- There is no silent/background data push on iOS; every push must show a visible notification.

Plan the UX around this: a "Turn on notifications" button the user taps, shown only when running
as an installed PWA.

## Current state

### Keys declared, unused

`functions/lib/env.ts` declares `VAPID_PUBLIC_KEY?` and `VAPID_PRIVATE_KEY?`. Nothing reads them.

### Service worker is auto-generated (the blocker)

`vite.config.ts` uses `VitePWA` with the default Workbox **`generateSW`** strategy (precaching +
navigation fallback only). A generated SW cannot contain custom `push` / `notificationclick`
handlers. To add them we must switch to the **`injectManifest`** strategy with our own SW source.

### No subscription code

No `serviceWorker.register` for a custom SW, no `pushManager.subscribe`, no `Notification` usage
anywhere in `src/`. The `push_subscriptions` table exists but is never written.

### No web-push library

`web-push` is not installed. We need a way to sign push payloads with VAPID. Note: the standard
Node `web-push` package leans on Node crypto APIs; on Cloudflare Workers prefer a Workers-native
approach (the Web Crypto API) or a Workers-compatible web-push build. See step 4.

## Target state

1. A custom service worker (`src/sw.ts`) that handles `push` (show notification) and
   `notificationclick` (focus/open the app at the right route), and still precaches via injected
   manifest.
2. A client flow: tap "Enable notifications" → request permission → `pushManager.subscribe` with
   the VAPID public key → POST the subscription to `/api/push/subscribe` → stored in
   `push_subscriptions`.
3. A backend sender `sendPushForActivity(env, activity)` called from the webhook (doc 05) that
   looks up the tenant's subscriptions and sends a VAPID-signed push to each, pruning dead ones.

## Step-by-step

### 1. Generate VAPID keys

```
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Cloudflare (encrypted). Expose the **public**
key to the frontend too, either as `VITE_VAPID_PUBLIC_KEY` (build-time inline) or via a tiny
`GET /api/push/key` endpoint. Prefer the endpoint so a key rotation does not require a rebuild.

### 2. Switch VitePWA to injectManifest

In `vite.config.ts`:

```ts
VitePWA({
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  registerType: "autoUpdate",
  injectRegister: "auto",
  includeAssets: [...existing...],
  manifest: { ...existing manifest unchanged... },
  injectManifest: {
    globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
  },
}),
```

Keep the manifest block exactly as it is (name, icons, standalone, theme). Only the SW strategy
changes.

### 3. Write `src/sw.ts`

```ts
/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Injected by vite-plugin-pwa at build. Preserves the existing precache behaviour.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event: PushEvent) => {
  const data = (() => {
    try { return event.data?.json() ?? {}; } catch { return {}; }
  })() as { title?: string; body?: string; url?: string };

  const title = data.title || "Hauck Dashboard";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) { (c as WindowClient).focus(); (c as WindowClient).navigate(url); return; }
      }
      return self.clients.openWindow(url);
    }),
  );
});
```

Add `workbox-precaching` to devDependencies if injectManifest needs it explicitly (vite-plugin-pwa
usually provides it).

### 4. Backend sender: `functions/lib/push.ts`

Cloudflare Workers run on Web Crypto, not Node crypto, so a Node-only `web-push` may not work.
Two viable paths:

- **Preferred:** use a Workers-compatible Web Push implementation (a VAPID + AES-GCM payload
  signer built on `crypto.subtle`). There are small libraries that target Workers; vet one, or
  port the ~150 lines needed (VAPID JWT signing with ES256 via `crypto.subtle`, plus aes128gcm
  content encryption).
- **Fallback:** run the sender on a tiny separate Node-capable worker/queue if a Workers-native
  signer proves painful. For the test app, the preferred path is worth the effort once.

```ts
import { getServiceClient, resolveTenantId } from "./supabase";
import type { Env } from "./env";

export async function sendPushForActivity(env: Env, activity: { kind: string; summary: string; opportunity_id: string | null; contact_id: string | null }) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const client = getServiceClient(env);
  if (!client) return;
  const tenantId = await resolveTenantId(client, "test-account");
  const { data: subs } = await client.from("push_subscriptions").select("*").eq("tenant_id", tenantId);
  if (!subs?.length) return;

  const payload = JSON.stringify({
    title: activity.kind === "lead_created" ? "New lead" : "New message",
    body: activity.summary,
    url: activity.opportunity_id ? `/lead/${activity.opportunity_id}`
       : activity.contact_id ? `/conversations/${activity.contact_id}` : "/",
  });

  await Promise.all(subs.map(async (s) => {
    try {
      await sendWebPush(s.subscription, payload, {
        publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!,
        subject: "mailto:jake@hauckmarketing.com",
      });
    } catch (err: any) {
      // 404/410 means the subscription is dead; prune it.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await client.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }));
}
```

`sendWebPush` is the Workers-native signer from step 4's preferred path.

### 5. Subscribe/unsubscribe endpoints

`functions/api/push/subscribe.ts` (authed, POST): store the `PushSubscription` JSON in
`push_subscriptions` scoped to the test tenant, keyed by endpoint (upsert on endpoint to avoid
duplicates). `functions/api/push/unsubscribe.ts` (POST): delete by endpoint.

Add the routes to nothing special in middleware; they should be authed (not public).

### 6. Client subscribe flow

Add `src/lib/push.ts`:

```ts
export async function enablePush(): Promise<"granted" | "denied" | "unsupported"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  const perm = await Notification.requestPermission(); // must be called from a tap
  if (perm !== "granted") return "denied";

  const reg = await navigator.serviceWorker.ready;
  const keyRes = await fetch("/api/push/key").then((r) => r.json());
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
  });
  await fetch("/api/push/subscribe", {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: sub }),
  });
  return "granted";
}
```

Add the standard `urlBase64ToUint8Array` helper (well-known snippet). Render an "Enable
notifications" button (Settings, or a one-time prompt on Home) that calls `enablePush()`. Show it
only when `display-mode: standalone` matches (installed PWA) and permission is not already
granted.

### 7. Connect the trigger

In `functions/api/webhook.ts` (doc 05's marked call site), import and call
`sendPushForActivity(ctx.env, activity)` for `message_in` and `lead_created`. It is already
wrapped in the webhook's try/catch, so a push failure never breaks the webhook.

## Testing

- [ ] Install the PWA on a real iPhone (doc 01). Tap "Enable notifications", grant permission.
- [ ] Confirm a row appears in `push_subscriptions`.
- [ ] Send yourself an SMS into the test GHL account. Confirm the webhook fires (doc 05) and a
      push notification appears on the locked phone within seconds.
- [ ] Tap the notification: the app opens to the right conversation/lead.
- [ ] Create a test opportunity in GHL: confirm a "New lead" push.
- [ ] Revoke a subscription (delete the row or uninstall) and confirm a dead-subscription send
      prunes it (410/404 path).
- [ ] Confirm nothing breaks when VAPID keys are unset (sender returns early).

## Acceptance criteria

- [ ] Tapping "Enable notifications" subscribes and stores the subscription.
- [ ] A real inbound message produces a visible push on an installed iOS PWA.
- [ ] Tapping the push deep-links to the relevant lead/conversation.
- [ ] Dead subscriptions are pruned on send failure.
- [ ] The feature is fully optional: unset VAPID keys = no push, no crashes.
- [ ] Existing precaching still works after the injectManifest switch (verify offline asset load).

## Rollback

The riskiest change is the SW strategy switch. If `injectManifest` misbehaves, revert
`vite.config.ts` to `generateSW` and delete `src/sw.ts`; push stops working but the app and its
precaching return to the doc-01 baseline. Backend push endpoints and `push.ts` are additive and
inert without VAPID keys.

## Future client promotion

Per client, generate a fresh VAPID keypair (or reuse one set of keys across clients, since the
subject identifies the agency, your call). Subscriptions are tenant-scoped via
`push_subscriptions.tenant_id`, so the same sender works once `resolveTenantId` keys off the
client's tenant instead of the hardcoded `test-account` slug.

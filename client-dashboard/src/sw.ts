/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { APP_BRAND } from "./lib/appBrand";

declare const self: ServiceWorkerGlobalScope;

// Activate a freshly installed worker immediately and take over open clients.
// Without this, installed PWAs (iOS especially) keep running the previous
// deploy's code until every tab/app instance is fully closed, which in
// practice meant deploys never reached phones. The app shell is data-driven
// (react-query refetches on focus), so a mid-session swap is safe.
self.skipWaiting();
clientsClaim();

// Injected by vite-plugin-pwa at build. Preserves the existing precache
// behaviour we had under the old generateSW strategy.
precacheAndRoute(self.__WB_MANIFEST);

// Runtime caching for API GETs, split by mutability. The request.method ===
// "GET" guard is load-bearing: mutations (POST/PATCH for SMS send, lead/stage
// updates) never match, so they fall through to the network and fail honestly
// when offline instead of being served from cache.
//
// List endpoints change only via polling, so stale-while-revalidate is fine:
// instant paint from cache, revalidate in the background.
const LIST_GET =
  /\/api\/(summary|pipelines|tenant|leads|contacts|conversations|activity|calendar\/events|invoices|payments\/transactions)$/;

// Detail endpoints reflect the user's own writes (a just-sent message, an
// edited note, a moved stage). Serving those stale-first made the app
// one-refresh-behind after every action, so they are network-first with a
// short timeout: fresh data wins online, cache still answers offline.
const DETAIL_GET =
  /\/api\/(notifications$|leads\/[^/]+(\/messages)?$|conversations\/[^/]+\/messages$|contacts\/[^/]+\/(notes|tasks)$|invoices\/[^/]+$)/;

registerRoute(
  ({ url, request }) => request.method === "GET" && LIST_GET.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: "api-get",
    plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 })],
  }),
);

registerRoute(
  ({ url, request }) => request.method === "GET" && DETAIL_GET.test(url.pathname),
  new NetworkFirst({
    cacheName: "api-detail",
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 })],
  }),
);

// Session probe: cached as a fallback so an offline launch can prove "a
// session existed recently" instead of reading a network failure as logged
// out (AuthContext pairs this with the hml_last_session_mode flag). Cleared
// on sign-out along with the rest of the runtime caches.
registerRoute(
  ({ url, request }) =>
    request.method === "GET" && url.pathname === "/api/auth/me",
  new NetworkFirst({
    cacheName: "api-detail",
    networkTimeoutSeconds: 3,
  }),
);

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  const data: PushPayload = (() => {
    try {
      return event.data?.json() ?? {};
    } catch {
      return {};
    }
  })();

  const title = data.title || APP_BRAND.appName;
  event.waitUntil(
    (async () => {
      // Tell every open window first so the in-app bell updates immediately
      // instead of waiting for the next 30s poll.
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const w of windows) w.postMessage({ type: "push" });

      // If the user is literally looking at the app, the bell badge is enough;
      // an OS banner on top would be noise.
      const appIsInFront = windows.some(
        (w) =>
          (w as WindowClient).visibilityState === "visible" &&
          (w as WindowClient).focused,
      );
      if (appIsInFront) return;

      await self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of windows) {
        if ("focus" in c) {
          const win = c as WindowClient;
          await win.focus();
          // Let the SPA route in place. win.navigate() forced a full page
          // reload, which both flashed and dumped in-memory state.
          win.postMessage({ type: "navigate", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

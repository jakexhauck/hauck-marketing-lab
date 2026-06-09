/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

// Injected by vite-plugin-pwa at build. Preserves the existing precache
// behaviour we had under the old generateSW strategy.
precacheAndRoute(self.__WB_MANIFEST);

// Runtime cache for read-only API GETs (stale-while-revalidate). Lets a
// previously loaded list render offline, then revalidate once back online.
// The request.method === "GET" guard is load-bearing: mutations (POST/PATCH
// for SMS send, lead/stage updates) never match, so they fall through to the
// network and fail honestly when offline instead of being served from cache.
const SAFE_GET = /\/api\/(summary|pipelines?|leads|contacts|conversations|activity)(\?|$|\/)/;

registerRoute(
  ({ url, request }) => request.method === "GET" && SAFE_GET.test(url.pathname + url.search),
  new StaleWhileRevalidate({
    cacheName: "api-get",
    plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 })],
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
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if ("focus" in c) {
            const win = c as WindowClient;
            win.focus();
            win.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});

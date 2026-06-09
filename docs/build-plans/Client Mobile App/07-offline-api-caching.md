# 07: Offline API Caching

## Objective

Make the app usable, or at least gracefully degraded, when the network drops, by caching the
last-known API responses and serving them stale-while-revalidate instead of throwing an error
screen.

## Why it matters

A field rep in a customer's basement loses signal. Today, any list that has not loaded yet shows
an error, and React Query has nothing to fall back on. The app already precaches its static
assets (HTML/JS/CSS via Workbox), so the shell loads offline, but every `/api/*` call fails. This
doc closes that gap so a rep can at least read the leads and conversations they loaded a minute
ago.

This is pure polish. Do it last, or skip it for the test app and revisit when a real rep
complains about dead zones.

## Dependencies

- 02 (so the cached lists are complete, not truncated to 100).
- If doc 06 shipped, the SW is already `injectManifest` with a custom `src/sw.ts`, which makes
  adding runtime API caching trivial. If doc 06 has not shipped, you can still do this with
  Workbox `runtimeCaching` in the `generateSW` config; the two approaches are noted below.

## Current state

`vite.config.ts` Workbox config:

```ts
workbox: {
  globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
  navigateFallbackDenylist: [/^\/api\//],   // API is explicitly NOT cached
},
```

So `/api/*` is deliberately excluded from the precache and has no runtime cache. React Query
holds responses in memory only; a reload while offline loses them. There is no persisted query
cache.

## Target state

Two independent layers, either or both:

1. **Persisted React Query cache** (client memory survives reload): the lists you have seen
   reappear instantly on relaunch, then revalidate when back online.
2. **Service worker runtime cache** for read-only GET `/api/*` endpoints, stale-while-revalidate,
   so even a cold load offline serves the last response.

Mutations (SMS send, lead update) must **never** be served from cache and should fail loudly or
queue. Only cache safe GETs.

## Step-by-step

### Layer 1: Persist the React Query cache

Install the persister:

```
pnpm add @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister
```

In `src/lib/queryClient.ts` (or wherever the `QueryClient` is created) wrap the app with
`PersistQueryClientProvider` using `localStorage`:

```ts
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const persister = createSyncStoragePersister({ storage: window.localStorage, key: "hml_query_cache" });
persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24h: do not show day-old leads as current
});
```

Set a sane `maxAge` so a rep does not mistake stale data for live. Pair it with a visible "last
updated" / "offline" indicator (see Layer 3).

Important: exclude mutations and sensitive responses if needed via a `dehydrateOptions` filter.
Do not persist anything you would not want sitting in `localStorage` on a shared device.

### Layer 2: SW runtime cache for safe GETs

**If on injectManifest (doc 06 shipped),** add to `src/sw.ts`:

```ts
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

const SAFE_GET = /\/api\/(summary|pipelines?|leads|contacts|conversations|activity)(\?|$|\/)/;

registerRoute(
  ({ url, request }) => request.method === "GET" && SAFE_GET.test(url.pathname + url.search),
  new StaleWhileRevalidate({
    cacheName: "api-get",
    plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 })],
  }),
);
```

Note this **removes** those paths from the `navigateFallbackDenylist` intent for GETs only;
mutations (POST/PATCH) are excluded by the `request.method === "GET"` guard and fall through to
the network, failing offline as they should.

**If still on generateSW (doc 06 not shipped),** add `runtimeCaching` to the Workbox block in
`vite.config.ts` instead:

```ts
workbox: {
  globPatterns: [...existing...],
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [{
    urlPattern: ({ url, request }) =>
      request.method === "GET" &&
      /\/api\/(summary|pipelines?|leads|contacts|conversations|activity)/.test(url.pathname),
    handler: "StaleWhileRevalidate",
    options: { cacheName: "api-get", expiration: { maxEntries: 64, maxAgeSeconds: 86400 } },
  }],
},
```

### Layer 3: Tell the user when they are offline

Stale data without a signal is dangerous. Add a small offline/last-updated banner:

```ts
const online = useSyncExternalStore(
  (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb);
            return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
  () => navigator.onLine,
);
```

When `!online`, show a thin banner: "Offline. Showing last saved data." Hide it when back online.
This is the difference between "helpful cache" and "rep quotes a closed lead because the app
looked live."

## Testing

Use Chrome DevTools (desktop, easiest) then confirm on device:

- [ ] Load Leads and Conversations online. Go offline (DevTools → Network → Offline).
- [ ] Reload: the previously loaded lists still render (Layer 1 and/or 2 working).
- [ ] The offline banner appears.
- [ ] Attempt to send an SMS offline: it fails clearly, does not silently appear to succeed.
- [ ] Go back online: lists revalidate, banner disappears, fresh data replaces stale.
- [ ] Confirm `maxAge` works: data older than the cap is not shown as current.
- [ ] On a real iPhone in airplane mode, the installed PWA opens and shows last-saved lists.

## Acceptance criteria

- [ ] Previously loaded lists are readable offline.
- [ ] An offline indicator is visible whenever the device is offline.
- [ ] Mutations never read from cache and fail honestly offline.
- [ ] Stale data past `maxAge` is not presented as live.
- [ ] Online behaviour is unchanged (revalidation keeps everything fresh).

## Rollback

Both layers are additive and independently removable. Remove the `PersistQueryClientProvider`
wrapper to drop Layer 1; remove the `registerRoute` / `runtimeCaching` block to drop Layer 2. The
app returns to memory-only caching with no offline support, exactly as today.

## Future client promotion

Nothing tenant-specific here; the caching keys off URL paths, not tenant. The only consideration
on shared client devices is Layer 1's `localStorage` persistence: confirm with the client that
caching lead data on-device is acceptable, and keep `maxAge` short for sensitive niches.

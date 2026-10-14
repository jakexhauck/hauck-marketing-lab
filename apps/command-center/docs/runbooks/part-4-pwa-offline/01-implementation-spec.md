# Part 4 Implementation Spec (Claude executes this)

No manual actions in this file. Numbers map to [00-README.md](00-README.md).

## 4.1 Service worker activation

- `src/sw.ts`: add `self.skipWaiting()` and `clientsClaim()`.
- Given the data-driven app shell (no long client-side state that a mid-session swap would corrupt), immediate activation is acceptable and far better than never updating. If testing reveals reload glitches, fall back to `registerSW({ onNeedRefresh })` with a toast "Update ready, tap to refresh"; decide during implementation and note it in the report.

## 4.2 Offline auth

- AuthContext: on `checkSession()` **network failure** (fetch threw, not a 401/403 response), do not flip to unauthenticated. Instead enter `status: "authenticated-offline"` when a previous session is plausible: persist a non-sensitive flag `hml_last_session_mode` in localStorage at login, clear at logout. A 401/403 response still means unauthenticated.
- ProtectedRoute treats `authenticated-offline` as authenticated; OfflineBanner already communicates the state.
- On reconnect (`online` event), re-run checkSession and reconcile.

## 4.3 SW caching strategy

- Split SAFE_GET: list endpoints (`/api/leads$`, `/api/contacts$`, `/api/conversations$`, `/api/summary`, `/api/pipelines`, `/api/calendar/events`, `/api/invoices`) stay StaleWhileRevalidate.
- Mutable detail endpoints (messages threads, single lead, notes, tasks) switch to NetworkFirst with a short timeout (3s) falling back to cache; offline still works, but fresh data wins when online.
- Add `/api/auth/me` to a NetworkFirst route with cache fallback so 4.2's offline path has data to show.

## 4.4 Central 401 handling

- `src/lib/api.ts`: on 401, dispatch a `window` custom event `hml:unauthorized`.
- AuthContext listens; flips status to unauthenticated, clears caches (see 4.5 helper) and the router redirects to /login naturally via ProtectedRoute.
- `src/lib/queryClient.ts`: `retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1`.

## 4.5 Mode-scoped caches + signOut hygiene

- Add the session mode to the react-query key root: keys become `[mode, 'leads']` etc. via a small `useKey(mode)` helper, or simpler: include mode in the persisted-cache `buster` string AND call a central `clearAllCaches()` on signOut and on mode change at login.
- `clearAllCaches()` does: `queryClient.clear()`, remove the persisted cache localStorage key, `caches.delete('api-get')` (and any other SW runtime cache names).
- Pick the simpler implementation that provably prevents cross-mode bleed; document the choice.

## 4.6 + 4.7 Push lifecycle

- `src/lib/push.ts`: use API_BASE consistently; check `res.ok` on subscribe POST and report failure to the caller (UI shows "could not enable notifications").
- Add `disablePush()`: `pushManager.getSubscription()`, `unsubscribe()`, POST `/api/push/unsubscribe` with the endpoint.
- signOut calls `disablePush()` best-effort before clearing the session.
- NotificationPrompt: handle the granted-but-unsubscribed state (offer "re-enable"); persist "Not now" for 7 days in localStorage instead of component state.

## 4.8 Live badge updates

- `src/sw.ts` push handler: after `showNotification`, `clients.matchAll()` and `postMessage({ type: 'push' })`.
- A `message` listener (registered once in `src/main.tsx` or a hook) invalidates the notifications query so the bell updates immediately.
- Skip the OS notification when a window is visible and focused (check `client.visibilityState === 'visible'` and `focused`), still postMessage so the in-app bell updates.
- Bonus: `navigator.setAppBadge(unreadCount)` / `clearAppBadge()` wired to the unread count where supported.

## 4.9 Deep-link landing

- LeadDetail: while the leads query is loading and no lead matches, render a spinner, not "Lead not found"; only show not-found after load completes. Use `useLeadQuery(id)` (already written, unused) as a direct fallback fetch so a deep link works even when the list query is cold.
- `src/sw.ts` notificationclick: if a window client exists, `focus()` + postMessage `{type:'navigate', url}` and let the SPA route (App listens and calls `navigate(url)`); only `openWindow(url)` when no client exists.

## 4.10 Role fallback

- AuthContext: when an identity id is stored but `fetchIdentity` fails (network/5xx), retry once, then fall back to a `rep`-equivalent minimal UI rather than owner. Only the genuine "no identity chosen / skipped" path keeps the owner default (single-operator account assumption).

## Exit criteria

- `pnpm typecheck`, `pnpm build` pass.
- A local two-deploy test (build, serve, modify, rebuild) demonstrates the SW activates without closing the tab.
- Report delivered before Jake runs [02-manual-actions.md](02-manual-actions.md).

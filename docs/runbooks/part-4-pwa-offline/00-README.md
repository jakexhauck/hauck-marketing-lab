# Part 4: PWA Lifecycle, Offline, and Auth Hygiene

Status: code ☑ done (2026-06-11, all ten findings) | manual actions ☐ not started

> Deploy note (2026-06-11): the Part 4 push (69eeb4c) built and deployed successfully, but a docs-only build of the prior commit finished 18 minutes later and reclaimed the production alias, so hauck-dashboard.pages.dev kept serving pre-Part-4 code. A retrigger commit the same day fixed it. Before starting the checklist below, confirm production has Part 4: in desktop devtools, Application tab, the active sw.js should contain `skipWaiting`.

Theme: the app's "installed app" behaviors. Today, deployed fixes never reach installed PWAs (the service worker never activates), launching offline logs the user out, stale caches show another account's data after mode switches, and an expired session bricks every panel instead of returning to login.

## What gets fixed

| # | Finding | Where |
|---|---|---|
| 4.1 | New service worker waits forever: no `skipWaiting`/`clientsClaim`, so installed PWAs (especially iOS) run old code indefinitely after deploys | `src/sw.ts`, `vite.config.ts` |
| 4.2 | Offline launch logs the user out: `/api/auth/me` is never cached, failure reads as unauthenticated, redirect to /login; the offline banner promises cached data it never shows | `src/context/AuthContext.tsx`, `src/sw.ts` |
| 4.3 | StaleWhileRevalidate on mutable GETs makes the app one-refresh stale after every send/edit (sent message missing until the next poll) | `src/sw.ts` SAFE_GET |
| 4.4 | No 401 handling mid-session: expired cookie leaves every panel erroring forever; queryClient retries 401s pointlessly | `src/lib/api.ts`, `src/lib/queryClient.ts`, AuthContext |
| 4.5 | Test/live cache leakage: query keys ignore session mode, the 24h persisted cache and SW cache survive signOut, so switching accounts shows the other account's data | `src/hooks/useApi.ts`, `src/main.tsx`, AuthContext signOut |
| 4.6 | signOut leaves the device subscribed to push (lead PII keeps arriving on a logged-out phone); no unsubscribe path is wired at all | `src/context/AuthContext.tsx`, `src/lib/push.ts`, `functions/api/push/unsubscribe.ts` |
| 4.7 | push.ts ignores VITE_API_BASE and reports "granted" even when the server save failed | `src/lib/push.ts` |
| 4.8 | Push received while app is open: OS notification shows but the bell badge stays stale up to 30s (no SW-to-client message) | `src/sw.ts`, `src/hooks/useApi.ts` |
| 4.9 | Notification deep links flash "Lead not found" while data loads, and `win.navigate` forces a full reload | `src/routes/LeadDetail.tsx`, `src/sw.ts` |
| 4.10 | Auth identity failure silently promotes to owner role UI | `src/context/AuthContext.tsx` |

## Files in this folder

- [01-implementation-spec.md](01-implementation-spec.md)
- [02-manual-actions.md](02-manual-actions.md)

## Done means

Your manual verification proves: a deploy reaches an installed PWA within a minute of reopening it; airplane-mode launch shows cached data with the offline banner instead of the login screen; a sent message appears instantly; logging out and into the other mode shows zero stale data; a logged-out phone stops receiving pushes.
